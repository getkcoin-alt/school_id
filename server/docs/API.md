# ID Card Studio API: integration guide for app developers

This is the complete reference for the ID Card Studio backend: every endpoint, who may call
it, what to send, and what comes back. The examples were captured from the running server,
so field names and shapes are exact.

- [1. Basics](#1-basics)
- [2. Signing in from a mobile app](#2-signing-in-from-a-mobile-app)
- [3. Roles and permissions](#3-roles-and-permissions)
- [4. Errors](#4-errors)
- [5. Rules the app must follow](#5-rules-the-app-must-follow)
- [6. Endpoint reference](#6-endpoint-reference)
- [7. Typical app flows](#7-typical-app-flows)
- [8. Old app endpoints and their replacements](#8-old-app-endpoints-and-their-replacements)

---

## 1. Basics

| | |
|---|---|
| **Base URL (production)** | `https://idstudio.in/api/api/v1` |
| **Base URL (local server)** | `http://localhost:4000/api/v1` |
| **Format** | JSON in and out (`Content-Type: application/json`), except file uploads (multipart) and downloads (files) |
| **Auth** | `Authorization: Bearer <accessToken>` on every call except sign-in, password reset and the student portal's first steps |
| **Mobile header** | Send `X-Client: mobile` on `/auth/login`, `/auth/refresh` and `/auth/onboard` (see [section 2](#2-signing-in-from-a-mobile-app)) |
| **Health check** | `GET https://idstudio.in/api/health` returns `{"ok": true}` |

In this guide, paths are relative to the base URL. `POST /auth/login` means
`POST https://idstudio.in/api/api/v1/auth/login`.

### IDs and codes

- Every record has an `id`: an opaque string such as `cmwj2hs0c000d7dh719eep00m`. Use it in
  URLs and request bodies. **Never show it to people.** Treat it as a string and don't parse
  it. IDs are not numbers; the old app used integers.
- Most records also have a short human `code` you may show: `ST-000201` (student),
  `SF-00012` (staff), `SCH-003` (school), `AG-001` (agent), `B-1007` (print batch),
  `D-002` (design). Students, staff, schools and batches can also be looked up by code
  wherever the path takes an `:id`.

### Dates and sessions

- **Send** dates as `DD-MM-YYYY` (e.g. `09-12-2015`) or `YYYY-MM-DD`. `9/12/2015` and
  `09.12.2015` also work.
- **Receive** dates as `YYYY-MM-DD` (e.g. `"dob": "2015-12-09"`). Show them to people
  as `DD-MM-YYYY`, which is the format used across the product.
- Timestamps (`createdAt`, `approvedAt`, …) are ISO 8601 in UTC, e.g. `2026-11-16T09:34:50.892Z`.
- An academic session is named like `2026–27`. The separator is an **en dash (U+2013)**,
  not a hyphen. URL-encode it in query strings (`session=2026%E2%80%9327`). When creating a
  session you may send `2027`, `2027-28` or `2027–28`; the server stores `2027–28`.

### Lists, search and paging

- Lists return `{ "items": [...] }`. Paged lists add `total`, `page` and `size`.
- Paging uses `page` (from 1) and `size`. The default and maximum size are listed per endpoint.
- The activity log uses cursor paging: pass `nextCursor` back as `cursor`.

### Files

- Photo, logo and document URLs in responses (`photoUrl`, `url`, `frontUrl`, …) are
  **signed and expire after about one hour**. Don't store them; fetch the record again for a
  fresh URL. Load them without an `Authorization` header.
- Uploads use `multipart/form-data`, up to **25 MB per file**. JSON bodies are limited to 2 MB.
- Photos are checked and normalised on the server: JPG, PNG or WebP only, at least
  120 × 120 pixels (300 × 300 or more recommended). They are stored as JPEG, at most
  1200 × 1200, with rotation fixed.
- Download endpoints (`.xlsx`, `.zip`, `.pdf`) return the file with a
  `Content-Disposition: attachment; filename="…"` header.

### Rate limits

| Endpoint | Limit |
|---|---|
| All endpoints | 600 requests per minute per client |
| `/auth/login`, `/auth/refresh`, `/auth/onboard`, `/auth/password/forgot`, `/auth/password/reset` | 10 per minute |
| `POST /students/import` | 30 per minute |
| `POST /media/photos` | 60 per minute |
| `POST /invitations/email` | 20 per minute |
| `POST /portal/invite/:token/otp` and `/verify` | 8 per 10 minutes |

Going over a limit returns HTTP `429`. Wait and retry.

---

## 2. Signing in from a mobile app

The server issues a short-lived **access token** (15 minutes) and a long-lived **refresh
token** (30 days). Browsers keep the refresh token in a cookie. **Mobile apps must send
`X-Client: mobile`**, and the refresh token is then returned in the JSON body. Keep it in
secure storage (Android Keystore / EncryptedSharedPreferences, iOS Keychain).

### Sign in

```http
POST /auth/login
Content-Type: application/json
X-Client: mobile

{ "email": "admin.gps@school.in", "password": "Secret123" }
```

`200 OK`

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9…",
  "refreshToken": "eR13tZXHkjcgQW__RZ4c…",
  "impersonatedBy": null,
  "user": {
    "id": "cmwceiab400bp7dr50829po4a",
    "email": "admin.gps@school.in",
    "name": "Anita Sharma",
    "phone": "9812010020",
    "role": "SCHOOL_ADMIN",
    "status": "ACTIVE",
    "agentId": null,
    "agentCode": null,
    "agentTier": null,
    "schoolId": "cmwceiaam00a97dr57jgl9ojg",
    "schoolCode": "SCH-003",
    "schoolName": "Greenwood Public School",
    "lastLoginAt": "2026-11-16T09:34:50.443Z",
    "createdAt": "2026-11-11T17:36:45.709Z"
  }
}
```

`user.role` is one of `SUPER_ADMIN`, `AGENT` or `SCHOOL_ADMIN`; use it to choose the app's
home screen. For agents, `agentTier` is `PREMIUM` or `REGULAR`.

Sign-in can fail with:

| Status | When |
|---|---|
| `401` | Wrong email or password: `"Email or password is incorrect."` |
| `403` | 5 wrong passwords in a row lock the account for 15 minutes. |
| `403` | The account is disabled; the school or agent is inactive; or the agent's subscription has ended. Show the `message`. |

### Call the API

```http
GET /workspace
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9…
```

### Refresh before or when the access token expires

When any call returns `401`, refresh once and retry the call:

```http
POST /auth/refresh
Content-Type: application/json
X-Client: mobile

{ "refreshToken": "eR13tZXHkjcgQW__RZ4c…" }
```

The response has the same shape as sign-in, with a **new** `accessToken` **and a new
`refreshToken`. Save both.** Refresh tokens rotate: each one works once. If an old refresh
token is used again, the server treats it as stolen and ends that whole sign-in session, so
the person must sign in again. If two requests could refresh at the same time, make sure only
one refresh runs and the others wait for it.

If refresh returns `401`, the session is over (signed out elsewhere, password changed,
account or school made inactive). Clear the stored tokens and show the sign-in screen.

### Sign out

```http
POST /auth/logout
Content-Type: application/json

{ "refreshToken": "eR13tZXHkjcgQW__RZ4c…" }
```

Returns `{ "ok": true }`. Delete both tokens from the device.

### Other account endpoints

| Endpoint | Body | Returns | Notes |
|---|---|---|---|
| `GET /auth/me` | – | `{ user, impersonatedBy }` | The signed-in person. |
| `POST /auth/password/forgot` | `{ email }` | `{ ok, message }` | Emails a 6-digit code valid for 15 minutes. Gives the same answer whether or not the email exists. |
| `POST /auth/password/reset` | `{ email, otp, password }` | `{ ok }` | 5 wrong codes use it up. Signs the person out everywhere. |
| `POST /auth/password/change` | `{ currentPassword, newPassword }` | `{ ok, accessToken }` | **Replace the stored access token** with the returned one. Other devices are signed out. |
| `GET /auth/sessions` | – | `{ items: [{ id, userAgent, ip, createdAt, current }] }` | Signed-in devices. |
| `GET /auth/onboard/:token` | – | `{ email, name, phone, role }` | Opens an account-setup link (from the welcome email). |
| `POST /auth/onboard` | `{ token, password, name?, phone? }` | Same as sign-in | Sets the first password and signs in. Send `X-Client: mobile`. |
| `PATCH /users/me` | `{ name?, phone? }` | `user` | Edit your own profile. |

**Password rule:** at least 8 characters with a letter and a number.

---

## 3. Roles and permissions

| Role | Who | Sees |
|---|---|---|
| `SUPER_ADMIN` | ID Card Studio (CTC) | Everything |
| `AGENT` + `PREMIUM` | Agent who may print and manage designs | Their own schools |
| `AGENT` + `REGULAR` | Agent | Their own schools; **cannot download** |
| `SCHOOL_ADMIN` | School office | Only their school. Every call is pinned to it, so `schoolId` parameters are ignored. |

`GET /workspace` returns a `permissions` object for the signed-in person. Use it to show or
hide actions instead of hard-coding roles:

| Permission | Allows | Super | Premium agent | Regular agent | School |
|---|---|:-:|:-:|:-:|:-:|
| `manageAgents` | Add, edit and delete agents | ✓ | | | |
| `manageSchools` | Add schools; set agent, rounds and status | ✓ | | | |
| `deleteSchools` | Delete a school | ✓ | ✓ | ✓ | |
| `editSchoolProfile` | Edit the school's own profile | ✓ | | | ✓ |
| `editStudents` | Add, edit and delete students and staff; photos; import | ✓ | ✓ | ✓ | ✓ |
| `approve` | Approve or return ID card details | ✓ | | | ✓ |
| `createBatch` | Send approved cards to print | ✓ | ✓ | ✓ | ✓ |
| `fulfilBatch` | Move a batch through production | ✓ | ✓ (own batches) | | |
| `download` | Excel, ZIP and PDF downloads | ✓ | ✓ | | ✓ |
| `manageDesigns` | Add card and lanyard designs | ✓ | ✓ | | |
| `uploadPdf` | Upload school photo PDFs | ✓ | ✓ | ✓ | |
| `impersonate` | Open another person's account | ✓ | | | |

Calling an endpoint without the permission returns `403`.

Agents and super admins act on one school at a time: pass `schoolId` (the id or the `SCH-…`
code) where an endpoint takes it. If it's missing you get `403 "Choose a school first."`.

---

## 4. Errors

Every error has the same shape:

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "Enter a valid 10-digit mobile number.",
    "details": [{ "path": "phone", "message": "Enter a valid 10-digit mobile number." }]
  }
}
```

`message` is written for people; show it as it is. `details` is optional.

| HTTP | `code` | Meaning | What the app should do |
|---|---|---|---|
| 400 | `VALIDATION` | A field is wrong. `details[].path` names the field. | Highlight the field and show the message. |
| 400 | `BAD_REQUEST` | The request can't be done as asked. | Show the message. |
| 401 | `UNAUTHORIZED` | No token, or an expired or invalid one. | Refresh once and retry; otherwise go to sign-in. |
| 403 | `FORBIDDEN` | Not allowed for this role or this record. | Show the message. |
| 404 | `NOT_FOUND` | No such record, or one you can't see. | Show the message and go back. |
| 409 | `CONFLICT` | Duplicate, out-of-date edit, or a record still in use. | See the cases below. |
| 429 | – | Too many requests. | Wait and retry. |
| 501 | `NOT_ENABLED` | The feature isn't switched on (e.g. WhatsApp). | Hide the feature. |
| 500 | `INTERNAL` | Server problem. | Show the message; retry later. |

Common `409` cases:

```json
{ "error": { "code": "CONFLICT", "message": "RIYA SHARMA with the same parent and date of birth already exists.", "details": { "duplicateOf": "cmwj2hs0c000d7dh719eep00m" } } }
```

```json
{ "error": { "code": "CONFLICT", "message": "Someone else changed this student. Reload to see the latest details.", "details": { "version": 2 } } }
```

---

## 5. Rules the app must follow

These match the website, so the app and the website behave the same way.

**Students and staff**

1. **Names are stored in capitals.** The server upper-cases `name`, `fatherName`,
   `motherName` and staff `name`. Show capitals while the person types.
2. **Admission number is optional.** Send an empty string or leave it out. Only a non-empty
   admission number is checked for duplicates.
3. **Duplicates are refused.** The server returns `409` for the same admission number in the
   same session, or the same name with the same father's name and/or date of birth.
4. **Photo number comes from the image's file name.** When a photo is chosen (from the
   device or from the school's photo library), set `photoNo` to the file name without its
   extension, in capitals: `DSC_2002.jpg` becomes `DSC_2002`. Keep the field read-only.
   **If another student in the same session already has that photo number**, warn the
   person and let them type a different one. **The server does not check this.** Check it
   in the app with `GET /search?q=<photoNo>`, comparing `photoNo` exactly, or against a
   student list you already hold.
5. **Parent prefixes:** father `Mr.`, `Sh.`, `Dr.`, `Md.`, `Late Sh.`; mother `Mrs.`,
   `Smt.`, `Dr.`, `Ms.`, `Late Smt.` (also in `GET /workspace` → `prefixes`). Excel import
   fills in `Mr.` / `Mrs.` when a parent's name is given without a prefix. **When adding a
   student one at a time, the server does not fill these in**, so preselect `Mr.` and
   `Mrs.` in the form.
6. **Dates:** show and accept `DD-MM-YYYY` with a date picker; the date of birth can't be in
   the future.
7. **Which fields to show and which are compulsory** depends on each school: use
   `GET /schools/:id/fields` (or `GET /workspace` → `school.fields`). Show only
   `enabled` fields, mark `required` ones, and never hide `locked` ones. Custom fields have
   `custom: true`, are sent inside `extra` (`{ "extra": { "x_house": "Red" } }`), and are a
   dropdown when `type` is `"select"` (choices in `options`).
8. **Cards already sent to print:** when a student's `status` is `SUBMITTED_FOR_PRINT`, warn
   that the card has already gone for printing and changes won't change it. Only the school
   or a super admin can still edit such a student; agents get `409`.
9. **Edits use versions:** send the `version` you loaded with `PATCH /students/:id`. If
   someone else saved first you get `409`; reload and try again.

**Student status flow**

`DRAFT` → `INVITED` (form link sent) → `IN_REVIEW` (submitted) → `APPROVED` or
`CHANGES_REQUESTED` → `SUBMITTED_FOR_PRINT` (in a print batch).

Labels to show: Draft, Invited, In review, Changes requested, Approved, Submitted for print.

**Print batches**

1. A batch holds **either students or staff, never both** (`400` otherwise).
2. Only **approved, active records with a photo** can go to print.
3. Each school has a number of **printing rounds** per session for students and for staff
   (default 3, set by ID Card Studio). Before sending, call `GET /batches/rounds` and show a
   short review: number of cards, total rounds, which round this is, rounds left. When one
   round is left, ask the person to include every student they can. When none are left,
   sending fails with `403`; only a super admin can send an extra round.
4. Status flow: `SUBMITTED` → `IN_PROGRESS` → `PRINTED` → `DELIVERED`. The printer may skip
   forward or step back one stage; `GET /batches/:id` → `nextStatuses` lists the allowed
   moves. `CANCELLED` sends the cards back to Approved.

**Accounts**

- Inactive schools and agents can't sign in, and anyone already signed in is signed out at
  once (`401` on the next call or refresh).

---

## 6. Endpoint reference

**Who** uses these abbreviations: **S** = super admin, **PA** = premium agent,
**RA** = regular agent, **SC** = school admin, **Any** = any signed-in person.

### 6.1 Start-up data

#### `GET /workspace`  (Any)

One call that gives the app everything it needs to start. Query: `schoolId?` (which school to
load; defaults to the first) and `session?` (for the counts).

```json
{
  "me": { "id": "…", "name": "Anita Sharma", "email": "…", "role": "SCHOOL_ADMIN", "agentId": null, "agentTier": null, "schoolId": "cmwceiaam00a97dr57jgl9ojg", "impersonatorId": null },
  "permissions": { "manageAgents": false, "manageSchools": false, "deleteSchools": false, "editSchoolProfile": true, "download": true, "approve": true, "editStudents": true, "createBatch": true, "fulfilBatch": false, "manageDesigns": false, "uploadPdf": false, "impersonate": false, "viewLogs": true },
  "schools": [ { "…school…": "…", "studentCount": 31 } ],
  "agents": [],
  "designs": [ { "id": "…", "code": "D-002", "name": "Campus", "kind": "ID_CARD", "audience": "STAFF", "color": "#2d4468", "agentId": null, "frontUrl": null } ],
  "school": {
    "…all school fields…": "…",
    "fields": { "student": [ "…field…" ], "staff": [ "…field…" ] },
    "classes": [ { "id": "…", "name": "VI", "sections": [ { "id": "…", "name": "A" } ] } ],
    "sessions": [ { "id": "…", "name": "2026–27", "startDate": "2026-04-01", "endDate": "2027-03-31", "isCurrent": true } ],
    "staffRoles": ["Driver", "Office staff", "Principal", "Support staff", "Teacher"],
    "counts": { "DRAFT": 4, "IN_REVIEW": 6, "APPROVED": 9, "SUBMITTED_FOR_PRINT": 12 }
  },
  "prefixes": { "father": ["Mr.", "Sh.", "Dr.", "Md.", "Late Sh."], "mother": ["Mrs.", "Smt.", "Dr.", "Ms.", "Late Smt."] },
  "unreadNotifications": 0,
  "features": { "whatsapp": false }
}
```

`school.classes` come in school order (Nursery, LKG, UKG, I … XII). `school.counts` counts
students by status in the current session.

#### `GET /search?q=…`  (Any)

Searches everything the person can see. `q` is 1–80 characters. Returns up to 8 students
(matching name, admission no., code, photo no., father's name or phone, in any session),
5 staff, 5 schools (agents and super), 5 agents (super) and 5 batches.

```json
{
  "students": [ { "id": "…", "name": "RIYA SHARMA", "admissionNo": null, "className": "I", "section": "B", "session": "2026–27", "status": "DRAFT", "schoolId": "…", "schoolName": "Greenwood Public School", "current": true } ],
  "staff": [ { "id": "…", "name": "Anita Sharma", "role": "Principal", "schoolId": "…", "schoolName": "Greenwood Public School" } ],
  "schools": [], "agents": [], "batches": []
}
```

`current` is `true` when the student is in the school's current session.

### 6.2 Students

#### The student object

```json
{
  "id": "cmwj2hs0c000d7dh719eep00m",
  "code": "ST-000201",
  "schoolId": "cmwceiaam00a97dr57jgl9ojg",
  "session": "2026–27",
  "className": "I",
  "section": "A",
  "name": "RIYA SHARMA",
  "admissionNo": null,
  "srn": null,
  "photoNo": "DSC_9001",
  "rollNo": null,
  "fatherPrefix": "Mr.",
  "fatherName": "ANIL SHARMA",
  "motherPrefix": "Mrs.",
  "motherName": "NEHA SHARMA",
  "dob": "2015-12-09",
  "gender": null,
  "email": null,
  "phone": "9876543210",
  "address": null,
  "admissionDate": null,
  "bloodGroup": null,
  "transport": null,
  "extra": {},
  "status": "DRAFT",
  "active": true,
  "photoUrl": null,
  "photoSource": null,
  "photoCapturedAt": null,
  "invitedAt": null,
  "submittedAt": null,
  "approvedAt": null,
  "reviewNote": null,
  "version": 1,
  "createdAt": "2026-11-16T09:34:50.892Z",
  "updatedAt": "2026-11-16T09:34:50.892Z"
}
```

- `photoSource`: `UPLOAD`, `CAMERA`, `LIBRARY`, `PDF` or `IMPORT`.
- `reviewNote`: what the school asked to correct, when `status` is `CHANGES_REQUESTED`.
- `gender`: `Male`, `Female` or `Other`.
- `bloodGroup`: `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+` or `O-`.
- `active: false` means the student has left. They stay on record but can't be printed.

#### Fields you can send

When adding or editing a student, all fields are optional except where noted.

| Field | Type | Rules |
|---|---|---|
| `name` | string | **Required when adding.** At least 2 characters. Stored in capitals. |
| `className` | string | **Required when adding.** A new class name is created automatically. |
| `section` | string | Up to 10 characters. |
| `admissionNo` | string | Up to 40 characters. Empty means none. |
| `srn` | string | Up to 40 characters. |
| `photoNo` | string | Up to 60 characters. Letters, digits, `_ . -`; other characters become `_`. |
| `rollNo` | string | Up to 20 characters. |
| `fatherPrefix`, `motherPrefix` | string | One of the prefixes above (case-insensitive). |
| `fatherName`, `motherName` | string | Stored in capitals. |
| `dob` | date | `DD-MM-YYYY` or `YYYY-MM-DD`; not in the future. |
| `gender` | enum | `Male`, `Female`, `Other` |
| `email` | string | A valid email, or empty. |
| `phone` | string | A 10-digit Indian mobile number; `+91` and spaces are removed. |
| `address` | string | Up to 300 characters. |
| `admissionDate` | date | Same formats as `dob`. |
| `bloodGroup` | enum | See above; empty clears it. |
| `transport` | string | Up to 80 characters. |
| `extra` | object | Custom fields: `{ "<field key>": "<value>" }`. When editing, merged into existing values. |
| `active` | boolean | `false` when the student has left. |
| `session` | string | Defaults to the school's current session. |
| `version` | number | When editing, the version you loaded (see [rule 9](#5-rules-the-app-must-follow)). |
| `schoolId` | string | When adding, as agent or super admin: which school. |

Send `null` or `""` to clear a text field.

#### Endpoints

| Method and path | Who | Description |
|---|---|---|
| `GET /students` | Any | List students of a school. |
| `GET /students/:id` | Any | One student, plus their last 5 form links. |
| `POST /students` | S, PA, RA, SC | Add a student. Returns the student. |
| `PATCH /students/:id` | S, PA, RA, SC | Edit a student. Returns the student. |
| `POST /students/:id/photo` | S, PA, RA, SC | Set the photo (upload or from the library). |
| `GET /students/:id/impact` | S, PA, RA, SC | What deleting this student affects. |
| `DELETE /students/:id` | S, PA, RA, SC | Delete a student. |
| `POST /students/bulk-delete` | S, PA, RA, SC | Delete several students. |
| `POST /students/approve` | S, SC | Approve ID card details. |
| `POST /students/unapprove` | S, SC | Move approved students back to review. |
| `POST /students/request-changes` | S, SC | Ask students to correct their details. |
| `POST /students/promote` | S, PA, RA, SC | Copy students into a new session and class. |
| `POST /students/import` | S, PA, RA, SC | Add students from an Excel/CSV sheet. |
| `GET /students/template.xlsx` | Any | Blank import sheet for the school. |
| `GET /students/export.xlsx` | S, PA, SC | Excel of the filtered students. |
| `GET /students/export.zip` | S, PA, SC | Excel plus photos named by photo number. |
| `GET /students/checklist.pdf` | S, PA, SC | Printable checking sheet. |

**`GET /students`** query parameters:

| Parameter | Description |
|---|---|
| `schoolId` | Agents and super admins: which school. |
| `session` | Defaults to the school's current session. |
| `className`, `section` | Exact match. |
| `status` | One status, e.g. `IN_REVIEW`. |
| `statuses` | Several, comma-separated: `DRAFT,INVITED`. |
| `search` | Name, admission no., code, father's name or phone. (Photo number: use `GET /search`.) |
| `active` | `true` / `false` |
| `hasPhoto` | `true` / `false` |
| `page`, `size` | Default 1 and 50; maximum size 1000. |

Sorted by class, section, then name. Response:

```json
{ "items": [ { "…student…": "…" } ], "total": 31, "page": 1, "size": 50, "counts": { "DRAFT": 4, "IN_REVIEW": 6, "APPROVED": 9, "SUBMITTED_FOR_PRINT": 12 } }
```

`counts` counts every status matching the other filters, ignoring `status`/`statuses`, so tab
badges stay correct.

**`POST /students`** example:

```http
POST /students
Authorization: Bearer …
Content-Type: application/json

{ "name": "riya sharma", "className": "I", "section": "A", "fatherPrefix": "Mr.", "fatherName": "anil sharma", "motherPrefix": "Mrs.", "motherName": "neha sharma", "dob": "09-12-2015", "phone": "9876543210", "admissionNo": "", "photoNo": "DSC_9001" }
```

Returns the new student with `status: "DRAFT"`. A duplicate returns `409` with
`details.duplicateOf`.

**`POST /students/:id/photo`** takes one of two forms:

- **Upload or camera:** `multipart/form-data` with a `file` part (JPG, PNG or WebP) and an
  optional text part `source=CAMERA` (default `UPLOAD`).
- **From the school's photo library:** JSON `{ "photoAssetId": "<id from GET /media/photos>" }`.

Returns the updated student with a fresh `photoUrl`. The upload doesn't change `photoNo`; set
it with `PATCH /students/:id` as described in [rule 4](#5-rules-the-app-must-follow).

**`DELETE /students/:id`** returns `{ "ok": true }`. Call `GET /students/:id/impact`
first to show what will happen:

```json
{ "lines": ["RIYA SHARMA's details will be removed from the school list."], "warnings": [] }
```

**`POST /students/bulk-delete`** takes `{ "ids": ["…"] }` (up to 1000) and returns
`{ "deleted": 12 }`.

**`POST /students/approve`** takes `{ "ids": ["…"] }` (up to 2000). Students missing a
compulsory field or a photo are not approved:

```json
{ "approved": 0, "approvedIds": [], "failed": [ { "id": "…", "name": "RIYA SHARMA", "reason": "Missing: Photo" } ] }
```

**`POST /students/unapprove`** takes `{ "ids": [...] }` and returns `{ "updated": 3 }`.

**`POST /students/request-changes`** takes
`{ "ids": [...], "note": "Photo is blurred", "notify": true }`. The note must be at least 3
characters. With `notify: true`, students with an email get a new form link. Returns
`{ "updated": 2, "emailed": 1 }`.

**`POST /students/promote`** takes
`{ "ids": [...], "toSession": "2027–28", "className": "VII", "section": "A" }` and returns
`{ "promoted": 28, "skipped": 2 }`. The new records start as `DRAFT`; the old session is kept.

**`POST /students/import`** takes either form:

- **JSON:** `{ "rows": [ { "NAME": "ADITYA", "PREFIXF": "MR.", "FATHER": "SUNIL", "DOB": "10-12-2015", "CLASS": "VII", "SECTION": "A", "MOBILE": "9494949494", "ADMNO": "9196", "PHOTO": "DSC_0101" } ], "schoolId": "…", "className": "…", "section": "…", "session": "…" }`
  (up to 10,000 rows).
- **Multipart:** a `file` part (`.xlsx` or `.csv`) plus the same optional text parts.

Column headers are matched loosely (`NAME`, `Student Name`, `studentname` all work). The
agreed columns are: `SRNO, PHOTO, NAME, PREFIXF, FATHER, PREFIXM, MOTHER, DOB, CLASS,
SECTION, MOBILE, ADDRESS, ADMNO, SRN, EMAIL`. Rows whose `PHOTO` matches a file in the
photo library get that photo. Response:

```json
{ "created": 40, "withPhoto": 35, "skipped": [ { "row": 7, "name": "AMIT", "reason": "Admission number 9196 already exists." } ], "invalid": [ { "row": 9, "reason": "Class is missing." } ] }
```

`row` is the spreadsheet row number (the header is row 1).

**Downloads** (`template.xlsx`, `export.xlsx`, `export.zip`, `checklist.pdf`) take the same
filters as `GET /students`. `checklist.pdf` also takes `perPage=10|12`.

### 6.3 Staff

Staff object:

```json
{ "id": "…", "code": "SF-00012", "schoolId": "…", "session": "2026–27", "name": "ANIKA KUMAR", "role": "Teacher", "email": "anika@school.in", "phone": "9812010021", "address": "Sonipat, Haryana", "gender": null, "dob": null, "className": null, "section": null, "extra": {}, "photoUrl": "https://…", "photoSource": "UPLOAD", "status": "ACTIVE", "reviewStatus": "APPROVED", "approvedAt": "2026-10-12T17:36:45.636Z", "version": 1, "updatedAt": "2026-11-11T17:36:46.800Z" }
```

`status` is `ACTIVE` or `INACTIVE`. `reviewStatus` uses the student statuses.

| Method and path | Who | Description |
|---|---|---|
| `GET /staff` | Any | Query: `schoolId?`, `search?` (name, role, code), `status?`, `reviewStatus?`. Returns `{ items }`, sorted by name. |
| `POST /staff` | S, PA, RA, SC | Body: `name` (required), `role`, `email`, `phone`, `address`, `gender`, `dob`, `className`, `section`, `extra`, `status`, `schoolId?`. Name stored in capitals. |
| `PATCH /staff/:id` | S, PA, RA, SC | Any of the same fields. |
| `DELETE /staff/:id` | S, PA, RA, SC | `{ ok: true }` |
| `POST /staff/:id/photo` | S, PA, RA, SC | Multipart `file`, optional `source=CAMERA`. |
| `POST /staff/approve` | S, SC | `{ ids }` → `{ approved, approvedIds, failed }` |
| `GET /staff/export.xlsx` | S, PA, SC | Query `schoolId?`. |

Staff roles for the role dropdown: `GET /schools/:id/staff-roles` (see 6.5).

### 6.4 Schools

School object:

```json
{ "id": "…", "code": "SCH-003", "name": "Greenwood Public School", "shortName": "GPS", "email": "office@gps.in", "phone": "9812010000", "principal": "Dr. R. Mehta", "address": "Sector 14", "city": "Sonipat", "state": "Haryana", "country": "India", "pin": "131001", "color": "#326b5b", "status": "ACTIVE", "agentId": "…", "agent": { "id": "…", "code": "AG-001", "name": "Northstar Print Co.", "tier": "PREMIUM" }, "studentRounds": 3, "staffRounds": 3, "studentPermit": true, "staffPermit": true, "studentDesignId": "…", "staffDesignId": null, "lanyardDesignId": null, "currentSession": "2026–27", "logoUrl": null, "createdAt": "…" }
```

| Method and path | Who | Description |
|---|---|---|
| `GET /schools` | Any | Query: `search?` (name, code, city), `status?`, `agentId?` (super; `none` for unassigned). Each item adds `studentCount` (current session). |
| `GET /schools/print-queue` | Any | Schools with cards ready: `{ items: [{ id, code, name, agentId, approvedStudents, approvedStaff, submittedBatches }] }`. |
| `POST /schools` | S | Add a school (see below). |
| `GET /schools/:id` | Any | One school, plus `logins: [{ id, email, name, status, lastLoginAt }]` for super and school admins. |
| `PATCH /schools/:id` | S, PA, RA, SC | Edit. **School admins:** contact details and designs only. **Agents:** also `status`. **Super admin:** everything, including `agentId`, rounds and permits. Making a school `INACTIVE` signs its users out. |
| `GET /schools/:id/impact` | S, PA, RA | What deleting the school affects: `{ lines, warnings }`. |
| `DELETE /schools/:id` | S, PA, RA | Delete the school, disable its logins and cancel its open batches. |
| `POST /schools/:id/copy-setup` | S, PA, RA | `{ fromSchoolId }`: copy fields, classes, sections, staff roles and designs from another school. |
| `GET /schools/:id/fields` | Any | `{ student: [field], staff: [field] }` |
| `PUT /schools/:id/fields` | S, PA, RA, SC | Replace a school's field settings (see below). |

**`POST /schools`** body: `name` (required), `shortName`, `email`, `phone`, `principal`,
`address`, `city`, `state`, `country`, `pin`, `color` (`#rrggbb`), `agentId`, `status`
(default `ACTIVE`), `studentRounds`/`staffRounds` (default 3), `studentPermit`/`staffPermit`
(default `true`), `createDefaultClasses` (default `true`: Nursery … XII with section A), and
optionally `admin: { name, email, phone? }`, which creates the school admin's login and emails
them a setup link.

**Field object** (from `/fields` and `/workspace`):

```json
{ "key": "fatherName", "label": "Father Name", "type": "text", "enabled": true, "required": true, "custom": false, "locked": false, "column": "FATHER", "aliases": ["fathername", "fathersname"], "options": ["Red", "Blue"] }
```

`type` is `text`, `date`, `tel`, `email`, `class`, `section`, `gender`, `blood`,
`fatherPrefix`, `motherPrefix`, `role` or `select`. `options` is present only for custom
`select` fields.

**`PUT /schools/:id/fields`** body:

```json
{ "audience": "STUDENT", "fields": [ { "key": "photoNo", "label": "Photo No.", "enabled": true, "required": false }, { "label": "House", "enabled": true, "required": true, "custom": true, "type": "select", "options": ["Red", "Blue", "Green", "Yellow"] } ] }
```

Send the full list in display order. A new custom field without a `key` gets one made from its
label (e.g. `x_house`). Locked fields are always enabled and required. Returns `{ fields }`.

### 6.5 Sessions, classes, sections and staff roles

All of these are nested under a school: `:id` is the school id or code.

| Method and path | Who | Description |
|---|---|---|
| `GET /schools/:id/sessions` | Any | `{ next: "2027–28", items: [{ id, name, startDate, endDate, isCurrent, students }] }` |
| `POST /schools/:id/sessions` | S, PA, RA, SC | `{ name?, startDate?, endDate?, isCurrent? }`. Without `name`, the next session is created. Dates default to 1 April – 31 March. `409` if it already exists. |
| `PATCH /schools/:id/sessions/:sessionId` | S, PA, RA, SC | `{ startDate?, endDate?, isCurrent?: true }`. `isCurrent: true` makes it the school's current session. |
| `POST /schools/sessions/bulk` | S, PA, RA | Add one session to many schools: `{ name?, isCurrent?, schoolIds? }`. Returns `{ created, skipped: [schoolName] }`. |
| `GET /schools/:id/classes` | Any | `{ items: [{ id, name, sortOrder, students, sections: [{ id, name, students }] }] }` in school order. |
| `POST /schools/:id/classes` | S, PA, RA, SC | `{ name, sections?: ["A","B"] }`. The class is placed in school order automatically. `409` if the name exists (case-insensitive). |
| `PATCH /schools/:id/classes/:classId` | S, PA, RA, SC | `{ name?, sortOrder? }`. Renaming moves the students with it. |
| `DELETE /schools/:id/classes/:classId` | S, PA, RA, SC | `409` while the class still has students (`details.students`). |
| `POST /schools/:id/classes/:classId/sections` | S, PA, RA, SC | `{ name }` |
| `DELETE /schools/:id/classes/:classId/sections/:sectionId` | S, PA, RA, SC | `409` while it has students. |
| `GET /schools/:id/staff-roles` | Any | `{ items: ["Principal", "Teacher", …] }` |
| `PUT /schools/:id/staff-roles` | S, PA, RA, SC | `{ roles: [...] }` replaces the list. |

### 6.6 Print batches

Batch object:

```json
{ "id": "…", "code": "B-1007", "name": "GPS second round", "schoolId": "…", "schoolName": "Greenwood Public School", "schoolCode": "SCH-003", "session": "2026–27", "status": "IN_PROGRESS", "fulfilledBy": "AGENT", "fulfillerAgentId": "…", "fulfillerName": "Northstar Print Co.", "designName": "Classic", "carrier": null, "tracking": null, "studentCount": 2, "staffCount": 0, "createdAt": "…", "printedAt": null, "deliveredAt": null }
```

A batch with `staffCount > 0` and `studentCount == 0` is a staff batch; otherwise it's a
student batch. `fulfilledBy` is `CENTRAL` (ID Card Studio) or `AGENT`.

| Method and path | Who | Description |
|---|---|---|
| `GET /batches` | Any | Query: `schoolId?`, `status?`, `fulfilledBy?`, `fulfillerAgentId?`, `search?`, `page`, `size` (max 200). Returns `{ items, total, counts }`. |
| `GET /batches/rounds` | Any | Query `schoolId?`. `{ "session": "2026–27", "student": { "allowed": 3, "used": 2 }, "staff": { "allowed": 3, "used": 0 }, "superAdmin": false }` |
| `POST /batches` | S, PA, RA, SC | Send cards to print (see below). |
| `GET /batches/:id` | Any | The batch plus `items` (records as printed, in print order, each with `photoUrl`), `orderForms` and `nextStatuses`. |
| `PATCH /batches/:id` | see below | `{ status?, carrier?, tracking?, name? }` |
| `GET /batches/:id/impact` | see below | What deleting the batch affects. |
| `DELETE /batches/:id` | see below | Delete; cards not yet printed go back to Approved. |
| `GET /batches/:id/export.xlsx` | S, PA, SC | Spreadsheet of the batch. |
| `GET /batches/:id/download.zip` | S, PA, SC | Spreadsheet, photos named by photo number, and a checklist PDF. |
| `GET /batches/:id/proof.pdf` | S, PA, SC | Proof checklist; `perPage=10|12`. |

**`POST /batches`** body:

```json
{ "schoolId": "…", "name": "Class VI round 2", "studentIds": ["…", "…"] }
```

or `{ "staffIds": [...] }` for staff, or `{ "allApproved": true, "className": "VI" }` for
every approved student (optionally of one class). It returns the batch plus `skipped`, the
number of chosen records that weren't approved or had no photo. The cards become
`SUBMITTED_FOR_PRINT`.

Errors: `400` for mixed students and staff or nothing eligible; `403` when no printing rounds
are left; `409` when someone else sent the same records first.

**Changing status:** only the printer (super admin, or the premium agent printing it) can move
production forward. Cancelling is allowed for the school, the person who created the batch,
or a super admin. **Deleting:** a super admin can delete any batch; the school or the creator
can delete it while it is `SUBMITTED` or `CANCELLED`.

### 6.7 Photos, photo PDFs and order forms

| Method and path | Who | Description |
|---|---|---|
| `GET /media/photos` | Any | The school's photo library. Query: `schoolId?`, `search?` (file name), `page`, `size` (max 500, default 100). `{ total, items: [{ id, fileName, size, url, createdAt }] }` |
| `POST /media/photos` | S, PA, RA, SC | Multipart: `schoolId?`, `session?`, and up to 200 `file` parts. Each photo is matched to a student by photo number, admission number or code (file name without extension) and set as their photo. |
| `DELETE /media/photos/:id` | S, PA, RA, SC | `{ ok, stillUsedBy }` |
| `GET /media/pdfs` | Any | Photo PDFs from agents: `{ items: [{ id, schoolId, schoolName, agentName, fileName, size, pages, note, status, createdAt, url }] }` |
| `POST /media/pdfs` | S, PA, RA | Multipart: `schoolId`, `note?`, `pages?`, PDF `file` parts. |
| `PATCH /media/pdfs/:id` | Any with access | `{ status?: "READY_FOR_REVIEW" \| "REVIEWED" \| "REJECTED", note?, pages? }` |
| `DELETE /media/pdfs/:id` | S, PA, RA | |
| `GET /media/order-forms` | Any | Query `schoolId?`, `batchId?`. School admins see their own school's forms. |
| `POST /media/order-forms` | S, PA, RA | Add an order form (see below). |
| `PATCH /media/order-forms/:id` | S, PA, RA | `{ details?, note? }` |
| `DELETE /media/order-forms/:id` | S, PA, RA | Schools can't delete order forms. |

`POST /media/photos` response:

```json
{ "matched": 1, "results": [ { "fileName": "DSC_2002.jpg", "status": "saved", "matchedStudentId": "…" }, { "fileName": "bad.gif", "status": "failed", "reason": "Upload a JPG, PNG or WebP photo." } ] }
```

`status` is `saved`, `replaced` (same file name uploaded again) or `failed`.

**Order forms.** These are the CtC order form, either filled in on screen or uploaded as a
signed copy. `POST /media/order-forms` is multipart with these parts:

- `schoolId` (required);
- `details` (optional): a JSON string of the form's answers;
- `file` (optional): PDF, JPG, PNG, WebP, Excel or Word;
- `note`, `batchId` (optional).

At least `details` or `file` is required. Order form object:

```json
{ "id": "…", "schoolId": "…", "schoolName": "Greenwood Public School", "batchCode": null, "fileName": null, "size": null, "note": null, "createdAt": "…", "url": null,
  "details": { "date": "2026-11-16", "schoolName": "Greenwood Public School", "cardType": "Scratch proof", "doriType": "Digital", "doriColour": "Navy Blue", "doriCount": "300", "rate": "35" } }
```

`url` is set only when a file was uploaded. `details` keys used by the website:

| Group | Keys |
|---|---|
| School | `srNo`, `date`, `schoolName`, `address`, `contactNo`, `email`, `emailPrint`, `website`, `websitePrint`, `design` |
| Card | `schoolLogo`, `cardType`, `issuingAuthority`, `signature` |
| Dori (lanyard) | `doriType`, `doriColour`, `printOnDories`, `doriCount` |
| Holder | `holderOrientation`, `holderSticky`, `holderSides`, `holderSize`, `attachment` |
| Staff member (from Sonepat) | `staffName`, `staffContact`, `rate`, `advance`, `extraDoriRate` |
| Authorised person | `authName`, `authDesignation`, `authContact` |
| Other | `remarks` |

Choices as on the paper form:

| Key | Choices |
|---|---|
| `emailPrint`, `websitePrint` | To print / Not to print |
| `schoolLogo`, `signature` | Received / Not received / Not applicable |
| `cardType` | Normal / Scratch proof |
| `doriType` | Digital / Soft / Mattee / Border |
| `doriColour` | Royal Blue / Navy Blue / Red / Yellow |
| `holderOrientation` | Horizontal / Vertical |
| `holderSticky` | Sticky / Non sticky |
| `holderSides` | Single sided / Double sided |
| `holderSize` | Small / Normal |
| `attachment` | With hook / Without hook |
| `issuingAuthority` | Director / Principal / Head Master / Head Mistress |

Values are strings, numbers or booleans of up to 500 characters; keys up to 40 characters.

### 6.8 Card and lanyard designs

Design object:

```json
{ "id": "…", "code": "D-002", "name": "Campus", "kind": "ID_CARD", "audience": "STAFF", "color": "#2d4468", "agentId": null, "frontUrl": "https://…", "backUrl": null, "createdAt": "…" }
```

`kind` is `ID_CARD` or `LANYARD`; `audience` is `STUDENT`, `STAFF` or `EVERYONE`. Designs
with `agentId: null` belong to ID Card Studio and everyone can use them. An agent's own
designs are visible to that agent and their schools.

| Method and path | Who | Description |
|---|---|---|
| `GET /designs` | Any | Query `kind?`, `audience?`. |
| `POST /designs` | S, PA | Multipart: `name`, `kind?`, `audience?`, `color?`, and 1–2 image `file` parts (front, then back; a file name containing "back" is the back). PNG, JPG, WebP, SVG or PDF. |
| `PATCH /designs/:id` | S, own PA | `{ name?, color?, audience? }` |
| `DELETE /designs/:id` | S, own PA | |

A school chooses its designs with `PATCH /schools/:id` and `studentDesignId`,
`staffDesignId` or `lanyardDesignId`.

### 6.9 Agents and logins

| Method and path | Who | Description |
|---|---|---|
| `GET /agents` | S | Query `tier?`, `status?`, `search?`. |
| `POST /agents` | S | Add an agent and their login (they get a setup email). |
| `GET /agents/:id` | S, the agent | Agent plus `logins`. |
| `PATCH /agents/:id` | S, the agent | An agent can edit their profile; a super admin can also change `tier`, subscription dates, `status` and `printBySelf`. Making an agent `INACTIVE` signs them out. |
| `GET /agents/:id/impact` | S | What deleting the agent affects. |
| `DELETE /agents/:id` | S | Their schools become unassigned. |
| `GET /users` | Any | Logins you may see. Query `role?`, `schoolId?`, `agentId?`, `search?`. Each has `setupEmail: { status, error, queuedAt, sentAt }`. |
| `POST /users` | S; SC for own school | `{ email, name, phone?, role, schoolId?, agentId? }`: creates a login and emails a setup link. |
| `POST /users/:id/resend-invite` | S; SC | Send the setup email again. |
| `PATCH /users/:id` | S; SC | `{ name?, phone?, status?: "ACTIVE" \| "DISABLED" }` |
| `POST /auth/impersonate` | S | `{ userId }`: returns a sign-in for that school admin or agent (1-day session). |

Agent object:

```json
{ "id": "…", "code": "AG-001", "name": "Ravi Kumar", "company": "Northstar Print Co.", "email": "…", "phone": "…", "tier": "PREMIUM", "address": "…", "city": "…", "state": "…", "country": "India", "pin": "…", "subscriptionStart": "2026-04-01", "subscriptionEnd": "2027-03-31", "status": "ACTIVE", "printBySelf": true, "photoUrl": null, "schoolCount": 4, "createdAt": "…" }
```

**`POST /agents`** body: `name`, `email`, `tier` (`PREMIUM` or `REGULAR`) are required;
optional fields are `company`, `phone`, `address`, `city`, `state`, `country`, `pin`,
`subscriptionStart`, `subscriptionEnd`, `status` and `printBySelf`.

### 6.10 Student form links and the student portal

Schools can send each student a personal link to fill in their own details and photo.

| Method and path | Who | Description |
|---|---|---|
| `POST /invitations/link` | S, PA, RA, SC | `{ studentId }` → `{ url, expiresAt }`, a link to copy or share. |
| `POST /invitations/email` | S, PA, RA, SC | `{ studentIds, message? }` → `{ sent, sentIds, skipped: [{ id, name, reason }] }` |
| `POST /invitations/revoke` | S, PA, RA, SC | `{ studentId }` → `{ revoked }` |
| `POST /invitations/whatsapp` | – | Not enabled yet (`501`). |

The student opens the link in a browser. The portal endpoints below need no account; they use
the token from the link, then a portal token:

| Method and path | Description |
|---|---|
| `GET /portal/invite/:token` | `{ school, studentFirstName, verification: "EMAIL_OTP" \| "ADMISSION_NO", emailHint, expiresAt }` |
| `POST /portal/invite/:token/otp` | Emails a 6-digit code. |
| `POST /portal/invite/:token/verify` | `{ otp }` or `{ admissionNo }` / `{ phone }` → `{ token }`. Send it as `Authorization: Bearer <token>` below. |
| `GET /portal/me` | `{ school, student, editable, fields, prefixes, classes, missing }` |
| `PUT /portal/me` | Student fields (identifiers like admission no. and photo no. are ignored). → `{ student, missing }` |
| `POST /portal/me/photo` | Multipart `file`, `source=CAMERA\|UPLOAD`. |
| `POST /portal/me/submit` | `{ consent: true }`: sends the details for review (`IN_REVIEW`). |

### 6.11 Notifications and activity

| Method and path | Who | Description |
|---|---|---|
| `GET /notifications` | Any | Latest 50: `{ items: [{ id, title, body, link, readAt, createdAt }], unread }` |
| `POST /notifications/read` | Any | `{ ids? }`: marks these as read, or all when `ids` is left out. |
| `GET /activity` | Any | Activity log. Query: `userId?`, `schoolId?`, `agentId?`, `action?` (prefix, e.g. `student.`), `from?`, `to?` (`YYYY-MM-DD`), `search?`, `size` (max 200), `cursor?`. |

Activity response:

```json
{ "items": [ { "id": "…", "createdAt": "…", "actorId": "…", "actorName": "Anita Sharma", "actorRole": "SCHOOL_ADMIN", "impersonatedBy": null, "schoolId": "…", "agentId": "…", "action": "student.updated", "entityType": "student", "entityId": "…", "summary": "Anita Sharma edited RIYA SHARMA" } ], "nextCursor": "…" }
```

There is no push-notification (FCM) registration endpoint. The old app's `/fcm/register`
has no replacement yet, so poll `GET /notifications` (or `unreadNotifications` in
`/workspace`).

---

## 7. Typical app flows

**Start-up**

1. If a refresh token is stored, call `POST /auth/refresh`; otherwise show sign-in.
2. Call `GET /workspace` and build the home screen from `me`, `permissions`, `school` and
   `school.counts`.

**Add a student with a photo**

1. Read the form from `school.fields.student`, the class and section dropdowns from
   `school.classes`, and the prefixes from `prefixes`.
2. Photo: take or pick an image. Set `photoNo` from the file name and check it isn't already
   used ([rule 4](#5-rules-the-app-must-follow)).
3. `POST /students` with the fields. You get the student `id` back.
4. `POST /students/:id/photo` with the image (multipart), or `{ "photoAssetId" }` for a
   library photo.

**Review and send to print (school admin)**

1. `GET /students?status=IN_REVIEW` to list submitted students.
2. `POST /students/approve` with the chosen ids. Show `failed[].reason` for any that didn't
   pass.
3. `GET /students?status=APPROVED&hasPhoto=true` to list cards that can be printed.
4. `GET /batches/rounds` and show the review: cards, total rounds, this round, rounds left.
5. `POST /batches` with `studentIds` (or `staffIds`).
6. Follow progress with `GET /batches` and `GET /batches/:id`.

**Bulk photos (agent)**

1. `POST /media/photos` with the school's photos (multipart, many files).
2. Photos named after a student's photo number are attached to that student automatically.

---

## 8. Old app endpoints and their replacements

The Android app was written for the previous server. Those addresses no longer exist and
return `404`. Use this table to move each call to the new API.

| Old call | New call |
|---|---|
| `POST login/all` | `POST /auth/login` with `X-Client: mobile` |
| `GET login/getProfile` | `GET /auth/me` (or `GET /workspace`) |
| `PUT login/updateProfile` | `PATCH /users/me`; agents: `PATCH /agents/:id`; schools: `PATCH /schools/:id` |
| `POST login/changeMyPassword` | `POST /auth/password/change` |
| `POST login/getOtp` / `verifyOTP` / `updatePassword` | `POST /auth/password/forgot`, then `POST /auth/password/reset` (code and new password in one call) |
| `GET login/dashBoard` | `GET /workspace` (`school.counts`) and `GET /students?…` |
| `GET login/getPass` | Removed: passwords are never shown. |
| `POST agent/add` | `POST /agents` |
| `GET agent/getAllAgent`, `agent/getAllLight`, `agent/getSuperPremAgent` | `GET /agents?tier=&status=&search=` |
| `GET agent/getById/{id}` | `GET /agents/:id` |
| `PUT agent/update/{id}` | `PATCH /agents/:id` |
| `DELETE agent/deleteById/{id}` | `DELETE /agents/:id` |
| `POST school/add` | `POST /schools` |
| `PUT school/update/{id}` | `PATCH /schools/:id` |
| `GET school/getAll` | `GET /schools` |
| `GET school/getById/{id}` | `GET /schools/:id` |
| `DELETE school/deleteById/{id}` | `DELETE /schools/:id` |
| `GET student/getStudents`, `getBySchool/{id}`, `getByNormalAgent` | `GET /students?schoolId=&status=&className=&section=&search=&page=&size=` |
| `GET student/getById/{id}` | `GET /students/:id` |
| `POST student/addStudent` | `POST /students`, then `POST /students/:id/photo` |
| `PUT student/update/{id}` | `PATCH /students/:id` (photo: `POST /students/:id/photo`) |
| `DELETE student/deleteStudent/{id}` | `DELETE /students/:id` |
| `GET student/getStudentForm` | `GET /schools/:id/fields` → `student` |
| `PUT student/approveData` (approve) | `POST /students/approve` / `POST /staff/approve` |
| `PUT student/approveData` (submit for print) | `POST /batches` |
| `GET student/getBySesClassSec` | `GET /students?session=&className=&section=` |
| `PUT student/promoteStudent` | `POST /students/promote` |
| `POST staff/add` | `POST /staff`, then `POST /staff/:id/photo` |
| `GET staff/getAll`, `staff/getBySchool/{id}` | `GET /staff?schoolId=&search=&status=` |
| `GET staff/getById/{id}` | `GET /staff?search=` (no single-staff endpoint) |
| `PUT staff/updateById/{id}` | `PATCH /staff/:id` |
| `DELETE staff/deleteById/{id}` | `DELETE /staff/:id` |
| `GET staff/getStaffForm` | `GET /schools/:id/fields` → `staff` |
| `POST role/add`, `GET role/getAll` | `GET` / `PUT /schools/:id/staff-roles` |
| `GET class/getAll`, `section/getAllByClassNo/{classNo}` | `GET /schools/:id/classes` (sections included) |
| `POST class/add` | `POST /schools/:id/classes` |
| `POST section/add` | `POST /schools/:id/classes/:classId/sections` |
| `DELETE section/deleteById/{id}` | `DELETE /schools/:id/classes/:classId/sections/:sectionId` |
| `PUT section/updateBulkByClassId/{classId}` | `PATCH /schools/:id/classes/:classId`, plus the section add/delete calls |
| `POST session/addSession` | `POST /schools/:id/sessions` |
| `GET session/getAllSession` | `GET /schools/:id/sessions` |
| `PUT session/activeSession/{id}` | `PATCH /schools/:id/sessions/:sessionId` with `{ "isCurrent": true }` |
| `DELETE session/deleteById/{id}` | Not available: sessions are kept for history. |
| `GET batch/getAllBatch` | `GET /batches` |
| `GET batch/downloadCSVByBatch` | `GET /batches/:id` (records as JSON) or `GET /batches/:id/export.xlsx` |
| `GET photo/getAll` | `GET /media/photos?search=` |
| `POST /fcm/register` | Not available yet (see 6.11). |

Two differences matter everywhere:

- **IDs are strings**, not integers. Change `List<Int>` and `@Path("id") id: Int` to
  `String`.
- **Requests are JSON bodies**, not query parameters (`@Query` on POST/PUT). Photos are a
  separate multipart call.
