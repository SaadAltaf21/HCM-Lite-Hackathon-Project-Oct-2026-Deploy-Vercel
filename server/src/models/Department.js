const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Setting', default: null, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
}, { timestamps: true });

departmentSchema.index({ companyId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Department', departmentSchema);
