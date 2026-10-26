const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  designation: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation', default: null },
  joiningDate: { type: String, required: true }, // YYYY-MM-DD
  exitDate: { type: String, default: null }, // YYYY-MM-DD, when status becomes exited
  salaryBasic: { type: Number, required: true, min: 0.01 },
  salaryHra: { type: Number, default: null }, // override; default 40% of basic
  salaryMedical: { type: Number, default: null }, // override; default 10% of basic
  status: { type: String, enum: ['active', 'probation', 'exited'], default: 'active' },
  gender: { type: String, default: '' },
  employmentType: { type: String, default: 'full-time' },
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);
