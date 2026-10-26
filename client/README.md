# HCM Lite — Frontend

Vite + React (JavaScript) + react-router-dom + axios. Plain CSS, no Tailwind.

## Run

```bash
npm install
npm run dev
```

The dev server runs on http://localhost:5173 and proxies `/api` to
http://localhost:5000 (see `vite.config.js`). The backend is expected at
`~/workspace/hcm-lite/server` and is built separately.

To point at a different backend, set `VITE_API_URL` before building, e.g.:

```bash
VITE_API_URL=http://localhost:5000/api npm run build
```

Without `VITE_API_URL`, the app uses the relative `/api` path (Vite proxy in dev).

## Notes

- Auth token + user are stored in `localStorage` (`hcm_token`, `hcm_user`).
  A 401 from the API clears them and redirects to `/login`.
- Users with `mustChangePassword` are forced to `/change-password`.
- The system starts empty by design: lists show "No records yet" until data
  is created through the app. No dummy data is included.
- Camera check-in (`/attendance/camera`) loads face-api.js models from a CDN.
  If model loading fails it shows a clear fallback and links to normal web
  check-in — it never fakes a face count.
- Dark mode toggle is in the top bar and persists in `localStorage`.
