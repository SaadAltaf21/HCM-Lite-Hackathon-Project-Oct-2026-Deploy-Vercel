const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Setting', default: null, index: true },
  name: { type: String, required: true, trim: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
}, { timestamps: true });

designationSchema.index({ companyId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Designation', designationSchema);
