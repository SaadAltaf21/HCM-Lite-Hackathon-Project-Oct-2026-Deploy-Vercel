# HCM Lite — AI-assisted Human Capital Management

**Saylani Hackathon · 24 October 2026 · Zaitoon Ashraf IT Park**

A web-based HR system for Admin, HR and Employees, built with the **MERN stack**
(MongoDB + Express + React + Node.js). There is **no pre-loaded or dummy data**:
the system starts empty, Admin sets up the company, HR registers employees, and
every number on every dashboard comes from what people do in the app.

## What is built — 9 modules, 25 functionalities

| Module | What it does |
|---|---|
| M1 Auth & Access | JWT login, bcrypt passwords, 3 roles, server-side role + data-scope checks on every request |
| M2 Organization Setup | Company settings (office hours, grace time, weekend, office location + radius), departments, designations, leave types + quotas, public holidays, HR logins |
| M3 Employees | Directory with server search/filters/paging, Employee 360, CSV import with dry-run error report, CSV export |
| M4 Attendance | Web check-in/out (server-stamped time), status rules, corrections, camera + location check-in (bonus) |
| M5 Leave | Apply, balance, overlap + holiday checks, approval inbox with comments |
| M6 Payroll Lite | Salary structure (gross = 1.5 × basic: HRA 40%, medical 10%), monthly run, tax slab, payslip PDF, Admin finalize locks the run |
| M7 Dashboards & Analytics | Admin / HR / Employee dashboards, KPIs, trends and insights, all computed on the server, filterable by date range and department |
| M8 AI Assistant | Chat with tools, dashboard summary, smart leave, policy Q&A — always scoped to the user's role |
| M9 Comms & Audit | Announcements, in-app notifications, audit log (actor, action, entity, before/after) |

Business rules implemented exactly as in the brief: office start 09:00, grace
15 min (late after 09:15), half day under 5 h, weekend Sat–Sun, leave quotas
annual 14 / sick 8 / casual 10 / unpaid unlimited, working days only (skip
weekends + holidays), overlap or over-balance = 422, second check-in = 409,
payroll deduction = (absent + unpaid + 0.5 × half days) × gross ÷ working days,
prorated joiners/leavers, tax slab on gross × 12 (0 to 600k; 5% to 1.2M;
30k + 15% to 2.4M; 210k + 25% to 3.6M; 510k + 35% above), monthly tax = annual ÷ 12.

A payroll run created mid-month counts absent/unpaid only up to today (a run
for a completed month counts the full month), and net pay never goes below zero.

## Run it in under 10 minutes — easiest first

### One-click run (no Docker, no Atlas, no .env editing)
You only need **Node.js 20+** installed. Everything else is automatic:
the backend starts its own in-memory MongoDB if `MONGO_URI` is not set,
so there is nothing else to install or configure.

- **Windows:** double-click **`run.bat`**
- **Mac / Linux:** `./run.sh` (first run: `chmod +x run.sh`)

That installs dependencies on first run, starts the backend on
http://localhost:5000 and the frontend on http://localhost:5173, and opens
the app. In the browser: **Setup** (create company + Admin account) →
**Login** with that Admin account. Data in this mode is temporary and
disappears when you stop the servers — perfect for a fresh demo. For
persistent data, set `MONGO_URI` in `server/.env` (see below).

### Prerequisites (manual run)
- Node.js 20+ and npm
- MongoDB — one of: Docker, a local `mongod`, or a free MongoDB Atlas cluster
  (or nothing at all, using the one-click in-memory mode above)

### 1. Start MongoDB — Docker OR Atlas (no Docker needed for Atlas)
```bash
docker compose up -d mongo
# This starts MongoDB on mongodb://127.0.0.1:27017/hcm-lite
```
**No Docker? Use MongoDB Atlas instead — skip step 1 entirely:**
1. Create a free cluster at cloud.mongodb.com, then in Atlas:
   **Database Access** → create a database user with read/write access;
   **Network Access** → Add IP Address → `0.0.0.0/0` (for testing).
