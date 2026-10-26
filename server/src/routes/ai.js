// AI assistant (M8): chat with tools, dashboard summary, smart leave.
// Rate limit: 20 requests / user / hour (in-memory). Every call is logged.
// If AI_API_KEY + AI_API_URL are set, an OpenAI-compatible chat call with
// tool calling is attempted (15s timeout); otherwise the deterministic local
// engine in services/aiTools.js answers — so the demo works with no key.
// The AI never writes data; smart-leave output is only pre-filled form data.
const express = require('express');
const AiLog = require('../models/AiLog');
const LeaveType = require('../models/LeaveType');
const { auth } = require('../middleware/auth');
const { TOOLS, POLICY, localAnswer } = require('../services/aiTools');
const { getSetting, workingDaysBetween, fmtDate, parseDate } = require('../services/rules');
const { leaveBalanceFor } = require('../services/dashboard');

const router = express.Router();
router.use(auth);

// ---- rate limiting (in-memory, per user, rolling hour) ----
const rateMap = new Map();
function rateLimited(userId) {
  const now = Date.now();
  const arr = (rateMap.get(String(userId)) || []).filter((t) => now - t < 3600_000);
  if (arr.length >= 20) { rateMap.set(String(userId), arr); return true; }
  arr.push(now); rateMap.set(String(userId), arr); return false;
}

const TOOL_DEFS = [
  { type: 'function', function: { name: 'get_headcount', description: 'Headcount, optionally by department', parameters: { type: 'object', properties: { department: { type: 'string' } } } } },
  { type: 'function', function: { name: 'get_attendance_summary', description: 'Attendance rate, late %, today counts', parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, department: { type: 'string' } } } } },
  { type: 'function', function: { name: 'get_late_comers', description: 'Top 5 late-comers', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_leave_summary', description: 'Leave by type, on leave today, pending', parameters: { type: 'object', properties: { department: { type: 'string' } } } } },
  { type: 'function', function: { name: 'get_my_leave_balance', description: "The asking user's own leave balance", parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_payroll_summary', description: 'Payroll cost, net, avg salary (not for employees)', parameters: { type: 'object', properties: { department: { type: 'string' } } } } },
  { type: 'function', function: { name: 'search_employees', description: 'Search employees by name/code/email (employees see only themselves, never salaries)', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
];

async function llmAnswer(user, message) {
  const url = process.env.AI_API_URL;
  const key = process.env.AI_API_KEY;
  if (!url || !key) return null;
  const system = `You are HCM Lite's HR assistant. Answer ONLY from tool results and these company rules: ${POLICY.join(' ')} `
    + `If the answer is not in the tools or rules, say you don't know. Never reveal another employee's salary to an employee. Never save or change data. End with [AI-generated].`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const first = await fetch(url, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, { role: 'user', content: message }],
        tools: TOOL_DEFS, tool_choice: 'auto',
      }),
    });
    if (!first.ok) throw new Error(`AI provider HTTP ${first.status}`);
    const data = await first.json();
    const choice = data.choices?.[0]?.message;
    const toolCalls = choice?.tool_calls || [];
    if (!toolCalls.length) return { answer: `${choice?.content || "I don't know."} [AI-generated]`, toolsUsed: [] };
    const toolsUsed = [];
    const toolMessages = [];
    for (const call of toolCalls) {
      const fn = TOOLS[call.function.name];
      if (!fn) continue;
      toolsUsed.push(call.function.name);
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch { args = {}; }
      const result = await fn(user, args);
      toolMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
    const second = await fetch(url, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system }, { role: 'user', content: message },
          { role: 'assistant', content: choice.content || '', tool_calls: toolCalls }, ...toolMessages,
        ],
      }),
    });
    if (!second.ok) throw new Error(`AI provider HTTP ${second.status}`);
    const data2 = await second.json();
    const text = data2.choices?.[0]?.message?.content || "I don't know.";
    return { answer: text.includes('[AI-generated]') ? text : `${text} [AI-generated]`, toolsUsed };
  } finally { clearTimeout(timer); }
}

router.post('/chat', async (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message is required' });
  if (rateLimited(req.user._id)) return res.status(429).json({ error: 'Rate limit: 20 AI requests per user per hour' });
  let result;
  try {
    result = await llmAnswer(req.user, message);
  } catch (err) {
    console.error('AI provider failed, falling back to local engine:', err.message);
    result = null;
  }
  if (!result) result = await localAnswer(req.user, message);
  await AiLog.create({ user: req.user._id, companyId: req.companyId || null, question: message, toolsUsed: result.toolsUsed, answer: result.answer });
  res.json({ answer: result.answer, toolsUsed: result.toolsUsed, label: 'AI-generated' });
});

