const mongoose = require('mongoose');

// One record per employee per day (unique index below).
const attendanceSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Setting', default: null, index: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  checkIn: { type: String, default: null }, // HH:MM:SS (server-stamped)
  checkOut: { type: String, default: null },
  hours: { type: Number, default: null },
  status: {
    type: String,
    enum: ['present', 'late', 'half_day', 'missing_checkout', 'absent', 'on_leave'],
    default: 'present',
  },
  source: { type: String, enum: ['web', 'camera'], default: 'web' },
}, { timestamps: true });

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
