# School ID — role and workflow map

Reviewed on 6 November 2026. This is a frontend redesign; the Java service and original GitLab clients are unchanged.

## Original system

The web client is Angular; the mobile client is native Android/Kotlin; the backend is Java with Spring-style controllers/entities. The web role matrix uses `SUPERADMIN`, `PREMIUM`, `NORMAL`, `ADMIN`, and `TEACHER`.

| Source role       | Purpose in original code                                                                                          | Revised panel                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| SUPERADMIN        | Vendors/agents, schools, sessions, print batches, photo uploads, ID and lanyard designs                           | Super Admin, with the revised school-review workflow                             |
| PREMIUM           | Assigned schools, personal profile, production batches, own printing, design/photo operations                     | Premium Agent, with school-wise PDF photo collections                            |
| NORMAL            | Assigned schools, personal profile, central print submissions                                                     | Regular Agent, with school-wise PDF collection and central fulfillment           |
| ADMIN             | Student/staff records, classes/sections, promotions, photo operations, design selection, card approval/submission | School Admin, the only school-side management panel                              |
| TEACHER           | Class-linked student collection and initial approvals                                                             | Removed; student self-completion links and school-admin review replace this step |
| Public invitation | New requested flow                                                                                                | Student form, accessible through its demo personal link                          |

## Source modules examined

| Existing source                                                             | Preserved or revised responsibility                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `layouts/full/sidebar/sidebar-data.ts`, `pages/pages.routes.ts`             | Role panels and module navigation; remove Teacher access                                                                 |
| `pages/starter/`                                                            | Role-specific overview, student/photo summaries, recent print batches                                                    |
| `pages/agent-details/`, `pages/add-agent/`                                  | Vendor tiers, contact/profile, subscription dates, active state, assigned schools                                        |
| `pages/school-details/`, `pages/add-edit-school/`, `pages/view-school/`     | School contacts, principal, agent assignment, ID field preferences, print rounds                                         |
| `pages/student-details/`, `pages/student-view/`, `pages/add-edit-student/`  | Complete student records, class/section, parent contacts, addresses, spreadsheet import, image choice, extra fields      |
| `pages/staff-details/`, `pages/add-edit-staff/`, `pages/staff-view/`        | Staff record maintenance, roles, photos, fields, exports                                                                 |
| `pages/class-details/`, `pages/promote-students/`, `pages/session-details/` | Classes, sections, new-session promotions, academic history                                                              |
| `pages/submitted-for-print/`, `pages/batch-details/`                        | Approval, print submission, batches, CSV exports, print/delivery progression                                             |
| `pages/upload-bulk-images/`                                                 | School-specific photo library; expanded with the requested PDF intake                                                    |
| `pages/id-card-design-details/`, `pages/upload-id-card-design/`             | Card/lanyard gallery, uploaded artwork, template choice                                                                  |
| Android bottom navigation and role directory structure                      | Cross-check mobile responsibilities and panel naming                                                                     |
| Backend `StudentData`, `SchIDFields`, `StaffIDFields`, `PrintStatus`        | Field/extra-field model, approval flags, print progression; teacher-approval flag is not represented in the new frontend |
| Backend Agent, SuperAdmin, Batch controller signatures                      | Agent CRUD/tier/printing responsibilities and batch exports/status changes                                               |

The original live approval states include pending, submitted for approval, approved, submitted for print, print in progress, printed, and delivered. The prototype makes collection clearer with Draft, Invited, In review, Changes requested, Approved, and Submitted for print. Production batches retain In progress, Printed, and Delivered.

## Revised journey

School contact list → personal email invitation → student details and a fresh portrait → School Admin review/correction → approved records → batch submission → agent/central printing → delivery.

Agent school-photo PDF intake runs alongside student submissions. Reviewing a PDF collection does **not** approve every student card. Individual card approval remains the school’s decision.

Real authentication, expiring invitation links, OTP delivery, anti-impersonation/liveness checks, durable storage, PDF photo matching, and production-grade print output require backend integration before real student data is used.
