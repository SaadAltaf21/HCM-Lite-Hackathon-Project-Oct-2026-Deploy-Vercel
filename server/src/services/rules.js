// Shared business rules (brief §3). All routes/services use these helpers
// so dashboards, payroll and the AI always agree with each other.
const Holiday = require('../models/Holiday');

const WEEKDAY_NUM = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function isValidMonthStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}$/.test(s)
    && Number(s.slice(5, 7)) >= 1 && Number(s.slice(5, 7)) <= 12;
}
function parseDate(s) { // local midnight, avoids UTC shifts
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function todayStr() { return fmtDate(new Date()); }
function timeStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function addMinutesToHHMM(hhmm, mins) {
  const total = toMinutes(hhmm) + mins;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(total / 60) % 24)}:${p(total % 60)}`;
}
function hoursBetween(t1, t2) {
  return (toMinutes(t2) - toMinutes(t1)) / 60;
}

async function getSetting(companyId) {
  const Setting = require('../models/Setting');
  let s = null;
  if (companyId) s = await Setting.findById(companyId);
  if (!s) s = await Setting.findOne();
  if (!s) s = { companyName: 'HCM Lite', officeStart: '09:00', graceMinutes: 15, weekendDays: ['Sat', 'Sun'], officeLat: null, officeLng: null, officeRadiusMeters: 150, halfDayHours: 5 };
  return s;
}
async function getDefaultLeaveTypes(companyId) {
  const LeaveType = require('../models/LeaveType');
  // Per company: each new company gets its own default leave types, so
  // companies never share (or clash on) leave-type rows.
  const filter = companyId ? { companyId } : {};
  const existing = await LeaveType.find(filter);
  if (existing.length) return existing;
  const defaults = [
    { name: 'annual', annualQuota: 14 },
    { name: 'sick', annualQuota: 8 },
    { name: 'casual', annualQuota: 10 },
    { name: 'unpaid', annualQuota: null },
  ];
  return LeaveType.insertMany(defaults.map((d) => ({ ...d, companyId: companyId || null })));
}

function isWeekend(dateStr, setting) {
  const days = (setting && setting.weekendDays && setting.weekendDays.length)
    ? setting.weekendDays : ['Sat', 'Sun'];
  const nums = new Set(days.map((d) => WEEKDAY_NUM[d]).filter((n) => n !== undefined));
  return nums.has(parseDate(dateStr).getDay());
}

async function holidaySet(start, end, companyId) {
  const filter = { date: { $gte: start, $lte: end } };
  if (companyId) filter.companyId = companyId;
  const rows = await Holiday.find(filter).lean();
  return new Set(rows.map((r) => r.date));
}
function eachDate(start, end) {
  const out = [];
  const cur = parseDate(start);
  const last = parseDate(end);
  while (cur <= last) { out.push(fmtDate(cur)); cur.setDate(cur.getDate() + 1); }
  return out;
}
// Working days = calendar days minus weekends minus holidays.
async function workingDaysBetween(start, end, setting) {
  const holidays = await holidaySet(start, end, setting && setting._id ? setting._id : null);
  return eachDate(start, end).filter((d) => !isWeekend(d, setting) && !holidays.has(d));
}
// Status at check-in: late only after office start + grace.
function statusAtCheckIn(checkInTime, setting) {
  const lateAfter = addMinutesToHHMM(setting.officeStart || '09:00', setting.graceMinutes ?? 15);
  return toMinutes(checkInTime) > toMinutes(lateAfter) ? 'late' : 'present';
}
// Status at check-out: under halfDayHours => half_day, else keep check-in status.
function statusAtCheckOut(checkInTime, checkOutTime, setting) {
  const hours = hoursBetween(checkInTime, checkOutTime);
  if (hours < (setting.halfDayHours ?? 5)) return 'half_day';
  return statusAtCheckIn(checkInTime, setting);
}
// A record from a past day with no check-out reads as missing_checkout.
function derivedStatus(record, today = todayStr()) {
  if (!record.checkOut && record.date < today) return 'missing_checkout';
  return record.status;
}
// Haversine distance in metres (server-side geofence decision).
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

module.exports = {
  WEEKDAY_NUM, isValidDateStr, isValidMonthStr, parseDate, fmtDate, todayStr, timeStr,
  toMinutes, addMinutesToHHMM, hoursBetween, getSetting, getDefaultLeaveTypes,
  isWeekend, holidaySet, eachDate, workingDaysBetween, statusAtCheckIn,
  statusAtCheckOut, derivedStatus, haversineMeters,
};
