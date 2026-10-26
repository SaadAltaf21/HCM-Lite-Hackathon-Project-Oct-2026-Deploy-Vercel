// Attendance: server-stamped web check-in/out, daily board, calendar,
// corrections, and camera check-in (face count + GPS geofence, server-decided).
const express = require('express');
const Attendance = require('../models/Attendance');
const AttendanceCorrection = require('../models/AttendanceCorrection');
const Employee = require('../models/Employee');
const LeaveRequest = require('../models/LeaveRequest');
const Notification = require('../models/Notification');
const { auth, requireRole, assertOwnEmployee, ownEmployeeId, scopeFilter } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const {
  getSetting, todayStr, timeStr, statusAtCheckIn, statusAtCheckOut, hoursBetween,
  derivedStatus, haversineMeters, isValidDateStr,
} = require('../services/rules');

const router = express.Router();
router.use(auth);

async function resolveEmployee(req, res) {
  const id = ownEmployeeId(req);
  if (req.user.role === 'employee' || req.user.role === 'hr') {
    if (!id) { res.status(403).json({ error: 'This login is not linked to an employee record' }); return null; }
    const emp = await Employee.findById(id);
    if (!emp) { res.status(404).json({ error: 'Employee record not found' }); return null; }
    return emp;
  }
  res.status(403).json({ error: 'Forbidden: insufficient role' });
  return null;
}

async function doCheckIn(emp, source) {
  const setting = await getSetting();
  const date = todayStr();
  const existing = await Attendance.findOne({ employee: emp._id, date });
  if (existing) return { conflict: true };
  const checkIn = timeStr();
  const rec = await Attendance.create({
    employee: emp._id, date, checkIn, status: statusAtCheckIn(checkIn, setting), source,
  });
  return { rec, setting };
}

router.post('/check-in', async (req, res) => {
  const emp = await resolveEmployee(req, res); if (!emp) return;
  const { rec, conflict } = await doCheckIn(emp, 'web');
  if (conflict) return res.status(409).json({ error: 'Already checked in today' });
  await logAudit(req, 'CREATE', 'Attendance', rec._id, null, { date: rec.date, checkIn: rec.checkIn });
  res.status(201).json(rec);
});

router.post('/check-out', async (req, res) => {
  const emp = await resolveEmployee(req, res); if (!emp) return;
  const date = todayStr();
  const rec = await Attendance.findOne({ employee: emp._id, date });
  if (!rec) return res.status(404).json({ error: 'No check-in found for today' });
  if (rec.checkOut) return res.status(409).json({ error: 'Already checked out today' });
  const setting = await getSetting();
  const checkOut = timeStr();
  rec.checkOut = checkOut;
  rec.hours = Math.round(hoursBetween(rec.checkIn, checkOut) * 100) / 100;
  rec.status = statusAtCheckOut(rec.checkIn, checkOut, setting);
  await rec.save();
  await logAudit(req, 'UPDATE', 'Attendance', rec._id, null, { checkOut, hours: rec.hours, status: rec.status });
  res.json(rec);
});

// Camera check-in: exactly 1 face, GPS accuracy <= 100m, inside office radius.
router.post('/camera-check-in', async (req, res) => {
  const emp = await resolveEmployee(req, res); if (!emp) return;
  const { faceCount, lat, lng, accuracy } = req.body || {};
  if (faceCount !== 1) return res.status(422).json({ error: 'Camera check-in rejected: exactly one face must be detected', reason: 'faceCount must be 1' });
  if (accuracy === undefined || accuracy === null || accuracy > 100) {
    return res.status(422).json({ error: 'Camera check-in rejected: GPS accuracy must be 100m or better', reason: 'accuracy > 100' });
  }
  if (lat === undefined || lng === undefined) return res.status(400).json({ error: 'lat and lng are required' });
  const setting = await getSetting();
  if (setting.officeLat === null || setting.officeLat === undefined || setting.officeLng === null || setting.officeLng === undefined) {
    return res.status(422).json({ error: 'Camera check-in rejected: office location is not configured', reason: 'office location not set' });
  }
  const distance = haversineMeters(Number(lat), Number(lng), setting.officeLat, setting.officeLng);
  if (distance > (setting.officeRadiusMeters ?? 150)) {
    return res.status(403).json({ error: 'Camera check-in rejected: outside office radius', reason: 'outside office radius', distanceMeters: Math.round(distance) });
  }
  const { rec, conflict } = await doCheckIn(emp, 'camera');
  if (conflict) return res.status(409).json({ error: 'Already checked in today' });
  await logAudit(req, 'CREATE', 'Attendance', rec._id, null, { date: rec.date, checkIn: rec.checkIn, source: 'camera' });
  res.status(201).json({ ...rec.toObject(), distanceMeters: Math.round(distance) });
});

