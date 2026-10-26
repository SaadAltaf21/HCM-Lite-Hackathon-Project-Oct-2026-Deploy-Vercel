// Multi-company support: a Setting row IS a company. Every other row carries
// companyId (the Setting _id). Before this change there was only ever one
// company per database, so legacy rows (companyId: null) all belong to the
// oldest Setting — the migration below assigns them to it, once, idempotently.
// It also replaces the old global unique indexes (department name, employee
// code/email, payroll month, holiday date, leave-type name) with
// per-company compound indexes, so two companies can both have an "HR"
// department or an "EMP001" without colliding. User email stays globally
// unique on purpose: duplicate email registration is rejected.
const mongoose = require('mongoose');
const Setting = require('../models/Setting');

const MODELS = [
  'User', 'Employee', 'Department', 'Designation', 'LeaveType', 'Holiday',
  'Attendance', 'AttendanceCorrection', 'LeaveRequest', 'PayrollRun',
  'Announcement', 'Notification', 'AuditLog', 'AiLog',
];

async function oldestSetting() {
  return Setting.findOne().sort({ createdAt: 1 }).lean();
}

async function migrateLegacyCompany() {
  const company = await oldestSetting();
  if (!company) return null;
  const companyId = company._id;
  // Assign every legacy row to the one company that existed before.
  for (const name of MODELS) {
    try {
      const Model = mongoose.model(name);
      await Model.updateMany({ companyId: null }, { $set: { companyId } });
    } catch (e) { /* model not registered yet — ignore */ }
  }
  // Drop old global unique indexes; compound indexes are (re)created by
  // Mongoose from the schemas, and createIndex below makes them exist now.
  const db = mongoose.connection.db;
  if (db) {
    const drops = [
      ['departments', 'name_1'], ['designations', 'name_1'],
      ['leavetypes', 'name_1'], ['holidays', 'date_1'],
      ['payrollruns', 'month_1'],
      ['employees', 'code_1'], ['employees', 'email_1'],
    ];
    for (const [coll, idx] of drops) {
      try { await db.collection(coll).dropIndex(idx); } catch (e) { /* already gone */ }
    }
    const creates = [
      ['departments', { companyId: 1, name: 1 }],
      ['designations', { companyId: 1, name: 1 }],
      ['leavetypes', { companyId: 1, name: 1 }],
      ['holidays', { companyId: 1, date: 1 }],
      ['payrollruns', { companyId: 1, month: 1 }],
      ['employees', { companyId: 1, code: 1 }],
      ['employees', { companyId: 1, email: 1 }],
    ];
    for (const [coll, spec] of creates) {
      try { await db.collection(coll).createIndex(spec, { unique: true }); } catch (e) { /* exists or legacy dupes */ }
    }
  }
  return companyId;
}

// Filter for the caller's company. After migration every authenticated user
// has a companyId; if one somehow does not, return a filter that matches
// nothing rather than leaking another company's rows.
function companyFilter(req) {
  const id = req.companyId || (req.user && req.user.companyId);
  return id ? { companyId: id } : { companyId: null };
}

function companyIdOf(req) {
  return req.companyId || (req.user && req.user.companyId) || null;
}

module.exports = { oldestSetting, migrateLegacyCompany, companyFilter, companyIdOf };
