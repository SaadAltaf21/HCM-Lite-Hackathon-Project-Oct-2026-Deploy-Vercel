const mongoose = require('mongoose');

const aiLogSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Setting', default: null, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  question: { type: String, required: true },
  toolsUsed: { type: [String], default: [] },
  answer: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('AiLog', aiLogSchema);