// GET /api/attendance/board?date=&department= (admin/hr all, employee own)
router.get('/board', async (req, res) => {
  const date = req.query.date || todayStr();
  if (!isValidDateStr(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  let empFilter = {};
  if (req.query.department) empFilter.department = req.query.department;
  if (req.user.role === 'employee') {
    if (!ownEmployeeId(req)) return res.json({ date, records: [], summary: {} });
    empFilter._id = req.user.employeeId;
  } else if (req.user.role !== 'admin' && req.user.role !== 'hr') {
    return res.status(403).json({ error: 'Forbidden: insufficient role' });
  }
  const employees = await Employee.find(empFilter).lean();
  const ids = employees.map((e) => e._id);
  const records = await Attendance.find({ employee: { $in: ids }, date })
    .populate('employee', 'code firstName lastName department').lean();
  const withDerived = records.map((r) => ({ ...r, status: derivedStatus(r, date) }));
  const onLeave = await LeaveRequest.find({
    employee: { $in: ids }, status: 'approved', startDate: { $lte: date }, endDate: { $gte: date },
  }).lean();
  const onLeaveIds = new Set(onLeave.map((l) => String(l.employee)));
  const recordedIds = new Set(records.map((r) => String(r.employee)));
  const absent = employees.filter((e) => !recordedIds.has(String(e._id)) && !onLeaveIds.has(String(e._id))).length;
  res.json({
    date,
    records: withDerived,
    summary: {
      present: withDerived.filter((r) => r.status === 'present').length,
      late: withDerived.filter((r) => r.status === 'late').length,
      halfDay: withDerived.filter((r) => r.status === 'half_day').length,
      missingCheckout: withDerived.filter((r) => r.status === 'missing_checkout').length,
      onLeave: onLeave.length, absent, totalEmployees: employees.length,
    },
  });
});

router.get('/mine', async (req, res) => {
  if (!ownEmployeeId(req)) return res.status(403).json({ error: 'This login is not linked to an employee record' });
  const records = await Attendance.find({ employee: req.user.employeeId }).sort({ date: -1 }).limit(100).lean();
  res.json(records.map((r) => ({ ...r, status: derivedStatus(r) })));
});

router.get('/calendar', async (req, res) => {
  const { employeeId, month } = req.query;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });
  const target = employeeId || ownEmployeeId(req);
  if (!target) return res.status(403).json({ error: 'employeeId is required' });
  if (!assertOwnEmployee(req, res, target)) return;
  const records = await Attendance.find({
    employee: target, date: { $gte: `${month}-01`, $lte: `${month}-31` },
  }).sort({ date: 1 }).lean();
  res.json(records.map((r) => ({ ...r, status: derivedStatus(r) })));
});

// Corrections
router.post('/corrections', async (req, res) => {
  const emp = await resolveEmployee(req, res); if (!emp) return;
  const { date, requestedCheckIn, requestedCheckOut, reason } = req.body || {};
  if (!date || !isValidDateStr(date) || !reason) return res.status(400).json({ error: 'date (YYYY-MM-DD) and reason are required' });
  const attendance = await Attendance.findOne({ employee: emp._id, date });
  const corr = await AttendanceCorrection.create({
    employee: emp._id, attendance: attendance?._id || null, date,
    requestedCheckIn: requestedCheckIn || null, requestedCheckOut: requestedCheckOut || null, reason,
  });
  await logAudit(req, 'CREATE', 'AttendanceCorrection', corr._id, null, { date, reason });
  res.status(201).json(corr);
});

router.get('/corrections', async (req, res) => {
  const filter = scopeFilter(req);
  const rows = await AttendanceCorrection.find(filter)
    .populate('employee', 'code firstName lastName').sort({ createdAt: -1 });
  res.json(rows);
});

router.patch('/corrections/:id', requireRole('hr'), async (req, res) => {
  const { status, approverComment } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'status must be approved or rejected' });
  const corr = await AttendanceCorrection.findById(req.params.id);
  if (!corr) return res.status(404).json({ error: 'Correction not found' });
  if (corr.status !== 'pending') return res.status(409).json({ error: 'Correction already decided' });
  const before = corr.toObject();
  corr.status = status; corr.approverComment = approverComment || '';
  await corr.save();
  let updatedAttendance = null;
  if (status === 'approved') {
    const setting = await getSetting();
    const rec = await Attendance.findOne({ employee: corr.employee, date: corr.date });
    if (rec) {
      if (corr.requestedCheckIn) rec.checkIn = corr.requestedCheckIn;
      if (corr.requestedCheckOut) rec.checkOut = corr.requestedCheckOut;
      if (rec.checkIn && rec.checkOut) {
        rec.hours = Math.round(hoursBetween(rec.checkIn, rec.checkOut) * 100) / 100;
        rec.status = statusAtCheckOut(rec.checkIn, rec.checkOut, setting);
      } else if (rec.checkIn) rec.status = statusAtCheckIn(rec.checkIn, setting);
      await rec.save(); updatedAttendance = rec;
    } else if (corr.requestedCheckIn) {
      updatedAttendance = await Attendance.create({
        employee: corr.employee, date: corr.date, checkIn: corr.requestedCheckIn,
        checkOut: corr.requestedCheckOut || null, source: 'web',
        status: corr.requestedCheckOut
          ? statusAtCheckOut(corr.requestedCheckIn, corr.requestedCheckOut, setting)
          : statusAtCheckIn(corr.requestedCheckIn, setting),
        hours: corr.requestedCheckOut ? Math.round(hoursBetween(corr.requestedCheckIn, corr.requestedCheckOut) * 100) / 100 : null,
      });
    }
    const emp = await Employee.findById(corr.employee);
    if (emp && emp.user) await Notification.create({ user: emp.user, message: `Your attendance correction for ${corr.date} was approved.`, type: 'correction' });
  } else {
    const emp = await Employee.findById(corr.employee);
    if (emp && emp.user) await Notification.create({ user: emp.user, message: `Your attendance correction for ${corr.date} was rejected.${approverComment ? ` ${approverComment}` : ''}`, type: 'correction' });
  }
  await logAudit(req, 'UPDATE', 'AttendanceCorrection', corr._id, before, corr);
  res.json({ correction: corr, attendance: updatedAttendance });
});

module.exports = router;
