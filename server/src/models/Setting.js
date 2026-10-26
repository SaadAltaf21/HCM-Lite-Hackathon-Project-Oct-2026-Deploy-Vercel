const mongoose = require('mongoose');

// Singleton company document: there is only ever one Setting row.
const settingSchema = new mongoose.Schema({
  companyName: { type: String, required: true, trim: true },
  officeStart: { type: String, default: '09:00' }, // HH:MM
  graceMinutes: { type: Number, default: 15, min: 0 },
  weekendDays: { type: [String], default: ['Sat', 'Sun'] }, // e.g. Sat, Sun
  officeLat: { type: Number, default: null },
  officeLng: { type: Number, default: null },
  officeRadiusMeters: { type: Number, default: 150, min: 0 },
  halfDayHours: { type: Number, default: 5, min: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Setting', settingSchema);