2. **Database** → Connect → Drivers → copy the connection string, replace
   `<password>` with that database user's password (URL-encode special
   characters, e.g. `@` → `%40`), and put the full string in `server/.env`
   as `MONGO_URI`.
3. Start the backend (step 2) and **check its terminal says
   "MongoDB connected"** before opening the frontend. If it does not, the
   frontend cannot reach the database and login will fail — see
   "Troubleshooting: Invalid credentials" below. The frontend needs no Atlas
   config at all; only the backend's `server/.env` has `MONGO_URI`.

### Styling (VVIP, 25 Oct 2026)

The whole frontend was restyled A–Z with no functionality changes: Inter
font, indigo–violet gradient brand and buttons, glass top bar, icon sidebar
with a gradient active state, lifted KPI cards, soft shadows, rounded
forms/tables, gradient AI chat bubbles, and a matching dark mode. Run it
exactly as before — `run.bat` / `./run.sh`, then Setup, then Login.

Animated styling (phase 2): top bar slides down, sidebar links slide in
one by one, cards and KPI stats pop in with a stagger, the logo mark
glows softly, primary buttons and active menu items flow through the
gradient, card top lines flow through indigo–violet–teal, dashboard bars
grow in, chat messages slide in, and KPI cards float gently on hover.
Animations respect `prefers-reduced-motion`.

### Troubleshooting: "Port 5000 is already in use" / EADDRINUSE, and "Cannot reach the backend"

These two messages are the **same problem**: the backend is not actually
running, because a previous backend is still holding port 5000.

- **Cause:** you ran `run.bat` / `./run.sh` twice, or you ran the launcher
  **and** `npm run dev` in `server/` at the same time, or you closed the
  browser but left the backend window open. Only **one** backend may run
  at a time. The old code crashed with a Node stack trace and then sat in
  "Waiting for file changes" — so the backend looked like it was running
  when it was not, and the frontend correctly said "Cannot reach the
  backend".
- **Fix (Windows):** double-click **`stop.bat`**, wait for "Done", then
  double-click **`run.bat` — only once**.
- **Fix (Mac/Linux):** `./stop.sh`, then `./run.sh` — only once.
- The new launchers also check first: if a backend is already healthy on
  port 5000, they will **not** start a second one, they will just use it.
  And the new backend prints a plain message instead of a stack trace if
  port 5000 is taken.
- **Also:** on first run the backend downloads the in-memory MongoDB
  binary, which can take up to a minute. The launcher now waits for
  "MongoDB connected" / backend health before opening the browser, and
  the Login/Setup pages retry every 3 seconds until the backend answers
  — so do not refresh in a panic, just wait for the backend window to
  say "HCM Lite server listening on http://localhost:5000".
- **Do not run from two extracted copies at once:** your path shows
  `hcm-lite (1)` — that is a second download of the same zip. Delete the
  duplicate folder, keep one copy, and run only from that one folder.

### Troubleshooting: "Invalid credentials" on Login

There is **no signup page in HCM Lite, by design** (the brief's first-run
flow). "Invalid credentials" almost always means you tried to log in
**before creating any account**, or the backend is not connected to the
database, so Setup never actually succeeded:

1. Open http://localhost:5173 — on a fresh database it must redirect to
   **Setup**. If it stays on Login, the Login page now shows a red banner
   if the backend is unreachable — fix the backend first (step 2).
2. On **Setup**, create the company + Admin account. That *is* the signup.
   Remember the exact Admin email and password you typed there.
3. Log in with **that** Admin email/password. Do not try a random email —
   no account exists for it yet, so the server correctly says Invalid
   credentials.
