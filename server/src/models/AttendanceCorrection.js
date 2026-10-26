const mongoose = require('mongoose');

const correctionSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  attendance: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', default: null },
  date: { type: String, required: true }, // YYYY-MM-DD
  requestedCheckIn: { type: String, default: null }, // HH:MM
  requestedCheckOut: { type: String, default: null },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approverComment: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('AttendanceCorrection', correctionSchema);
