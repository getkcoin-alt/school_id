# ID Card Studio — API server

Production backend for the School ID platform. It keeps every feature of the original
Java/Spring backend (`gitlab.com/school-id-backend-separate/backend`, left unchanged as the
old version) and adds the upgrade scope from proposal SCZ/PRP/IDCS/2611 plus the change sheet.

**Stack:** Node 22 · TypeScript · Fastify 5 · PostgreSQL (Prisma) · Redis + BullMQ ·
S3-compatible storage (AWS S3 / Cloudflare R2 / MinIO) or local disk · SMTP email.

## Architecture for scale

- **Stateless API**: JWT access tokens (15 min) plus rotating refresh tokens in an httpOnly
  cookie, with reuse detection. Run as many API replicas as needed behind a load balancer.
- **Worker** (`dist/worker.js`): email delivery through a durable outbox, retry sweeps,
  subscription-expiry reminders and token cleanup. Rate limits are shared through Redis.
- **Files** go to object storage and are served through short-lived signed URLs. Photos
  are normalised to JPEG, metadata is stripped, and the long edge is capped at 1200 px.
- **Data**: indexed queries scoped per school and session; bulk imports use batched inserts
  and reserved code ranges; print batches store immutable snapshots.
- **Audit**: every change writes an `ActivityLog` row with actor, school, agent and, when a
  super admin is acting as someone else, the impersonator.

## Roles

| Role | Access |
| --- | --- |
| Super Admin | Everything. Can **open any school admin or agent account** (`POST /auth/impersonate`) and act with full rights; actions are logged as "opened by". |
| School Admin | Own school only: students, staff, classes, fields, invitations, review/approval, print submission. |
| Premium Agent | Assigned schools, downloads, own printing (`printBySelf`), designs, PDF uploads. |
| Regular Agent | Assigned schools without downloads; batches go to central printing. |

## Onboarding

Email first. A super admin creates a school (with its admin) or an agent. The person gets a
single-use set-password link (7 days) and then signs in with email and password. Forgotten
passwords use an emailed 6-digit code. WhatsApp is phase 2 (`WHATSAPP_ENABLED`, returns 501
for now).

Students use personal links (copy, or bulk email to students with an email address). They verify
with an emailed code, or with their admission number when there is no email. They then fill the
school's fields, take a camera photo and submit for school review.

## Change sheet coverage

| # | Item | Where |
| --- | --- | --- |
| 2–3 | Father/mother prefixes (Mr., Sh., Dr., Md., Late Sh. / Mrs., Smt., Dr., Ms., Late Smt.) | `fatherPrefix`, `motherPrefix`, normalised on input |
| 4 | Excel in the agreed column order; disabled fields omitted | `GET /students/export.xlsx` |
| 5 | Batch download: Excel + photos named exactly as the PHOTO column | `GET /batches/:id/download.zip` |
| 6 | Order form upload (all panels) | `/media/order-forms` |
| 7 | Checklist PDF, A4, 10/12 per page, A–Z, new page per class | `GET /students/checklist.pdf` |
| 8 | Login with password | `/auth/*` |
| 9 | WhatsApp invitations | phase 2 stub |
| 10 | Batch creation shows only schools with cards ready | `GET /schools/print-queue` |
| 11 | Field on/off plus compulsory/optional | `PUT /schools/:id/fields` |
| 12 | Delete classes and sections (when empty) | `DELETE /schools/:id/classes/...` |
| 13 | Approve without an invitation | `POST /students/approve` |
| 14 | "Fulfilled by" filter | `GET /batches?fulfilledBy=CENTRAL\|AGENT` |
| 15 | Batch proof as a checklist | `GET /batches/:id/proof.pdf` |
| 16 | Duplicates avoided (admission no., or name + father + DOB) | create, update, import |
| 17 | Downloads in capital letters | all exports |

## Run locally

```sh
cp .env.example .env            # set DATABASE_URL, JWT_SECRET
npm ci
npx prisma migrate deploy
npm run db:seed                 # demo logins, password Demo@1234 (never in production)
npm run dev                     # API on :4000
npm run worker:dev              # needs REDIS_URL
```

Frontend: from the repo root, `VITE_API_URL=http://localhost:4000 npm run dev`. Without
`VITE_API_URL` the frontend stays the self-contained preview.

## Production

`docker compose up -d --build` from the repo root starts the API, worker, PostgreSQL, Redis
and MinIO. In production:

- Set a long random `JWT_SECRET`.
- Set `NODE_ENV=production`, `APP_URL`, `API_PUBLIC_URL` and `CORS_ORIGINS`.
- Set `MAIL_DRIVER=smtp` with the SMTP settings.
- Use `STORAGE_DRIVER=s3`.

The container runs `prisma migrate deploy` on start.

Create the first super admin:

```sh
node dist/scripts/create-super-admin.js owner@idcardstudio.in "Owner Name"
```

This emails a setup link. Alternatively, set `SUPER_ADMIN_PASSWORD` before running it.

## Tests

`npm test` runs end-to-end API tests against a real PostgreSQL database. Each run migrates a
fresh schema and drops it afterwards, so existing data is never touched. Set
`TEST_DATABASE_URL` to the test database.
