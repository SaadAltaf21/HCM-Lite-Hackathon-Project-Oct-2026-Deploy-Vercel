// Audit helper: best-effort, never breaks the main request if logging fails.
const AuditLog = require('../models/AuditLog');

async function logAudit(req, action, entity, entityId, before, after) {
  try {
    await AuditLog.create({
      actor: req && req.user ? req.user._id : null,
      actorEmail: req && req.user ? req.user.email : null,
      action,
      entity,
      entityId: entityId ? String(entityId) : null,
      before: before === undefined ? null : before,
      after: after === undefined ? null : after,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { logAudit };
