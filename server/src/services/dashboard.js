// Dashboards: every number is computed here from the database — nothing is
// hardcoded. Filters: ?from=YYYY-MM-DD&to=YYYY-MM-DD&department=<id>
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const LeaveType = require('../models/LeaveType');
const PayrollRun = require('../models/PayrollRun');
const Department = require('../models/Department');
const { todayStr, parseDate, fmtDate, derivedStatus, eachDate, isWeekend, holidaySet } = require('./rules');

async function leaveBalanceFor(employeeId, year) {
  const types = await LeaveType.find().lean();
  const reqs = await LeaveRequest.find({
    employee: employeeId,
    status: { $in: ['approved', 'pending'] },
    startDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
  }).lean();
  return types.map((t) => {
    const used = reqs.filter((r) => String(r.leaveType) === String(t._id) && r.status === 'approved')
      .reduce((s, r) => s + r.workingDays, 0);
    const pending = reqs.filter((r) => String(r.leaveType) === String(t._id) && r.status === 'pending')
      .reduce((s, r) => s + r.workingDays, 0);
    const unlimited = t.annualQuota === null || t.name.toLowerCase() === 'unpaid';
    return {
      leaveType: t._id, name: t.name, quota: unlimited ? null : t.annualQuota,
      used, pending, remaining: unlimited ? null : (t.annualQuota - used - pending),
    };
  });
}

