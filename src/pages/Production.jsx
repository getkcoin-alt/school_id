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
  DeleteConfirm,
  DateInput,
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
  toDMY,
} from "../lib.js";
import { getFile, putFile, deleteFile } from "../files.js";
function PDFViewer({ file, onClose, notify }) {
  const [url, setURL] = useState("");
  useEffect(() => {
    let alive = true,
      objectURL;
    async function run() {
      try {
        // Live: the PDF is served by the API (signed link, same site).
        if (file.url) {
          if (alive) setURL(file.url);
          return;
        }
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
      subtitle={`${file.pages} pages · School photo collection${file.url ? "" : " · browser-local file"}`}
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
const MAX_PHOTOS = 200,
  MAX_PHOTO_MB = 15;
export function PhotoUploads({ ctx }) {
  const { data, school, update, notify, log, availableSchools, role } = ctx;
  const [tab, setTab] = useState("PDF collections"),
    [file, setFile] = useState(null),
    [pages, setPages] = useState(1),
    [note, setNote] = useState(""),
    [classNo, setClass] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
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
      if (ctx.live) {
        const fullNote = [classNo && `Class ${classNo}`, note.trim()].filter(Boolean).join(" · ");
        await ctx.api.upload("/media/pdfs", { schoolId: school.id, pages: String(+pages), note: fullNote || undefined, files: [file] });
        await ctx.reload().catch(() => {});
        setFile(null);
        setNote("");
        notify(`Photo PDF saved for ${school.name}. The school and ID Studio can now see it.`);
        return;
      }
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
  // Live: files go straight to the server in batches (it resizes each photo for print
  // and links it to the student whose photo number matches the file name).
  const bulkLive = async (files) => {
    const list = [...files];
    if (list.length > MAX_PHOTOS) {
      notify(`Choose up to ${MAX_PHOTOS} photos at a time.`, "error");
      return;
    }
    const types = ["image/jpeg", "image/png", "image/webp"];
    const wrongType = list.filter((f) => !types.includes(f.type));
    const tooBig = list.filter((f) => types.includes(f.type) && f.size > MAX_PHOTO_MB * 1024 * 1024);
    const seen = new Set();
    const ok = list.filter((f) => {
      if (!types.includes(f.type) || f.size > MAX_PHOTO_MB * 1024 * 1024) return false;
      const k = f.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const repeated = list.length - wrongType.length - tooBig.length - ok.length;
    const chunks = [];
    for (const f of ok) {
      const last = chunks[chunks.length - 1];
      if (last && last.files.length < 10 && last.bytes + f.size <= 40 * 1024 * 1024) {
        last.files.push(f);
        last.bytes += f.size;
      } else chunks.push({ files: [f], bytes: f.size });
    }
    setBusy(true);
    const results = [];
    let matched = 0,
      done = 0;
    try {
      for (const c of chunks) {
        setProgress(`Uploading ${done + 1}–${done + c.files.length} of ${ok.length}…`);
        try {
          const r = await ctx.api.upload("/media/photos", { schoolId: school.id, files: c.files });
          results.push(...r.results);
          matched += r.matched || 0;
        } catch (e) {
          results.push(...c.files.map((f) => ({ fileName: f.name, status: "failed", reason: e.message })));
        }
        done += c.files.length;
      }
    } finally {
      setBusy(false);
      setProgress("");
    }
    await ctx.reload().catch(() => {});
    const saved = results.filter((r) => r.status === "saved").length,
      replaced = results.filter((r) => r.status === "replaced").length,
      failed = results.filter((r) => r.status === "failed");
    const parts = [`${saved} photos added`];
    if (replaced) parts.push(`${replaced} replaced (same file name)`);
    if (matched) parts.push(`${matched} linked to students by photo number`);
    if (tooBig.length) parts.push(`${tooBig.length} over ${MAX_PHOTO_MB} MB skipped`);
    if (wrongType.length) parts.push(`${wrongType.length} not JPG/PNG/WebP skipped`);
    if (repeated) parts.push(`${repeated} repeated in the selection skipped`);
    if (failed.length) parts.push(`${failed.length} failed (${[...new Set(failed.map((f) => f.reason))].slice(0, 2).join("; ")})`);
    notify(parts.join("; ") + ".", failed.length || saved + replaced === 0 ? "error" : undefined);
  };
  const bulk = async (files) => {
    if (ctx.live) return bulkLive(files);
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
            {role === "school" && ctx.live ? (
              <Panel
                title="Photo PDFs from your agent"
                subtitle="Your agent or ID Studio uploads these. Open each one, check it, then mark it reviewed."
              >
                <div className="padded">
                  <Callout icon="help">
                    Photo PDFs are uploaded by your agent or ID Studio. They
                    appear in the list below for you to check.
                  </Callout>
                </div>
              </Panel>
            ) : (
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
            )}
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
              {ctx.live ? (
                <Callout icon="help">
                  The PDF is saved for this school and ID Studio is notified.
                  It is a reference copy: photos inside it are not extracted
                  or matched to students automatically. To put photos on
                  cards, use the Photo library tab or each student's record.
                </Callout>
              ) : (
                <Callout icon="help">
                  PDFs are stored in this browser only. Extraction, automatic
                  photo matching, and server uploads are not connected.
                </Callout>
              )}
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
                        <Badge tone={u.status === "Reviewed" ? "green" : u.status === "Rejected" ? "red" : undefined}>
                          {u.status}
                        </Badge>
                      </td>
                      <td>
                        <div className="row-actions">
                          <IconButton
                            icon="eye"
                            label={"Preview " + u.name}
                            onClick={() => setView(u)}
                          />
                          {["school", "super"].includes(role) &&
                            u.status !== "Reviewed" && (
                              <IconButton
                                icon="check"
                                label={"Mark reviewed " + u.name}
                                onClick={() => {
                                  update((d) => ({
                                    ...d,
                                    uploads: d.uploads.map((x) =>
                                      x.id === u.id
                                        ? { ...x, status: "Reviewed" }
                                        : x,
                                    ),
                                  }));
                                  notify(
                                    "Photo collection marked reviewed. Student cards still need individual approval.",
                                  );
                                }}
                              />
                            )}
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
                <strong>{progress || "Add individual photos"}</strong>
                <span>
                  {ctx.live
                    ? `JPG, PNG, WebP · up to ${MAX_PHOTO_MB} MB each · ${MAX_PHOTOS} files at a time · name files by photo number to link them to students`
                    : "JPG, PNG, WebP · up to 500 KB each · 20 files at a time"}
                </span>
                <input
                  type="file"
                  multiple
                  disabled={busy}
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    bulk(e.target.files || []);
                    e.target.value = "";
                  }}
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
                      variant={data.lanyard === d.name ? "soft" : "secondary"}
                      icon={data.lanyard === d.name ? "check" : null}
                      onClick={() => {
                        update((x) => ({ ...x, lanyard: d.name }));
                        notify(`${d.name} selected as the school lanyard.`);
                      }}
                    >
                      {data.lanyard === d.name ? "Selected" : "Choose"}
                    </Button>
                  )}
                  {ctx.live && (role === "super" || (role === "premium" && d.agentId && d.agentId === data.me?.agentId)) && (
                    <IconButton
                      icon="trash"
                      label={"Remove design " + d.name}
                      onClick={() => {
                        if (!window.confirm(`Remove ${d.name} from the collection? Schools using it keep their printed cards.`)) return;
                        ctx.api
                          .del(`/designs/${d.id}`)
                          .then(() => ctx.reload())
                          .then(() => notify(`${d.name} removed.`))
                          .catch((err) => notify(err.message, "error"));
                      }}
                    />
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
            onSubmit={async (e) => {
              e.preventDefault();
              if (!file) {
                notify("Choose a design image first.", "error");
                return;
              }
              if (ctx.live) {
                // Saved on the server so every school of this agent (or all schools, for
                // ID Card Studio designs) can pick it from the collection.
                try {
                  await ctx.api.upload("/designs", {
                    name: draft.name.trim(),
                    kind: draft.kind === "Lanyard" ? "LANYARD" : "ID_CARD",
                    audience: draft.audience.toUpperCase(),
                    color: draft.color,
                    files: [file],
                  });
                  await ctx.reload();
                  setUpload(false);
                  setFile(null);
                  setDraft({ ...draft, name: "" });
                  notify(`${draft.name.trim()} added. ${role === "super" ? "Every school" : "Your schools"} can now choose it.`);
                } catch (err) {
                  notify(err.message, "error");
                }
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
                <span>Up to 5 MB · front preview</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (
                      f.size > 5e6 ||
                      !["image/png", "image/jpeg"].includes(f.type)
                    ) {
                      notify("Choose a PNG or JPG under 5 MB.", "error");
                      return;
                    }
                    setFile(f);
                  }}
                />
              </label>
              <Callout>
                {ctx.live
                  ? role === "super"
                    ? "Designs added by ID Card Studio are available to every school."
                    : "Designs you add are available to all your schools."
                  : "Artwork is available in the gallery. Template field placement and printer output need a connected design editor."}
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
// Schools and batch creators may delete batches that have not started printing.
const BATCH_DELETABLE = ["Submitted", "Cancelled"];
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
    [removeBatch, setRemoveBatch] = useState(null),
    [nextStatus, setNextStatus] = useState(""),
    [tracking, setTracking] = useState(""),
    [carrier, setCarrier] = useState(""),
    [fulfilled, setFulfilled] = useState(""),
    [readySchools, setReadySchools] = useState(null),
    [kind, setKind] = useState("Students"), // a batch holds students or staff, never both
    [rounds, setRounds] = useState(null),
    [confirmBatch, setConfirmBatch] = useState(false);
  // Printing rounds used and left, shown before a batch is sent.
  useEffect(() => {
    if (!create) return;
    setConfirmBatch(false);
    if (live)
      ctx.api
        .get(`/batches/rounds?schoolId=${school.id}`)
        .then(setRounds)
        .catch(() => setRounds(null));
    else {
      const used = (k) => data.batches.filter((b) => b.school === school.id && (k === "student" ? (b.studentIds?.length || !b.staffIds?.length) : b.staffIds?.length) && b.status !== "Cancelled").length;
      setRounds({ session: ctx.session, student: { allowed: school.studentRounds || 0, used: used("student") }, staff: { allowed: school.staffRounds || 0, used: used("staff") } });
    }
  }, [create, school.id]);
  useEffect(() => {
    if (ctx.focus?.name === "createBatch") {
      setCreate(true);
      ctx.clearFocus();
    }
  }, [ctx.focus]);
  const { live } = ctx;
  const canProduce = ["super", "premium"].includes(role);
  const canDownload = role !== "regular" && (!live || ctx.permissions.download);
  const printer = (b) =>
    b.fulfilledBy || (b.owner === "ID Studio" || b.owner === "ID Card Studio" ? "ID Card Studio" : "Agent");
  // Change sheet #10: batch creation lists only schools with cards ready to print.
  useEffect(() => {
    if (!create || role === "school") return;
    if (live)
      ctx.api
        .get("/schools/print-queue")
        .then((r) => setReadySchools(r.items.map((s) => s.id)))
        .catch(() => setReadySchools(null));
    else
      setReadySchools(
        availableSchools
          .filter((sc) => data.students.some((st) => st.school === sc.id && eligible(st)))
          .map((sc) => sc.id),
      );
  }, [create]);
  const pickableSchools = readySchools
    ? availableSchools.filter((s) => readySchools.includes(s.id) || s.id === school.id)
    : availableSchools;
  // Live batches carry their records on the server; load them when opened.
  useEffect(() => {
    if (!live || !detail || detail.snapshot) return;
    ctx.api
      .get(`/batches/${detail.id}`)
      .then((r) => {
        const map = (i) => ({
          ...i,
          id: i.id || i.code,
          classNo: i.className,
          admission: i.admissionNo,
          father: i.fatherName,
          mother: i.motherName,
          photo: i.photoUrl,
        });
        setDetail((d) =>
          d && d.id === r.id
            ? {
                ...d,
                snapshot: r.items.filter((i) => i._kind === "STUDENT").map(map),
                staffSnapshot: r.items.filter((i) => i._kind === "STAFF").map(map),
                orderForms: r.orderForms,
              }
            : d,
        );
      })
      .catch((e) => notify(e.message, "error"));
  }, [detail?.id]);
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
    const chosen = kind === "Students" ? students.filter((s) => selected.includes(s.id)) : [];
    const chosenStaff = kind === "Staff" ? staff.filter((s) => staffIds.includes(s.id)) : [];
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
    setConfirmBatch(false);
    setSelected([]);
    setStaffIds([]);
    setName("");
    notify(`${batch.count} ${kind === "Staff" ? "staff" : "student"} cards sent for printing.`);
  };
  const picked = kind === "Students" ? selected.length : staffIds.length;
  // Round summary: which round this batch uses, and a friendly nudge on the last one.
  const roundInfo = (() => {
    const r = rounds?.[kind === "Students" ? "student" : "staff"];
    const who = kind === "Students" ? "student" : "staff";
    if (!r || !r.allowed) return null;
    const left = r.allowed - r.used;
    const sess = rounds.session ? ` for ${rounds.session}` : "";
    if (left <= 0)
      return role === "super"
        ? { tone: "amber", text: `${school.name} has used all ${r.allowed} ${who} printing rounds${sess}. As super admin you can still send this batch; it will count as an extra round.`, after: `This is an extra round beyond the ${r.allowed} included.` }
        : { tone: "coral", blocked: true, text: `All ${r.allowed} ${who} printing rounds${sess} have been used. Contact ID Card Studio to add another round.` };
    const after = `This uses round ${r.used + 1} of ${r.allowed}${sess}; ${left - 1 === 0 ? "no rounds will be left after it" : `${left - 1} round${left - 1 === 1 ? "" : "s"} will be left`}.`;
    if (left === 1)
      return { tone: "amber", text: `This is the last ${who} printing round${sess}. Include every ${who === "student" ? "student" : "staff member"} you can. Once it is used, more cards need a new round from ID Card Studio.`, after };
    return { tone: "blue", text: `${r.used} of ${r.allowed} ${who} printing rounds used${sess}. ${after}`, after };
  })();
  const visibleBatches = batches.filter(
    (b) =>
      (!batchStatus || b.status === batchStatus) &&
      (!fulfilled || printer(b) === fulfilled) &&
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
          ["Submitted", "inbox"],
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
                : s === "Submitted"
                  ? "Waiting for the printer"
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
          <select
            aria-label="Filter by who prints"
            value={fulfilled}
            onChange={(e) => setFulfilled(e.target.value)}
          >
            <option value="">Fulfilled by: anyone</option>
            <option>ID Card Studio</option>
            <option>Agent</option>
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>BATCH</th>
                <th>SCHOOL</th>
                <th>TYPE</th>
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
                      {b.code || b.id} · {fmtDate(b.date)}
                    </small>
                  </td>
                  <td>{data.schools.find((s) => s.id === b.school)?.name}</td>
                  <td>
                    <Badge tone={(b.kind || (b.staffIds?.length && !b.studentIds?.length ? "Staff" : "Students")) === "Staff" ? "purple" : "blue"}>
                      {b.kind || (b.staffIds?.length && !b.studentIds?.length ? "Staff" : "Students")}
                    </Badge>
                  </td>
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
                          if (live) {
                            if (!canDownload) {
                              notify("Your plan does not include downloads.", "error");
                              return;
                            }
                            ctx.download(`/batches/${b.id}/download.zip`, `${b.code || b.id}.zip`);
                            return;
                          }
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
                      {ctx.live && (role === "super" || BATCH_DELETABLE.includes(b.status)) && (
                        <IconButton
                          icon="trash"
                          label={"Delete batch " + (b.code || b.id)}
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
      <Callout icon="shield">
        Only approved, active records with photos can enter a new batch. Editing
        an approved student returns the record to review. Printed output in this
        preview is a sample card proof.
      </Callout>
      <OrderForms ctx={ctx} />
      {create && (
        <Modal
          wide
          title="Create a print batch"
          subtitle={`${school.name} · choose students or staff, then review before sending`}
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
                  {pickableSchools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {readySchools && !readySchools.length && role !== "school" && (
              <Callout>No school has approved cards waiting for print.</Callout>
            )}
            <Field label="Batch name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Class 6 · November collection"
              />
            </Field>
            <div className="segmented batch-kind" role="tablist" aria-label="Batch type">
              {["Students", "Staff"].map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={kind === k}
                  className={kind === k ? "active" : ""}
                  onClick={() => {
                    setKind(k);
                    setSelected([]);
                    setStaffIds([]);
                    setConfirmBatch(false);
                  }}
                >
                  {k === "Students" ? `Student cards (${students.length})` : `Staff cards (${staff.length})`}
                </button>
              ))}
            </div>
            <p className="muted small-note">A batch holds either students or staff. Make a separate batch for each.</p>
            {roundInfo && (
              <Callout icon={roundInfo.tone === "coral" ? "alert" : "calendar"} tone={roundInfo.tone}>
                {roundInfo.text}
              </Callout>
            )}
            <div className="print-select-head">
              <strong>{kind === "Students" ? "Approved students" : "Approved staff"}</strong>
              <Button
                variant="text"
                onClick={() =>
                  kind === "Students"
                    ? setSelected(selected.length === students.length ? [] : students.map((s) => s.id))
                    : setStaffIds(staffIds.length === staff.length ? [] : staff.map((s) => s.id))
                }
              >
                {(kind === "Students" ? selected.length === students.length && students.length : staffIds.length === staff.length && staff.length) ? "Clear" : "Select all"}
              </Button>
            </div>
            {kind === "Students" &&
              students.map((s) => (
                <label className="print-select-row" key={s.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(s.id)}
                    onChange={() => setSelected(selected.includes(s.id) ? selected.filter((id) => id !== s.id) : [...selected, s.id])}
                  />
                  <Avatar name={s.name} />
                  <span>
                    <strong>{s.name}</strong>
                    <small>
                      {s.admission ? `${s.admission} · ` : ""}Class {s.classNo} {s.section}
                    </small>
                  </span>
                  <Badge>Approved</Badge>
                </label>
              ))}
            {kind === "Staff" &&
              staff.map((s) => (
                <label className="print-select-row" key={s.id}>
                  <input
                    type="checkbox"
                    checked={staffIds.includes(s.id)}
                    onChange={() => setStaffIds(staffIds.includes(s.id) ? staffIds.filter((id) => id !== s.id) : [...staffIds, s.id])}
                  />
                  <Avatar name={s.name} />
                  <span>
                    <strong>{s.name}</strong>
                    <small>{s.role}</small>
                  </span>
                  <Badge>Approved</Badge>
                </label>
              ))}
            {(kind === "Students" ? !students.length : !staff.length) && (
              <Empty
                title={`No approved ${kind === "Students" ? "student" : "staff"} cards`}
                text={kind === "Students" ? "Approve students in Review submissions first." : "Approve staff from the staff directory first."}
              />
            )}
            {confirmBatch && (
              <div className="batch-confirm">
                <strong>Before you send {picked} {kind === "Students" ? "student" : "staff"} card{picked === 1 ? "" : "s"} to print</strong>
                <ul>
                  <li>
                    The cards are locked as <b>Submitted for print</b>. Changing a student or staff record afterwards will not change the printed card.
                  </li>
                  {roundInfo?.after && <li>{roundInfo.after}</li>}
                  <li>The printer is notified and you can follow the batch on this page until it is delivered.</li>
                  <li>Until printing starts you can still delete the batch; the cards then go back to Approved.</li>
                </ul>
              </div>
            )}
          </div>
          <div className="modal-actions">
            <span className="muted">{picked} cards selected</span>
            <Button
              variant="secondary"
              onClick={() => (confirmBatch ? setConfirmBatch(false) : setCreate(false))}
            >
              {confirmBatch ? "Back" : "Cancel"}
            </Button>
            {confirmBatch ? (
              <Button icon="print" onClick={submit}>
                Confirm and send to print
              </Button>
            ) : (
              <Button disabled={!picked || roundInfo?.blocked} icon="print" onClick={() => setConfirmBatch(true)}>
                Review and send
              </Button>
            )}
          </div>
        </Modal>
      )}
      {removeBatch && (
        <DeleteConfirm
          ctx={ctx}
          path={`/batches/${removeBatch.id}`}
          title={`Delete batch ${removeBatch.code || removeBatch.id}?`}
          subtitle={`${data.schools.find((s) => s.id === removeBatch.school)?.name || ""} · ${removeBatch.count} cards · ${removeBatch.status}`}
          deleteLabel="Delete batch"
          doneText={`Batch ${removeBatch.code || removeBatch.id} deleted.`}
          onClose={() => setRemoveBatch(null)}
        />
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
                    <Icon name={["inbox", "print", "package", "truck"][i]} />
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
              {live && canDownload && (
                <>
                  <Button
                    icon="download"
                    onClick={() => ctx.download(`/batches/${detail.id}/download.zip`, `${detail.code}.zip`)}
                  >
                    Excel + photos (ZIP)
                  </Button>
                  <Button
                    variant="secondary"
                    icon="fileDown"
                    onClick={() => ctx.download(`/batches/${detail.id}/proof.pdf`, `${detail.code}-proof.pdf`)}
                  >
                    Proof checklist
                  </Button>
                </>
              )}
              {!live && canDownload && (
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
            {!live && !batchRows(detail).length && !detail.staffSnapshot?.length && (
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
                          STAGES.indexOf(s) >= STAGES.indexOf(detail.status) - 1,
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
                    notify(live ? `${detail.code || detail.id} is now ${nextStatus.toLowerCase()}. The school has been notified.` : "Production status updated across the preview.");
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

/** Change sheet #6: every panel can upload a school's order form. */
// The CtC Id Solutions order form, as sections of fields. "choice" fields are radio buttons.
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
      ["emailPrint", "Print email on card", ["Yes", "No"]],
      ["website", "Website"],
      ["websitePrint", "Print website on card", ["Yes", "No"]],
    ],
  },
  {
    title: "Card",
    fields: [
      ["design", "Design", ["Same as last year", "Changes in old design", "New design"]],
      ["schoolLogo", "School logo", ["Same as last year", "New logo attached"]],
      ["cardType", "Card type", ["PVC card", "Laminated card", "Card with holder"]],
      ["issuingAuthority", "Issuing authority on card", ["Principal", "Director", "Manager", "None"]],
      ["signature", "Signature", ["Printed on card", "Not required"]],
      ["attachment", "Attachment", ["Excel sheet", "Photos", "Excel & photos", "Old card sample"]],
    ],
  },
  {
    title: "Lanyard (dori)",
    fields: [
      ["doriType", "Dori type", ["Plain", "Printed", "Not required"]],
      ["doriColour", "Dori colour"],
      ["printOnDories", "Print on dories"],
      ["doriCount", "No. of dories", "number"],
    ],
  },
  {
    title: "Card holder",
    fields: [
      ["holderOrientation", "Holder", ["Vertical", "Horizontal", "Not required"]],
      ["holderSticky", "Sticky", ["Yes", "No"]],
      ["holderSides", "Sides", ["Single side", "Both sides"]],
      ["holderSize", "Size"],
    ],
  },
  {
    title: "Rates & contacts",
    fields: [
      ["rate", "Rate per card (₹)", "number"],
      ["advance", "Advance (₹)", "number"],
      ["extraDoriRate", "Extra dori rate (₹)", "number"],
      ["staffName", "Our staff name"],
      ["staffContact", "Our staff contact", "tel"],
      ["authName", "School authority name"],
      ["authDesignation", "Designation"],
      ["authContact", "Authority contact", "tel"],
      ["remarks", "Remarks", "wide"],
    ],
  },
];

const formValue = (v) => (v === true ? "Yes" : v === false ? "No" : v == null || v === "" ? "—" : String(v));

function printOrderForm(f) {
  const d = f.details || {};
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const body = ORDER_SECTIONS.map(
    (s) =>
      `<h2>${esc(s.title)}</h2><table>${s.fields
        .map(([k, l, t]) => `<tr><th>${esc(l)}</th><td>${esc(t === "date" && d[k] ? toDMY(d[k]) : formValue(d[k]))}</td></tr>`)
        .join("")}</table>`,
  ).join("");
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Order form · ${esc(f.schoolName)}</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:32px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:20px 0 6px;border-bottom:1px solid #999}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #ddd;vertical-align:top}th{width:40%;font-weight:600}p{color:#555;margin:0}</style></head><body><h1>CtC Id Solutions · ID card order form</h1><p>${esc(f.schoolName)}${f.note ? " · " + esc(f.note) : ""}</p>${body}<script>window.onload=()=>window.print()</script></body></html>`,
  );
  w.document.close();
}

function OrderFormEditor({ ctx, form, schools, onClose }) {
  const { live, notify, update } = ctx;
  const first = form?.schoolId || ctx.school.id;
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
  const [d, setD] = useState(form?.details || prefill(first));
  const [note, setNote] = useState(form?.note || "");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const save = async (e) => {
    e.preventDefault();
    if (file && file.size > 10 * 1024 * 1024) return notify("The scan must be under 10 MB.", "error");
    const details = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== "" && v != null).map(([k, v]) => [k, String(v)]));
    setBusy(true);
    try {
      if (live) {
        if (form) await ctx.api.patch(`/media/order-forms/${form.id}`, { details, note });
        else await ctx.api.upload("/media/order-forms", { schoolId, details: JSON.stringify(details), ...(note ? { note } : {}), ...(file ? { file } : {}) });
        await ctx.reload();
      } else
        update((data) => ({
          ...data,
          orderForms: form
            ? (data.orderForms || []).map((f) => (f.id === form.id ? { ...f, details, note } : f))
            : [{ id: uid("OF"), school: schoolId, schoolId, schoolName: schoolOf(schoolId)?.name, fileName: file?.name || null, details, note, createdAt: new Date().toISOString() }, ...(data.orderForms || [])],
        }));
      notify(form ? "Order form updated." : `Order form saved. ${schoolOf(schoolId)?.name || "The school"} can now see it.`);
      onClose();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal wide title={form ? "Edit order form" : "New order form"} subtitle="CtC Id Solutions ID card order form. The school sees it read-only." onClose={onClose}>
      <form onSubmit={save} className="order-form">
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
            <Field label="Signed scan (optional)" hint="PDF or photo of the signed paper form">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </Field>
          )}
        </div>
        {ORDER_SECTIONS.map((sec) => (
          <fieldset key={sec.title} className="order-section">
            <legend>{sec.title}</legend>
            <div className="form-grid">
              {sec.fields.map(([k, l, t, req]) =>
                Array.isArray(t) ? (
                  <div key={k} className="field choice-field">
                    <span className="field-label">{l}</span>
                    <div className="choice-row" role="radiogroup" aria-label={l}>
                      {t.map((o) => (
                        <label key={o} className={`choice ${d[k] === o ? "on" : ""}`}>
                          <input type="radio" name={k} checked={d[k] === o} onChange={() => set(k, o)} />
                          {o}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : t === "date" ? (
                  <Field key={k} label={l}>
                    <DateInput value={d[k] || ""} onChange={(v) => set(k, v)} />
                  </Field>
                ) : (
                  <Field key={k} label={l} required={req} className={t === "wide" ? "span-2" : undefined}>
                    {t === "wide" ? (
                      <textarea rows="2" maxLength="500" value={d[k] || ""} onChange={(e) => set(k, e.target.value)} />
                    ) : (
                      <input required={req} type={t === "number" ? "number" : t === "email" ? "email" : t === "tel" ? "tel" : "text"} min={t === "number" ? "0" : undefined} maxLength="200" value={d[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
                    )}
                  </Field>
                ),
              )}
            </div>
          </fieldset>
        ))}
        <Field label="Internal note (optional)">
          <input maxLength="500" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
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

function OrderFormView({ form, onClose }) {
  const d = form.details || {};
  return (
    <Modal wide title={`Order form · ${form.schoolName}`} subtitle={`Filled on ${fmtDate(form.createdAt)}${form.note ? " · " + form.note : ""}`} onClose={onClose}>
      {!form.details && <p className="muted">This order form is a scanned file only.</p>}
      {form.details &&
        ORDER_SECTIONS.map((sec) => (
          <div key={sec.title} className="order-view">
            <h3>{sec.title}</h3>
            <dl>
              {sec.fields.map(([k, l, t]) => (
                <React.Fragment key={k}>
                  <dt>{l}</dt>
                  <dd>{t === "date" && d[k] ? toDMY(d[k]) : formValue(d[k])}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        ))}
      <div className="modal-actions">
        {form.url && (
          <a className="btn secondary" href={form.url} target="_blank" rel="noreferrer">
            <Icon name="download" size={15} /> Signed scan
          </a>
        )}
        {form.details && (
          <Button variant="secondary" onClick={() => printOrderForm(form)}>
            <Icon name="print" size={15} /> Print
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

function OrderForms({ ctx }) {
  const { live, school, data, notify, update, role } = ctx;
  const canManage = role !== "school"; // super admin and agents fill in, edit and delete order forms
  const schools = ctx.availableSchools || data.schools;
  const [edit, setEdit] = useState(null); // null | "new" | form
  const [view, setView] = useState(null);
  const forms = (data.orderForms || []).filter((f) => (role === "school" ? (f.schoolId || f.school) === school.id : true));
  const remove = async (f) => {
    if (!window.confirm(`Delete the order form for ${f.schoolName}? This cannot be undone.`)) return;
    try {
      if (live) {
        await ctx.api.del(`/media/order-forms/${f.id}`);
        await ctx.reload();
      } else update((d) => ({ ...d, orderForms: (d.orderForms || []).filter((x) => x.id !== f.id) }));
      notify("Order form deleted.");
    } catch (e) {
      notify(e.message, "error");
    }
  };
  return (
    <Panel
      title="Order forms"
      subtitle={canManage ? "Fill in the CtC order form for a school. The school sees it but cannot change or delete it." : `Order forms filled in for ${school.name} by your agent.`}
      action={
        canManage && (
          <Button onClick={() => setEdit("new")}>
            <Icon name="plus" size={15} /> New order form
          </Button>
        )
      }
    >
      {forms.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SCHOOL</th>
                <th>CARD</th>
                <th>DORI</th>
                <th>DATE</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => (
                <tr key={f.id}>
                  <td>
                    <button type="button" className="link-btn" onClick={() => setView(f)}>
                      {f.schoolName}
                    </button>
                    {f.note && <small className="block muted">{f.note}</small>}
                  </td>
                  <td>{f.details?.cardType || (f.fileName ? "Scan only" : "—")}</td>
                  <td>{f.details?.doriType ? `${f.details.doriType}${f.details.doriCount ? " · " + f.details.doriCount : ""}` : "—"}</td>
                  <td>{f.details?.date ? toDMY(f.details.date) : fmtDate(f.createdAt)}</td>
                  <td className="row-actions">
                    <IconButton icon="eye" label="View order form" onClick={() => setView(f)} />
                    {canManage && f.details && <IconButton icon="edit" label="Edit order form" onClick={() => setEdit(f)} />}
                    {canManage && <IconButton icon="trash" label="Delete order form" onClick={() => remove(f)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No order forms yet" text={canManage ? "Use New order form to fill in the CtC order form for a school." : "Your agent will add the order form here."} />
      )}
      {edit && <OrderFormEditor ctx={ctx} schools={schools} form={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {view && <OrderFormView form={view} onClose={() => setView(null)} />}
    </Panel>
  );
}
