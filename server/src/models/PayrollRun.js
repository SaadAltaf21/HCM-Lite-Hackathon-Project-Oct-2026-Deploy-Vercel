const mongoose = require('mongoose');

// Items snapshot the numbers at run time; a finalized run is never edited.
const payrollItemSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeName: { type: String, default: '' },
  employeeCode: { type: String, default: '' },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  basic: { type: Number, required: true },
  gross: { type: Number, required: true }, // prorated gross (see payroll service)
  hra: { type: Number, required: true },
  medical: { type: Number, required: true },
  workingDays: { type: Number, required: true },
  daysEmployed: { type: Number, required: true },
  absentDays: { type: Number, required: true },
  unpaidDays: { type: Number, required: true },
  halfDays: { type: Number, required: true },
  deduction: { type: Number, required: true },
  tax: { type: Number, required: true },
  net: { type: Number, required: true },
}, { _id: false });

const payrollRunSchema = new mongoose.Schema({
  month: { type: String, required: true, unique: true }, // YYYY-MM
  status: { type: String, enum: ['draft', 'finalized'], default: 'draft' },
  items: { type: [payrollItemSchema], default: [] },
  finalizedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('PayrollRun', payrollRunSchema);
