# Submission checklist — Saylani LMS (lms.saylaniit.com)

The brief asks every student to share **two links** on the LMS: a **Git
repository** link and a **hosted (live) project** link. The code in this
folder is already submission-ready (git repo initialised locally, README
with stack / how to run / first Admin / AI key / done-not-done). The two
steps below are the only ones that need *your* accounts, so Muse cannot do
them for you — they take about 5 minutes total.

## 1. Git repository link (5 minutes)

1. On GitHub, create a new **public** repository (e.g. `hcm-lite`), empty
   (no README, no .gitignore — this folder already has them).
2. In this folder, run (use your own name and GitHub email):
   ```bash
   git init
   git config user.name "Your Name"
   git config user.email "you@example.com"
   git add -A
   git commit -m "HCM Lite: MERN HR system for Saylani Hackathon"
   git remote add origin https://github.com/<your-username>/hcm-lite.git
   git branch -M main
   git push -u origin main
   ```
   (If Git asks for credentials, use a GitHub Personal Access Token as the
   password, not your GitHub password.)
3. Copy the repository URL — that is link 1 for the LMS.

Never push a real `.env`: `.gitignore` already excludes `.env`,
`node_modules/` and `dist/`. Only `.env.example` is committed.

## 2. Hosted (live) project link — free options

The live app must open in a browser and start from first-run Setup, so
judges can create the company themselves. Any free hosting is fine.

**Fastest free option — Render (backend) + Vercel/Netlify (frontend):**
- Backend: Render → New Web Service → connect your GitHub repo → Root
  Directory `server`, Build Command `npm install`, Start Command
  `npm start`, and add environment variables `MONGO_URI` (your Atlas
  connection string — Atlas is the persistent database for hosting, the
  in-memory mode is only for local demos), `JWT_SECRET` (a long random
  string), `TZ=Asia/Karachi`. Render gives you a backend URL.
- Frontend: Vercel/Netlify → import the same repo → Root Directory
  `client`, Build Command `npm run build`, Output Directory `dist`,
  and set `VITE_API_URL=https://<your-render-backend>/api`. Deploy.
- Copy the frontend URL — that is link 2 for the LMS.

**Local demo alternative (if hosting is not ready in time):** run the
one-click launcher (`run.bat` on Windows, `./run.sh` on Mac/Linux), do the
5-minute demo live from your laptop, and submit the Git link plus a note
on the LMS that the live link is the hosted URL above once deployed.
Do not submit a `localhost` link — judges cannot open your localhost.

## 3. 5-minute demo script (from the brief)

1. Fresh install: Admin sets up the company, office hours and location, a
   department and leave types, then creates an HR login.
2. HR registers 2–3 employees; one signs in, changes the password, checks in.
3. Employee types a leave request in plain words (Smart leave) and confirms
   the pre-filled form; HR approves it.
4. HR opens the dashboard, clicks Summarize, asks the assistant who is on
   leave, runs payroll for the month; Admin finalizes it.
5. Employee downloads the payslip and asks for a colleague's salary
   (refused); Admin shows the audit log.

## 4. Before you submit, check

- [ ] `git push` succeeded and the repo is public (or shared with judges).
- [ ] The hosted link opens and shows the Setup page on a fresh database.
- [ ] No real AI key or database password is in the repo (search for
      `AI_API_KEY=` and `MONGO_URI=` — only `.env.example` should appear).
- [ ] README in the repo explains stack, how to run, first Admin, AI key,
      and what is done / not done.