4. Still failing after Setup? Check: (a) the backend terminal says
   "MongoDB connected" (Atlas: IP allowlist + password, see above);
   (b) you did not set `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `server/.env` and
   then try a different email — if those env vars are set, the Admin
   account is created automatically from them on a fresh database, and
   Setup will say "Setup already completed", so log in with the env email;
   (c) you are not mixing two databases (e.g. Atlas in one run and local
   MongoDB in another) — the account lives in whichever database the
   backend is connected to right now.
5. After Admin login: Admin creates HR logins (Organization page), HR
   registers employees (each registration creates that employee's login
   with the temporary password HR sets). Employees log in with that
   temporary password and are forced to change it.

### 2. Backend
```bash
cd server
cp .env.example .env
# Edit .env: set MONGO_URI and JWT_SECRET (a long random string).
# Optional: AI_API_KEY + AI_API_URL for a hosted LLM (see AI section below).
# Optional: TZ=Asia/Karachi so server-stamped times use Pakistan time on a UTC host.
npm install
npm run dev
# Server on http://localhost:5000  ·  health: http://localhost:5000/api/health
```

### 3. Frontend
```bash
cd client
npm install
npm run dev
# App on http://localhost:5173 (Vite proxies /api to localhost:5000)
```

### 4. First-run setup (the demo story)
1. Open http://localhost:5173 — it redirects to **Setup** because the system is empty.
2. Create the company + Admin account (office start 09:00, grace 15, office
   location + radius, e.g. 150 m).
3. As Admin: create a department, a designation, and an HR login
   (Organization page). Leave types annual/sick/casual/unpaid are created
   automatically with quotas 14/8/10/unlimited.
4. Log in as HR: register 2–3 employees. Each registration creates that
   employee's login with the temporary password you set (shown after creation);
   the employee must change it on first sign-in.
5. As an Employee: change password, check in (web, or camera check-in with
   face detection + GPS), then type a plain sentence in **Leave → Smart leave**
   (e.g. "I need next Monday and Tuesday off for my sister's wedding") and
   confirm the pre-filled form.
6. As HR: approve the leave, open the HR dashboard, click **Summarize**, ask
   the assistant who is on leave, then create the monthly payroll run.
7. As Admin: finalize the payroll run (this locks it and notifies employees).
8. As an Employee: download the payslip PDF, and try asking the assistant for
   a colleague's salary — it politely refuses.
9. As Admin: open **Audit Log** to see every important action.

## AI assistant (M8)

- The browser never calls an AI provider. The API key lives only in the
  backend env (`AI_API_KEY`).
- If `AI_API_KEY` + `AI_API_URL` are set, the backend calls an
  OpenAI-compatible chat API with tool calling (15 s timeout). Otherwise it
  uses a built-in deterministic tool engine, so **the demo works with no key**:
  answers are still computed from real database records, are labelled
  "AI-generated", are rate-limited to 20 requests per user per hour, and are
  logged in `ai_logs`.
- Tools (all reusing the same services and permission checks as the REST API):
  `get_headcount`, `get_attendance_summary`, `get_late_comers`,
  `get_leave_summary`, `get_my_leave_balance`, `get_payroll_summary`,
  `search_employees`.
- The AI never writes data. Smart-leave output is only a pre-filled form the
  user confirms. Policy questions are answered only from the brief's rules, or
  the assistant says it does not know.
- Live test questions it answers: HR — headcount by department, who came late
  most often this month, this month's attendance rate; Employee — own sick
  leave left this year; Employee — a colleague's salary is refused.

To use a hosted LLM, set in `server/.env`:
```
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_API_KEY=sk-...
```
(Any OpenAI-compatible endpoint works; a free tier is enough.)

## Camera attendance (bonus)

On **Attendance → Camera check-in** the browser opens the webcam, tries to
load face detection from a CDN, counts faces, and reads GPS. The **server**
decides: it rejects the check-in if the face count is not exactly 1, GPS
accuracy is worse than 100 m, the office location is not configured, or the
Haversine distance to the office is greater than the Admin-set radius. If the
face model cannot load, the page says so clearly and does not fake a face
count — use normal web check-in instead (the brief's fallback).

## Project structure

```
hcm-lite/
├── server/                 # Express + Mongoose backend
│   ├── src/index.js        # App wiring, first-admin bootstrap
│   ├── src/models/         # User, Setting, Department, Designation, LeaveType,
│   │                       # Holiday, Employee, Attendance, LeaveRequest,
│   │                       # AttendanceCorrection, PayrollRun, Announcement,
│   │                       # Notification, AuditLog, AiLog
│   ├── src/services/       # rules.js (office/leave rules), payroll.js,
│   │                       # dashboard.js (server aggregation), aiTools.js
│   └── src/routes/         # setup, auth, users, settings, org, employees,
│                           # attendance, leave, payroll, dashboard,
│                           # announcements, notifications, audit, ai
├── client/                 # Vite + React frontend
│   └── src/pages/          # Setup, Login, Dashboard, Employees, Org,
│                           # Attendance, CameraCheckIn, Leave, Payroll,
│                           # AI, Announcements, Notifications, Audit
├── docker-compose.yml      # MongoDB for local development
└── README.md               # This file
```

## Roles — who can do what

| | Admin | HR | Employee |
|---|---|---|---|
| Company settings, departments, leave types, holidays | Manage | View | — |
| Create HR logins; deactivate / reset any login | Manage | — | — |
| Register employees (creates their login) | View | Manage | Own phone & address |
| Employee directory + 360 | All | All | Own |
| CSV import (dry-run) / export | — | Manage | — |
| Check in / out (web + camera) | — | Own | Own |
| Attendance board / calendar, corrections | All / View | All / Approve | Own / Request |
| Leave apply / cancel, balance | — | Own | Own |
| Leave approve / reject | View | Approve | — |
| Salary structure | View | Manage | — |
| Monthly payroll draft | View | Manage | — |
| Finalize payroll (locks it) | Manage | — | — |
| Payslips (PDF) | All | All | Own |
| Dashboards + AI summary | Company | HR | Personal |
| AI chat | All data | HR data | Own data |
| Announcements | Post | Post | Read |
| Audit log | View | — | — |

An HR login with no employee record cannot use self-service check-in/leave
(it returns 403) — register that person as an employee as well if they need
self-service, which is how the brief separates HR logins from employee logins.

## Environment — commit `.env.example` only

Never commit a real `AI_API_KEY` or database password. Keep secrets in the
hosting provider's environment settings. `server/.env.example` lists every
variable: `PORT`, `MONGO_URI`, `JWT_SECRET`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `AI_API_KEY`, `AI_API_URL`, `TZ`.

Setting `ADMIN_EMAIL` + `ADMIN_PASSWORD` in the environment creates the first
Admin automatically on a fresh database (alternative to the Setup page).

## What is done / not done

Done: all 25 functionalities in the brief's checklist, all 9 modules, the
business rules above, role-scoped AI tools, dashboard summaries, smart leave,
payslip PDFs, audit log, CSV dry-run import/export, camera check-in with
server-side geofence, dark mode, responsive layout (375 px+).

Not done / bonus only partially: face **matching** to an enrolled face and
blink liveness (camera bonus) are not implemented — face *detection* (exactly
one face) + GPS geofence are. Attrition risk score, absence anomaly flags,
late-penalty rule (3 lates = 0.5 day) and Roman Urdu AI are not implemented;
the PWA shell is not included.

## Tests run before delivery

End-to-end against a real local MongoDB: first-run setup → Admin login →
department + HR login → HR registers employee → employee changes password →
web check-in → second check-in correctly returns 409 → check-out → camera
rejections (face count 0, outside radius, GPS accuracy > 100 m) → smart leave
("next Monday and Tuesday off for my sister's wedding" → casual, correct
dates) → leave apply → overlap correctly returns 422 → HR approves → balance
shows casual 8 left → CSV dry-run flags bad rows and counts valid rows →
attendance correction request → monthly payroll run → Admin finalizes →
payslip PDF downloads → audit log records the actions → AI headcount answer
matches the dashboard and a colleague-salary question is refused.
