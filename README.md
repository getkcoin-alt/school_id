# ID Studio — school identity workspace

A redesigned, responsive **frontend prototype** with fictional data. The UI follows the existing ID Studio logo and its coral `#F05656` accent. It is independent of the original Angular and Android clients and does not call the live backend.

## Run locally

```sh
npm ci
npm run dev
npm test
npm run build
```

Node 22 or newer is recommended. Vercel builds the Vite app and serves `dist/`.

## Walk through the project

Use **Explore Panels** in the header to switch between School Admin, Premium Agent, Regular Agent, Super Admin, and the student invitation experience. There is no Teacher panel. The **Help & getting started** page explains responsibilities and links to each next step.

1. Open **School Admin → Students**. Add a record or import the school's CSV/XLSX contact list. A template is available in the import dialog. The importer validates required contacts and skips duplicate admission numbers.
2. Open **Student invitations**, select pending students, and prepare sample email invitations. The local outbox shows their personal form links. No messages are sent externally.
3. Open a personal link. Enter demo code **246810**, complete the school's ID fields, agree to camera use, and take a portrait. **Use sample photo for demo** is an explicit alternative with a different source label.
4. Submit the form. In **Review submissions**, the School Admin can inspect the card and photo source, request a correction, edit manually, or approve.
5. Create a **print batch** from approved students and/or staff. Export its CSV and generate front/back PDF card proofs. Use **Save PDF** or **Preview PDF** once the proof is prepared.
6. Switch to Super Admin or Premium Agent to update production from **In progress → Printed → Delivered** and enter a courier or pickup reference.
7. Agents use **Photo uploads** to add PDFs against a specific school. PDF files stay in IndexedDB; the selected page count is entered manually. The separate photo library supports individual portraits and duplicate-name checks.

## Included modules

| Module                 | Frontend behavior                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Overview               | Derived counts, collection journey, review queue, and recent activity                                                            |
| Students               | Search, class/section/status filters, pagination, selection, view/edit/delete, CSV export, CSV/XLSX import, photo replacement    |
| Invitations            | Recipient selection, email composition and preview, sample outbox, copy/open personal links, reminders through the same flow     |
| Student form           | Demo email-code screen, school-configured fields, validation, camera consent/capture, sample-photo option, confirmation, receipt |
| School review          | School-only approval step, photo provenance, manual corrections, correction requests                                             |
| Schools                | Profiles, assigned agent, active state, printing-round settings, copy setup, school workspace links                              |
| Agents                 | Regular/Premium tiers, subscription dates, active state, school assignments, simulated secure access-reset request               |
| Staff                  | Staff identities and photos, role management, configurable fields, manual approval, CSV export, staff printing                   |
| Classes/sections       | Add classes/sections, rename a class, student/photo summaries                                                                    |
| Promotion              | Selected students copied to another class/section in a new session; history retained and duplicate target admissions skipped     |
| Academic sessions      | Add sessions, dates, set current session, retain history                                                                         |
| Photo collections      | School-scoped PDF file validation/upload, notes, page counts, review state, removal; individual photo library                    |
| Card/lanyard designs   | Front/back sample preview, template selection by school, lanyard selection, image artwork gallery uploads                        |
| Printing               | Approved-only batches, immutable record snapshots, search/status filter, CSV, card proof PDF, production/delivery tracking       |
| Settings               | Role profile, school contacts, student/staff field preferences, extra school fields, demo reset                                  |
| Notifications/activity | Read state, navigation to relevant modules, browser-local change history                                                         |
| Guidance               | Contextual hints, validation messages, empty states, clear role guide                                                            |

## Deliberate scope

- **Only mocked data.** Browser-local storage and IndexedDB are not a multi-user database or access-control system. Same-browser tabs synchronize record updates; different devices do not share submissions.
- **No real email, SMS, WhatsApp, OTP authentication, signed expiring links, or password changes.** WhatsApp is visibly marked for phase 2. Phone contacts are retained for that integration.
- Camera capture is real when supported and permitted. **A portrait alone does not prove identity.** Automated liveness/face matching, school-record matching, server validation, rate limits, and authenticated review are backend work.
- PDFs can be uploaded and previewed locally; extraction and automatic mapping of portraits from PDFs are not implemented. School photo-library images can be applied manually in the student editor.
- Card proofs are labelled samples. Final typography, configurable field placement, uploaded artwork placement, printer bleed, and print production integration are separate work. The barcode in the visual mockup is decorative, not a credential.
- Subscription/printing-round settings are editable mock configuration; backend entitlement and quota enforcement are not connected.
- Teacher **staff records** remain possible. Teacher login, Teacher panel, and Teacher approval are removed.
- The deployment has `noindex` metadata and headers. It is a product preview, not a real school-record portal.

## Source references

The frontend was designed after reading the current project structure and relevant role/navigation, form, upload, review, and production code from:

- [Original Angular frontend](https://gitlab.com/school-id-system/school_id_frontend_web)
- [Original Android frontend](https://gitlab.com/school-id-system/school_id_card_frontend_mobile)
- [Java backend](https://gitlab.com/school-id-backend-separate/backend)

The original `src/assets/images/logos/logo.svg` is retained as `public/logo.svg`. No production configuration, credentials, student records, or private backend code were copied. **No GitLab repository was modified.**

See [the source-to-prototype module map](docs/PROJECT_MAP.md) and [validation notes](docs/VALIDATION.md).
