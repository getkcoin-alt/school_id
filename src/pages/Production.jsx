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
  studentPhoto,
  photoNumber,
  printRounds,
  batchSession,
  cardRecord,
  currentSession,
  exportStudents,
  validPhoto,
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
function LibraryPhoto({ photo }) {
  const [src, setSrc] = useState(photo.src || "");
  useEffect(() => {
    if (!photo.fileKey) return;
    let active = true;
    let url;
    getFile(photo.fileKey)
      .then((file) => {
        if (!active || !file) return;
        url = URL.createObjectURL(file);
        setSrc(url);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo.fileKey]);
  return src ? (
    <img loading="lazy" src={src} alt={photo.name} />
  ) : (
    <Icon name="image" />
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
    [view, setView] = useState(
      () =>
        data.uploads.find(
          (file) => file.school === school.id && file.id === ctx.photoRecord,
        ) || null,
    ),
    [remove, setRemove] = useState(null);
  const canUploadPDF = ["regular", "premium", "super"].includes(role);
  const canReviewPDF = ["school", "super"].includes(role);
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
    if (!file || !canUploadPDF || busy) return;
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
            notifications: [
              {
                id: uid("NOTICE"),
                page: "photos",
                school: school.id,
                pdf: id,
                title: "Photo PDF received",
                text: `${file.name} · ${pages} ${Number(pages) === 1 ? "page" : "pages"}`,
                read: false,
              },
              ...d.notifications,
            ],
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
    if (busy || !list.length) return;
    if (list.length > 200) {
      notify("Choose up to 200 photos at a time.", "error");
      return;
    }
    setBusy(true);
    let skipped = 0;
    const results = [];
    const matches = new Map();
    const names = new Set(images.map((photo) => photoNumber(photo.name)));
    for (const file of list) {
      const number = photoNumber(file.name);
      if (!validPhoto(file) || !number || names.has(number)) {
        skipped++;
        continue;
      }
      try {
        const id = uid("IMG");
        const preview = await studentPhoto(file);
        await putFile(id, await (await fetch(preview)).blob());
        results.push({ id, school: school.id, name: file.name, fileKey: id });
        names.add(number);
        matches.set(number, preview);
      } catch {
        skipped++;
      }
    }
    if (results.length)
      update((d) =>
        log(
          {
            ...d,
            photoLibrary: [...d.photoLibrary, ...results],
            students: d.students.map((student) =>
              student.school === school.id &&
              !student.photo &&
              matches.has(photoNumber(student.photoNo))
                ? {
                    ...student,
                    photo: matches.get(photoNumber(student.photoNo)),
                    photoSource: "School photo library",
                  }
                : student,
            ),
          },
          `Added ${results.length} photos to ${school.name}`,
          "image",
        ),
      );
    setBusy(false);
    notify(
      `${results.length} photos added${skipped ? ` · ${skipped} duplicate, oversized, or unreadable files skipped` : ""}.`,
      results.length ? "success" : "error",
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
            disabled={busy || role === "school"}
            onChange={(e) => {
              ctx.setSchoolId(e.target.value);
              setFile(null);
              setNote("");
              setClass("");
              setPages("1");
            }}
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
          {canUploadPDF ? (
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
          ) : (
            <Callout icon="file">
              Your agent uploads school photo PDFs. Open each collection below
              and mark it reviewed after checking the photos.
            </Callout>
          )}
          <Panel
            title="School photo collections"
            subtitle={`${uploads.length} PDF collections for ${school.name}`}
          >
            <div className="table-wrap">
              <table className="phone-records">
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
                      <td className="phone-record-title">
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
                      <td data-label="PAGES">{u.pages}</td>
                      <td data-label="ADDED">{fmtDate(u.date)}</td>
                      <td data-label="STATUS">
                        <Badge>
                          {u.status === "Approved" ? "Reviewed" : u.status}
                        </Badge>
                      </td>
                      <td className="phone-record-actions">
                        <div className="row-actions">
                          <IconButton
                            icon="eye"
                            label={"Preview " + u.name}
                            onClick={() => setView(u)}
                          />
                          {canReviewPDF && u.status === "Ready for review" && (
                            <IconButton
                              icon="check"
                              label={"Mark reviewed " + u.name}
                              onClick={() => {
                                update((d) => ({
                                  ...d,
                                  uploads: d.uploads.map((x) =>
                                    x.id === u.id
                                      ? {
                                          ...x,
                                          status: "Reviewed",
                                          reviewedAt: new Date().toISOString(),
                                        }
                                      : x,
                                  ),
                                }));
                                notify(
                                  "Photo collection marked reviewed. Student cards still need individual approval.",
                                );
                              }}
                            />
                          )}
                          {canUploadPDF && (
                            <IconButton
                              icon="trash"
                              label={"Delete " + u.name}
                              onClick={() => setRemove(u)}
                            />
                          )}
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
                text={
                  canUploadPDF
                    ? "Upload your first collection above."
                    : "Collections from your agent will appear here."
                }
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
                <strong>
                  {busy ? "Saving photos…" : "Add individual photos"}
                </strong>
                <span>
                  JPG, PNG, WebP · up to 15 MB each · name files by photo number
                  to link them automatically
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    bulk(e.target.files || []);
                    e.target.value = "";
                  }}
                />
              </label>
              <div className="photo-library">
                {images.map((p) => (
                  <div key={p.id}>
                    <LibraryPhoto photo={p} />
                    <strong>{p.name}</strong>
                    <IconButton
                      icon="trash"
                      label={"Remove " + p.name}
                      onClick={async () => {
                        try {
                          if (p.fileKey) await deleteFile(p.fileKey);
                        } catch {
                          notify(
                            "Could not remove the photo. Try again.",
                            "error",
                          );
                          return;
                        }
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
                        update((x) => ({
                          ...x,
                          schoolLanyards: {
                            ...x.schoolLanyards,
                            [school.id]: d.name,
                          },
                        }));
                        notify(`${d.name} selected as the school lanyard.`);
                      }}
                    >
                      {(data.schoolLanyards?.[school.id] || data.lanyard) ===
                      d.name
                        ? "Selected"
                        : "Choose"}
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
const ORDER_SECTIONS = [
  {
    title: "School",
    fields: [
      ["srNo", "Sr. no."],
      ["date", "Date", "date"],
      ["schoolName", "School name", "text", true],
      ["address", "Address", "wide"],
      ["contactNo", "Contact no.", "tel"],
      ["email", "Email ID", "email"],
      ["emailPrint", "Email on card", ["To print", "Not to print"]],
      ["website", "Website"],
      ["websitePrint", "Website on card", ["To print", "Not to print"]],
      ["design", "Design", "wide"],
    ],
  },
  {
    title: "Card",
    fields: [
      [
        "schoolLogo",
        "School logo",
        ["Received", "Not received", "Not applicable"],
      ],
      ["cardType", "Card type", ["Normal", "Scratch proof"]],
      [
        "issuingAuthority",
        "Issuing authority",
        ["Director", "Principal", "Head Master", "Head Mistress"],
      ],
      [
        "signature",
        "Signature",
        ["Received", "Not received", "Not applicable"],
      ],
    ],
  },
  {
    title: "Dori (lanyard)",
    fields: [
      ["doriType", "Dori type", ["Digital", "Soft", "Mattee", "Border"]],
      [
        "doriColour",
        "Dori colour",
        ["Royal Blue", "Navy Blue", "Red", "Yellow"],
        false,
        "Subject to availability",
      ],
      ["printOnDories", "Print on dories", "wide"],
      [
        "doriCount",
        "No. of dori",
        "number",
        false,
        "Extra dories must be purchased by the school",
      ],
    ],
  },
  {
    title: "Holder (H. details)",
    fields: [
      ["holderOrientation", "Orientation", ["Horizontal", "Vertical"]],
      ["holderSticky", "Sticky", ["Sticky", "Non sticky"]],
      ["holderSides", "Sides", ["Single sided", "Double sided"]],
      ["holderSize", "Size", ["Small", "Normal"]],
      ["attachment", "Attachment", ["With hook", "Without hook"]],
    ],
  },
  {
    title: "Staff member (from Sonepat)",
    note: "18% GST will be applicable on the overall amount.",
    fields: [
      ["staffName", "Name"],
      ["staffContact", "Contact no.", "tel"],
      ["rate", "Rate (₹)", "number"],
      ["advance", "Advance (₹)", "number"],
      ["extraDoriRate", "Rate for extra dories (₹)", "number"],
    ],
  },
  {
    title: "Authorised person's details",
    fields: [
      ["authName", "Name"],
      ["authDesignation", "Designation"],
      ["authContact", "Contact no.", "tel"],
    ],
  },
  {
    title: "Remarks",
    fields: [["remarks", "Remarks (if any)", "wide"]],
  },
];
const ORDER_TERMS = [
  "The overall job is expected to be completed within 10 days after finalisation of data.",
  "CtC will not be responsible for any mistake found after proof reading.",
  "Colour on card may be in a slightly different shade due to the thermal process.",
  "Photography will take place two times maximum (if applicable).",
  "The institution has to provide data and photographs in soft format after two visits of the photographer.",
];

const formValue = (v) =>
  v === true
    ? "Yes"
    : v === false
      ? "No"
      : v == null || v === ""
        ? "—"
        : String(v);

function printOrderForm(f, onBlocked) {
  const d = f.details || {};
  const esc = (s) =>
    String(s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );
  const body =
    ORDER_SECTIONS.map(
      (s) =>
        `<h2>${esc(s.title)}</h2><table>${s.fields
          .map(
            ([k, l, t]) =>
              `<tr><th>${esc(l)}</th><td>${esc(t === "date" && d[k] ? fmtDate(d[k]) : formValue(d[k]))}</td></tr>`,
          )
          .join("")}</table>`,
    ).join("") +
    `<h2>Terms &amp; conditions</h2><ol>${ORDER_TERMS.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>`;
  const w = window.open("", "_blank");
  if (!w) {
    onBlocked();
    return;
  }
  w.opener = null;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Order form · ${esc(f.schoolName)}</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:32px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:20px 0 6px;border-bottom:1px solid #999}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #ddd;vertical-align:top}th{width:40%;font-weight:600}p{color:#555;margin:0}</style></head><body><h1>CtC Id Solutions · ID card order form</h1><p>G-16, City Plaza, Near Axis Bank, Old D.C. Road, Sonipat-131001</p><p>${esc(f.schoolName)}${f.note ? " · " + esc(f.note) : ""}</p>${body}<script>window.onload=()=>window.print()</script></body></html>`,
  );
  w.document.close();
}

function OrderFormEditor({ ctx, form, schools, onClose }) {
  const { notify, update, log } = ctx;
  const first = form?.school || ctx.school.id;
  const schoolOf = (id) => schools.find((s) => s.id === id);
  const prefill = (id) => {
    const s = schoolOf(id) || {};
    return {
      date: new Date().toISOString().slice(0, 10),
      schoolName: s.name || "",
      address: [s.address, s.city, s.state, s.pin].filter(Boolean).join(", "),
      contactNo: s.phone || "",
      email: s.email || "",
      authName: s.principal || "",
      authDesignation: s.principal ? "Principal" : "",
    };
  };
  const [schoolId, setSchoolId] = useState(first);
  // "fill": the CtC form on screen; "upload": only a scan or photo of a filled paper form.
  const [mode, setMode] = useState(form && !form.details ? "upload" : "fill");
  const [d, setD] = useState(form?.details || prefill(first));
  const [note, setNote] = useState(form?.note || "");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const save = async (e) => {
    e.preventDefault();
    if (file && file.size > 10 * 1024 * 1024)
      return notify("The file must be under 10 MB.", "error");
    if (mode === "upload" && !form?.fileKey && !file)
      return notify("Choose the filled order form to upload.", "error");
    const details =
      mode === "fill"
        ? Object.fromEntries(
            Object.entries(d)
              .filter(([, v]) => v !== "" && v != null)
              .map(([k, v]) => [k, String(v)]),
          )
        : null;
    setBusy(true);
    try {
      const id = form?.id || uid("OF");
      if (file && !/\.(pdf|jpe?g|png|webp)$/i.test(file.name))
        throw new Error("Choose a PDF or image.");
      if (file) await putFile(id, file);
      const saved = {
        ...form,
        id,
        school: schoolId,
        schoolName: schoolOf(schoolId)?.name,
        name: file?.name || form?.name || "CtC order form",
        details,
        note: note.trim(),
        fileKey: file ? id : form?.fileKey,
        date: form?.date || new Date().toISOString(),
      };
      update((data) =>
        log(
          {
            ...data,
            orderForms: form
              ? (data.orderForms || []).map((entry) =>
                  entry.id === id ? saved : entry,
                )
              : [saved, ...(data.orderForms || [])],
          },
          form ? "Updated a CtC order form" : "Added a CtC order form",
          "print",
        ),
      );
      notify(
        form
          ? "Order form updated."
          : `Order form saved. ${schoolOf(schoolId)?.name || "The school"} can now see it.`,
      );
      onClose();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      wide
      title={form ? "Edit order form" : "New order form"}
      subtitle="CtC Id Solutions ID card order form. The school can view and print it but not change it."
      onClose={busy ? undefined : onClose}
    >
      <form onSubmit={save}>
        <div className="modal-body order-form">
          {!form && (
            <div
              className="segmented"
              role="tablist"
              aria-label="How to add the order form"
            >
              {[
                ["fill", "Fill online"],
                ["upload", "Upload signed copy"],
              ].map(([m, l]) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  className={mode === m ? "active" : ""}
                  onClick={() => setMode(m)}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
          <div className="form-grid">
            <Field label="School" required>
              <select
                required
                disabled={Boolean(form)}
                value={schoolId}
                onChange={(e) => {
                  setSchoolId(e.target.value);
                  setD({ ...d, ...prefill(e.target.value) });
                }}
              >
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            {!form && (
              <Field
                label={
                  mode === "upload"
                    ? "Filled order form"
                    : "Signed scan (optional)"
                }
                required={mode === "upload"}
                hint="PDF or photo, up to 10 MB"
              >
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </Field>
            )}
          </div>
          {mode === "fill" &&
            ORDER_SECTIONS.map((sec) => (
              <fieldset key={sec.title} className="order-section">
                <legend>{sec.title}</legend>
                {sec.note && <p className="muted small-note">{sec.note}</p>}
                <div className="form-grid">
                  {sec.fields.map(([k, l, t, req, hint]) =>
                    Array.isArray(t) ? (
                      <div key={k} className="field choice-field">
                        <span className="field-label">
                          {l}
                          {hint && <small className="muted"> · {hint}</small>}
                        </span>
                        <div
                          className="choice-row"
                          role="radiogroup"
                          aria-label={l}
                        >
                          {t.map((o) => (
                            <label
                              key={o}
                              className={`choice ${d[k] === o ? "on" : ""}`}
                            >
                              <input
                                type="radio"
                                name={k}
                                checked={d[k] === o}
                                onChange={() => set(k, o)}
                              />
                              {o}
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : t === "date" ? (
                      <Field key={k} label={l}>
                        <input
                          type="date"
                          value={d[k] || ""}
                          onChange={(e) => set(k, e.target.value)}
                        />
                      </Field>
                    ) : (
                      <Field
                        key={k}
                        label={l}
                        required={req}
                        hint={hint}
                        className={t === "wide" ? "span-2" : undefined}
                      >
                        {t === "wide" ? (
                          <textarea
                            rows="2"
                            maxLength="500"
                            value={d[k] || ""}
                            onChange={(e) => set(k, e.target.value)}
                          />
                        ) : (
                          <input
                            required={req}
                            type={
                              t === "number"
                                ? "number"
                                : t === "email"
                                  ? "email"
                                  : t === "tel"
                                    ? "tel"
                                    : "text"
                            }
                            min={t === "number" ? "0" : undefined}
                            maxLength="200"
                            value={d[k] ?? ""}
                            onChange={(e) => set(k, e.target.value)}
                          />
                        )}
                      </Field>
                    ),
                  )}
                </div>
              </fieldset>
            ))}
          {mode === "fill" && (
            <div className="order-terms">
              <strong>Terms &amp; conditions</strong>
              <ol>
                {ORDER_TERMS.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
            </div>
          )}
          <Field label="Note (optional)">
            <input
              maxLength="500"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
        <div className="modal-actions">
          <Button
            variant="secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : form ? "Save changes" : "Save order form"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function OrderFormView({ form, onClose, onDownload, notify }) {
  const d = form.details || {};
  return (
    <Modal
      wide
      title={`Order form · ${form.schoolName}`}
      subtitle={`Filled on ${fmtDate(form.date || form.createdAt)}${form.note ? " · " + form.note : ""}`}
      onClose={onClose}
    >
      <div className="modal-body">
        {!form.details && (
          <p className="muted">
            This order form was uploaded as a file. Open it with the button
            below.
          </p>
        )}
        {form.details &&
          ORDER_SECTIONS.map((sec) => (
            <div key={sec.title} className="order-view">
              <h3>{sec.title}</h3>
              {sec.note && <p className="muted small-note">{sec.note}</p>}
              <dl>
                {sec.fields.map(([k, l, t]) => (
                  <React.Fragment key={k}>
                    <dt>{l}</dt>
                    <dd>
                      {t === "date" && d[k] ? fmtDate(d[k]) : formValue(d[k])}
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
          ))}
        {form.details && (
          <div className="order-terms">
            <strong>Terms &amp; conditions</strong>
            <ol>
              {ORDER_TERMS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <div className="modal-actions">
        {form.fileKey && (
          <Button
            variant="secondary"
            icon="download"
            onClick={() => onDownload(form)}
          >
            {form.details ? "Download signed copy" : "Download order form"}
          </Button>
        )}
        {form.details && (
          <Button
            variant="secondary"
            onClick={() =>
              printOrderForm(form, () =>
                notify(
                  "Allow pop-ups to open the printable order form.",
                  "error",
                ),
              )
            }
          >
            <Icon name="print" size={15} /> Print
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

function OrderForms({ ctx }) {
  const { data, role, school, availableSchools, update, notify, log } = ctx;
  const canManage = role !== "school";
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const [remove, setRemove] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [schoolFilter, setSchoolFilter] = useState("");
  const allowed = new Set(
    (canManage ? availableSchools : [school]).map((entry) => entry.id),
  );
  const forms = (data.orderForms || [])
    .filter(
      (entry) =>
        allowed.has(entry.school) &&
        (!schoolFilter || schoolFilter === entry.school),
    )
    .map((entry) => ({
      ...entry,
      schoolName:
        entry.schoolName ||
        data.schools.find((row) => row.id === entry.school)?.name,
    }));
  const downloadForm = async (form) => {
    try {
      const file = await getFile(form.fileKey);
      if (!file) throw new Error("File unavailable");
      download(form.name, file, file.type || "application/octet-stream");
    } catch {
      notify("The saved attachment is unavailable in this browser.", "error");
    }
  };
  const deleteForm = async () => {
    setDeleting(true);
    try {
      if (remove.fileKey) await deleteFile(remove.fileKey);
      update((d) =>
        log(
          {
            ...d,
            orderForms: (d.orderForms || []).filter(
              (entry) => entry.id !== remove.id,
            ),
          },
          "Removed a CtC order form",
          "print",
        ),
      );
      setRemove(null);
      notify("Order form deleted.");
    } catch {
      notify("Could not remove the saved file.", "error");
    } finally {
      setDeleting(false);
    }
  };
  return (
    <Panel
      title="Order forms"
      subtitle={
        canManage
          ? "CtC Id Solutions · Fill online or upload a signed copy."
          : `Order forms for ${school.name}`
      }
      action={
        canManage && (
          <Button icon="plus" onClick={() => setEdit({})}>
            New order form
          </Button>
        )
      }
    >
      {canManage && availableSchools.length > 1 && (
        <div className="table-toolbar">
          <Field label="Filter order forms by school">
            <select
              value={schoolFilter}
              onChange={(e) => setSchoolFilter(e.target.value)}
            >
              <option value="">All schools</option>
              {availableSchools.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {forms.length ? (
        <div className="table-wrap">
          <table className="phone-records">
            <thead>
              <tr>
                <th>SCHOOL</th>
                <th>CARD</th>
                <th>LANYARD</th>
                <th>DATE</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((form) => (
                <tr key={form.id}>
                  <td className="phone-record-title">
                    <strong>{form.schoolName}</strong>
                    <small className="block muted">
                      {form.note || form.name}
                    </small>
                  </td>
                  <td data-label="Card">
                    {form.details?.cardType ||
                      (form.fileKey ? "Uploaded copy" : "—")}
                  </td>
                  <td data-label="Lanyard">
                    {[form.details?.doriType, form.details?.doriCount]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td data-label="Date">
                    {fmtDate(form.details?.date || form.date || form.createdAt)}
                  </td>
                  <td className="phone-record-actions">
                    <div className="row-actions">
                      <IconButton
                        icon="eye"
                        label="View order form"
                        onClick={() => setView(form)}
                      />
                      {canManage && form.details && (
                        <IconButton
                          icon="edit"
                          label="Edit order form"
                          onClick={() => setEdit(form)}
                        />
                      )}
                      {canManage && (
                        <IconButton
                          icon="trash"
                          label="Delete order form"
                          onClick={() => setRemove(form)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No order forms yet"
          text={
            canManage
              ? "Create an order form for a school or upload a signed copy."
              : "Forms will appear here when your agent adds them."
          }
        />
      )}
      {edit && canManage && (
        <OrderFormEditor
          ctx={ctx}
          form={edit.id ? edit : null}
          schools={availableSchools}
          onClose={() => setEdit(null)}
        />
      )}
      {view && (
        <OrderFormView
          form={view}
          onClose={() => setView(null)}
          onDownload={downloadForm}
          notify={notify}
        />
      )}
      {remove && canManage && (
        <Modal
          title="Delete order form?"
          subtitle={remove.schoolName}
          onClose={deleting ? undefined : () => setRemove(null)}
        >
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={deleting}
              onClick={() => setRemove(null)}
            >
              Keep form
            </Button>
            <Button disabled={deleting} onClick={deleteForm}>
              Delete form
            </Button>
          </div>
        </Modal>
      )}
    </Panel>
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
    [fulfilledBy, setFulfilledBy] = useState(""),
    [kind, setKind] = useState("student"),
    [confirmBatch, setConfirmBatch] = useState(false),
    [create, setCreate] = useState(ctx.record === "createBatch"),
    [name, setName] = useState(""),
    [selected, setSelected] = useState([]),
    [staffIds, setStaffIds] = useState([]),
    [detail, setDetail] = useState(
      () =>
        data.batches.find(
          (row) =>
            row.id === ctx.record &&
            (role === "school"
              ? row.school === school.id
              : availableSchools.some((entry) => entry.id === row.school)),
        ) || null,
    ),
    [removeBatch, setRemoveBatch] = useState(null),
    [nextStatus, setNextStatus] = useState(detail?.status || ""),
    [tracking, setTracking] = useState(detail?.tracking || ""),
    [carrier, setCarrier] = useState(detail?.carrier || "");
  const canProduce = ["super", "premium"].includes(role);
  const canDownload = role !== "regular";
  const students = schoolStudents.filter(eligible);
  const staffReady = (entry) =>
    entry.printStatus === "Approved" &&
    entry.status === "Active" &&
    Boolean(entry.photo);
  const staff = data.staff.filter(
    (entry) => entry.school === school.id && staffReady(entry),
  );
  const pickableSchools = availableSchools.filter(
    (entry) =>
      entry.id === school.id ||
      data.students.some(
        (student) =>
          student.school === entry.id &&
          student.session === currentSession(data, entry.id) &&
          eligible(student),
      ) ||
      data.staff.some(
        (member) => member.school === entry.id && staffReady(member),
      ),
  );
  const batches = data.batches.filter(
    (batch) =>
      availableSchools.some((entry) => entry.id === batch.school) &&
      (role !== "school" || batch.school === school.id) &&
      batchSession(batch) === ctx.session,
  );
  const { allowed, used, remaining } = printRounds(
    data.batches,
    school,
    ctx.session,
    kind,
  );
  const blocked = remaining === 0 && role !== "super";
  const source = kind === "student" ? students : staff;
  const picked = kind === "student" ? selected : staffIds;
  const setPicked = kind === "student" ? setSelected : setStaffIds;
  const openCreate = () => {
    setSelected([]);
    setStaffIds([]);
    setKind("student");
    setConfirmBatch(false);
    setName("");
    setCreate(true);
  };
  const submit = () => {
    const chosen =
      kind === "student" ? students.filter((s) => selected.includes(s.id)) : [];
    const chosenStaff =
      kind === "staff" ? staff.filter((s) => staffIds.includes(s.id)) : [];
    if (!confirmBatch || blocked || (!chosen.length && !chosenStaff.length))
      return;
    const batch = {
      id: uid("B"),
      name: name.trim() || `${school.name} · ${fmtDate(new Date())}`,
      school: school.id,
      session: ctx.session,
      kind,
      count: chosen.length + chosenStaff.length,
      studentIds: chosen.map((s) => s.id),
      staffIds: chosenStaff.map((s) => s.id),
      snapshot: chosen.map((entry) => cardRecord(data, school.id, entry)),
      staffSnapshot: chosenStaff.map((entry) =>
        cardRecord(data, school.id, entry, true),
      ),
      status: "Submitted",
      date: new Date().toISOString(),
      owner:
        role === "premium" &&
        (data.agentPrinting?.[ctx.agentId] ?? data.ownPrinting)
          ? data.agents.find((entry) => entry.id === ctx.agentId)?.company ||
            ctx.userProfile.name
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
          notifications: [
            {
              id: uid("NOTICE"),
              page: "printing",
              school: school.id,
              batch: batch.id,
              title: "Print batch submitted",
              text: batch.name,
              read: false,
            },
            ...d.notifications,
          ],
          students: d.students.map((s) =>
            chosen.some((x) => x.id === s.id)
              ? { ...s, status: "Submitted for print", batch: batch.id }
              : s,
          ),
          staff: d.staff.map((s) =>
            chosenStaff.some((x) => x.id === s.id)
              ? { ...s, printStatus: "Submitted for print", batch: batch.id }
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
  const deleteBatch = () => {
    const batch = removeBatch;
    if (
      !batch ||
      (role !== "super" && !["Submitted", "Cancelled"].includes(batch.status))
    )
      return;
    update((d) =>
      log(
        {
          ...d,
          batches: d.batches.filter((b) => b.id !== batch.id),
          orderForms: (d.orderForms || []).map((form) =>
            form.batch === batch.id ? { ...form, batch: "" } : form,
          ),
          students: d.students.map((s) =>
            s.batch === batch.id
              ? {
                  ...s,
                  batch: "",
                  status:
                    s.status === "Submitted for print" ? "Approved" : s.status,
                }
              : s,
          ),
          staff: d.staff.map((s) => {
            if (s.printStatus !== "Submitted for print") return s;
            const inOtherBatch = d.batches.some(
              (b) => b.id !== batch.id && b.staffIds?.includes(s.id),
            );
            if (
              s.batch === batch.id ||
              (!s.batch && !inOtherBatch && batch.staffIds?.includes(s.id))
            )
              return { ...s, batch: "", printStatus: "Approved" };
            return s;
          }),
        },
        `Deleted print batch ${batch.name}`,
        "print",
      ),
    );
    setRemoveBatch(null);
    notify(
      "Print batch deleted. Cards in its print queue are ready for a new batch.",
    );
  };
  const visibleBatches = batches.filter(
    (b) =>
      (!batchStatus || b.status === batchStatus) &&
      (!fulfilledBy ||
        (["ID Studio", "ID Card Studio"].includes(b.owner)
          ? "studio"
          : "agent") === fulfilledBy) &&
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
          "fatherPrefix",
          "father",
          "motherPrefix",
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
        {["school", "super"].includes(role) && (
          <Button
            variant="secondary"
            icon="review"
            onClick={() => ctx.go("review")}
          >
            Review submissions
          </Button>
        )}
        <Button icon="plus" onClick={openCreate}>
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
                {(data.agentPrinting?.[ctx.agentId] ?? data.ownPrinting)
                  ? "Your new batches are assigned to your print team."
                  : "New batches are fulfilled centrally by ID Studio."}
              </p>
            </div>
          </div>
          <label className="switch-label">
            <input
              type="checkbox"
              role="switch"
              checked={data.agentPrinting?.[ctx.agentId] ?? data.ownPrinting}
              onChange={(e) =>
                update((d) => ({
                  ...d,
                  agentPrinting: {
                    ...d.agentPrinting,
                    [ctx.agentId]: e.target.checked,
                  },
                }))
              }
            />
            <span>Own printing</span>
          </label>
        </Panel>
      )}
      <div className="metric-grid print-metrics">
        {[
          ["Submitted", "send"],
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
            {[...STAGES, "Cancelled"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Filter by who prints"
            value={fulfilledBy}
            onChange={(e) => setFulfilledBy(e.target.value)}
          >
            <option value="">All printers</option>
            <option value="studio">ID Card Studio</option>
            <option value="agent">Agent</option>
          </select>
        </div>
        <div className="table-wrap">
          <table className="phone-records">
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
                  <td className="phone-record-title">
                    <strong>{b.name}</strong>
                    <small className="block muted">
                      {b.id} · {fmtDate(b.date)}
                    </small>
                  </td>
                  <td data-label="SCHOOL">
                    {data.schools.find((s) => s.id === b.school)?.name}
                  </td>
                  <td data-label="CARDS">{b.count}</td>
                  <td data-label="FULFILLED BY">{b.owner}</td>
                  <td data-label="STATUS">
                    <Badge>{b.status}</Badge>
                  </td>
                  <td className="phone-record-actions">
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
                      {canDownload && (
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
                      )}
                      {(role === "super" ||
                        ["Submitted", "Cancelled"].includes(b.status)) && (
                        <IconButton
                          icon="trash"
                          label={`Delete batch ${b.id}`}
                          onClick={() => setRemoveBatch(b)}
                        />
                      )}
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
      <OrderForms key={school.id} ctx={ctx} />
      {removeBatch && (
        <Modal
          title={`Delete ${removeBatch.name}?`}
          subtitle="Review the impact before deleting this print batch."
          onClose={() => setRemoveBatch(null)}
        >
          <div className="modal-body">
            <ul>
              <li>
                The batch and its saved history of {removeBatch.count} cards
                will be removed.
              </li>
              <li>
                Linked cards still in the print queue will return to Approved.
              </li>
              <li>
                {
                  (data.orderForms || []).filter(
                    (form) => form.batch === removeBatch.id,
                  ).length
                }{" "}
                linked order forms will stay under the school.
              </li>
            </ul>
          </div>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setRemoveBatch(null)}>
              Keep batch
            </Button>
            <Button onClick={deleteBatch}>Delete batch</Button>
          </div>
        </Modal>
      )}
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
                    setConfirmBatch(false);
                  }}
                >
                  {pickableSchools.map((s) => (
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
            <div className="review-tabs" role="group" aria-label="Batch type">
              {[
                ["student", "Students"],
                ["staff", "Staff"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={kind === value}
                  className={kind === value ? "active" : ""}
                  onClick={() => {
                    setKind(value);
                    setSelected([]);
                    setStaffIds([]);
                    setConfirmBatch(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <Callout icon="calendar" tone={remaining === 0 ? "amber" : "blue"}>
              {used} of {allowed} {kind} print rounds used for {ctx.session}.{" "}
              {remaining
                ? `${remaining} remaining.`
                : role === "super"
                  ? "Super Admin can submit an extra round."
                  : "Contact ID Card Studio to add a round."}
            </Callout>
            <div className="print-select-head">
              <strong>
                Approved {kind === "student" ? "students" : "staff"}
              </strong>
              {source.length > 0 && (
                <Button
                  variant="text"
                  onClick={() => {
                    setPicked(
                      picked.length === source.length
                        ? []
                        : source.map((entry) => entry.id),
                    );
                    setConfirmBatch(false);
                  }}
                >
                  {picked.length === source.length ? "Clear" : "Select all"}
                </Button>
              )}
            </div>
            {source.map((entry) => (
              <label className="print-select-row" key={entry.id}>
                <input
                  type="checkbox"
                  checked={picked.includes(entry.id)}
                  onChange={() => {
                    setPicked(
                      picked.includes(entry.id)
                        ? picked.filter((id) => id !== entry.id)
                        : [...picked, entry.id],
                    );
                    setConfirmBatch(false);
                  }}
                />
                <Avatar name={entry.name} photo={entry.photo} />
                <span>
                  <strong>{entry.name}</strong>
                  <small>
                    {kind === "student"
                      ? `${entry.admission || entry.srn || ""} · Class ${entry.classNo} ${entry.section || ""}`
                      : entry.role}
                  </small>
                </span>
                <Badge>Approved</Badge>
              </label>
            ))}
            {!source.length && (
              <Empty
                title={`No approved ${kind} cards`}
                text={
                  kind === "student"
                    ? "Approve students in Review submissions."
                    : "Approve staff in the staff directory."
                }
              />
            )}
            {confirmBatch && (
              <Callout icon="print">
                <strong>
                  Send {picked.length} {kind} cards?
                </strong>{" "}
                This saves a print snapshot and uses one round. A submitted
                batch can be deleted until printing begins.
              </Callout>
            )}
          </div>
          <div className="modal-actions">
            <span className="muted">{picked.length} cards selected</span>
            <Button
              variant="secondary"
              onClick={() =>
                confirmBatch ? setConfirmBatch(false) : setCreate(false)
              }
            >
              {confirmBatch ? "Back" : "Cancel"}
            </Button>
            <Button
              disabled={!picked.length || blocked}
              icon="print"
              onClick={() => (confirmBatch ? submit() : setConfirmBatch(true))}
            >
              {confirmBatch ? "Confirm and send to print" : "Review batch"}
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
                    <Icon name={["send", "print", "package", "truck"][i]} />
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
              {canDownload &&
                ["zip", "checklist"].map((format) => (
                  <Button
                    key={format}
                    variant="secondary"
                    icon="download"
                    disabled={
                      !batchRows(detail).length && !detail.staffSnapshot?.length
                    }
                    onClick={() =>
                      exportStudents(
                        [
                          ...batchRows(detail),
                          ...(detail.staffSnapshot || []).map((entry) => ({
                            ...entry,
                            classNo: entry.role,
                            admission: entry.id,
                            status: entry.printStatus,
                          })),
                        ],
                        {
                          ...data.schools.find(
                            (entry) => entry.id === detail.school,
                          ),
                          short: detail.id,
                        },
                        [],
                        format,
                      ).catch(() =>
                        notify("Could not prepare this download.", "error"),
                      )
                    }
                  >
                    {format === "zip"
                      ? "Excel + photos (ZIP)"
                      : "Proof checklist"}
                  </Button>
                ))}

              {canDownload && (
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
              )}
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
            {canProduce &&
            detail.status !== "Cancelled" &&
            (role === "super" ||
              !["ID Studio", "ID Card Studio"].includes(detail.owner)) ? (
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