async function buildDashboard({ from, to, department, employeeId = null }) {
  const today = todayStr();
  const empFilter = { status: { $in: ['active', 'probation'] } };
  if (department) empFilter.department = department;
  if (employeeId) empFilter._id = employeeId;
  const employees = await Employee.find(empFilter).populate('department', 'name').lean();
  const empIds = employees.map((e) => e._id);
  const empById = new Map(employees.map((e) => [String(e._id), e]));

  // Period defaults to the current month when no range is given.
  const periodFrom = from || `${today.slice(0, 7)}-01`;
  const periodTo = to || today;
  const attendance = await Attendance.find({
    employee: { $in: empIds }, date: { $gte: periodFrom, $lte: periodTo },
  }).lean();
  const leaves = await LeaveRequest.find({
    employee: { $in: empIds }, status: { $in: ['approved', 'pending'] },
    startDate: { $lte: periodTo }, endDate: { $gte: periodFrom },
  }).populate('leaveType', 'name').lean();

  const todayAtt = await Attendance.find({ employee: { $in: empIds }, date: today }).lean();
  const onLeaveToday = leaves.filter((l) => l.status === 'approved' && l.startDate <= today && l.endDate >= today);
  const presentToday = todayAtt.filter((a) => derivedStatus(a) !== 'absent').length;
  const lateToday = todayAtt.filter((a) => derivedStatus(a) === 'late').length;

  // Attendance rate (brief §7): (present+late+missing_checkout+0.5*half) / (records - on_leave)
  const counts = { present: 0, late: 0, half_day: 0, missing_checkout: 0 };
  for (const a of attendance) {
    const s = derivedStatus(a);
    if (counts[s] !== undefined) counts[s] += 1;
  }
  const numerator = counts.present + counts.late + counts.missing_checkout + 0.5 * counts.half_day;
  const denominator = attendance.length;
  const attendanceRate = denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
  const latePct = (counts.present + counts.late)
    ? Math.round((counts.late / (counts.present + counts.late)) * 1000) / 10 : 0;

  // Per-department absenteeism + headcount.
  const byDept = {};
  for (const e of employees) {
    const name = (e.department && e.department.name) || 'Unassigned';
    byDept[name] = byDept[name] || { department: name, headcount: 0, late: 0, absent: 0, expected: 0 };
    byDept[name].headcount += 1;
  }
  for (const a of attendance) {
    const e = empById.get(String(a.employee));
    if (!e) continue;
    const name = (e.department && e.department.name) || 'Unassigned';
    if (!byDept[name]) byDept[name] = { department: name, headcount: 0, late: 0, absent: 0, expected: 0 };
    if (derivedStatus(a) === 'late') byDept[name].late += 1;
    byDept[name].expected += 1;
  }
  // Absent days in period: working days (Mon-Fri approx via weekend rule) minus
  // attended / approved-leave days — computed per employee per working day.
  const Setting = require('../models/Setting');
  const setting = (await Setting.findOne()) || { weekendDays: ['Sat', 'Sun'] };
  const holidays = await holidaySet(periodFrom, periodTo);
  const workingDates = eachDate(periodFrom, periodTo)
    .filter((d) => !isWeekend(d, setting) && !holidays.has(d));
  const attendedByEmp = new Map();
  for (const a of attendance) {
    if (!attendedByEmp.has(String(a.employee))) attendedByEmp.set(String(a.employee), new Set());
    attendedByEmp.get(String(a.employee)).add(a.date);
  }
  const leaveDatesByEmp = new Map();
  for (const l of leaves.filter((x) => x.status === 'approved')) {
    if (!leaveDatesByEmp.has(String(l.employee))) leaveDatesByEmp.set(String(l.employee), new Set());
    for (const d of eachDate(l.startDate, l.endDate)) leaveDatesByEmp.get(String(l.employee)).add(d);
  }
  for (const e of employees) {
    const name = (e.department && e.department.name) || 'Unassigned';
    const attended = attendedByEmp.get(String(e._id)) || new Set();
    const onLeave = leaveDatesByEmp.get(String(e._id)) || new Set();
    const absent = workingDates.filter((d) => !attended.has(d) && !onLeave.has(d)).length;
    byDept[name].absent += absent;
    byDept[name].expected += absent;
  }
  const absenteeismByDept = Object.values(byDept).map((d) => ({
    ...d,
    absenteeismPct: d.expected ? Math.round((d.absent / d.expected) * 1000) / 10 : 0,
  }));

  const leaveByType = {};
  for (const l of leaves.filter((x) => x.status === 'approved')) {
    const name = (l.leaveType && l.leaveType.name) || 'unknown';
    leaveByType[name] = (leaveByType[name] || 0) + l.workingDays;
  }
  const lateCounts = {};
  for (const a of attendance) {
    if (derivedStatus(a) !== 'late') continue;
    lateCounts[String(a.employee)] = (lateCounts[String(a.employee)] || 0) + 1;
  }
  const topLateComers = Object.entries(lateCounts)
    .map(([id, count]) => {
      const e = empById.get(id);
      return { employeeId: id, name: e ? `${e.firstName} ${e.lastName}` : id, code: e ? e.code : null, lateCount: count };
    })
    .sort((a, b) => b.lateCount - a.lateCount).slice(0, 5);

  const pendingLeave = await LeaveRequest.countDocuments({ employee: { $in: empIds }, status: 'pending' });
  const AttendanceCorrection = require('../models/AttendanceCorrection');
  const pendingCorrections = await AttendanceCorrection.countDocuments({ employee: { $in: empIds }, status: 'pending' });

  // Payroll cost from runs in the period (by run month overlapping the range).
  const runMonths = new Set();
  { const cur = parseDate(periodFrom); const end = parseDate(periodTo);
    while (cur <= end) { runMonths.add(fmtDate(cur).slice(0, 7)); cur.setMonth(cur.getMonth() + 1); } }
  const runs = await PayrollRun.find({ month: { $in: [...runMonths] } }).lean();
  let payrollCost = 0; let payrollNet = 0;
  const payrollByDept = {}; const payrollByMonth = {};
  const deptNameById = new Map((await Department.find().lean()).map((d) => [String(d._id), d.name]));
  for (const run of runs) {
    payrollByMonth[run.month] = payrollByMonth[run.month] || { month: run.month, gross: 0, net: 0 };
    for (const item of run.items) {
      if (employeeId && String(item.employee) !== String(employeeId)) continue;
      payrollCost += item.gross; payrollNet += item.net;
      payrollByMonth[run.month].gross += item.gross; payrollByMonth[run.month].net += item.net;
      const dn = deptNameById.get(String(item.department)) || 'Unassigned';
      payrollByDept[dn] = payrollByDept[dn] || { department: dn, gross: 0, net: 0 };
      payrollByDept[dn].gross += item.gross; payrollByDept[dn].net += item.net;
    }
  }
  const avgSalary = employees.length
    ? Math.round((employees.reduce((s, e) => s + (e.salaryBasic || 0), 0) / employees.length) * 100) / 100 : 0;
  const headcountByDept = Object.values(byDept).map((d) => ({ department: d.department, headcount: d.headcount }));
  const exitedYTD = await Employee.countDocuments({
    status: 'exited', ...(department ? { department } : {}),
  });
  const avgHeadcount = Math.max(1, (employees.length + exitedYTD) / 2);
  const attritionYTD = Math.round(((exitedYTD / avgHeadcount) * 100) * 10) / 10;

  // 7-day trend (last 7 days ending today).
  const trend = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = fmtDate(d);
    const dayAtt = await Attendance.find({ employee: { $in: empIds }, date: ds }).lean();
    trend.push({
      date: ds,
      present: dayAtt.filter((a) => derivedStatus(a) === 'present').length,
      late: dayAtt.filter((a) => derivedStatus(a) === 'late').length,
      onLeave: leaves.filter((l) => l.status === 'approved' && l.startDate <= ds && l.endDate >= ds).length,
    });
  }

  return {
    headcount: employees.length, presentToday, onLeaveToday: onLeaveToday.length, lateToday,
    pendingApprovals: pendingLeave + pendingCorrections, pendingLeave, pendingCorrections,
    attendanceRate, latePercent: latePct, absenteeismByDept, leaveByType,
    topLateComers, payrollCost, payrollNet, payrollCostByDept: Object.values(payrollByDept),
    payrollCostByMonth: Object.values(payrollByMonth), avgSalary, headcountByDept,
    attritionYTD, exitedYTD, trend, period: { from: periodFrom, to: periodTo },
  };
}

