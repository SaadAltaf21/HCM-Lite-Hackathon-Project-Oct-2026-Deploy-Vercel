# HCM Lite — Backend (MERN)

AI-assisted Human Capital Management backend for Admin, HR and Employees.
The system **starts empty**: no employees or dummy data are seeded. Admin sets
up the company, HR registers employees, and every number comes from real data.

## Stack

Node.js + Express + Mongoose (MongoDB) + JWT + bcryptjs + pdfkit.

## Run

```bash
cd server
cp .env.example .env   # set MONGO_URI, JWT_SECRET
npm install
npm run dev            # or: npm start
```

The API listens on `PORT` (default 5000). Health: `GET /health`.

## First admin — two ways

1. **First-run setup** (fresh install, no users yet):
   `POST /api/setup` with `companyName, adminName, adminEmail, adminPassword`
   (+ optional `officeStart, graceMinutes, officeLat, officeLng, officeRadiusMeters`).
   Check first with `GET /api/setup/status` → `{ needsSetup: true }`.
   Setup also creates the default leave types: annual 14, sick 8, casual 10,
   unpaid unlimited.
2. **Env bootstrap**: set `ADMIN_EMAIL` + `ADMIN_PASSWORD` in `.env` before the
   first start; an admin + default setting are created only if no users exist.

Then: Admin creates HR logins (`POST /api/users`, role `hr`), HR registers
employees (`POST /api/employees` — returns a one-time `tempPassword`; the
employee must change it on first sign-in via `POST /api/auth/change-password`).

## Environment (.env.example)

| Variable | Purpose |
|---|---|
| `PORT` | Default 5000 |
| `MONGO_URI` | e.g. `mongodb://127.0.0.1:27017/hcm-lite` |
| `JWT_SECRET` | Signing secret for JWTs |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Optional first-run admin bootstrap |
| `AI_API_KEY` / `AI_API_URL` / `AI_MODEL` | Optional OpenAI-compatible LLM for `/api/ai/chat`. **Without a key, a deterministic local tool engine answers instead**, so the demo works offline. Key stays on the server only. |
| `COMPANY_NAME` | Used by the env bootstrap |

## Business rules (enforced on the server)

- Office 09:00, grace 15 min → late after 09:15; under 5 h → half day;
  a past day with no check-out reads as `missing_checkout`; one record per
  employee per day (second check-in = 409).
- Leave working days skip Sat/Sun + holidays; overlap or over-balance = 422.
- Payroll: gross = 1.5 × basic (HRA 40%, medical 10%);
  deduction = (absent + unpaid + 0.5 × half) × gross / working days;
  joiners/leavers prorated by working days employed in the month
  (leavers need `exitDate` on the employee, otherwise they are counted for
  the full month); tax on gross × 12 — 0% ≤600k, 5% >600k–1.2M,
  30k+15% >1.2M–2.4M, 210k+25% >2.4M–3.6M, 510k+35% >3.6M, monthly = annual/12.
  Finalized runs are locked (Admin only finalizes; HR cannot).
- Camera check-in: exactly 1 face, GPS accuracy ≤ 100 m, Haversine distance
  to the office ≤ radius, otherwise 403/422 with a reason.
- Scope: employees only ever see their own rows (403 otherwise); HR cannot
  manage settings/users/audit/finalize; audit log has no write routes.

## Routes (all under `/api`, JSON; errors are `{ error }` with 400/401/403/404/409/422)

| Method & path | Role |
|---|---|
| `GET /setup/status`, `POST /setup` | public, only when no users exist |
| `POST /auth/login`, `POST /auth/change-password`, `POST /auth/logout` | auth / any |
| `GET /users`, `POST /users` (hr), `PATCH /users/:id/deactivate`, `PATCH /users/:id/activate`, `PATCH /users/:id/reset-password` | admin |
| `GET /settings`, `PUT /settings` | admin/hr view, admin write |
| `GET/POST/PATCH/DELETE /departments`, `/designations`, `/leave-types`, `/holidays` | admin write; employee read for leave-types & holidays only |
| `POST /employees`, `GET /employees` (search/filter/page/limit), `GET /employees/:id` (360), `PATCH /employees/:id`, `GET /employees/export/csv`, `POST /employees/import/dry-run`, `POST /employees/import/confirm` | hr write; employee own phone/address only |
| `POST /attendance/check-in`, `POST /attendance/check-out`, `POST /attendance/camera-check-in`, `GET /attendance/board?date&department`, `GET /attendance/mine`, `GET /attendance/calendar?employeeId&month`, `POST /attendance/corrections`, `GET /attendance/corrections`, `PATCH /attendance/corrections/:id` | hr/employee own; board admin/hr |
| `POST /leave`, `GET /leave`, `GET /leave/balance`, `PATCH /leave/:id/approve`, `PATCH /leave/:id/reject`, `PATCH /leave/:id/cancel` | employee/hr own; approve/reject hr |
| `GET /payroll/structure/:employeeId`, `PATCH /payroll/structure/:employeeId`, `POST /payroll/runs`, `GET /payroll/runs`, `GET /payroll/runs/:id`, `POST /payroll/runs/:id/finalize`, `GET /payroll/payslips/mine`, `GET /payroll/payslips/:runId/:employeeId/pdf` | structure hr/admin; runs hr create, admin finalize; payslips scope-checked |
| `GET /dashboard/admin`, `/dashboard/hr`, `/dashboard/employee` (`?from&to&department`) | matching role (admin may also view hr) |
| `POST /announcements`, `GET /announcements` | admin/hr post, all read |
| `GET /notifications/mine`, `PATCH /notifications/:id/read` | own |
| `GET /audit` | admin |
| `POST /ai/chat` (20/user/hour, logged, labelled `AI-generated`), `POST /ai/summary` (`{kpis}` → 3–5 bullets from those numbers only), `POST /ai/smart-leave` (`{text}` → `{type,start,end,reason}`; user confirms via normal leave POST, AI never saves) | all roles, scope-checked tools |

## What is done / not done

- Done: all modules above, including payslip PDFs, CSV import dry-run,
  camera geofence check, AI tool engine + local fallback, audit log.
- Not done (frontend scope): no frontend is included in this backend-only
  package — the parent task builds it separately. Face matching/liveness
  (bonus) is not implemented server-side: the client sends `faceCount` and
  the server decides on count + location only.
