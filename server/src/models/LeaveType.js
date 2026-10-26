const mongoose = require('mongoose');

// annualQuota null = unlimited (used for "unpaid").
const leaveTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  annualQuota: { type: Number, default: null, min: 0 },
}, { timestamps: true });

module.exports = mongoose.model('LeaveType', leaveTypeSchema);
