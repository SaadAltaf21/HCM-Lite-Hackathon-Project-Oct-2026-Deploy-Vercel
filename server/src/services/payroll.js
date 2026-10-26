// Payroll Lite (brief §3 M6).
// Gross = 1.5 x basic (HRA 40%, medical 10%). Per-day = gross / working days.
// Deduction = (absent + unpaid + 0.5 x half days) x gross / working days.
// Tax: annualised on gross x 12, then divided by 12 for the month.
// Joiners/leavers are prorated by working days actually employed in the month.
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const LeaveType = require('../models/LeaveType');
const { workingDaysBetween, eachDate, isWeekend, holidaySet, parseDate, fmtDate, todayStr } = require('./rules');

function annualTax(annualGross) {
  if (annualGross <= 600000) return 0;
  if (annualGross <= 1200000) return (annualGross - 600000) * 0.05;
  if (annualGross <= 2400000) return 30000 + (annualGross - 1200000) * 0.15;
  if (annualGross <= 3600000) return 210000 + (annualGross - 2400000) * 0.25;
  return 510000 + (annualGross - 3600000) * 0.35;
}
const round2 = (n) => Math.round(n * 100) / 100;

function structureFor(emp) {
  const basic = emp.salaryBasic;
  const hra = emp.salaryHra ?? basic * 0.4;
  const medical = emp.salaryMedical ?? basic * 0.1;
  return { basic, hra, medical, gross: basic + hra + medical }; // = 1.5 x basic by default
}

async function computePayrollRun(month, companyId) {
  const [year, mon] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = fmtDate(new Date(year, mon, 0)); // last day of month
  const Setting = require('../models/Setting');
  const setting = (companyId ? await Setting.findById(companyId) : await Setting.findOne()) || {};
  const workingDaysList = await workingDaysBetween(monthStart, monthEnd, setting);
  const workingDays = workingDaysList.length;
  const workingSet = new Set(workingDaysList);

  const leaveTypes = await LeaveType.find(companyId ? { companyId } : {}).lean();
  const unpaidIds = new Set(leaveTypes
    .filter((t) => t.name.toLowerCase() === 'unpaid' || t.annualQuota === null)
    .map((t) => String(t._id)));

  // Employees who joined on/before month end (exited staff are included only
  // when an exitDate exists, prorated up to that date).
  const employees = await Employee.find({
    ...(companyId ? { companyId } : {}),
    joiningDate: { $lte: monthEnd },
    $or: [{ exitDate: null }, { exitDate: { $gte: monthStart } }, { status: { $ne: 'exited' } }],
  }).lean();
  const empIds = employees.map((e) => e._id);
  const attendance = await Attendance.find({
    employee: { $in: empIds }, date: { $gte: monthStart, $lte: monthEnd },
  }).lean();
  const leaves = await LeaveRequest.find({
    employee: { $in: empIds }, status: 'approved',
    startDate: { $lte: monthEnd }, endDate: { $gte: monthStart },
  }).lean();

  const items = [];
  for (const emp of employees) {
    const employedWorking = workingDaysList.filter((d) => {
      if (emp.joiningDate && d < emp.joiningDate) return false;
      if (emp.exitDate && d > emp.exitDate) return false;
      return true;
    });
    const daysEmployed = employedWorking.length;
    const empAttendance = attendance.filter((a) => String(a.employee) === String(emp._id));
    const attendedDates = new Set(empAttendance.map((a) => a.date));
    // A run created mid-month must not count future working days as absent:
    // absent/unpaid/half-day days are counted only up to today (for a
    // completed month, accountedEnd == monthEnd, so the full month counts).
    const accountedEnd = monthEnd < todayStr() ? monthEnd : todayStr();
    const halfDays = empAttendance.filter((a) => a.status === 'half_day' && a.date <= accountedEnd).length;

    // Approved-leave working days inside this month, split paid vs unpaid.
    let unpaidDays = 0;
    const leaveDates = new Set();
    for (const lv of leaves.filter((l) => String(l.employee) === String(emp._id))) {
      const isUnpaid = unpaidIds.has(String(lv.leaveType));
      for (const d of eachDate(lv.startDate, lv.endDate)) {
        if (!workingSet.has(d) || d < monthStart || d > monthEnd) continue;
        if (!employedWorking.includes(d)) continue;
        leaveDates.add(d);
        if (isUnpaid && d <= accountedEnd) unpaidDays += 1;
      }
    }
    // Absent = employed working days up to today with no attendance record
    // and no approved leave.
    const absentDays = employedWorking.filter((d) => d <= accountedEnd && !attendedDates.has(d) && !leaveDates.has(d)).length;

    const { basic, hra, medical, gross: fullGross } = structureFor(emp);
    const prorate = workingDays ? daysEmployed / workingDays : 0;
    const gross = round2(fullGross * prorate);
    const proratedHra = round2(hra * prorate);
    const proratedMedical = round2(medical * prorate);
    const deduction = workingDays
      ? round2(((absentDays + unpaidDays + 0.5 * halfDays) * fullGross) / workingDays) : 0;
    // Tax on the contractual annual gross, prorated for partial months.
    const tax = round2((annualTax(fullGross * 12) / 12) * prorate);
    // Net pay can never go below zero: deductions + tax are capped at gross.
    const net = Math.max(0, round2(gross - deduction - tax));
    items.push({
      employee: emp._id, employeeName: `${emp.firstName} ${emp.lastName}`,
      employeeCode: emp.code, department: emp.department, basic,
      gross, hra: proratedHra, medical: proratedMedical, workingDays,
      daysEmployed, absentDays, unpaidDays, halfDays, deduction, tax, net,
    });
  }
  return { month, workingDays, items };
}

module.exports = { annualTax, structureFor, computePayrollRun, round2 };
