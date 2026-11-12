import React, { useState } from "react";
import { FIELDS } from "../data.js";
import {
  PageTitle,
  Panel,
  Button,
  Icon,
  IconButton,
  SearchBox,
  Avatar,
  Badge,
  Modal,
  Field,
  Callout,
  Empty,
  CardPreview,
  PDFProofButton,
} from "../components.jsx";
import {
  uid,
  exportCSV,
  download,
  parseImport,
  validateStudent,
  isNotSubmitted,
  approvalError,
  approvedStudent,
  exportStudents,
  studentPhoto,
  validPhoto,
} from "../lib.js";
import { getFile } from "../files.js";

export function StudentEditor({ ctx, student, onClose, onSaved }) {
  const { data, school, update, notify, log } = ctx;
  const [draft, setDraft] = useState(
    student
      ? structuredClone(student)
      : {
          id: uid("ST"),
          school: school.id,
          name: "",
          admission: "",
          classNo: "6",
          section: "A",
          gender: "",
          dob: "",
          father: "",
          mother: "",
          email: "",
          phone: "",
          address: "",
          blood: "",
          admissionDate: "",
          transport: "",
          status: "Draft",
          active: true,
          session: ctx.session,
          photo: "",
          custom: {},
        },
  );
  const [errors, setErrors] = useState({});
  const [photoBusy, setPhotoBusy] = useState(false);
  const canApprove =
    ["school", "super"].includes(ctx.role) &&
    draft.active &&
    (!student || isNotSubmitted(student) || student.status === "In review");
  const keys = data.fieldScope[school.id] || data.enabledFields;
  const fields = FIELDS.filter((f) => keys.includes(f[0]));
  const change = (key, val) => {
    setDraft((d) => ({ ...d, [key]: val }));
    setErrors((e) => ({ ...e, [key]: null }));
  };
  const save = (approve = false) => {
    const e = validateStudent(draft, fields);
    if (
      data.students.some(
        (s) =>
          s.id !== draft.id &&
          s.school === school.id &&
          s.session === draft.session &&
          String(s.admission).trim() === draft.admission.trim(),
      )
    )
      e.admission = "This admission number already exists in this school.";
    if (Object.keys(e).length) {
      setErrors(e);
      notify("Check the highlighted fields.", "error");
      return;
    }
    if (approve && (!canApprove || approvalError(draft, fields))) {
      notify("Add a photo before approving this student.", "error");
      return;
    }
    const saved = {
      ...draft,
      name: draft.name.trim(),
      admission: draft.admission.trim(),
      status: student
        ? ["Approved", "Submitted for print"].includes(student.status)
          ? "In review"
          : draft.status
        : draft.photo
          ? "In review"
          : "Draft",
    };
    const result = approve ? approvedStudent(saved) : saved;
    update((d) =>
      log(
        {
          ...d,
          students: student
            ? d.students.map((s) => (s.id === result.id ? result : s))
            : [result, ...d.students],
        },
        `${approve ? "Approved" : student ? "Updated" : "Added"} student ${result.name}`,
      ),
    );
    notify(
      approve
        ? `${result.name} is approved and ready for printing.`
        : student
          ? "Student record updated."
          : "Student added to your directory.",
    );
    onSaved?.(result);
    onClose();
  };
  const loadPhoto = async (read, source) => {
    setPhotoBusy(true);
    try {
      const photo = await read();
      setDraft((d) => ({ ...d, photo, photoSource: source, captureAt: null }));
    } catch {
      notify("The photo could not be opened. Choose another image.", "error");
    } finally {
      setPhotoBusy(false);
    }
  };
  const photo = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!validPhoto(file)) {
      notify("Choose a JPG, PNG, or WebP image up to 15 MB.", "error");
      return;
    }
    loadPhoto(() => studentPhoto(file), "School admin upload");
  };
  return (
    <Modal
      wide
      title={student ? "Edit student details" : "Add a student"}
      subtitle="Use the school record to make corrections. Edited approved details return to review."
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="student-editor-head">
          <Avatar
            name={draft.name || "New student"}
            photo={draft.photo}
            size={66}
          />
          <div>
            <label className="btn secondary upload-label">
              <Icon name="upload" size={15} />
              <span>{draft.photo ? "Replace photo" : "Upload photo"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={photo}
                disabled={photoBusy}
              />
            </label>
            <p>
              {photoBusy ? "Preparing photo…" : "JPG, PNG, WebP · up to 15 MB"}
            </p>
          </div>
          {data.photoLibrary.filter((p) => p.school === school.id).length >
            0 && (
            <Field label="Or choose from school photos">
              <select
                defaultValue=""
                disabled={photoBusy}
                onChange={(e) => {
                  const p = data.photoLibrary.find(
                    (p) => p.id === e.target.value,
                  );
                  e.target.value = "";
                  if (p)
                    loadPhoto(async () => {
                      if (p.src) return p.src;
                      const file = await getFile(p.fileKey);
                      if (!file) throw Error("Photo missing");
                      return studentPhoto(file);
                    }, "School photo library");
                }}
              >
                <option value="">Choose a library photo</option>
                {data.photoLibrary
                  .filter((p) => p.school === school.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          {draft.photo && (
            <IconButton
              icon="trash"
              label="Remove student photo"
              onClick={() => change("photo", "")}
            />
          )}
        </div>
        <div className="form-grid">
          {fields.map(([key, label, type, required]) => (
            <Field
              key={key}
              label={label}
              required={required}
              error={errors[key]}
              className={key === "address" ? "span-two" : ""}
            >
              {["class", "section", "gender", "blood"].includes(type) ? (
                <select
                  value={draft[key] || ""}
                  onChange={(e) => change(key, e.target.value)}
                >
                  <option value="">Select {label.toLowerCase()}</option>
                  {(type === "class"
                    ? data.classes
                    : type === "section"
                      ? data.sections
                      : type === "gender"
                        ? ["Male", "Female", "Other", "Prefer not to say"]
                        : ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"]
                  ).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={type}
                  value={draft[key] || ""}
                  onChange={(e) => change(key, e.target.value)}
                />
              )}
            </Field>
          ))}
          {data.customFields
            .filter((f) => f.school === school.id && f.audience !== "staff")
            .map((f) => (
              <Field key={f.id} label={f.name}>
                <input
                  value={draft.custom?.[f.id] || ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      custom: { ...d.custom, [f.id]: e.target.value },
                    }))
                  }
                />
              </Field>
            ))}
          <Field label="Record status">
            <select
              value={draft.active ? "Active" : "Inactive"}
              onChange={(e) => change("active", e.target.value === "Active")}
            >
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </Field>
        </div>
        <Callout icon="shield">
          Manual photo uploads are labelled as school uploads. They do not count
          as live student captures.
        </Callout>
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={canApprove ? "secondary" : undefined}
          icon="check"
          disabled={photoBusy}
          onClick={() => save()}
        >
          Save student
        </Button>
        {canApprove && (
          <Button icon="print" disabled={photoBusy} onClick={() => save(true)}>
            Save and approve
          </Button>
        )}
      </div>
    </Modal>
  );
}
export function ImportStudents({ ctx, onClose }) {
  const [file, setFile] = useState(null),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false);
  const { notify, school, data, update, log, session } = ctx;
  const customFields = data.customFields.filter(
    (f) => f.school === school.id && f.audience !== "staff",
  );
  const sample = () =>
    download(
      "student-import-template.csv",
      'name,admission,class,section,email,phone,father,mother,address,gender,dob,admissionDate,blood,transport\nSample Student,NEW-001,6,A,student@example.com,9876500000,Parent Name,Parent Name,"Udaipur, Rajasthan",,2014-08-01,2026-04-01,O+,',
      "text/csv",
    );
  const inspect = async () => {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024)
        throw Error("Keep the spreadsheet under 5 MB.");
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellDates: true,
        dateNF: "yyyy-mm-dd",
      });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
        raw: false,
        dateNF: "yyyy-mm-dd",
      });
      if (rows.length > 5000) throw Error("Import up to 5,000 rows at a time.");
      setResult(
        parseImport(rows, school.id, data.students, session, customFields),
      );
    } catch (e) {
      notify(
        e.message || "This file could not be read. Use the provided template.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Import your student list"
      subtitle={`${school.name} · ${session}`}
      onClose={onClose}
    >
      <div className="modal-body">
        <Callout>
          Include a name and admission number for each student. Add ID details
          now, then attach a photo and approve the card in Review → Not
          submitted. The school’s required ID fields must be complete at
          approval.
        </Callout>
        <Button variant="text" icon="download" onClick={sample}>
          Download sample CSV
        </Button>
        <label className="dropzone">
          <Icon name="fileUp" size={30} />
          <strong>{file ? file.name : "Choose your spreadsheet"}</strong>
          <span>CSV or XLSX · up to 5 MB</span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => {
              setFile(e.target.files?.[0]);
              setResult(null);
            }}
          />
        </label>
        {result && (
          <div className="import-summary">
            <Badge tone="green">{result.students.length} ready</Badge>
            <Badge>{result.duplicates} duplicates skipped</Badge>
            <Badge tone="red">{result.invalid} invalid rows</Badge>
            <p>
              {result.students
                .slice(0, 3)
                .map((s) => s.name)
                .join(", ")}
              {result.students.length > 3 ? "…" : ""}
            </p>
          </div>
        )}
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        {!result ? (
          <Button
            disabled={!file || busy}
            icon={busy ? "loader" : "search"}
            onClick={inspect}
          >
            {busy ? "Reading file…" : "Review import"}
          </Button>
        ) : (
          <Button
            disabled={!result.students.length}
            onClick={() => {
              const admissions = new Set(
                data.students
                  .filter(
                    (s) => s.school === school.id && s.session === session,
                  )
                  .map((s) => String(s.admission).trim()),
              );
              const fresh = result.students.filter(
                (s) => !admissions.has(s.admission),
              );
              update((d) =>
                log(
                  { ...d, students: [...d.students, ...fresh] },
                  `Imported ${fresh.length} students into ${session}`,
                  "upload",
                ),
              );
              notify(
                `${fresh.length} students imported. Open Review → Not submitted to finish their cards.`,
              );
              onClose();
            }}
          >
            Import {result.students.length} students
          </Button>
        )}
      </div>
    </Modal>
  );
}
export default function Students({ ctx }) {
  const { schoolStudents, update, notify, go, school, log, data } = ctx;
  const [query, setQuery] = useState(""),
    [classNo, setClass] = useState(""),
    [section, setSection] = useState(""),
    [status, setStatus] = useState(""),
    [tab, setTab] = useState("Active"),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(data.studentPageSize || "8"),
    [downloads, setDownloads] = useState(false),
    [exporting, setExporting] = useState(false),
    [selected, setSelected] = useState([]),
    [edit, setEdit] = useState(null),
    [importing, setImporting] = useState(false),
    [view, setView] = useState(null),
    [remove, setRemove] = useState(null);
  const filtered = schoolStudents.filter(
    (s) =>
      (tab === "All" || s.active === (tab === "Active")) &&
      (!query ||
        `${s.name} ${s.admission} ${s.email}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!classNo || s.classNo === classNo) &&
      (!section || s.section === section) &&
      (!status || s.status === status),
  );
  const size =
    pageSize === "all" ? Math.max(1, filtered.length) : Number(pageSize);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * size, current * size);
  const all = rows.length > 0 && rows.every((s) => selected.includes(s.id));
  const resetPage = (f) => {
    f();
    setPage(1);
  };
  return (
    <>
      <PageTitle
        eyebrow="YOUR SCHOOL DIRECTORY"
        title="Every student, in one place."
        description="Keep details up to date, track submissions, and make every ID count."
      >
        <Button
          variant="secondary"
          icon="upload"
          onClick={() => setImporting(true)}
        >
          Import students
        </Button>
        <Button icon="plus" onClick={() => setEdit({})}>
          Add student
        </Button>
      </PageTitle>
      <div className="mini-summary">
        <span>
          <b>{schoolStudents.length}</b> total students
        </span>
        <i />
        <span>
          <b>{schoolStudents.filter((s) => s.photo).length}</b> with photos
        </span>
        <i />
        <span>
          <b>{schoolStudents.filter((s) => s.status === "In review").length}</b>{" "}
          awaiting review
        </span>
        <Button variant="text" icon="send" onClick={() => go("invitations")}>
          Manage invitations
        </Button>
      </div>
      <Panel>
        <div className="table-tabs">
          <div>
            {["Active", "Inactive", "All"].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => resetPage(() => setTab(t))}
              >
                {t} students{" "}
                <span>
                  {
                    schoolStudents.filter(
                      (s) => t === "All" || s.active === (t === "Active"),
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
          <Button
            variant="text"
            icon="download"
            onClick={() => setDownloads(true)}
            disabled={!filtered.length}
          >
            Downloads
          </Button>
        </div>
        <div className="table-toolbar">
          <SearchBox
            value={query}
            onChange={(v) => resetPage(() => setQuery(v))}
            placeholder="Search name, admission no. or email"
          />
          <div className="filters">
            <select
              aria-label="Filter class"
              value={classNo}
              onChange={(e) => resetPage(() => setClass(e.target.value))}
            >
              <option value="">All classes</option>
              {data.classes.map((c) => (
                <option key={c} value={c}>
                  Class {c}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter section"
              value={section}
              onChange={(e) => resetPage(() => setSection(e.target.value))}
            >
              <option value="">All sections</option>
              {data.sections.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Filter student status"
              value={status}
              onChange={(e) => resetPage(() => setStatus(e.target.value))}
            >
              <option value="">All statuses</option>
              {[
                "Draft",
                "Invited",
                "In review",
                "Approved",
                "Changes requested",
                "Submitted for print",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
        </div>
        {selected.length > 0 && (
          <div className="selection-bar">
            <span>{selected.length} selected</span>
            <Button
              variant="text"
              icon="download"
              onClick={() =>
                exportCSV(schoolStudents.filter((s) => selected.includes(s.id)))
              }
            >
              Export selected
            </Button>
            <Button variant="text" icon="x" onClick={() => setSelected([])}>
              Clear selection
            </Button>
          </div>
        )}
        {!rows.length ? (
          <Empty
            title="No matching students"
            text="Try another filter, or add students to this session."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setClass("");
                  setSection("");
                  setStatus("");
                  setQuery("");
                  setTab("All");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="phone-records">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select visible students"
                      checked={all}
                      onChange={() =>
                        setSelected(
                          all
                            ? selected.filter(
                                (id) => !rows.some((s) => s.id === id),
                              )
                            : [
                                ...new Set([
                                  ...selected,
                                  ...rows.map((s) => s.id),
                                ]),
                              ],
                        )
                      }
                    />
                  </th>
                  <th>STUDENT</th>
                  <th>CLASS & SECTION</th>
                  <th>CONTACT</th>
                  <th>PHOTO</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr key={s.id}>
                    <td className="phone-record-select">
                      <input
                        type="checkbox"
                        aria-label={"Select " + s.name}
                        checked={selected.includes(s.id)}
                        onChange={() =>
                          setSelected(
                            selected.includes(s.id)
                              ? selected.filter((id) => id !== s.id)
                              : [...selected, s.id],
                          )
                        }
                      />
                    </td>
                    <td className="phone-record-title">
                      <button
                        className="person-cell person-button"
                        onClick={() => setView(s)}
                      >
                        <Avatar
                          name={s.name}
                          photo={s.photo}
                          color={i % 2 ? "peach" : ""}
                        />
                        <div>
                          <strong>{s.name}</strong>
                          <small>ADM {s.admission}</small>
                        </div>
                      </button>
                    </td>
                    <td data-label="CLASS & SECTION">
                      <span className="class-label">
                        {s.classNo} – {s.section}
                      </span>
                    </td>
                    <td data-label="CONTACT">
                      <span className="cell-email">{s.email}</span>
                      <small className="block muted">+91 {s.phone}</small>
                    </td>
                    <td data-label="PHOTO">
                      {s.photo ? (
                        <span className="photo-present">
                          <Icon name="checkCircle" size={14} />
                          Added
                        </span>
                      ) : (
                        <span className="muted">Missing</span>
                      )}
                    </td>
                    <td data-label="STATUS">
                      <Badge>{s.status}</Badge>
                    </td>
                    <td className="phone-record-actions">
                      <div className="row-actions">
                        <IconButton
                          icon="eye"
                          label={"View " + s.name}
                          onClick={() => setView(s)}
                        />
                        <IconButton
                          icon="edit"
                          label={"Edit " + s.name}
                          onClick={() => setEdit(s)}
                        />
                        <IconButton
                          icon="trash"
                          label={"Delete " + s.name}
                          onClick={() => setRemove(s)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            Showing {rows.length ? (current - 1) * size + 1 : 0}–
            {Math.min(current * size, filtered.length)} of {filtered.length}{" "}
            students
          </span>
          <select
            aria-label="Students per page"
            value={pageSize}
            onChange={(e) => {
              const value = e.target.value;
              resetPage(() => setPageSize(value));
              update({ studentPageSize: value });
            }}
          >
            {[8, 15, 25, 50, "all"].map((value) => (
              <option key={value} value={value}>
                {value === "all" ? "All students" : `${value} per page`}
              </option>
            ))}
          </select>
          <div>
            <Button
              variant="secondary"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
              icon="left"
            >
              Previous
            </Button>
            <span>
              {current} / {pages}
            </span>
            <Button
              variant="secondary"
              disabled={current === pages}
              onClick={() => setPage(current + 1)}
            >
              Next
              <Icon name="chevron" size={14} />
            </Button>
          </div>
        </div>
      </Panel>
      {downloads && (
        <Modal
          title="Download student records"
          subtitle={`${filtered.length} students matching your filters`}
          onClose={() => setDownloads(false)}
        >
          <div className="modal-body">
            <div className="button-row">
              {[
                ["excel", "Excel student list"],
                ["zip", "ZIP with photos"],
                ["checklist", "Checking sheet PDF"],
                ["csv", "CSV"],
              ].map(([format, label]) => (
                <Button
                  key={format}
                  variant="secondary"
                  icon="download"
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true);
                    try {
                      if (format === "csv") exportCSV(filtered);
                      else
                        await exportStudents(
                          filtered,
                          school,
                          data.customFields.filter(
                            (f) =>
                              f.school === school.id && f.audience !== "staff",
                          ),
                          format,
                        );
                      notify(`${label} ready.`);
                    } catch {
                      notify(
                        "Could not create the download. Try fewer records.",
                        "error",
                      );
                    } finally {
                      setExporting(false);
                    }
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
            {exporting && <p role="status">Preparing download…</p>}
          </div>
        </Modal>
      )}
      {edit && (
        <StudentEditor
          ctx={ctx}
          student={edit.id ? edit : null}
          onClose={() => setEdit(null)}
        />
      )}
      {importing && (
        <ImportStudents ctx={ctx} onClose={() => setImporting(false)} />
      )}
      {view && (
        <Modal
          wide
          title="Student record"
          subtitle={`${view.id} · ${school.name}`}
          onClose={() => setView(null)}
        >
          <div className="modal-body record-view">
            <CardPreview student={view} school={school} design={ctx.design} />
            <div>
              <Badge>{view.status}</Badge>
              <h2>{view.name}</h2>
              <dl className="details-list">
                {FIELDS.filter((f) => view[f[0]]).map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{view[key]}</dd>
                  </div>
                ))}
              </dl>
              <Callout icon="camera">
                Photo source: {view.photoSource || "No photo yet"}.{" "}
                {view.captureAt
                  ? "Captured " + new Date(view.captureAt).toLocaleString()
                  : "Sample / manually provided photos do not establish identity."}
              </Callout>
            </div>
          </div>
          <div className="modal-actions">
            <Button
              variant="secondary"
              icon="edit"
              onClick={() => {
                setEdit(view);
                setView(null);
              }}
            >
              Edit details
            </Button>
            <PDFProofButton
              students={[view]}
              school={school}
              design={ctx.design}
            />
          </div>
        </Modal>
      )}
      {remove && (
        <Modal
          title={`Delete ${remove.name}?`}
          subtitle="Review the impact before deleting this student from the demo."
          onClose={() => setRemove(null)}
        >
          <div className="modal-body">
            <ul>
              <li>
                The student record, photo, and submission link will be removed.
              </li>
              <li>
                {data.outbox.filter((m) => m.student === remove.id).length} demo
                invitations will be removed.
              </li>
              <li>
                {
                  data.batches.filter((b) => b.studentIds.includes(remove.id))
                    .length
                }{" "}
                print batches keep their saved history.
              </li>
            </ul>
          </div>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setRemove(null)}>
              Keep student
            </Button>
            <Button
              onClick={() => {
                update((d) =>
                  log(
                    {
                      ...d,
                      students: d.students.filter((s) => s.id !== remove.id),
                      outbox: d.outbox.filter((m) => m.student !== remove.id),
                    },
                    `Deleted student ${remove.name}`,
                  ),
                );
                setSelected(selected.filter((id) => id !== remove.id));
                setRemove(null);
                notify("Student deleted from this preview.");
              }}
            >
              Delete student
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
