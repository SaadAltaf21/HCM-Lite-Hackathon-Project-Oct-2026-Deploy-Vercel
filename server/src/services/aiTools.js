// AI tool engine: tools reuse the same services + scope checks as the REST API.
// The model (or the local fallback) never queries the database directly and
// never writes data. Employees see only their own rows; salary fields are
// stripped for employees.
const Employee = require('../models/Employee');
const { buildDashboard, leaveBalanceFor } = require('./dashboard');
const { todayStr } = require('./rules');

const POLICY = [
  'Office starts at 09:00 with a 15-minute grace period; check-in after 09:15 is late.',
  'A workday under 5 hours is a half day; a past day with no check-out is missing_checkout.',
  'Weekends are Saturday and Sunday; leave working days skip weekends and public holidays.',
  'Leave quotas per year: annual 14 days, sick 8 days, casual 10 days, unpaid unlimited.',
  'Payroll: gross = 1.5 x basic (HRA 40% of basic, medical 10% of basic); deductions are (absent + unpaid + 0.5 x half days) x gross / working days.',
  'Tax is calculated on gross x 12: 0% up to 600k, 5% above 600k up to 1.2M, 30k + 15% above 1.2M up to 2.4M, 210k + 25% above 2.4M up to 3.6M, 510k + 35% above 3.6M; monthly tax is annual tax / 12.',
  'Leave overlap with a pending or approved request, or going over balance, is rejected (422).',
  'Camera check-in needs exactly one face, GPS accuracy of 100m or better, and the employee inside the office radius set by Admin.',
];

// Scope helper for tools: employee users are pinned to their own employee row.
function scopeFor(user) {
  if (user.role === 'employee') return { employeeId: user.employeeId || null };
  return {};
}