async function employeeDashboard(user, { from, to }) {
  const emp = await Employee.findById(user.employeeId).populate('department', 'name').populate('designation', 'name').lean();
  if (!emp) return null;
  const base = await buildDashboard({ from, to, employeeId: emp._id });
  const today = todayStr();
  // Hours this week (Monday-Sunday) vs 40.
  const now = new Date();
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const weekAtt = await Attendance.find({
    employee: emp._id, date: { $gte: fmtDate(monday), $lte: fmtDate(sunday) },
  }).lean();
  const hoursThisWeek = Math.round(weekAtt.reduce((s, a) => s + (a.hours || 0), 0) * 100) / 100;
  const monthAtt = await Attendance.find({
    employee: emp._id, date: { $gte: `${today.slice(0, 7)}-01`, $lte: today },
  }).lean();
  const lateCount = monthAtt.filter((a) => derivedStatus(a) === 'late').length;
  const year = Number(today.slice(0, 4));
  const leaveBalance = await leaveBalanceFor(emp._id, year);
  const PayrollRunM = require('../models/PayrollRun');
  const runs = await PayrollRunM.find().sort({ month: -1 }).lean();
  let lastPayslip = null;
  for (const run of runs) {
    const item = run.items.find((i) => String(i.employee) === String(emp._id));
    if (item) { lastPayslip = { month: run.month, status: run.status, ...item }; break; }
  }
  const Announcement = require('../models/Announcement');
  const announcements = await Announcement.find().sort({ createdAt: -1 }).limit(5).lean();
  return {
    employee: emp, hoursThisWeek, hoursTarget: 40, lateCount, leaveBalance,
    lastPayslip, announcements, attendanceRate: base.attendanceRate,
    presentToday: base.presentToday, onLeaveToday: base.onLeaveToday,
  };
}

module.exports = { buildDashboard, leaveBalanceFor, employeeDashboard };
