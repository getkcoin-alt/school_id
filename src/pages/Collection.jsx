import React, { useState } from "react";
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
} from "../components.jsx";
import {
  studentLink,
  uid,
  fmtDate,
  approvalError,
  schoolFields,
  cardRecord,
  schoolExtras,
  approvedStudent,
  isNotSubmitted,
} from "../lib.js";
import { StudentEditor } from "./Students.jsx";
export function Invitations({ ctx }) {
  const { schoolStudents, data, update, notify, go, school, log } = ctx;
  const [query, setQuery] = useState(""),
    [classNo, setClass] = useState(""),
    [selected, setSelected] = useState([]),
    [compose, setCompose] = useState(false),
    [sent, setSent] = useState(null),
    [subject, setSubject] = useState(
      `${school.name} — complete your school ID details`,
    ),
    [message, setMessage] = useState(
      "Your new school ID starts here. Please check your details, take a clear live photo, and submit your form for school approval.",
    ),
    [outbox, setOutbox] = useState(false);
  const rows = schoolStudents.filter(
    (s) =>
      s.active &&
      (!classNo || s.classNo === classNo) &&
      `${s.name} ${s.email}`.toLowerCase().includes(query.toLowerCase()),
  );
  const toSend = schoolStudents.filter(
    (s) =>
      selected.includes(s.id) &&
      s.active &&
      s.email &&
      !["In review", "Approved", "Submitted for print"].includes(s.status),
  );
  const toggle = (id) =>
    setSelected(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  const selectable = rows.filter(
    (s) =>
      s.email &&
      !["In review", "Approved", "Submitted for print"].includes(s.status),
  );
  const all =
    selectable.length > 0 && selectable.every((s) => selected.includes(s.id));
  const send = () => {
    const now = new Date().toISOString();
    update((d) =>
      log(
        {
          ...d,
          students: d.students.map((s) =>
            toSend.some((t) => t.id === s.id)
              ? {
                  ...s,
                  status:
                    s.status === "Changes requested"
                      ? "Changes requested"
                      : "Invited",
                  invitedAt: now,
                }
              : s,
          ),
          outbox: [
            ...toSend.map((s) => ({
              id: uid("MAIL"),
              school: school.id,
              student: s.id,
              to: s.email,
              subject,
              message,
              link: studentLink(s.id),
              date: now,
              status: "Simulated",
            })),
            ...d.outbox,
          ],
        },
        `Prepared ${toSend.length} student invitation emails`,
        "email",
      ),
    );
    setSent(toSend);
    setCompose(false);
    setSelected([]);
    notify(
      `${toSend.length} invitation emails added to the demo outbox. No real emails were sent.`,
    );
  };
  return (
    <>
      <PageTitle
        eyebrow="COLLECT, WITHOUT THE CHASING"
        title="A personal link for every student."
        description="Use contacts already held by your school. Students fill in their details; you stay in control."
      >
        <Button
          variant="secondary"
          icon="inbox"
          onClick={() => setOutbox(true)}
        >
          Demo outbox{" "}
          <span className="count-pill">
            {data.outbox.filter((m) => m.school === school.id).length}
          </span>
        </Button>
        <Button
          icon="send"
          disabled={!toSend.length}
          onClick={() => setCompose(true)}
        >
          Invite {toSend.length || "selected"} students
        </Button>
      </PageTitle>
      <div className="channel-grid">
        <div className="channel active">
          <span className="channel-icon">
            <Icon name="email" />
          </span>
          <div>
            <strong>Email invitations</strong>
            <p>Personal links using existing school contacts</p>
          </div>
          <Badge tone="green">Available in preview</Badge>
        </div>
        <div className="channel future">
          <span className="channel-icon">
            <Icon name="send" />
          </span>
          <div>
            <strong>WhatsApp invitations</strong>
            <p>The same easy flow, on WhatsApp</p>
          </div>
          <Badge>Phase 2</Badge>
        </div>
      </div>
      <Callout icon="shield">
        This frontend preview prepares sample emails and opens the student form.
        Real email delivery, one-time links, OTP verification, and identity
        checks need backend integration.
      </Callout>
      <Panel
        title="Your invitation list"
        subtitle="Select students who still need to submit their details."
        action={
          <Button variant="text" icon="plus" onClick={() => go("students")}>
            Add or import contacts
          </Button>
        }
      >
        <div className="table-toolbar">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search students or email"
          />
          <select
            aria-label="Filter invitations by class"
            value={classNo}
            onChange={(e) => setClass(e.target.value)}
          >
            <option value="">All classes</option>
            {data.classes.map((c) => (
              <option key={c} value={c}>
                Class {c}
              </option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table className="phone-records">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select eligible invitations"
                    checked={all}
                    onChange={() =>
                      setSelected(
                        all
                          ? selected.filter(
                              (id) => !selectable.some((s) => s.id === id),
                            )
                          : [
                              ...new Set([
                                ...selected,
                                ...selectable.map((s) => s.id),
                              ]),
                            ],
                      )
                    }
                  />
                </th>
                <th>STUDENT</th>
                <th>CLASS</th>
                <th>EMAIL ADDRESS</th>
                <th>STATUS</th>
                <th>PERSONAL LINK</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="phone-record-select">
                    <input
                      type="checkbox"
                      aria-label={"Invite " + s.name}
                      disabled={
                        !s.email ||
                        [
                          "In review",
                          "Approved",
                          "Submitted for print",
                        ].includes(s.status)
                      }
                      checked={selected.includes(s.id)}
                      onChange={() => toggle(s.id)}
                    />
                  </td>
                  <td className="phone-record-title">
                    <div className="person-cell">
                      <Avatar name={s.name} />
                      <div>
                        <strong>{s.name}</strong>
                        <small>{s.admission}</small>
                      </div>
                    </div>
                  </td>
                  <td data-label="CLASS">
                    {s.classNo} – {s.section}
                  </td>
                  <td data-label="EMAIL ADDRESS">
                    {s.email || "Email needed to send"}
                  </td>
                  <td data-label="STATUS">
                    <Badge>{s.status}</Badge>
                  </td>
                  <td className="phone-record-actions">
                    <div className="row-actions">
                      <IconButton
                        icon="copy"
                        label={"Copy invitation for " + s.name}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              studentLink(s.id),
                            );
                            notify("Demo invitation link copied.");
                          } catch {
                            notify(
                              "Clipboard unavailable. Open the link and copy its address.",
                              "error",
                            );
                          }
                        }}
                      />
                      <a
                        className="icon-btn"
                        href={studentLink(s.id)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={"Preview student link for " + s.name}
                        title="Open student link"
                      >
                        <Icon name="external" size={17} />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Empty
            title="No students found"
            text="Import your existing contacts from the Students page."
          />
        )}
        <div className="table-note">
          <Icon name="help" size={15} />
          Already submitted students are excluded from new invitations. Use
          reminders for pending forms.
        </div>
      </Panel>
      {compose && (
        <Modal
          title="Review your invitation email"
          subtitle={`${toSend.length} recipients · Each email gets a unique demo student link.`}
          onClose={() => setCompose(false)}
        >
          <div className="modal-body">
            <Field label="Subject">
              <input
                value={subject}
                required
                onChange={(e) => setSubject(e.target.value)}
              />
            </Field>
            <Field label="Message">
              <textarea
                rows="4"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>
            <div className="email-preview">
              <div>
                <Icon name="email" />
                <span>EMAIL PREVIEW</span>
              </div>
              <h3>Hello {toSend[0]?.name.split(" ")[0]},</h3>
              <p>{message}</p>
              <span className="email-cta">
                Complete my school ID <Icon name="arrow" size={14} />
              </span>
              <p className="muted">
                {school.name}
                <br />
                Your school reviews the details before printing.
              </p>
            </div>
            <Callout icon="inbox">
              Demo only. Emails are saved to the preview outbox and are not
              delivered to recipients.
            </Callout>
          </div>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setCompose(false)}>
              Cancel
            </Button>
            <Button
              disabled={!subject.trim() || !message.trim()}
              icon="send"
              onClick={send}
            >
              Simulate email invitations
            </Button>
          </div>
        </Modal>
      )}
      {sent && (
        <Modal
          title="Your invitations are ready."
          subtitle="Explore exactly what your students will see."
          onClose={() => setSent(null)}
        >
          <div className="modal-body">
            <div className="success-circle">
              <Icon name="check" size={30} />
            </div>
            <h3 className="centered">{sent.length} sample emails prepared</h3>
            <p className="centered muted">
              The demo outbox contains every personal link. No external messages
              were sent.
            </p>
            {sent.slice(0, 3).map((s) => (
              <a
                className="link-row"
                key={s.id}
                href={studentLink(s.id)}
                target="_blank"
                rel="noreferrer"
              >
                <Avatar name={s.name} />
                <span>Open {s.name.split(" ")[0]}’s form</span>
                <Icon name="external" size={16} />
              </a>
            ))}
          </div>
          <div className="modal-actions">
            <Button
              onClick={() => {
                setSent(null);
                setOutbox(true);
              }}
            >
              View demo outbox
            </Button>
          </div>
        </Modal>
      )}
      {outbox && (
        <Modal
          wide
          title="Demo email outbox"
          subtitle="Locally saved invitation previews. No email delivery has occurred."
          onClose={() => setOutbox(false)}
        >
          <div className="modal-body">
            {data.outbox.filter((m) => m.school === school.id).length ? (
              data.outbox
                .filter((m) => m.school === school.id)
                .map((m) => (
                  <div className="outbox-item" key={m.id}>
                    <div>
                      <Badge tone="blue">Simulated email</Badge>
                      <small>{fmtDate(m.date)}</small>
                    </div>
                    <h3>{m.subject}</h3>
                    <p>To: {m.to}</p>
                    <p>{m.message}</p>
                    <a href={m.link} target="_blank" rel="noreferrer">
                      Open personal student link{" "}
                      <Icon name="external" size={13} />
                    </a>
                  </div>
                ))
            ) : (
              <Empty
                title="Your outbox is empty"
                text="Select students and simulate your first invitation."
              />
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
export function ReviewQueue({ ctx }) {
  const {
    data,
    update,
    notify,
    school,
    schoolStudents,
    go,
    log,
    role,
    availableSchools,
    setSchoolId,
  } = ctx;
  const [tab, setTab] = useState(() => {
      const record = schoolStudents.find((s) => s.id === ctx.reviewRecord);
      if (!record) return "In review";
      return isNotSubmitted(record) ? "Not submitted" : record.status;
    }),
    [query, setQuery] = useState(""),
    [chosen, setChosen] = useState(ctx.reviewRecord),
    [reason, setReason] = useState(""),
    [edit, setEdit] = useState(null),
    [rejection, setRejection] = useState(false);
  const canReview = ["school", "super"].includes(role);
  const matchesTab = (student, value) =>
    value === "Not submitted"
      ? isNotSubmitted(student)
      : student.status === value;
  const list = schoolStudents.filter(
    (s) =>
      matchesTab(s, tab) &&
      `${s.name} ${s.admission}`.toLowerCase().includes(query.toLowerCase()),
  );
  const current = chosen ? list.find((s) => s.id === chosen) : list[0];
  const phoneDetail =
    ctx.phoneView && list.some((student) => student.id === chosen);
  const approve = () => {
    if (!current || !canReview) return;
    const fields = schoolFields(data, school.id);
    const error = approvalError(current, fields, schoolExtras(data, school.id));
    if (error) {
      notify(error, "error");
      return;
    }
    const approved = approvedStudent(current);
    update((d) =>
      log(
        {
          ...d,
          students: d.students.map((s) => (s.id === current.id ? approved : s)),
        },
        `School approved ${current.name} for printing`,
        "review",
      ),
    );
    setChosen(null);
    notify(`${current.name} is approved and ready for printing.`);
  };
  const request = () => {
    if (!canReview || !current || isNotSubmitted(current) || !reason.trim())
      return;
    update((d) =>
      log(
        {
          ...d,
          students: d.students.map((s) =>
            s.id === current.id
              ? { ...s, status: "Changes requested", note: reason }
              : s,
          ),
        },
        `Requested corrections from ${current.name}`,
        "review",
      ),
    );
    setReason("");
    setRejection(false);
    setChosen(null);
    notify("Correction request saved. The student can update the same form.");
  };
  return (
    <>
      <PageTitle
        eyebrow="THE SCHOOL HAS THE FINAL SAY"
        title="A quick review. A better ID."
        description="Check every detail and photo before approving a card for printing."
      >
        <Button variant="secondary" icon="print" onClick={() => go("printing")}>
          Go to print queue
        </Button>
      </PageTitle>
      {role !== "school" && (
        <div className="school-context-picker">
          <Icon name="school" />
          <select
            aria-label="School to review"
            value={school.id}
            onChange={(e) => {
              setSchoolId(e.target.value);
              setChosen(null);
            }}
          >
            {availableSchools.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="review-tabs">
        {["In review", "Not submitted", "Approved", "Changes requested"].map(
          (t) => (
            <button
              className={t === tab ? "active" : ""}
              key={t}
              onClick={() => {
                setTab(t);
                setChosen(null);
              }}
            >
              {t}
              <span>
                {schoolStudents.filter((s) => matchesTab(s, t)).length}
              </span>
            </button>
          ),
        )}
      </div>
      {tab === "Not submitted" && (
        <Callout icon="review">
          Open a draft or invited student to add any missing details and a
          photo. School admins can approve the card here or in the student
          directory.
        </Callout>
      )}
      <div
        className={`review-layout ${phoneDetail ? "phone-review-detail" : "phone-review-list"}`}
      >
        <Panel className="review-list">
          <div className="padded">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Find a student"
            />
          </div>
          {list.map((s) => (
            <button
              className={`review-person ${current?.id === s.id ? "active" : ""}`}
              key={s.id}
              onClick={() => {
                setChosen(s.id);
                setRejection(false);
                if (ctx.phoneView) window.scrollTo(0, 0);
              }}
            >
              <Avatar name={s.name} photo={s.photo} size={42} />
              <div>
                <strong>{s.name}</strong>
                <small>
                  Class {s.classNo} – {s.section} · {s.admission}
                </small>
              </div>
              <Icon name="chevron" size={15} />
            </button>
          ))}
          {!list.length && (
            <Empty title="All clear here" text="No students match this view." />
          )}
        </Panel>
        <Panel className="review-detail">
          {phoneDetail && (
            <button
              className="phone-review-back"
              onClick={() => setChosen(null)}
            >
              <Icon name="back" size={18} /> All submissions
            </button>
          )}
          {current && list.some((s) => s.id === current.id) ? (
            <>
              <div className="panel-header">
                <div>
                  <h2>{current.name}</h2>
                  <p>
                    {current.id} · {school.name}
                  </p>
                </div>
                <Badge>{current.status}</Badge>
              </div>
              <div className="review-content">
                <div className="review-card">
                  <CardPreview
                    student={cardRecord(data, school.id, current)}
                    school={school}
                    design={ctx.design}
                  />
                  <span className="preview-caption">
                    <Icon name="eye" size={14} />
                    Live card preview
                  </span>
                </div>
                <div className="review-facts">
                  <div className="review-photo-meta">
                    <Icon name="camera" />
                    <div>
                      <strong>
                        {current.photoSource === "Live camera"
                          ? "Live camera photo"
                          : current.photoSource === "Demo capture"
                            ? "Demo camera photo"
                            : "Sample / uploaded photo"}
                      </strong>
                      <p>
                        {current.captureAt
                          ? new Date(current.captureAt).toLocaleString()
                          : current.photo
                            ? current.photoSource || "Sample photo"
                            : "No photo added"}
                      </p>
                    </div>
                    <Badge
                      tone={
                        current.photoSource === "Live camera" ? "green" : "gray"
                      }
                    >
                      {current.photoSource === "Live camera"
                        ? "Captured"
                        : "Preview"}
                    </Badge>
                  </div>
                  <dl className="details-list">
                    {schoolFields(data, school.id)
                      .filter(([key]) => current[key])
                      .map(([key, label]) => (
                        <div key={key}>
                          <dt>{label}</dt>
                          <dd>{current[key]}</dd>
                        </div>
                      ))}
                    {schoolExtras(data, school.id).map((f) => (
                      <div key={f.id}>
                        <dt>{f.name}</dt>
                        <dd>{current.custom?.[f.id] || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
              <div className="review-bottom">
                <Callout icon="shield">
                  A camera photo alone does not prove identity. Compare it with
                  the school’s record. Automated liveness and identity
                  verification are not connected in this preview.
                </Callout>
                {current.note && (
                  <Callout tone="amber">
                    Correction requested: {current.note}
                  </Callout>
                )}
                {rejection ? (
                  <div className="correction-form">
                    <Field label="What should the student correct?" required>
                      <textarea
                        rows="3"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Be specific, e.g. retake the photo with your face centered."
                      />
                    </Field>
                    <div className="button-row">
                      <Button
                        variant="secondary"
                        onClick={() => setRejection(false)}
                      >
                        Cancel
                      </Button>
                      <Button disabled={!reason.trim()} onClick={request}>
                        Request correction
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="review-actions">
                    {canReview && (
                      <Button
                        variant="secondary"
                        icon="edit"
                        onClick={() => setEdit(current)}
                      >
                        Edit manually
                      </Button>
                    )}
                    {canReview && current.status !== "Approved" && (
                      <>
                        {!isNotSubmitted(current) && (
                          <Button
                            variant="secondary"
                            icon="refresh"
                            onClick={() => setRejection(true)}
                          >
                            Request changes
                          </Button>
                        )}
                        <Button icon="check" onClick={approve}>
                          Approve for printing
                        </Button>
                      </>
                    )}
                    {current.status === "Approved" && (
                      <Button icon="print" onClick={() => go("printing")}>
                        Continue to printing
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <Empty
              title="You’re all caught up."
              text="New student submissions will appear here for your review."
              action={
                <Button
                  variant="secondary"
                  icon="email"
                  onClick={() => go("invitations")}
                >
                  Check invitations
                </Button>
              }
            />
          )}
        </Panel>
      </div>
      {edit && (
        <StudentEditor
          ctx={ctx}
          student={edit}
          onClose={() => setEdit(null)}
          onSaved={(saved) => {
            if (saved.status === "Approved") setChosen(null);
          }}
        />
      )}
    </>
  );
}
