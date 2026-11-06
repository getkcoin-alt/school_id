import test from "node:test";
import assert from "node:assert/strict";
import { createSeed, FIELDS, ROLES } from "../src/data.js";
import { parseImport, validateStudent, eligible, csvText } from "../src/lib.js";
test("the preview has no Teacher panel and preserves the two agent tiers", () => {
  assert.deepEqual(
    ROLES.map((r) => r.id),
    ["school", "premium", "regular", "super", "student"],
  );
  const d = createSeed();
  assert.deepEqual(
    d.agents.map((a) => a.type),
    ["Premium", "Regular"],
  );
});
test("printing accepts only approved active records with a photo", () => {
  const s = createSeed().students[0];
  assert.ok(eligible(s));
  for (const status of [
    "Invited",
    "Draft",
    "In review",
    "Changes requested",
    "Submitted for print",
  ])
    assert.equal(eligible({ ...s, status }), false);
  assert.equal(eligible({ ...s, photo: "" }), false);
  assert.equal(eligible({ ...s, active: false }), false);
});
test("spreadsheet import maps school headings and isolates duplicate admissions by school", () => {
  const d = createSeed();
  const rows = [
    {
      "Student Name": "New Student",
      "Admission Number": "NEW-001",
      "Email Address": "sample@example.com",
      "Class No": "7",
      Section: "B",
    },
    { name: "Duplicate", admission: "2026001", email: "duplicate@example.com" },
    {
      name: "New Student again",
      admission: "NEW-001",
      email: "sample@example.com",
    },
    { name: "Invalid", admission: "BAD", email: "not an email" },
  ];
  const r = parseImport(rows, "SCH-001", d.students);
  assert.equal(r.students.length, 1);
  assert.equal(r.duplicates, 2);
  assert.equal(r.invalid, 1);
  assert.equal(r.students[0].classNo, "7");
  assert.equal(r.students[0].status, "Draft");
  assert.equal(
    parseImport([rows[1]], "SCH-002", d.students).students.length,
    1,
  );
});
test("required school fields, email, phone and future birth dates are checked", () => {
  const s = createSeed().students[0];
  assert.deepEqual(validateStudent(s, FIELDS), {});
  assert.ok(validateStudent({ ...s, name: " " }, FIELDS).name);
  assert.ok(validateStudent({ ...s, email: "broken" }, FIELDS).email);
  assert.ok(validateStudent({ ...s, phone: "1234" }, FIELDS).phone);
  assert.ok(validateStudent({ ...s, dob: "2099-01-01" }, FIELDS).dob);
});
test("CSV exports escape quotes, embedded newlines and spreadsheet formulas", () => {
  const out = csvText(
    [{ name: '=IMPORTXML("x")', note: "A, B\nC" }],
    [
      { key: "name", label: "Name" },
      { key: "note", label: "Note" },
    ],
  );
  assert.ok(out.includes('"\'=IMPORTXML(""x"")"'));
  assert.ok(out.includes('"A, B\nC"'));
});
test("new demo state is independent and all records belong to known schools", () => {
  const a = createSeed(),
    b = createSeed();
  a.students[0].name = "Changed";
  assert.notEqual(a.students[0].name, b.students[0].name);
  const schools = new Set(b.schools.map((s) => s.id));
  assert.ok(b.students.every((s) => schools.has(s.school)));
});