async function toolGetHeadcount(user, args = {}) {
  const d = await buildDashboard({ department: args.department || null, companyId: user.companyId || null });
  return { headcount: d.headcount, headcountByDept: d.headcountByDept };
}
async function toolGetAttendanceSummary(user, args = {}) {
  const d = await buildDashboard({
    from: args.from, to: args.to, department: args.department || null,
    employeeId: user.role === 'employee' ? user.employeeId : null,
    companyId: user.companyId || null,
  });
  return {
    period: d.period, attendanceRate: d.attendanceRate, latePercent: d.latePercent,
    presentToday: d.presentToday, lateToday: d.lateToday, onLeaveToday: d.onLeaveToday,
    absenteeismByDept: d.absenteeismByDept, trend: d.trend,
  };
}
async function toolGetLateComers(user) {
  const d = await buildDashboard({ employeeId: user.role === 'employee' ? user.employeeId : null, companyId: user.companyId || null });
  return { topLateComers: d.topLateComers };
}
async function toolGetLeaveSummary(user, args = {}) {
  const d = await buildDashboard({ department: args.department || null, companyId: user.companyId || null });
  if (user.role === 'employee') {
    const bal = await leaveBalanceFor(user.employeeId, Number(todayStr().slice(0, 4)), user.companyId || null);
    return { myLeaveBalance: bal };
  }
  return { leaveByType: d.leaveByType, onLeaveToday: d.onLeaveToday, pendingLeave: d.pendingLeave };
}
async function toolGetMyLeaveBalance(user) {
  if (!user.employeeId) return { error: 'This login is not linked to an employee record.' };
  const bal = await leaveBalanceFor(user.employeeId, Number(todayStr().slice(0, 4)), user.companyId || null);
  return { leaveBalance: bal };
}
async function toolGetPayrollSummary(user, args = {}) {
  if (user.role === 'employee') {
    return { error: 'Payroll summaries are not available to employees; use your own payslip.' };
  }
  const d = await buildDashboard({ department: args.department || null, companyId: user.companyId || null });
  return {
    payrollCost: d.payrollCost, payrollNet: d.payrollNet, avgSalary: d.avgSalary,
    payrollCostByDept: d.payrollCostByDept, payrollCostByMonth: d.payrollCostByMonth,
  };
}
async function toolSearchEmployees(user, args = {}) {
  const q = String(args.query || '').trim();
  if (!q) return { employees: [] };
  if (user.role === 'employee') {
    // Employees may only ever see themselves through search.
    const me = await Employee.findById(user.employeeId).populate('department', 'name').populate('designation', 'name').lean();
    if (!me) return { employees: [] };
    const hay = `${me.firstName} ${me.lastName} ${me.code} ${me.email}`.toLowerCase();
    if (!hay.includes(q.toLowerCase())) return { employees: [] };
    return { employees: [{ code: me.code, name: `${me.firstName} ${me.lastName}`, department: me.department?.name || null, designation: me.designation?.name || null, status: me.status }] };
  }
  const rows = await Employee.find({
    ...(user.companyId ? { companyId: user.companyId } : {}),
    $or: [
      { firstName: new RegExp(q, 'i') }, { lastName: new RegExp(q, 'i') },
      { code: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') },
    ],
  }).populate('department', 'name').populate('designation', 'name').limit(10).lean();
  return {
    employees: rows.map((e) => ({
      code: e.code, name: `${e.firstName} ${e.lastName}`, email: e.email,
      department: e.department?.name || null, designation: e.designation?.name || null,
      status: e.status,
    })),
  };
}

const TOOLS = {
  get_headcount: toolGetHeadcount,
  get_attendance_summary: toolGetAttendanceSummary,
  get_late_comers: toolGetLateComers,
  get_leave_summary: toolGetLeaveSummary,
  get_my_leave_balance: toolGetMyLeaveBalance,
  get_payroll_summary: toolGetPayrollSummary,
  search_employees: toolSearchEmployees,
};

// Refuse employee requests for another person's salary/pay data.
async function salaryRefusalIfNeeded(user, message) {
  if (user.role !== 'employee') return null;
  if (!/(salary|pay|basic|wage|earn)/i.test(message)) return null;
  // Own salary questions are still refused via tools (no salary tool exists);
  // only a request naming someone else is a colleague-salary refusal.
  const all = await Employee.find(user.companyId ? { companyId: user.companyId } : {}).select('firstName lastName code').lean();
  const me = user.employeeId ? all.find((e) => String(e._id) === String(user.employeeId)) : null;
  const lower = message.toLowerCase();
  const other = all.find((e) => e !== me && lower.includes(`${e.firstName} ${e.lastName}`.toLowerCase()));
  if (other) {
    return "Sorry, I can't share another employee's salary or pay details. You can ask about your own leave, attendance, or payslip instead. [AI-generated]";
  }
  if (/(colleague|teammate|other|someone else|his|her|their)/i.test(message)) {
    return "Sorry, I can't share another employee's salary or pay details. You can ask about your own leave, attendance, or payslip instead. [AI-generated]";
  }
  return null;
}

function policyAnswer(message) {
  const m = message.toLowerCase();
  if (/late|grace|09:00|9:00|office start|check-in time/.test(m)) return POLICY[0];
  if (/half day|half_day|5 hour/.test(m)) return POLICY[1];
  if (/weekend|holiday/.test(m)) return POLICY[2];
  if (/quota|annual|sick|casual|unpaid|leave.*day/.test(m)) return POLICY[3];
  if (/payroll|gross|hra|medical|deduction/.test(m)) return POLICY[4];
  if (/tax|slab/.test(m)) return POLICY[5];
  if (/camera|face|location|radius|gps/.test(m)) return POLICY[7];
  return null;
}

// Deterministic local engine: used when no AI key is configured, and as the
// fallback when the hosted LLM call fails or times out.
async function localAnswer(user, message) {
  const refusal = await salaryRefusalIfNeeded(user, message);
  if (refusal) return { answer: refusal, toolsUsed: [] };
  const m = message.toLowerCase();
  const toolsUsed = [];
  let data;
  if (/my leave|leave balance|how many.*leave.*(left|remain)|sick leaves.*left/.test(m)) {
    toolsUsed.push('get_my_leave_balance');
    data = await toolGetMyLeaveBalance(user);
    if (data.error) return { answer: `${data.error} [AI-generated]`, toolsUsed };
    const parts = data.leaveBalance.map((b) => (b.quota === null
      ? `${b.name}: unlimited` : `${b.name}: ${b.remaining} left (quota ${b.quota}, used ${b.used}, pending ${b.pending})`));
    return { answer: `Your leave balance: ${parts.join('; ')}. [AI-generated]`, toolsUsed };
  }
  if (/late/.test(m)) {
    toolsUsed.push('get_late_comers');
    data = await toolGetLateComers(user);
    const list = data.topLateComers.map((c) => `${c.name} (${c.lateCount})`).join(', ') || 'no late-comers recorded';
    return { answer: `Top late-comers: ${list}. [AI-generated]`, toolsUsed };
  }
  if (/headcount|how many employees|how many.*in .*department/.test(m)) {
    toolsUsed.push('get_headcount');
    data = await toolGetHeadcount(user, {});
    return { answer: `There are ${data.headcount} active/probation employees. By department: ${data.headcountByDept.map((d) => `${d.department}: ${d.headcount}`).join(', ') || 'none yet'}. [AI-generated]`, toolsUsed };
  }
  if (/attendance/.test(m)) {
    toolsUsed.push('get_attendance_summary');
    data = await toolGetAttendanceSummary(user, {});
    return { answer: `Attendance rate ${data.attendanceRate}% (late ${data.latePercent}%). Present today: ${data.presentToday}, late today: ${data.lateToday}, on leave today: ${data.onLeaveToday}. [AI-generated]`, toolsUsed };
  }
  if (/leave/.test(m)) {
    toolsUsed.push('get_leave_summary');
    data = await toolGetLeaveSummary(user, {});
    if (data.myLeaveBalance) {
      return { answer: `Your leave balance: ${data.myLeaveBalance.map((b) => `${b.name}: ${b.remaining === null ? 'unlimited' : `${b.remaining} left`}`).join(', ')}. [AI-generated]`, toolsUsed };
    }
    return { answer: `Leave by type (approved days): ${Object.entries(data.leaveByType).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none yet'}. On leave today: ${data.onLeaveToday}, pending requests: ${data.pendingLeave}. [AI-generated]`, toolsUsed };
  }
  if (/payroll|cost|salary cost/.test(m)) {
    toolsUsed.push('get_payroll_summary');
    data = await toolGetPayrollSummary(user, {});
    if (data.error) return { answer: `${data.error} [AI-generated]`, toolsUsed };
    return { answer: `Payroll cost (gross) in the period: ${data.payrollCost}, net: ${data.payrollNet}, average basic salary: ${data.avgSalary}. [AI-generated]`, toolsUsed };
  }
  if (/who is|on leave today|who.*leave/.test(m)) {
    toolsUsed.push('get_leave_summary');
    data = await toolGetLeaveSummary(user, {});
    return { answer: `Employees on leave today: ${data.onLeaveToday}. [AI-generated]`, toolsUsed };
  }
  const policy = policyAnswer(message);
  if (policy) return { answer: `${policy} [AI-generated]`, toolsUsed };
  // Employee-name search fallback.
  const nameMatch = message.match(/([A-Z][a-z]+ [A-Z][a-z]+)/);
  if (nameMatch) {
    toolsUsed.push('search_employees');
    data = await toolSearchEmployees(user, { query: nameMatch[1] });
    if (!data.employees.length) return { answer: `I don't know — I couldn't find an employee matching that name in the data I can see. [AI-generated]`, toolsUsed };
    const e = data.employees[0];
    return { answer: `${e.name} (${e.code}), ${e.designation || ''} in ${e.department || 'no department'}, status ${e.status}. [AI-generated]`, toolsUsed };
  }
  return { answer: "I don't know — I can only answer from the HR data I can see and the company rules (office hours, leave quotas, payroll formula, tax slab). Try asking about headcount, attendance, late-comers, leave, or payroll. [AI-generated]", toolsUsed };
}

module.exports = { TOOLS, POLICY, localAnswer, scopeFor };