// Dashboard summary: 3-5 bullets using ONLY the supplied KPI numbers.
router.post('/summary', async (req, res) => {
  if (rateLimited(req.user._id)) return res.status(429).json({ error: 'Rate limit: 20 AI requests per user per hour' });
  const kpis = req.body?.kpis || {};
  if (typeof kpis !== 'object' || Array.isArray(kpis)) return res.status(400).json({ error: 'kpis object is required' });
  const bullets = [];
  const num = (k) => (typeof kpis[k] === 'number' ? kpis[k] : null);
  if (num('headcount') !== null) bullets.push(`Headcount is ${kpis.headcount} active/probation employees.`);
  if (num('attendanceRate') !== null) bullets.push(`Attendance rate is ${kpis.attendanceRate}%.`);
  if (num('latePercent') !== null) bullets.push(`Late arrivals are ${kpis.latePercent}% of present + late records.`);
  if (num('presentToday') !== null) bullets.push(`Present today: ${kpis.presentToday}, on leave today: ${kpis.onLeaveToday ?? 0}, late today: ${kpis.lateToday ?? 0}.`);
  if (num('pendingApprovals') !== null) bullets.push(`There are ${kpis.pendingApprovals} pending approvals waiting for action.`);
  if (num('payrollCost') !== null) bullets.push(`Payroll cost (gross) in the period is ${kpis.payrollCost}.`);
  if (num('avgSalary') !== null) bullets.push(`Average basic salary is ${kpis.avgSalary}.`);
  if (num('attritionYTD') !== null) bullets.push(`Attrition year-to-date is ${kpis.attritionYTD}%.`);
  const out = bullets.slice(0, 5);
  if (!out.length) out.push('No KPI numbers were supplied, so no insight can be drawn from them.');
  res.json({ bullets: out, label: 'AI-generated' });
});

// ---- Smart leave: plain language -> { type, start, end, reason } (no save) ----
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function dateForWeekday(name, reference, strictlyAfter) {
  const target = WEEKDAYS.indexOf(name);
  const d = new Date(reference);
  let diff = (target - d.getDay() + 7) % 7;
  if (strictlyAfter && diff === 0) diff = 7;
  d.setDate(d.getDate() + diff);
  return d;
}

router.post('/smart-leave', async (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text is required' });
  const lower = text.toLowerCase();
  let type = 'casual';
  if (/\b(sick|ill|fever|flu|doctor|hospital|medical)\b/.test(lower)) type = 'sick';
  else if (/\bunpaid\b/.test(lower)) type = 'unpaid';
  else if (/\bannual\b/.test(lower)) type = 'annual';

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let dates = [];
  // ISO dates first.
  const iso = [...text.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((m) => m[0]);
  if (iso.length >= 2) dates = [parseDate(iso[0]), parseDate(iso[1])];
  else if (iso.length === 1) dates = [parseDate(iso[0]), parseDate(iso[0])];
  if (!dates.length) {
    // Weekday / tomorrow / today tokens, in order, each after the previous.
    const tokens = [];
    const re = /(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|today/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].toLowerCase() === 'tomorrow') tokens.push({ kind: 'tomorrow' });
      else if (m[0].toLowerCase() === 'today') tokens.push({ kind: 'today' });
      else tokens.push({ kind: 'weekday', name: m[2].toLowerCase(), next: !!m[1] });
    }
    let ref = today;
    for (const [i, tok] of tokens.entries()) {
      let d;
      if (tok.kind === 'tomorrow') { d = new Date(ref); d.setDate(d.getDate() + 1); }
      else if (tok.kind === 'today') d = new Date(ref);
      else d = dateForWeekday(tok.name, ref, i === 0 ? tok.next : true);
      dates.push(d);
      ref = d;
    }
    if (dates.length === 1) dates.push(dates[0]);
    if (dates.length > 2) dates = [dates[0], dates[dates.length - 1]];
  }
  if (!dates.length) return res.status(422).json({ error: 'Could not parse dates from text — please include a day or date' });
  let [start, end] = dates;
  if (end < start) { const tmp = start; start = end; end = tmp; }
  const startStr = fmtDate(start); const endStr = fmtDate(end);

  // Reason: text after "for", else the sentence minus date words.
  let reason = '';
  const forMatch = text.match(/\bfor\b\s+(.+)$/i);
  if (forMatch) reason = forMatch[1].replace(/[.!?]+$/, '').trim();
  if (!reason) {
    reason = text
      .replace(/\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
      .replace(/\b(tomorrow|today|off|leave|need|i|want|please|from|to|and)\b/gi, '')
      .replace(/\s+/g, ' ').trim() || 'Personal leave';
  }

  const setting = await getSetting(req.companyId);
  const workingDays = (await workingDaysBetween(startStr, endStr, setting)).length;
  let balanceNote = null;
  if (req.user.employeeId) {
    const year = Number(startStr.slice(0, 4));
    const balances = await leaveBalanceFor(req.user.employeeId, year);
    const bal = balances.find((b) => b.name.toLowerCase() === type);
    if (bal && bal.remaining !== null) {
      balanceNote = workingDays > bal.remaining
        ? `Note: this needs ${workingDays} working days but only ${bal.remaining} ${type} days remain.`
        : `Within balance: ${bal.remaining} ${type} days remain after ${workingDays} working days.`;
    }
  }
  res.json({ type, start: startStr, end: endStr, reason, workingDays, balanceNote });
});

module.exports = router;
