# Validation notes

## Automated

`npm test` checks role removal/tier retention, approved-only printing eligibility, school-scoped spreadsheet duplicate detection, input validation, CSV escaping/formula protection, and independent fictional seed data.

`npm run build` compiles the production Vite bundle. `git diff --check` checks patch formatting.

A generated PDF was independently checked for the `%PDF-` header and extracted text, including front/back school details, student details, and the sample-proof label.

## Browser workflow checks

- Prepared an invitation for a fictional student and verified the sample outbox confirmation.
- Opened the personal student link, entered the demo code, completed the fields, used the visibly labelled sample-photo path, confirmed, and submitted.
- Verified the already-open school tab received the submission, approved it, and created a one-card print batch.
- Verified batch CSV download contents matched the student and its immutable batch snapshot.
- Verified Premium/Regular role switching, assigned-school lists, and isolation of uploaded school-PDF records between schools.
- Uploaded an actual fictional PDF fixture and verified its school-scoped metadata and Ready for review state.
- Rendered School Admin and student screens in 390px-wide iframes. Neither produced horizontal document overflow.
- Verified the PDF proof generator produced Save PDF and Preview PDF links.

## Verification limits

- The test browser blocks observing `blob:` URLs; its PDF download observation did not complete. PDF content was checked outside that browser. PDF viewing/downloading should be checked in the reviewer’s normal browser.
- The sample-photo route was exercised. Physical-camera permissions/hardware and automated identity verification were not tested; automated identity verification is not implemented.
- No real delivery, multi-device submission, authentication, or backend operations were tested because this is explicitly a mocked frontend.
