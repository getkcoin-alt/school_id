import React, { useEffect, useState } from "react";
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
  DeleteConfirm,
  DateInput,
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
  toDMY,
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
  // ID cards print names in capitals, so names are kept that way while typing.
  const UPPER = new Set(["name", "father", "mother"]);
  const change = (key, val) => {
    setDraft((d) => ({ ...d, [key]: UPPER.has(key) && typeof val === "string" ? val.toUpperCase() : val }));
    setErrors((e) => ({ ...e, [key]: null }));
  };
  const library = data.photoLibrary.filter((p) => p.school === school.id);
  const pickLibrary = (p) => {
    // The file name is the photo number (e.g. DSC_2002.jpg -> DSC_2002).
    setDraft((d) => ({ ...d, photo: p.src, photoSource: "School photo library", captureAt: null, photoNo: p.name.replace(/\.[a-z0-9]+$/i, "") }));
    setErrors((e) => ({ ...e, photoNo: null }));
  };
  const save = () => {
    const e = validateStudent(draft, fields);
    if (
      data.students.some(
        (s) =>
          s.id !== draft.id &&
          s.school === school.id &&
          s.session === draft.session &&
          String(draft.admission || "").trim() &&
          String(s.admission || "").trim().toLowerCase() === String(draft.admission).trim().toLowerCase(),
      )
    )
      e.admission = "This admission number already exists in this school.";
    for (const f of data.customFields.filter((f) => f.school === school.id && f.audience !== "staff" && f.enabled !== false && f.required))
      if (!String(draft.custom?.[f.id] || "").trim()) e["custom:" + f.id] = `${f.name} is required.`;
    if (Object.keys(e).length) {
      setErrors(e);
      notify("Check the highlighted fields.", "error");
      return;
    }
    const result = {
      ...draft,
      name: draft.name.trim().replace(/\s+/g, " ").toUpperCase(),
      admission: String(draft.admission || "").trim(),
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
      file.size > 15 * 1024 * 1024
    ) {
      notify("Choose a JPG, PNG, or WebP image under 15 MB.", "error");
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
        {student?.status === "Submitted for print" && (
          <Callout icon="alert" tone="amber">
            <strong>This card has already gone for printing.</strong> Changes saved here update the school record only; the card being printed will not change. Saving sends the record back to review.
          </Callout>
        )}
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
            <p>JPG, PNG, WebP · max. 15 MB · manual upload</p>
          </div>
          {library.length > 0 && <LibraryPicker photos={library} onPick={pickLibrary} />}
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
              {type === "date" ? (
                <DateInput value={draft[key] || ""} max={key === "dob" ? new Date().toISOString().slice(0, 10) : undefined} onChange={(v) => change(key, v)} />
              ) : optionsFor(type, data) ? (
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
                  className={UPPER.has(key) ? "upper" : undefined}
                  onChange={(e) => change(key, e.target.value)}
                />
              )}
            </Field>
          ))}
          {data.customFields
            .filter((f) => f.school === school.id && f.audience !== "staff" && f.enabled !== false)
            .map((f) => {
              const set = (v) => {
                setDraft((d) => ({ ...d, custom: { ...d.custom, [f.id]: v } }));
                setErrors((e) => ({ ...e, ["custom:" + f.id]: null }));
              };
              return (
                <Field key={f.id} label={f.name} required={f.required} error={errors["custom:" + f.id]}>
                  {f.type === "select" ? (
                    <select value={draft.custom?.[f.id] || ""} onChange={(e) => set(e.target.value)}>
                      <option value="">Select {f.name.toLowerCase()}</option>
                      {(f.options || []).map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input value={draft.custom?.[f.id] || ""} onChange={(e) => set(e.target.value)} />
                  )}
                </Field>
              );
            })}
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
function DownloadMenu({ options, note }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !e.target.closest?.(".download-menu") && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span className="download-menu">
      <Button variant="secondary" icon="download" aria-expanded={open} onClick={() => setOpen(!open)}>
        Download
      </Button>
      {open && (
        <div className="download-menu-list" role="menu">
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                o.run();
              }}
            >
              <strong>{o.label}</strong>
              <div className="dm-text">{o.text}</div>
            </button>
          ))}
          {note && <small className="muted" style={{ padding: "6px 12px" }}>{note}</small>}
        </div>
      )}
    </span>
  );
}
function Downloads({ ctx, rows, query }) {
  const { live, school, data, role } = ctx;
  if (role === "regular" || (live && !ctx.permissions.download)) return null;
  const q = new URLSearchParams({ schoolId: school.id, session: ctx.session, ...query }).toString();
  const fields = schoolFieldList(data, school.id);
  const options = [
    {
      label: "Student list (Excel)",
      text: "Every student's details in a spreadsheet, for records or editing.",
      run: () =>
        live
          ? ctx.download(`/students/export.xlsx?${q}`, "students.xlsx")
          : exportSheet(rows, fields, `${school.short}-students.xlsx`),
    },
    ...(live
      ? [
          {
            label: "Student list with photos (ZIP)",
            text: "The same spreadsheet plus every photo, named by photo number. Send this to a printer.",
            run: () => ctx.download(`/students/export.zip?${q}`, "students.zip"),
          },
          {
            label: "Checking sheet (PDF)",
            text: "Printable pages with each student's photo and details, class by class, to check and sign before cards are printed.",
            run: () => ctx.download(`/students/checklist.pdf?${q}`, "checklist.pdf"),
          },
        ]
      : []),
  ];
  return <DownloadMenu options={options} note="Downloads follow the tab, class and status filters you have chosen." />;
}
/** School photo library search: type part of a photo number (e.g. 20) to find DSC_2002. */
function LibraryPicker({ photos, onPick }) {
  const [q, setQ] = useState(""),
    [open, setOpen] = useState(false);
  const term = q.trim().toLowerCase();
  const hits = photos.filter((p) => !term || p.name.toLowerCase().includes(term)).slice(0, 12);
  return (
    <div className="library-picker">
      <Field label="Or choose from school photos" hint={`${photos.length} photos · type part of the photo number`}>
        <input
          value={q}
          placeholder="e.g. 2002"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) {
              e.preventDefault();
              onPick(hits[0]);
              setQ(hits[0].name.replace(/\.[a-z0-9]+$/i, ""));
              setOpen(false);
            }
          }}
        />
      </Field>
      {open && (
        <div className="library-hits" role="listbox">
          {hits.map((p) => (
            <button
              type="button"
              role="option"
              key={p.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(p);
                setQ(p.name.replace(/\.[a-z0-9]+$/i, ""));
                setOpen(false);
              }}
            >
              <img src={p.src} alt="" loading="lazy" />
              <span>{p.name.replace(/\.[a-z0-9]+$/i, "")}</span>
            </button>
          ))}
          {!hits.length && <p className="muted">No photo matches “{q}”.</p>}
        </div>
      )}
    </div>
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
    [perPage, setPerPageState] = useState(() => {
      try {
        return Number(localStorage.getItem("students.perPage")) || 8;
      } catch {
        return 8;
      }
    }),
    [selected, setSelected] = useState([]),
    [edit, setEdit] = useState(null),
    [importing, setImporting] = useState(false),
    [view, setView] = useState(null),
    [remove, setRemove] = useState(null);
  // Requests from universal search: open a student, or start adding/importing.
  useEffect(() => {
    const f = ctx.focus;
    if (!f) return;
    if (f.type === "student") {
      const st = schoolStudents.find((s) => s.id === f.id);
      if (!st) return; // wait until that school and session have loaded
      setView(st);
    } else if (f.name === "addStudent") setEdit({});
    else if (f.name === "import") setImporting(true);
    else return;
    ctx.clearFocus();
  }, [ctx.focus, schoolStudents]);
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
  const size = perPage === -1 ? Math.max(filtered.length, 1) : perPage;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * size, current * size);
  const setPerPage = (n) => {
    setPerPageState(n);
    setPage(1);
    try {
      localStorage.setItem("students.perPage", String(n));
    } catch {}
  };
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
          <span className="pagination-info">
            <label>
              Rows per page
              <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))}>
                {[8, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value={-1}>All</option>
              </select>
            </label>
            <span>
              Showing {rows.length ? (current - 1) * size + 1 : 0}–
              {Math.min(current * size, filtered.length)} of {filtered.length}{" "}
              students
            </span>
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
                    <dd>{["dob", "admissionDate"].includes(key) ? toDMY(view[key]) : view[key]}</dd>
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
      {remove && ctx.live && (
        <DeleteConfirm
          ctx={ctx}
          path={`/students/${remove.id}`}
          title={`Delete ${remove.name}?`}
          subtitle={`${remove.admission ? `Admission no. ${remove.admission} · ` : ""}Class ${remove.classNo || "—"}${remove.section ? ` – ${remove.section}` : ""}`}
          deleteLabel="Delete student"
          doneText={`${remove.name} deleted.`}
          onClose={() => setRemove(null)}
          onDeleted={() => setSelected(selected.filter((id) => id !== remove.id))}
        />
      )}
      {remove && !ctx.live && (
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
