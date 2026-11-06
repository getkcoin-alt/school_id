import React, { useState, useEffect } from "react";
import {
  PageTitle,
  Panel,
  Button,
  Icon,
  IconButton,
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
  eligible,
  uid,
  fmtDate,
  exportCSV,
  cardPDF,
  STAGES,
  download,
  csvText,
} from "../lib.js";
import { getFile, putFile, deleteFile } from "../files.js";
function PDFViewer({ file, onClose, notify }) {
  const [url, setURL] = useState("");
  useEffect(() => {
    let alive = true,
      objectURL;
    async function run() {
      try {
        let blob = file.fileKey ? await getFile(file.fileKey) : null;
        if (!blob) {
          if (file.fileKey)
            throw Error(
              "The PDF is no longer in this browser. Please upload it again.",
            );
          const { jsPDF } = await import("jspdf");
          const doc = new jsPDF();
          for (let i = 0; i < file.pages; i++) {
            if (i) doc.addPage();
            doc.setFontSize(20);
            doc.text("ID STUDIO - SAMPLE PHOTO COLLECTION", 16, 24);
            doc.setFontSize(12);
            doc.text(`Demo PDF ${file.id} / Page ${i + 1}`, 16, 36);
            doc.text("Fictional photo sheet for frontend review.", 16, 45);
            for (let j = 0; j < 6; j++) {
              const x = 20 + (j % 3) * 62,
                y = 65 + Math.floor(j / 3) * 100;
              doc.setDrawColor("#dddddd");
              doc.roundedRect(x, y, 48, 68, 3, 3);
              doc.setFontSize(9);
              doc.text("SAMPLE PORTRAIT", x + 5, y + 31);
              doc.text(`Student ${i * 6 + j + 1}`, x + 5, y + 53);
            }
          }
          blob = doc.output("blob");
        }
        objectURL = URL.createObjectURL(blob);
        if (alive) setURL(objectURL);
      } catch (e) {
        notify(e.message, "error");
      }
    }
    run();
    return () => {
      alive = false;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [file]);
  return (
    <Modal
      wide
      title={file.name}
      subtitle={`${file.pages} pages · School photo collection · browser-local file`}
      onClose={onClose}
    >
      <div className="pdf-preview">
        {url ? (
          <iframe title="School photo PDF preview" src={url} />
        ) : (
          <p>Preparing PDF preview…</p>
        )}
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        {url && (
          <a href={url} download={file.name} className="btn primary">
            <Icon name="download" size={16} />
            Download PDF
          </a>
        )}
      </div>
    </Modal>
  );
}
export function PhotoUploads({ ctx }) {
  const { data, school, update, notify, log, availableSchools, role } = ctx;
  const [tab, setTab] = useState("PDF collections"),
    [file, setFile] = useState(null),
    [pages, setPages] = useState(1),
    [note, setNote] = useState(""),
    [classNo, setClass] = useState(""),
    [busy, setBusy] = useState(false),
    [view, setView] = useState(null),
    [remove, setRemove] = useState(null);
  const uploads = data.uploads.filter((u) => u.school === school.id);
  const images = data.photoLibrary.filter((p) => p.school === school.id);
  const choose = (f) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf") || f.size > 10 * 1024 * 1024) {
      notify("Choose a PDF document under 10 MB.", "error");
      return;
    }
    setFile(f);
  };
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      if (
        data.uploads.some((u) => u.school === school.id && u.name === file.name)
      )
        throw Error(
          "A PDF with this name already exists for this school. Rename it or remove the earlier upload.",
        );
      const signature = new TextDecoder().decode(
        await file.slice(0, 5).arrayBuffer(),
      );
      if (signature !== "%PDF-")
        throw Error("This file is not a valid PDF document.");
      const id = uid("PDF");
      await putFile(id, file);
      update((d) =>
        log(
          {
            ...d,
            uploads: [
              {
                id,
                school: school.id,
                name: file.name,
                pages: +pages,
                status: "Ready for review",
                date: new Date().toISOString(),
                note,
                classNo,
                fileKey: id,
                size: file.size,
              },
              ...d.uploads,
            ],
          },
          `Uploaded ${file.name} for ${school.name}`,
          "upload",
        ),
      );
      setFile(null);
      setNote("");
      notify("Photo PDF saved for this school. Ready for review.");
    } catch (e) {
      notify(
        e.message || "This file could not be saved in your browser.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };
  const bulk = async (files) => {
    const list = [...files];
    if (list.length > 20) {
      notify("Choose up to 20 photos at a time.", "error");
      return;
    }
    let skipped = 0;
    const results = [];
    for (const f of list) {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
        f.size > 500 * 1024 ||
        data.photoLibrary.some(
          (p) => p.school === school.id && p.name === f.name,
        ) ||
        results.some((p) => p.name === f.name)
      ) {
        skipped++;
        continue;
      }
      const src = await new Promise((r) => {
        const reader = new FileReader();
        reader.onload = () => r(reader.result);
        reader.readAsDataURL(f);
      });
      results.push({ id: uid("IMG"), school: school.id, name: f.name, src });
    }
    update((d) =>
      log(
        { ...d, photoLibrary: [...d.photoLibrary, ...results] },
        `Added ${results.length} photos to ${school.name}`,
        "image",
      ),
    );
    notify(
      `${results.length} photos added${skipped ? `; ${skipped} duplicate, oversized, or unsupported files skipped` : ""}.`,
    );
  };
  return (
    <>
      <PageTitle
        eyebrow="THE RIGHT PHOTO. THE RIGHT SCHOOL."
        title="Photo collection, without the clutter."
        description="Upload a school-wise photo PDF, or organize individual images for manual card updates."
      />
      <div className="school-context-picker">
        <span className="school-cell-icon">
          <Icon name="school" />
        </span>
        <div>
          <small>WORKING WITH</small>
          <select
            aria-label="School for photo uploads"
            value={school.id}
            onChange={(e) => ctx.setSchoolId(e.target.value)}
          >
            {availableSchools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <Badge tone="green">School-specific collection</Badge>
      </div>
      <div className="review-tabs">
        {["PDF collections", "Photo library"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
            <span>
              {t === "PDF collections" ? uploads.length : images.length}
            </span>
          </button>
        ))}
      </div>
      {tab === "PDF collections" ? (
        <>
          <div className="upload-grid">
            <Panel
              title="Upload a photo PDF"
              subtitle="Keep one school’s photos together in a document."
            >
              <div className="padded">
                <label
                  className={`dropzone ${file ? "has-file" : ""}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    choose(e.dataTransfer.files[0]);
                  }}
                >
                  <span className="upload-circle">
                    <Icon name={file ? "file" : "upload"} size={25} />
                  </span>
                  <strong>
                    {file ? file.name : "Drop your school photo PDF here"}
                  </strong>
                  <span>
                    {file
                      ? `${(file.size / 1024).toFixed(0)} KB · Ready to add`
                      : "or click to choose a file · PDF up to 10 MB"}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => choose(e.target.files?.[0])}
                  />
                </label>
                <div className="form-grid">
                  <Field label="Class (optional)">
                    <select
                      value={classNo}
                      onChange={(e) => setClass(e.target.value)}
                    >
                      <option value="">All classes</option>
                      {data.classes.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Number of pages"
                    hint="Enter the page count shown in your PDF."
                  >
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={pages}
                      onChange={(e) => setPages(e.target.value)}
                    />
                  </Field>
                  <Field label="Collection notes" className="span-two">
                    <textarea
                      rows="2"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Class 6 portraits, ordered by admission number"
                    />
                  </Field>
                </div>
                <div className="button-row">
                  <Button
                    icon={busy ? "loader" : "upload"}
                    disabled={!file || busy || +pages < 1 || +pages > 1000}
                    onClick={upload}
                  >
                    {busy ? "Saving PDF…" : "Upload for this school"}
                  </Button>
                  {file && (
                    <Button variant="text" onClick={() => setFile(null)}>
                      Clear file
                    </Button>
                  )}
                </div>
              </div>
            </Panel>
            <div className="upload-guide">
              <span className="eyebrow">A BETTER HANDOFF</span>
              <h2>
                A little preparation.
                <br />A much clearer picture.
              </h2>
              {[
                [
                  "01",
                  "One school per PDF",
                  "Select the school first. Avoid mixing photos across schools.",
                ],
                [
                  "02",
                  "Make photos easy to match",
                  "Label each portrait with the admission number or student name.",
                ],
                [
                  "03",
                  "Keep the school in control",
                  "The school reviews the collection before cards enter printing.",
                ],
              ].map(([n, t, p]) => (
                <div key={n}>
                  <span>{n}</span>
                  <div>
                    <strong>{t}</strong>
                    <p>{p}</p>
                  </div>
                </div>
              ))}
              <Callout icon="help">
                PDFs are stored in this browser only. Extraction, automatic
                photo matching, and server uploads are not connected.
              </Callout>
            </div>
          </div>
          <Panel
            title="School photo collections"
            subtitle={`${uploads.length} PDF collections for ${school.name}`}
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>PDF DOCUMENT</th>
                    <th>PAGES</th>
                    <th>ADDED</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="person-cell">
                          <span className="pdf-icon">
                            <Icon name="file" />
                          </span>
                          <div>
                            <strong>{u.name}</strong>
                            <small>{u.note || u.id}</small>
                          </div>
                        </div>
                      </td>
                      <td>{u.pages}</td>
                      <td>{fmtDate(u.date)}</td>
                      <td>
                        <Badge>{u.status}</Badge>
                      </td>
                      <td>
                        <div className="row-actions">
                          <IconButton
                            icon="eye"
                            label={"Preview " + u.name}
                            onClick={() => setView(u)}
                          />
                          <IconButton
                            icon="check"
                            label={"Mark reviewed " + u.name}
                            onClick={() => {
                              update((d) => ({
                                ...d,
                                uploads: d.uploads.map((x) =>
                                  x.id === u.id
                                    ? { ...x, status: "Approved" }
                                    : x,
                                ),
                              }));
                              notify(
                                "Photo collection marked reviewed. Student cards still need individual approval.",
                              );
                            }}
                          />
                          <IconButton
                            icon="trash"
                            label={"Delete " + u.name}
                            onClick={() => setRemove(u)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!uploads.length && (
              <Empty
                title="No PDFs for this school yet"
                text="Your first photo collection starts above."
              />
            )}
          </Panel>
        </>
      ) : (
        <>
          <Panel
            title="School photo library"
            subtitle="Use these photos in the manual student editor."
          >
            <div className="padded">
              <label className="dropzone">
                <Icon name="image" size={30} />
                <strong>Add individual photos</strong>
                <span>
                  JPG, PNG, WebP · up to 500 KB each · 20 files at a time
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => bulk(e.target.files || [])}
                />
              </label>
              <div className="photo-library">
                {images.map((p) => (
                  <div key={p.id}>
                    <img src={p.src} alt={p.name} />
                    <strong>{p.name}</strong>
                    <IconButton
                      icon="trash"
                      label={"Remove " + p.name}
                      onClick={() => {
                        update((d) => ({
                          ...d,
                          photoLibrary: d.photoLibrary.filter(
                            (x) => x.id !== p.id,
                          ),
                        }));
                        notify("Photo removed from the library.");
                      }}
                    />
                  </div>
                ))}
              </div>
              {!images.length && (
                <Empty
                  title="A home for school photos"
                  text="Add individual photos to choose from when correcting a student record."
                />
              )}
            </div>
          </Panel>
        </>
      )}
      {view && (
        <PDFViewer file={view} notify={notify} onClose={() => setView(null)} />
      )}
      {remove && (
        <Modal
          title="Remove this PDF collection?"
          subtitle={remove.name}
          onClose={() => setRemove(null)}
        >
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setRemove(null)}>
              Keep PDF
            </Button>
            <Button
              onClick={async () => {
                try {
                  if (remove.fileKey) await deleteFile(remove.fileKey);
                  update((d) => ({
                    ...d,
                    uploads: d.uploads.filter((u) => u.id !== remove.id),
                  }));
                  setRemove(null);
                  notify("PDF collection removed.");
                } catch {
                  notify("The PDF could not be removed. Try again.", "error");
                }
              }}
            >
              Remove PDF
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Designs({ ctx }) {
  const { data, school, update, notify, role, schoolStudents } = ctx;
  const [filter, setFilter] = useState("All"),
    [back, setBack] = useState(false),
    [upload, setUpload] = useState(false),
    [draft, setDraft] = useState({
      name: "",
      kind: "ID card",
      audience: "Student",
      color: "#326b5b",
    });
  const [file, setFile] = useState(null);
  const canUpload = ["super", "premium"].includes(role);
  return (
    <>
      <PageTitle
        eyebrow="LOOKS LIKE YOUR SCHOOL"
        title="An identity worth carrying."
        description="Find the right card and lanyard design. Preview the details before sending them to print."
      >
        {canUpload && (
          <Button icon="upload" onClick={() => setUpload(true)}>
            Add design
          </Button>
        )}
      </PageTitle>
      <div className="design-workspace">
        <div className="design-preview-board">
          <div className="design-board-head">
            <span>YOUR SCHOOL CARD PREVIEW</span>
            <div className="segmented">
              <button
                className={!back ? "active" : ""}
                onClick={() => setBack(false)}
              >
                Front
              </button>
              <button
                className={back ? "active" : ""}
                onClick={() => setBack(true)}
              >
                Back
              </button>
            </div>
          </div>
          <div className="design-large-card">
            <CardPreview
              student={schoolStudents[0] || data.students[0]}
              school={school}
              design={ctx.design}
              back={back}
            />
          </div>
          <div className="design-board-footer">
            <Icon name="eye" size={16} />
            <span>Live preview · {ctx.design} design · Sample card</span>
          </div>
        </div>
        <div className="design-info">
          <span className="eyebrow">MAKE EVERY DETAIL COUNT</span>
          <h2>
            Familiar colours.
            <br />A fresh identity.
          </h2>
          <p>
            Your school’s name, student details, and selected design come
            together in one clear, readable card.
          </p>
          <div className="design-spec">
            <div>
              <span>Card format</span>
              <strong>Portrait · CR80</strong>
            </div>
            <div>
              <span>Selected design</span>
              <strong>{ctx.design}</strong>
            </div>
            <div>
              <span>School</span>
              <strong>{school.name}</strong>
            </div>
          </div>
          <Callout icon="help">
            Card proofs are for frontend review. Final bleed, colour, photo
            matching, and printer-ready output belong to the production
            integration.
          </Callout>
        </div>
      </div>
      <Panel
        title="The design collection"
        subtitle="Cards and lanyards for the whole school."
      >
        <div className="table-tabs">
          <div>
            {["All", "ID card", "Lanyard"].map((t) => (
              <button
                className={filter === t ? "active" : ""}
                key={t}
                onClick={() => setFilter(t)}
              >
                {t === "All" ? "All designs" : t + "s"}
              </button>
            ))}
          </div>
        </div>
        <div className="design-gallery">
          {data.designs
            .filter((d) => filter === "All" || d.kind === filter)
            .map((d) => (
              <div
                className={`design-tile ${ctx.design === d.name ? "selected" : ""}`}
                key={d.id}
              >
                <div
                  className="design-thumbnail"
                  style={{ background: d.color + "12" }}
                >
                  {d.fileData ? (
                    <img src={d.fileData} alt={d.name} />
                  ) : d.kind === "Lanyard" ? (
                    <div
                      className="lanyard-mock"
                      style={{ borderColor: d.color }}
                    >
                      <span style={{ background: d.color }}>ID STUDIO</span>
                    </div>
                  ) : (
                    <div className="mini-design-card">
                      <div style={{ background: d.color }} />
                      <span className="mini-design-photo" />
                      <b />
                      <i />
                      <i />
                    </div>
                  )}
                </div>
                <div className="design-tile-content">
                  <div>
                    <strong>{d.name}</strong>
                    <small>
                      {d.kind} · {d.audience}
                    </small>
                  </div>
                  {d.kind === "ID card" ? (
                    <Button
                      variant={ctx.design === d.name ? "soft" : "secondary"}
                      icon={ctx.design === d.name ? "check" : null}
                      onClick={() => {
                        update((x) => ({
                          ...x,
                          schoolDesigns: {
                            ...x.schoolDesigns,
                            [school.id]: d.name,
                          },
                        }));
                        notify(`${d.name} selected for the card preview.`);
                      }}
                    >
                      {ctx.design === d.name ? "Selected" : "Use design"}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        update((x) => ({ ...x, lanyard: d.name }));
                        notify(`${d.name} selected as the school lanyard.`);
                      }}
                    >
                      {data.lanyard === d.name ? "Selected" : "Choose"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
        </div>
      </Panel>
      {upload && (
        <Modal
          title="Add a design"
          subtitle="Add a front artwork preview to the collection."
          onClose={() => setUpload(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!file) {
                notify("Choose a design image first.", "error");
                return;
              }
              const r = new FileReader();
              r.onload = () => {
                update((d) => ({
                  ...d,
                  designs: [
                    ...d.designs,
                    { ...draft, id: uid("DES"), fileData: r.result },
                  ],
                }));
                setUpload(false);
                notify("Design artwork added to the collection.");
              };
              r.readAsDataURL(file);
            }}
          >
            <div className="modal-body">
              <div className="form-grid">
                <Field label="Design name" required>
                  <input
                    required
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Design type">
                  <select
                    value={draft.kind}
                    onChange={(e) =>
                      setDraft({ ...draft, kind: e.target.value })
                    }
                  >
                    <option>ID card</option>
                    <option>Lanyard</option>
                  </select>
                </Field>
                <Field label="For">
                  <select
                    value={draft.audience}
                    onChange={(e) =>
                      setDraft({ ...draft, audience: e.target.value })
                    }
                  >
                    <option>Student</option>
                    <option>Staff</option>
                    <option>Everyone</option>
                  </select>
                </Field>
                <Field label="Accent colour">
                  <input
                    type="color"
                    value={draft.color}
                    onChange={(e) =>
                      setDraft({ ...draft, color: e.target.value })
                    }
                  />
                </Field>
              </div>
              <label className="dropzone">
                <Icon name="design" size={25} />
                <strong>{file?.name || "Choose a PNG or JPG artwork"}</strong>
                <span>Up to 1 MB · front preview only</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (
                      f.size > 1e6 ||
                      !["image/png", "image/jpeg"].includes(f.type)
                    ) {
                      notify("Choose a PNG or JPG under 1 MB.", "error");
                      return;
                    }
                    setFile(f);
                  }}
                />
              </label>
              <Callout>
                Artwork is available in the gallery. Template field placement
                and printer output need a connected design editor.
              </Callout>
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setUpload(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!file}>
                Save design
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function PrintOrders({ ctx }) {
  const {
    data,
    school,
    role,
    schoolStudents,
    update,
    notify,
    log,
    availableSchools,
  } = ctx;
  const [batchQuery, setBatchQuery] = useState(""),
    [batchStatus, setBatchStatus] = useState(""),
    [create, setCreate] = useState(false),
    [name, setName] = useState(""),
    [selected, setSelected] = useState([]),
    [staffIds, setStaffIds] = useState([]),
    [detail, setDetail] = useState(null),
    [nextStatus, setNextStatus] = useState(""),
    [tracking, setTracking] = useState(""),
    [carrier, setCarrier] = useState("");
  const canProduce = ["super", "premium"].includes(role);
  const students = schoolStudents.filter(eligible);
  const staff = data.staff.filter(
    (s) =>
      s.school === school.id &&
      s.printStatus === "Approved" &&
      s.status === "Active",
  );
  const batches = data.batches.filter(
    (b) =>
      (role === "super" || availableSchools.some((s) => s.id === b.school)) &&
      (role !== "school" || b.school === school.id),
  );
  const submit = () => {
    const chosen = students.filter((s) => selected.includes(s.id));
    const chosenStaff = staff.filter((s) => staffIds.includes(s.id));
    if (!chosen.length && !chosenStaff.length) return;
    const batch = {
      id: uid("B"),
      name: name.trim() || `${school.name} · ${fmtDate(new Date())}`,
      school: school.id,
      count: chosen.length + chosenStaff.length,
      studentIds: chosen.map((s) => s.id),
      staffIds: chosenStaff.map((s) => s.id),
      snapshot: structuredClone(chosen),
      staffSnapshot: structuredClone(chosenStaff),
      status: "In progress",
      date: new Date().toISOString(),
      owner:
        role === "premium" && data.ownPrinting
          ? "Northstar Print Co."
          : "ID Studio",
      design: ctx.design,
      tracking: "",
      carrier: "",
    };
    update((d) =>
      log(
        {
          ...d,
          batches: [batch, ...d.batches],
          students: d.students.map((s) =>
            chosen.some((x) => x.id === s.id)
              ? { ...s, status: "Submitted for print", batch: batch.id }
              : s,
          ),
          staff: d.staff.map((s) =>
            chosenStaff.some((x) => x.id === s.id)
              ? { ...s, printStatus: "Submitted for print" }
              : s,
          ),
        },
        `Created print batch ${batch.name}`,
        "print",
      ),
    );
    setCreate(false);
    setSelected([]);
    setStaffIds([]);
    setName("");
    notify(`${batch.count} cards submitted as a new print batch.`);
  };
  const visibleBatches = batches.filter(
    (b) =>
      (!batchStatus || b.status === batchStatus) &&
      `${b.name} ${b.id} ${data.schools.find((s) => s.id === b.school)?.name}`
        .toLowerCase()
        .includes(batchQuery.toLowerCase()),
  );
  const batchRows = (b) =>
    b.snapshot || data.students.filter((s) => b.studentIds.includes(s.id));
  const exportBatch = (b) => {
    const ss = batchRows(b);
    const st =
      b.staffSnapshot ||
      data.staff.filter((s) => (b.staffIds || []).includes(s.id));
    download(
      `${b.id}.csv`,
      csvText(
        [
          ...ss.map((s) => ({ ...s, type: "Student" })),
          ...st.map((s) => ({ ...s, type: "Staff" })),
        ],
        [
          "id",
          "type",
          "name",
          "admission",
          "classNo",
          "section",
          "father",
          "mother",
          "email",
          "phone",
          "address",
          "blood",
          "session",
        ].map((key) => ({ key, label: key })),
      ),
      "text/csv",
    );
  };
  return (
    <>
      <PageTitle
        eyebrow="FROM APPROVED TO IN THEIR HANDS"
        title="Great IDs. A smoother finish."
        description="Group approved cards into a batch and follow every step through delivery."
      >
        <Button
          variant="secondary"
          icon="review"
          onClick={() => ctx.go("review")}
        >
          Review submissions
        </Button>
        <Button icon="plus" onClick={() => setCreate(true)}>
          Create print batch
        </Button>
      </PageTitle>
      {role === "premium" && (
        <Panel className="own-printing">
          <div>
            <span className="metric-icon coral">
              <Icon name="print" />
            </span>
            <div>
              <h3>Handle printing in-house</h3>
              <p>
                {data.ownPrinting
                  ? "Your new batches are assigned to Northstar Print Co."
                  : "New batches are fulfilled centrally by ID Studio."}
              </p>
            </div>
          </div>
          <label className="switch-label">
            <input
              type="checkbox"
              role="switch"
              checked={data.ownPrinting}
              onChange={(e) =>
                update((d) => ({ ...d, ownPrinting: e.target.checked }))
              }
            />
            <span>Own printing</span>
          </label>
        </Panel>
      )}
      <div className="metric-grid print-metrics">
        {[
          ["In progress", "print"],
          ["Printed", "package"],
          ["Delivered", "truck"],
        ].map(([s, icon]) => (
          <div className="metric" key={s}>
            <div>
              <span>{s}</span>
              <Icon name={icon} />
            </div>
            <strong>{batches.filter((b) => b.status === s).length}</strong>
            <p>
              {s === "Delivered"
                ? "Finished and handed over"
                : "School print batches"}
            </p>
          </div>
        ))}
      </div>
      <Panel
        title="Your print batches"
        subtitle="A clear timeline, without the follow-up calls."
      >
        <div className="table-toolbar">
          <div className="search-box">
            <Icon name="search" size={16} />
            <input
              aria-label="Search print batches"
              placeholder="Search batch or school"
              value={batchQuery}
              onChange={(e) => setBatchQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter print status"
            value={batchStatus}
            onChange={(e) => setBatchStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {STAGES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>BATCH</th>
                <th>SCHOOL</th>
                <th>CARDS</th>
                <th>FULFILLED BY</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {visibleBatches.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.name}</strong>
                    <small className="block muted">
                      {b.id} · {fmtDate(b.date)}
                    </small>
                  </td>
                  <td>{data.schools.find((s) => s.id === b.school)?.name}</td>
                  <td>{b.count}</td>
                  <td>{b.owner}</td>
                  <td>
                    <Badge>{b.status}</Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      <IconButton
                        icon="eye"
                        label={"View batch " + b.id}
                        onClick={() => {
                          setDetail(b);
                          setNextStatus(b.status);
                          setTracking(b.tracking || "");
                          setCarrier(b.carrier || "");
                        }}
                      />
                      <IconButton
                        icon="download"
                        label={"Export batch " + b.id}
                        onClick={() => {
                          if (
                            !batchRows(b).length &&
                            !b.staffSnapshot?.length
                          ) {
                            notify(
                              "This historical sample has no individual record export. Create a new batch to export its data.",
                            );
                            return;
                          }
                          exportBatch(b);
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visibleBatches.length && (
          <Empty
            title="No print batches in this view"
            text="Review student submissions, then create a batch from approved cards."
          />
        )}
      </Panel>
      <Callout icon="shield">
        Only approved, active records with photos can enter a new batch. Editing
        an approved student returns the record to review. Printed output in this
        preview is a sample card proof.
      </Callout>
      {create && (
        <Modal
          wide
          title="Create a print batch"
          subtitle={`${school.name} · ${students.length} approved students and ${staff.length} approved staff`}
          onClose={() => setCreate(false)}
        >
          <div className="modal-body">
            {role !== "school" && (
              <Field label="School">
                <select
                  value={school.id}
                  onChange={(e) => {
                    ctx.setSchoolId(e.target.value);
                    setSelected([]);
                    setStaffIds([]);
                  }}
                >
                  {availableSchools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Batch name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Class 6 · November collection"
              />
            </Field>
            <div className="print-select-head">
              <strong>Student cards</strong>
              <Button
                variant="text"
                onClick={() =>
                  setSelected(
                    selected.length === students.length
                      ? []
                      : students.map((s) => s.id),
                  )
                }
              >
                {selected.length === students.length ? "Clear" : "Select all"}
              </Button>
            </div>
            {students.map((s) => (
              <label className="print-select-row" key={s.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={() =>
                    setSelected(
                      selected.includes(s.id)
                        ? selected.filter((id) => id !== s.id)
                        : [...selected, s.id],
                    )
                  }
                />
                <Avatar name={s.name} />
                <span>
                  <strong>{s.name}</strong>
                  <small>
                    {s.admission} · Class {s.classNo} {s.section}
                  </small>
                </span>
                <Badge>Approved</Badge>
              </label>
            ))}
            {staff.length > 0 && (
              <div className="print-select-head">
                <strong>Staff cards</strong>
              </div>
            )}
            {staff.map((s) => (
              <label className="print-select-row" key={s.id}>
                <input
                  type="checkbox"
                  checked={staffIds.includes(s.id)}
                  onChange={() =>
                    setStaffIds(
                      staffIds.includes(s.id)
                        ? staffIds.filter((id) => id !== s.id)
                        : [...staffIds, s.id],
                    )
                  }
                />
                <Avatar name={s.name} />
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.role}</small>
                </span>
                <Badge>Approved</Badge>
              </label>
            ))}
            {!students.length && !staff.length && (
              <Empty
                title="No approved cards available"
                text="Approve students in Review Submissions, or approve staff from the staff directory."
              />
            )}
          </div>
          <div className="modal-actions">
            <span className="muted">
              {selected.length + staffIds.length} cards selected
            </span>
            <Button variant="secondary" onClick={() => setCreate(false)}>
              Cancel
            </Button>
            <Button
              disabled={!selected.length && !staffIds.length}
              icon="print"
              onClick={submit}
            >
              Submit for printing
            </Button>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal
          wide
          title={detail.name}
          subtitle={`${detail.id} · ${detail.count} cards · ${detail.owner}`}
          onClose={() => setDetail(null)}
        >
          <div className="modal-body">
            <div className="batch-timeline">
              {STAGES.map((s, i) => (
                <div
                  key={s}
                  className={STAGES.indexOf(detail.status) >= i ? "done" : ""}
                >
                  <span>
                    <Icon name={["print", "package", "truck"][i]} />
                  </span>
                  <strong>{s}</strong>
                </div>
              ))}
            </div>
            <div className="batch-detail-facts">
              <Badge>{detail.status}</Badge>
              <span>Created {fmtDate(detail.date)}</span>
              <span>Design: {detail.design}</span>
            </div>
            <div className="button-row">
              <Button
                variant="secondary"
                icon="download"
                disabled={
                  !batchRows(detail).length && !detail.staffSnapshot?.length
                }
                onClick={() => exportBatch(detail)}
              >
                Export batch CSV
              </Button>
              <PDFProofButton
                disabled={
                  !batchRows(detail).length && !detail.staffSnapshot?.length
                }
                students={[
                  ...batchRows(detail),
                  ...(detail.staffSnapshot || []).map((s) => ({
                    ...s,
                    cardType: "STAFF",
                    classNo: s.role,
                    section: "",
                    admission: s.id,
                  })),
                ]}
                school={data.schools.find((s) => s.id === detail.school)}
                design={detail.design}
              />
            </div>
            {!batchRows(detail).length && !detail.staffSnapshot?.length && (
              <Callout>
                Historical sample batch: individual records are not attached.
                Create a new batch to try record exports and card proofs.
              </Callout>
            )}
            {canProduce ? (
              <>
                <div className="rule" />
                <h3>Production update</h3>
                <div className="form-grid">
                  <Field label="Batch status">
                    <select
                      value={nextStatus}
                      onChange={(e) => setNextStatus(e.target.value)}
                    >
                      {STAGES.filter(
                        (s) =>
                          STAGES.indexOf(s) >= STAGES.indexOf(detail.status),
                      ).map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Courier / delivery method">
                    <input
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      placeholder="e.g. School pickup"
                    />
                  </Field>
                  <Field label="Tracking reference">
                    <input
                      value={tracking}
                      onChange={(e) => setTracking(e.target.value)}
                      placeholder="Optional courier reference"
                    />
                  </Field>
                </div>
                <Button
                  onClick={() => {
                    const updated = {
                      ...detail,
                      status: nextStatus,
                      carrier,
                      tracking,
                    };
                    update((d) =>
                      log(
                        {
                          ...d,
                          batches: d.batches.map((b) =>
                            b.id === detail.id ? updated : b,
                          ),
                        },
                        `${detail.id} marked ${nextStatus.toLowerCase()}`,
                        "print",
                      ),
                    );
                    setDetail(updated);
                    notify("Production status updated across the preview.");
                  }}
                >
                  Save production update
                </Button>
              </>
            ) : (
              <Callout icon="truck">
                The print team updates production and delivery.{" "}
                {detail.carrier
                  ? `${detail.carrier} · ${detail.tracking || "No tracking reference"}`
                  : "Delivery details will appear here when available."}
              </Callout>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
