# UBTaekwondoManagementSystem

Full-stack management platform for University of Bohol Taekwondo team and sports academy.

## Core Modules

- Athlete and coach/admin authentication with role-based access control
- Athlete profile management with fixed belt rank framework
- Event scheduling (training, tournaments, team events) with attendance tracking
- Tournament roster management, results, feedback, achievements, and ranking point sync
- Team and individual analytics dashboards with charts
- PDF export for athlete, attendance, performance, achievements, and team rankings
- Mobile-first responsive UI designed for desktop, tablet, and smartphone browsers

## Tech Stack

- Frontend: React + TypeScript + Vite + Recharts
- Backend: Express + TypeScript + Prisma
- Database: SQLite (development default)
- Auth/Security: JWT, bcrypt, zod validation, role-based middleware
- File handling: Multer for profile image uploads
- PDF export: PDFKit

## Repository Structure

- `client/` React frontend
- `server/` Express API and Prisma schema/migrations
- `server/uploads/` profile photos

## Requirements

- Node.js 20+
- npm 10+

## Local Setup

1. Install dependencies

```bash
npm install
```

2. Configure environment

```bash
cp server/.env.example server/.env
```

3. Generate Prisma client and apply migrations

```bash
npm run prisma:generate -w server
npm run prisma:migrate -w server
```

4. Seed development accounts

```bash
npm run seed
```

5. Start frontend and backend together

```bash
npm run dev
```

## URLs

- Frontend: http://localhost:5173
- Backend: http://localhost:4000
- API Health: http://localhost:4000/api/health

## Seed Accounts

- Admin: coach.admin@ub.edu.ph / AdminPass123!
- Athlete: athlete.sample@ub.edu.ph / AthletePass123!

## Environment Variables (`server/.env`)

- `DATABASE_URL` Prisma database URL
- `JWT_SECRET` JWT signing secret
- `PORT` API port (default 4000)
- `CLIENT_ORIGIN` Allowed frontend origin (default http://localhost:5173)

## NPM Scripts

Root:

- `npm run dev` Start both server and client in development
- `npm run build` Build server and client
- `npm run lint` Run client lint checks
- `npm run seed` Seed database

Server workspace:

- `npm run dev -w server` Run API with watch mode
- `npm run build -w server` Compile TypeScript API
- `npm run start -w server` Start compiled API
- `npm run prisma:generate -w server` Generate Prisma client
- `npm run prisma:migrate -w server` Run development migrations

Client workspace:

- `npm run dev -w client` Start Vite dev server
- `npm run build -w client` Build frontend
- `npm run preview -w client` Preview production build

## API Overview

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

Current User:

- `GET /api/me`
- `PATCH /api/me`
- `POST /api/me/photo`
- `DELETE /api/me/photo`

Athlete Management (Admin only):

- `GET /api/users/athletes`
- `POST /api/users/athletes`
- `PATCH /api/users/athletes/:id`
- `PATCH /api/users/athletes/:id/reset-password`
- `DELETE /api/users/athletes/:id`
- `GET /api/users/admin-logs`

Events and Attendance:

- `GET /api/events`
- `POST /api/events` (admin)
- `PATCH /api/events/:id` (admin)
- `DELETE /api/events/:id` (admin)
- `POST /api/events/attendance` (admin)
- `GET /api/events/:id/attendance` (admin)
- `GET /api/events/attendance/mine` (athlete)
- `GET /api/events/attendance/dashboard` (admin)
- `PATCH /api/events/attendance/:attendanceId/reason` (athlete)
- `PATCH /api/events/attendance/:attendanceId/reason-review` (admin)
- `GET /api/events/attendance/summary`

Notifications:

- `GET /api/me/notifications`
- `PATCH /api/me/notifications/:id/read`

Tournaments:

- `GET /api/tournaments`
- `POST /api/tournaments` (admin)
- `PATCH /api/tournaments/:id` (admin)
- `DELETE /api/tournaments/:id` (admin)
- `POST /api/tournaments/:id/roster` (admin)
- `DELETE /api/tournaments/:id/roster/:rosterId` (admin)
- `PATCH /api/tournaments/:id/roster/:rosterId/result` (admin)

Analytics and Rankings:

- `GET /api/dashboard/upcoming-events`
- `GET /api/analytics/individual/:athleteProfileId`
- `GET /api/analytics/team` (admin)
- `GET /api/rankings`

PDF Reports:

- `GET /api/reports/athlete/:athleteProfileId`
- `GET /api/reports/attendance`
- `GET /api/reports/attendance-dashboard` (admin)
- `GET /api/reports/performance`
- `GET /api/reports/achievements`
- `GET /api/reports/rankings`

## Deployment Notes

For online hosting:

1. Build the project:

```bash
npm run build
```

2. Set production env vars (`JWT_SECRET`, `DATABASE_URL`, `CLIENT_ORIGIN`, `PORT`).
3. Use a persistent database (PostgreSQL recommended for production) and update Prisma datasource provider/url.
4. Serve frontend static build from `client/dist` using Nginx, Vercel, Netlify, or any static host.
5. Deploy API (`server/dist/index.js`) to a Node host (Render, Railway, Fly.io, VPS).
6. Store uploads in persistent storage (cloud object storage recommended).

## Production Deployment (ubtkdmis.github.io)

Frontend is already on GitHub Pages. To make login work publicly, deploy the backend API and point the frontend to it.

1. Create backend on Render using Blueprint

- Open Render Dashboard -> New -> Blueprint
- Select repository: `ubtkdmis/ubtkdmis.github.io`
- Render will read `render.yaml` and provision:
	- Web service: `ubtkdmis-api`
	- Postgres database: `ubtkdmis-db`

2. Set required backend secret

- In Render service `ubtkdmis-api`, add env var:
	- `JWT_SECRET` = strong random secret string

3. Get backend public URL

- After deploy, copy the Render web service URL (for example: `https://ubtkdmis-api.onrender.com`)

4. Set frontend API URL for GitHub Pages build

- In GitHub repo `ubtkdmis/ubtkdmis.github.io`:
	- Settings -> Secrets and variables -> Actions -> Variables
	- Create variable `VITE_API_URL`
	- Value: `https://<your-render-service>.onrender.com/api`

5. Redeploy Pages frontend

- Trigger workflow `Deploy to GitHub Pages` from GitHub Actions, or push any commit.

6. Verify live endpoints

- Frontend: `https://ubtkdmis.github.io/`
- API health: `https://<your-render-service>.onrender.com/api/health`

## Security Notes

- Passwords are hashed before storage.
- JWT protects authenticated routes.
- Role checks enforce admin-only management endpoints.
- Input payloads validated using zod.

