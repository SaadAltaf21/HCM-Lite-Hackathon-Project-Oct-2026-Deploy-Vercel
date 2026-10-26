// JWT auth + role guard + employee data-scope guard + company scope.
// Every route uses these: hiding a button in the frontend is never enough.
// A user belongs to exactly one company (companyId = its Setting row); all
// company data is filtered to that company, so companies never see each
// other's employees, settings, payroll or leave.
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function signToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, employeeId: user.employeeId || null, companyId: user.companyId || null },
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
    // Legacy users (created before multi-company) have no companyId: they
    // belong to the oldest company in the database. Assign it on first use
    // so company scoping works for them too, instead of leaking rows.
    if (!user.companyId) {
      try {
        const Setting = require('../models/Setting');
        const oldest = await Setting.findOne().sort({ createdAt: 1 });
        if (oldest) { user.companyId = oldest._id; await user.save(); }
      } catch (e) { /* keep going without a company; filters then match nothing */ }
    }
    req.user = user;
    req.companyId = user.companyId || decoded.companyId || null;
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

// Filter for the caller's company: if a company is known, restrict to it;
// if not, match nothing rather than leaking another company's rows.
function companyFilter(req) {
  const id = req.companyId || (req.user && req.user.companyId);
  return id ? { companyId: id } : { companyId: null };
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

// For list queries: employees are silently scoped to themselves; everyone
// else is silently scoped to their own company.
function scopeFilter(req, base = {}) {
  if (req.user.role === 'employee') {
    if (!ownEmployeeId(req)) return { ...base, employee: null }; // matches nothing
    return { ...base, employee: req.user.employeeId };
  }
  return { ...base, ...companyFilter(req) };
}

module.exports = { signToken, auth, requireRole, ownEmployeeId, assertOwnEmployee, scopeFilter, companyFilter };
