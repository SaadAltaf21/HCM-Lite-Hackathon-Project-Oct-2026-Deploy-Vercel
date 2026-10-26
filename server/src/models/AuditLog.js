const mongoose = require('mongoose');

// Append-only by convention: no route updates or deletes audit rows.
const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorEmail: { type: String, default: null },
  action: { type: String, required: true }, // e.g. CREATE, UPDATE, APPROVE, FINALIZE
  entity: { type: String, required: true },
  entityId: { type: String, default: null },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);
