// JWT auth + role guard + employee data-scope guard.
// Every route uses these: hiding a button in the frontend is never enough.
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function signToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, employeeId: user.employeeId || null },
    process.env.JWT_SECRET || 'dev-secret-change-me',
    { expiresIn: '7d' },
  );
}

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    if (!user.active) return res.status(403).json({ error: 'Account is deactivated' });
    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    return next();
  };
}

// Employee's own employee ObjectId, or null for admin/hr logins without one.
function ownEmployeeId(req) {
  return req.user && req.user.employeeId ? String(req.user.employeeId) : null;
}

// Throws a 403 response when an employee tries to touch another employee's row.
function assertOwnEmployee(req, res, employeeId) {
  if (req.user.role === 'employee') {
    if (!ownEmployeeId(req) || String(employeeId) !== ownEmployeeId(req)) {
      res.status(403).json({ error: 'Forbidden: employees can only access their own records' });
      return false;
    }
  }
  return true;
}

// For list queries: employees are silently scoped to themselves.
function scopeFilter(req, base = {}) {
  if (req.user.role === 'employee') {
    if (!ownEmployeeId(req)) return { ...base, employee: null }; // matches nothing
    return { ...base, employee: req.user.employeeId };
  }
  return base;
}

module.exports = { signToken, auth, requireRole, ownEmployeeId, assertOwnEmployee, scopeFilter };
