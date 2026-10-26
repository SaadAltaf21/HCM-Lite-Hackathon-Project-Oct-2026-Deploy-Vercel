const mongoose = require('mongoose');

// annualQuota null = unlimited (used for "unpaid").
const leaveTypeSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Setting', default: null, index: true },
  name: { type: String, required: true, trim: true },
  annualQuota: { type: Number, default: null, min: 0 },
}, { timestamps: true });

leaveTypeSchema.index({ companyId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('LeaveType', leaveTypeSchema);
