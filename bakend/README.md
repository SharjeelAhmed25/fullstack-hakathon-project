# HCM Lite

HCM Lite is a React and Express workspace for company setup, role-based accounts, attendance, time-off requests, payroll drafts and payslips. The frontend uses Tailwind CSS alongside the existing PeopleOS styles.

## Run locally

1. Copy `.env.example` to `.env`.
2. Set `MONGODB_URI` to the MongoDB server you control (local MongoDB or your Atlas cluster) and set `JWT_SECRET` to a private random value. Do not commit `.env`.
3. In this directory, run `npm start` (or `npm run dev`).
4. In `../frontend`, run `npm run dev` and open the Vite URL.

The Vite development server proxies `/api` requests to `http://localhost:3000`. Set `VITE_API_URL` when the API is hosted elsewhere. MongoDB Compass is a client: connect it to the same MongoDB server specified by `MONGODB_URI` to view the app's database and collections. If using Atlas, set `MONGODB_URI` to your existing cluster's connection string and connect Compass to that same cluster; no new cluster is needed.

## Current functionality

- First-run company and administrator setup.
- JWT sign-in, password changes, bcrypt password hashes and server-side role checks.
- Admin-created HR accounts and HR-created employee accounts.
- Employee directory, attendance check-in/out and monthly records.
- Admin/HR employee detail editing and controlled temporary-password resets.
- Employee leave requests, working-day/quota checks and HR approval or rejection.
- HR payroll drafts, attendance/leave deductions, tax calculation and Admin finalization.
- Role-specific dashboard data, printable employee payslips and Admin audit history.
- Configurable departments, working days, leave quotas and public holidays.
- Employee attendance-correction requests and HR review.
- Audience-scoped announcements and in-app notifications.
- Employee CSV template/export and validated dry-run/import workflows.
- Role-scoped assistant chat, dashboard summaries and smart leave-request suggestions.

All attendance dates and office-start comparisons use `OFFICE_TIME_ZONE` (default `Asia/Karachi`). Payroll rules are illustrative hackathon rules, not tax advice.

Model-powered assistant responses are optional. Without `AI_API_KEY`, the assistant uses its local role-scoped workspace data. If configured, keep the provider key in the backend `.env` only; never expose it to the frontend.

## API overview

- `GET /api/setup/status`, `POST /api/setup`
- `POST /api/auth/login`, `GET /api/auth/me`, `PATCH /api/auth/password`
- Authenticated: `/api/dashboard`, `/api/users`, `/api/settings`, `/api/departments`, `/api/attendance`, `/api/leaves`, `/api/payroll`, `/api/announcements`, `/api/notifications`, `/api/ai`
- Admin/HR account management: `PATCH /api/users/:id`, `PATCH /api/users/:id/password`
- Admin only: `GET /api/audit`, `POST /api/payroll/:id/finalize`
- HR/Admin employee CSV downloads: `/api/users/csv/template`, `/api/users/csv/export`; HR import endpoints: `/api/users/csv/dry-run`, `/api/users/csv/import`

The database must be reachable before the API starts. Startup reports missing environment variables explicitly.

To copy the current local database to your existing Atlas cluster without overwriting Atlas documents, save the local URI as `LOCAL_MONGODB_URI`, set `MONGODB_URI` to Atlas with the same database name, and run `npm run migrate:atlas` from this directory. It is safe to retry after an interrupted migration.

If the Admin password is forgotten, set `MONGODB_URI` to the existing Atlas cluster in `.env` and run `npm run reset:admin-password -- admin@example.com`. The script only resets an active Admin matching that exact email, generates a one-time temporary password, and requires a password change on the next sign-in. Share the temporary password with the Admin securely; it is printed once and is not recoverable afterward.

Mobile face/location attendance is optional and is not currently implemented.

## Checks

Run `npm test` here, then run `npm run lint` and `npm run build` in `../frontend`.
