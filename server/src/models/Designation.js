const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
}, { timestamps: true });

module.exports = mongoose.model('Designation', designationSchema);
