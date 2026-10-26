// HCM Lite backend — Express + MongoDB (Mongoose) + JWT.
// Starts empty: no employees or dummy data are seeded. On startup, if
// ADMIN_EMAIL / ADMIN_PASSWORD are set and no users exist, an admin account
// and the default company setting + leave types are created.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { connectDB } = require('./config/db');
const User = require('./models/User');
const Setting = require('./models/Setting');
const { getDefaultLeaveTypes } = require('./services/rules');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => res.json({ ok: true, service: 'hcm-lite-server' }));
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'hcm-lite-server' }));

app.use('/api/setup', require('./routes/setup'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api', require('./routes/org')); // /api/departments, /designations, /leave-types, /holidays
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/leave', require('./routes/leave'));
app.use('/api/payroll', require('./routes/payroll'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/ai', require('./routes/ai'));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  if (err.code === 11000) return res.status(409).json({ error: 'Duplicate value' });
  res.status(500).json({ error: 'Internal server error' });
});

async function bootstrapAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, COMPANY_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  if (await User.countDocuments() > 0) return;
  await Setting.findOneAndUpdate({}, { companyName: COMPANY_NAME || 'HCM Lite' }, { upsert: true, new: true });
  await User.create({
    name: 'Admin', email: ADMIN_EMAIL.toLowerCase(),
    passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10), role: 'admin',
  });
  await getDefaultLeaveTypes();
  console.log(`Bootstrap admin created: ${ADMIN_EMAIL}`);
}

async function start() {
  await connectDB();
  await bootstrapAdmin();
  const port = process.env.PORT || 5000;
  const server = app.listen(port, () => console.log(`HCM Lite server listening on http://localhost:${port}`));
  // EADDRINUSE used to crash with a Node stack trace and, under
  // `node --watch`, left the process hanging in "waiting for file changes"
  // — so the backend was actually NOT running, and the frontend correctly
  // reported "Cannot reach the backend". Handle it with a plain message.
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPort ${port} is already in use.`);
      console.error('That means an HCM Lite server is ALREADY running — do NOT start a second one.');
      console.error('Fix (pick one):');
      console.error('  1. Just use the already-running server: open http://localhost:5173');
      console.error('  2. Or stop the old server first: close its terminal window, or run stop.bat (Windows) / ./stop.sh (Mac/Linux), then start again.');
      console.error('  3. Common cause: you double-clicked run.bat twice, or you ran run.bat AND "npm run dev" in server/ at the same time. Only one backend may run at a time.');
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}

if (require.main === module) start().catch((err) => { console.error(err); process.exit(1); });
module.exports = app;
