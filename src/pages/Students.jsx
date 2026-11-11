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
  eligible,
  cardPDF,
  schoolFieldList,
  optionsFor,
  exportSheet,
} from "../lib.js";
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
  const fields = schoolFieldList(data, school.id);
  const change = (key, val) => {
    setDraft((d) => ({ ...d, [key]: val }));
    setErrors((e) => ({ ...e, [key]: null }));
  };
  const save = () => {
    const e = validateStudent(draft, fields);
    if (
      data.students.some(
        (s) =>
          s.id !== draft.id &&
          s.school === school.id &&
          s.session === draft.session &&
          s.admission === draft.admission,
      )
    )
      e.admission = "This admission number already exists in this school.";
    if (Object.keys(e).length) {
      setErrors(e);
      notify("Check the highlighted fields.", "error");
      return;
    }
    const result = {
      ...draft,
      name: draft.name.trim(),
      status: student
        ? ["Approved", "Submitted for print"].includes(student.status)
          ? "In review"
          : draft.status
        : draft.photo
          ? "In review"
          : "Draft",
    };
    update((d) =>
      log(
        {
          ...d,
          students: student
            ? d.students.map((s) => (s.id === result.id ? result : s))
            : [result, ...d.students],
        },
        `${student ? "Updated" : "Added"} student ${result.name}`,
      ),
    );
    notify(
      student
        ? "Student updated. Changes to approved cards require a new review."
        : "Student added to your directory.",
    );
    onSaved?.(result);
    onClose();
  };
  const photo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      notify("Choose a JPG, PNG, or WebP image under 2 MB.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setDraft((d) => ({
        ...d,
        photo: reader.result,
        photoSource: "School admin upload",
        captureAt: null,
      }));
    reader.readAsDataURL(file);
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
              />
            </label>
            <p>JPG, PNG, WebP · max. 2 MB · manual upload</p>
          </div>
          {data.photoLibrary.filter((p) => p.school === school.id).length >
            0 && (
            <Field label="Or choose from school photos">
              <select
                defaultValue=""
                onChange={(e) => {
                  const p = data.photoLibrary.find(
                    (p) => p.id === e.target.value,
                  );
                  if (p)
                    setDraft((d) => ({
                      ...d,
                      photo: p.src,
                      photoSource: "School photo library",
                      captureAt: null,
                    }));
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
              {optionsFor(type, data) ? (
                <select
                  value={draft[key] || ""}
                  onChange={(e) => change(key, e.target.value)}
                >
                  <option value="">Select {label.toLowerCase()}</option>
                  {optionsFor(type, data).map((o) => (
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
        <Button icon="check" onClick={save}>
          Save student
        </Button>
      </div>
    </Modal>
  );
}
export function ImportStudents({ ctx, onClose }) {
  const [file, setFile] = useState(null),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false);
  const { notify, school, data, update, log, live } = ctx;
  const [report, setReport] = useState(null);
  const sample = () =>
    live
      ? ctx.download(`/students/template.xlsx?schoolId=${school.id}`, "student-upload-template.xlsx")
      : download(
          "student-upload-template.csv",
          "SRNO,PHOTO,NAME,PREFIXF,FATHER,PREFIXM,MOTHER,DOB,CLASS,SECTION,MOBILE,ADDRESS,ADMNO,SRN,EMAIL\n1,DSC_0101,ADITYA,MR.,SUNIL,MRS.,POONAM,10-12-2015,VII,A,9494949494,SONIPAT,9196,2002510881,",
          "text/csv",
        );
  // Live: the browser reads any Excel format (including .xlsb) and the server
  // validates every row, skips duplicates and links photos by Photo No.
  const importLive = async () => {
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: true, defval: "" });
      if (rows.length > 10000) throw Error("Import up to 10,000 rows at a time.");
      const r = await ctx.api.post("/students/import", { rows, schoolId: school.id, session: ctx.session });
      setReport(r);
      await ctx.reload();
      notify(`${r.created} students imported. ${r.skipped.length} duplicates skipped.`);
    } catch (e) {
      notify(e.message || "This file could not be read.", "error");
    } finally {
      setBusy(false);
    }
  };
  if (live)
    return (
      <Modal title="Import your student list" subtitle={`Into ${school.name} · ${ctx.session}`} onClose={onClose}>
        <div className="modal-body">
          <Callout>
            Use the agreed sheet: SRNO, PHOTO, NAME, PREFIXF, FATHER, PREFIXM, MOTHER, DOB, CLASS, SECTION, MOBILE,
            ADDRESS, ADMNO, SRN. Only NAME and CLASS are needed; duplicates (same admission number, or same name,
            father and date of birth) are skipped. Photos already uploaded with the same Photo No. are linked
            automatically.
          </Callout>
          <Button variant="text" icon="download" onClick={sample}>
            Download the template
          </Button>
          <label className="dropzone">
            <Icon name="fileUp" size={30} />
            <strong>{file ? file.name : "Choose your spreadsheet"}</strong>
            <span>XLSX, XLSB, XLS or CSV</span>
            <input type="file" accept=".csv,.xlsx,.xlsb,.xls" onChange={(e) => (setFile(e.target.files?.[0]), setReport(null))} />
          </label>
          {report && (
            <div className="import-summary">
              <Badge tone="green">{report.created} imported</Badge>
              <Badge>{report.withPhoto} with photo</Badge>
              <Badge>{report.skipped.length} duplicates skipped</Badge>
              <Badge tone="red">{report.invalid.length} rows need fixing</Badge>
              {[...report.invalid, ...report.skipped].slice(0, 8).map((x) => (
                <p key={x.row + x.reason}>
                  Row {x.row}
                  {x.name ? ` · ${x.name}` : ""}: {x.reason}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            {report ? "Done" : "Cancel"}
          </Button>
          {!report && (
            <Button disabled={!file || busy} icon={busy ? "loader" : "upload"} onClick={importLive}>
              {busy ? "Importing…" : "Import"}
            </Button>
          )}
        </div>
      </Modal>
    );
  const inspect = async () => {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024)
        throw Error("Keep the spreadsheet under 5 MB.");
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if (rows.length > 5000) throw Error("Import up to 5,000 rows at a time.");
      setResult(parseImport(rows, school.id, data.students, ctx.session));
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
      subtitle="Bring in existing school contacts. Send invitations when you’re ready."
      onClose={onClose}
    >
      <div className="modal-body">
        <Callout>
          Use the agreed sheet: SRNO, PHOTO, NAME, PREFIXF, FATHER, PREFIXM,
          MOTHER, DOB, CLASS, SECTION, MOBILE, ADDRESS, ADMNO, SRN. NAME and
          CLASS are required. Duplicates are skipped.
        </Callout>
        <Button variant="text" icon="download" onClick={sample}>
          Download the template
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
              const fresh = { students: result.students };
              update((d) =>
                log(
                  { ...d, students: [...d.students, ...fresh.students] },
                  `Imported ${fresh.students.length} student contacts`,
                  "upload",
                ),
              );
              notify(
                `${fresh.students.length} student contacts imported as drafts.`,
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
function Downloads({ ctx, rows, query }) {
  const { live, school, data, role } = ctx;
  if (role === "regular" || (live && !ctx.permissions.download)) return null;
  const q = new URLSearchParams({ schoolId: school.id, session: ctx.session, ...query }).toString();
  const fields = schoolFieldList(data, school.id);
  return (
    <span className="download-group">
      <Button
        variant="text"
        icon="download"
        onClick={() =>
          live
            ? ctx.download(`/students/export.xlsx?${q}`, "students.xlsx")
            : exportSheet(rows, fields, `${school.short}-students.xlsx`)
        }
      >
        Excel
      </Button>
      {live && (
        <>
          <Button variant="text" icon="download" onClick={() => ctx.download(`/students/export.zip?${q}`, "students.zip")}>
            Excel + photos
          </Button>
          <Button variant="text" icon="fileDown" onClick={() => ctx.download(`/students/checklist.pdf?${q}`, "checklist.pdf")}>
            Checklist PDF
          </Button>
        </>
      )}
    </span>
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
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * 8, current * 8);
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
          <Downloads
            ctx={ctx}
            rows={filtered}
            query={Object.fromEntries(
              Object.entries({ className: classNo, section }).filter(([, v]) => v),
            )}
          />
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
            {["school", "super"].includes(ctx.role) && (
              <Button
                variant="text"
                icon="check"
                onClick={() => {
                  const fields = schoolFieldList(data, school.id);
                  const ready = schoolStudents.filter(
                    (s) =>
                      selected.includes(s.id) &&
                      !["Approved", "Submitted for print"].includes(s.status) &&
                      (ctx.live || (s.photo && !Object.keys(validateStudent(s, fields)).length)),
                  );
                  if (!ready.length) {
                    notify("Selected students need all compulsory fields and a photo before approval.", "error");
                    return;
                  }
                  update((d) =>
                    log(
                      {
                        ...d,
                        students: d.students.map((s) =>
                          ready.some((r) => r.id === s.id) ? { ...s, status: "Approved", note: "" } : s,
                        ),
                      },
                      `Approved ${ready.length} ID cards`,
                    ),
                  );
                  notify(
                    ctx.live
                      ? "Approving… records missing compulsory fields or a photo will be listed."
                      : `${ready.length} approved without an invitation.`,
                  );
                  setSelected([]);
                }}
              >
                Approve selected
              </Button>
            )}
            {ctx.role !== "regular" && (
              <Button
                variant="text"
                icon="download"
                onClick={() =>
                  exportSheet(
                    schoolStudents.filter((s) => selected.includes(s.id)),
                    schoolFieldList(data, school.id),
                    `${school.short}-selected.xlsx`,
                  )
                }
              >
                Export selected
              </Button>
            )}
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
            <table>
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
                    <td>
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
                    <td>
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
                    <td>
                      <span className="class-label">
                        {s.classNo} – {s.section}
                      </span>
                    </td>
                    <td>
                      <span className="cell-email">{s.email}</span>
                      <small className="block muted">+91 {s.phone}</small>
                    </td>
                    <td>
                      {s.photo ? (
                        <span className="photo-present">
                          <Icon name="checkCircle" size={14} />
                          Added
                        </span>
                      ) : (
                        <span className="muted">Missing</span>
                      )}
                    </td>
                    <td>
                      <Badge>{s.status}</Badge>
                    </td>
                    <td>
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
            Showing {rows.length ? (current - 1) * 8 + 1 : 0}–
            {Math.min(current * 8, filtered.length)} of {filtered.length}{" "}
            students
          </span>
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
            {["school", "super"].includes(ctx.role) && !["Approved", "Submitted for print"].includes(view.status) && (
              <Button
                icon="check"
                onClick={() => {
                  const fields = schoolFieldList(data, school.id);
                  if (!view.photo || Object.keys(validateStudent(view, fields)).length) {
                    notify("Fill the compulsory fields and add a photo (Edit details) before approving.", "error");
                    return;
                  }
                  update((d) => log({ ...d, students: d.students.map((x) => (x.id === view.id ? { ...x, status: "Approved", note: "" } : x)) }, `Approved ${view.name}`, "review"));
                  notify(`${view.name} approved for printing.`);
                  setView(null);
                }}
              >
                Approve
              </Button>
            )}
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
          subtitle="The student record and local submission will be removed. Existing print batches keep their history."
          onClose={() => setRemove(null)}
        >
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
