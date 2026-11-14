import React, { useState } from "react";
import { STATES, citiesOf } from "../india.js";
import { FIELDS, STAFF_FIELDS, personIcon } from "../data.js";
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
  ExtraField,
  Callout,
  Empty,
} from "../components.jsx";
import {
  uid,
  fmtDate,
  exportCSV,
  download,
  csvText,
  lockedFields,
  schoolFields,
  schoolExtras,
  validateExtras,
  validateStudent,
  sessionsFor,
  normaliseSession,
  sessionDates,
  nextSession,
} from "../lib.js";
import { deleteFiles } from "../files.js";

function workspaceLink(ctx, params) {
  return `${ctx.phoneView ? "/app" : "/"}?${new URLSearchParams(params)}`;
}

function SetupAccess({ ctx, account, collection, onClose }) {
  const label = account.setupAt ? "Resend setup email" : "Send setup email";
  return (
    <Modal title={label} subtitle={account.email} onClose={onClose}>
      <div className="modal-body">
        <Callout icon="lock">
          This demo records the setup request in Activity. Live accounts and
          email delivery require the connected service.
        </Callout>
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          icon="email"
          onClick={() => {
            const setupAt = new Date().toISOString();
            ctx.update((d) =>
              ctx.log(
                {
                  ...d,
                  [collection]: d[collection].map((record) =>
                    record.id === account.id ? { ...record, setupAt } : record,
                  ),
                },
                `Simulated ${account.setupAt ? "resend of " : ""}account setup email for ${account.email}`,
                "email",
              ),
            );
            ctx.notify("Demo setup email recorded.");
            onClose();
          }}
        >
          {label}
        </Button>
      </div>
    </Modal>
  );
}

function DeleteAccount({ account, children, onClose, onDelete }) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={`Delete ${account.name}?`}
      subtitle="Review the impact and type the name to confirm."
      onClose={busy ? undefined : onClose}
    >
      <div className="modal-body">
        {children}
        <Field label={`Type ${account.name}`}>
          <input
            autoComplete="off"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </Field>
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          disabled={busy || confirmation.trim() !== account.name.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await onDelete();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Deleting…" : "Confirm deletion"}
        </Button>
      </div>
    </Modal>
  );
}

function copySchoolSetup(data, from, to) {
  const keys = [
    "fieldScope",
    "fieldRequired",
    "staffFieldScope",
    "staffFieldRequired",
    "schoolDesigns",
    "schoolLanyards",
    "schoolClasses",
    "schoolSections",
    "schoolStaffRoles",
  ];
  return {
    ...Object.fromEntries(
      keys
        .filter((key) => data[key]?.[from] !== undefined)
        .map((key) => [
          key,
          { ...data[key], [to]: structuredClone(data[key][from]) },
        ]),
    ),
    customFields: [
      ...data.customFields,
      ...data.customFields
        .filter((field) => field.school === from)
        .map((field) => ({
          ...structuredClone(field),
          id: uid("FIELD"),
          school: to,
        })),
    ],
  };
}

export function SchoolForm({ ctx, value, onClose }) {
  const { data, update, notify, log } = ctx;
  const [s, setS] = useState(
    value
      ? { ...value, id: value.id || uid("SCH") }
      : {
          id: uid("SCH"),
          name: "",
          short: "",
          email: "",
          phone: "",
          principal: "",
          address: "",
          city: "",
          state: "Rajasthan",
          country: "India",
          pin: "",
          agent: ctx.agentId || "",
          status: "Active",
          studentRounds: 3,
          staffRounds: 3,
          color: "#326b5b",
        },
  );
  const [otherCity, setOtherCity] = useState(() =>
    Boolean(s.city && !citiesOf(s.state || "Rajasthan").includes(s.city)),
  );
  const [error, setError] = useState("");
  const set = (k, v) => setS({ ...s, [k]: v });
  const save = (e) => {
    e.preventDefault();
    if (
      !s.name.trim() ||
      !s.email ||
      !s.city ||
      !/^[6-9]\d{9}$/.test(s.phone)
    ) {
      setError(
        "Add the school name, valid email, city, and 10-digit phone number.",
      );
      return;
    }
    update((d) =>
      log(
        {
          ...d,
          ...(value?.copyFrom ? copySchoolSetup(d, value.copyFrom, s.id) : {}),
          schools: value?.id
            ? d.schools.map((x) => (x.id === s.id ? s : x))
            : [...d.schools, s],
        },
        `${value ? "Updated" : "Created"} school ${s.name}`,
        "school",
      ),
    );
    notify("School details saved.");
    onClose();
  };
  return (
    <Modal
      wide
      title={
        value?.id
          ? "Edit school"
          : value?.copyFrom
            ? "Copy school setup"
            : "Add a school"
      }
      subtitle="Set up the school contact, assigned agent, and card collection rounds."
      onClose={onClose}
    >
      <form onSubmit={save}>
        <div className="modal-body">
          <div className="form-grid">
            {[
              ["name", "School name"],
              ["principal", "Principal name"],
              ["email", "School email", "email"],
              ["phone", "Contact number", "tel"],
              ["address", "Address"],
              ["country", "Country"],
              ["pin", "PIN code"],
            ].map(([k, l, t]) => (
              <Field
                key={k}
                label={l}
                required={["name", "email", "phone", "city"].includes(k)}
              >
                <input
                  type={t || "text"}
                  required={["name", "email", "phone", "city"].includes(k)}
                  value={s[k] || ""}
                  onChange={(e) => set(k, e.target.value)}
                />
              </Field>
            ))}
            <Field label="State" required>
              <select
                required
                value={s.state || "Rajasthan"}
                onChange={(e) => {
                  setS({ ...s, state: e.target.value, city: "" });
                  setOtherCity(false);
                }}
              >
                {STATES.map((state) => (
                  <option key={state}>{state}</option>
                ))}
              </select>
            </Field>
            <Field label="City" required>
              <select
                required
                aria-label="Choose city"
                value={otherCity ? "__other" : s.city || ""}
                onChange={(e) => {
                  const other = e.target.value === "__other";
                  setOtherCity(other);
                  set("city", other ? "" : e.target.value);
                }}
              >
                <option value="">Choose a city</option>
                {citiesOf(s.state || "Rajasthan").map((city) => (
                  <option key={city}>{city}</option>
                ))}
                <option value="__other">Other city or town</option>
              </select>
              {otherCity && (
                <input
                  type="text"
                  required
                  aria-label="City or town name"
                  value={s.city}
                  onChange={(e) => set("city", e.target.value)}
                />
              )}
            </Field>
            <Field label="Assigned agent">
              <select
                value={s.agent}
                onChange={(e) => set("agent", e.target.value)}
                disabled={Boolean(ctx.agentId) || ctx.role === "school"}
              >
                <option value="">Unassigned</option>
                {data.agents
                  .filter(
                    (a) =>
                      ctx.role === "super" || a.id === (ctx.agentId || s.agent),
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.type}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Student printing rounds">
              <input
                type="number"
                min="1"
                max="10"
                disabled={ctx.role !== "super"}
                value={s.studentRounds}
                onChange={(e) => set("studentRounds", +e.target.value)}
              />
            </Field>
            <Field label="Staff printing rounds">
              <input
                type="number"
                min="1"
                max="10"
                disabled={ctx.role !== "super"}
                value={s.staffRounds}
                onChange={(e) => set("staffRounds", +e.target.value)}
              />
            </Field>
            <Field label="School status">
              <select
                value={s.status}
                onChange={(e) => set("status", e.target.value)}
              >
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </Field>
          </div>
          {error && <p className="error">{error}</p>}
          <Callout icon="settings">
            Card fields and extra fields are managed in the school’s Settings
            panel. Students and staff have separate records; only the School
            Admin manages the school-side workflow.
          </Callout>
        </div>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" icon="check">
            Save school
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function Schools({ ctx }) {
  const { data, availableSchools, setSchoolId, go, update, notify, log } = ctx;
  const [query, setQuery] = useState(""),
    [edit, setEdit] = useState(ctx.record === "addSchool" ? {} : null),
    [detail, setDetail] = useState(
      () => availableSchools.find((row) => row.id === ctx.record) || null,
    ),
    [setup, setSetup] = useState(null),
    [removeSchool, setRemoveSchool] = useState(null);
  const removeSchoolData = async () => {
    if (ctx.role !== "super" || data.schools.length < 2) return;
    const { id, name } = removeSchool;
    const collections = [
      "students",
      "staff",
      "uploads",
      "photoLibrary",
      "batches",
      "orderForms",
      "outbox",
      "customFields",
    ];
    try {
      await deleteFiles(
        ["uploads", "photoLibrary", "orderForms"].flatMap((key) =>
          (data[key] || [])
            .filter((record) => record.school === id && record.fileKey)
            .map((record) => record.fileKey),
        ),
      );
      update((d) => {
        const next = {
          ...d,
          schools: d.schools.filter((school) => school.id !== id),
        };
        for (const key of collections)
          next[key] = (d[key] || []).filter((record) => record.school !== id);
        for (const key of [
          "fieldScope",
          "staffFieldScope",
          "fieldRequired",
          "staffFieldRequired",
          "schoolDesigns",
          "schoolLanyards",
          "schoolSessions",
          "schoolClasses",
          "schoolSections",
          "schoolStaffRoles",
        ]) {
          if (d[key]) {
            next[key] = { ...d[key] };
            delete next[key][id];
          }
        }
        next.profiles = { ...d.profiles };
        delete next.profiles[`school:${id}`];
        return log(next, `Deleted school ${name}`, "school");
      });
      if (ctx.schoolId === id)
        setSchoolId(data.schools.find((school) => school.id !== id).id);
      setRemoveSchool(null);
      setDetail(null);
      notify("School and its demo records deleted.");
    } catch {
      notify("Could not delete the school files. Try again.", "error");
    }
  };
  const rows = availableSchools.filter((s) =>
    `${s.name} ${s.city}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        eyebrow="YOUR SCHOOL NETWORK"
        title="Good identities start with good connections."
        description="Keep school contacts, card requirements, and collections organized."
      >
        <Button icon="plus" onClick={() => setEdit({})}>
          Add school
        </Button>
      </PageTitle>
      <Panel
        title={`${availableSchools.length} connected schools`}
        subtitle="Every school has one school-admin workspace."
      >
        <div className="table-toolbar">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search schools or cities"
          />
          <Button
            variant="text"
            icon="download"
            onClick={() => {
              download(
                "schools.csv",
                csvText(rows, [
                  { key: "name", label: "School" },
                  { key: "city", label: "City" },
                  { key: "email", label: "Email" },
                  { key: "phone", label: "Phone" },
                  { key: "status", label: "Status" },
                ]),
                "text/csv",
              );
            }}
          >
            Export schools
          </Button>
        </div>
        <div className="table-wrap">
          <table className="phone-records">
            <thead>
              <tr>
                <th>SCHOOL</th>
                <th>CONTACT</th>
                <th>AGENT</th>
                <th>STUDENTS</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="phone-record-title">
                    <div className="person-cell">
                      <span
                        className="school-cell-icon"
                        style={{ color: s.color }}
                      >
                        <Icon name="school" />
                      </span>
                      <div>
                        <strong>{s.name}</strong>
                        <small>
                          {s.city} · {s.id}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td data-label="CONTACT">
                    {s.email}
                    <small className="block muted">+91 {s.phone}</small>
                  </td>
                  <td data-label="AGENT">
                    {data.agents.find((a) => a.id === s.agent)?.name ||
                      "Unassigned"}
                  </td>
                  <td data-label="STUDENTS">
                    {data.students.filter((x) => x.school === s.id).length}
                  </td>
                  <td data-label="STATUS">
                    <Badge>{s.status}</Badge>
                  </td>
                  <td className="phone-record-actions">
                    <div className="row-actions">
                      <IconButton
                        icon="eye"
                        label={"View " + s.name}
                        onClick={() => setDetail(s)}
                      />
                      <IconButton
                        icon="edit"
                        label={"Edit " + s.name}
                        onClick={() => setEdit(s)}
                      />
                      <IconButton
                        icon="copy"
                        label={"Copy settings for " + s.name}
                        onClick={() =>
                          setEdit({
                            ...s,
                            id: null,
                            name: "",
                            email: "",
                            phone: "",
                            principal: "",
                            address: "",
                            city: "",
                            copyFrom: s.id,
                          })
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Empty
            title="No schools found"
            text="Try another search or add a school."
          />
        )}
      </Panel>
      <Callout icon="guide">
        Agents upload photo PDFs by school. School Admins send student links,
        manage records, and approve cards. Switch panels above to experience
        each role.
      </Callout>
      {edit && (
        <SchoolForm
          ctx={ctx}
          value={edit.name || edit.copyFrom ? edit : null}
          onClose={() => setEdit(null)}
        />
      )}
      {detail && (
        <Modal
          title={detail.name}
          subtitle={`${detail.id} · ${detail.city}`}
          onClose={() => setDetail(null)}
        >
          <div className="modal-body">
            <dl className="details-list">
              {[
                ["Principal", detail.principal],
                ["Email", detail.email],
                ["Phone", detail.phone],
                ["Address", detail.address],
                ["Agent", data.agents.find((a) => a.id === detail.agent)?.name],
                ["Student rounds", detail.studentRounds],
                ["Staff rounds", detail.staffRounds],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="button-row">
              <a
                className="btn secondary"
                href={workspaceLink(ctx, {
                  panel: "school",
                  page: "overview",
                  school: detail.id,
                })}
              >
                Open School Admin <Icon name="external" size={15} />
              </a>
              <Button
                variant="secondary"
                icon="email"
                onClick={() => {
                  setSetup(detail);
                  setDetail(null);
                }}
              >
                {detail.setupAt ? "Resend setup email" : "Send setup email"}
              </Button>
              {ctx.role === "super" && data.schools.length > 1 && (
                <Button
                  variant="secondary"
                  icon="trash"
                  onClick={() => {
                    setRemoveSchool(detail);
                    setDetail(null);
                  }}
                >
                  Delete school
                </Button>
              )}
              <Button
                onClick={() => {
                  setSchoolId(detail.id);
                  setDetail(null);
                  go("photos");
                }}
                icon="fileUp"
              >
                Photo PDFs
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {setup && (
        <SetupAccess
          ctx={ctx}
          account={setup}
          collection="schools"
          onClose={() => setSetup(null)}
        />
      )}
      {removeSchool && (
        <DeleteAccount
          account={removeSchool}
          onDelete={removeSchoolData}
          onClose={() => setRemoveSchool(null)}
        >
          <ul>
            <li>
              {data.students.filter((s) => s.school === removeSchool.id).length}{" "}
              student and{" "}
              {data.staff.filter((s) => s.school === removeSchool.id).length}{" "}
              staff records
            </li>
            <li>
              {data.batches.filter((b) => b.school === removeSchool.id).length}{" "}
              print batches
            </li>
            <li>
              School photos, order forms, demo invitations, and ID settings
            </li>
          </ul>
        </DeleteAccount>
      )}
    </>
  );
}
export function Agents({ ctx }) {
  const { data, update, notify, log } = ctx;
  const [tab, setTab] = useState("All"),
    [query, setQuery] = useState(
      () => data.agents.find((row) => row.id === ctx.record)?.name || "",
    ),
    [edit, setEdit] = useState(ctx.record === "addAgent" ? "new" : null),
    [reset, setReset] = useState(null),
    [setup, setSetup] = useState(null),
    [removeAgent, setRemoveAgent] = useState(null);
  const removeAgentData = () => {
    if (ctx.role !== "super") return;
    update((d) => {
      const profiles = { ...d.profiles };
      delete profiles[`agent:${removeAgent.id}`];
      return log(
        {
          ...d,
          profiles,
          agents: d.agents.filter((agent) => agent.id !== removeAgent.id),
          schools: d.schools.map((school) =>
            school.agent === removeAgent.id ? { ...school, agent: "" } : school,
          ),
        },
        `Deleted agent ${removeAgent.name}`,
        "briefcase",
      );
    });
    setRemoveAgent(null);
    notify("Agent deleted. Their schools are now unassigned.");
  };
  const empty = {
    id: uid("AG"),
    name: "",
    email: "",
    phone: "",
    type: "Premium",
    company: "",
    city: "",
    address: "",
    state: "Rajasthan",
    country: "India",
    pin: "",
    start: "2026-11-06",
    end: "2027-11-05",
    status: "Active",
  };
  React.useEffect(() => {
    if (edit === "new") setEdit(empty);
  }, [edit]);
  const rows = data.agents.filter(
    (a) =>
      (tab === "All" || a.type === tab) &&
      `${a.name} ${a.company} ${a.email}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const save = (e) => {
    e.preventDefault();
    update((d) =>
      log(
        {
          ...d,
          agents: d.agents.some((a) => a.id === edit.id)
            ? d.agents.map((a) => (a.id === edit.id ? edit : a))
            : [...d.agents, edit],
        },
        `Saved ${edit.type.toLowerCase()} agent ${edit.name}`,
        "briefcase",
      ),
    );
    setEdit(null);
    notify("Agent saved in the preview.");
  };
  return (
    <>
      <PageTitle
        eyebrow="PARTNERS, WITH A PURPOSE"
        title="The people behind every school ID."
        description="Manage regular and premium agents, subscriptions, and school assignments."
      >
        <Button icon="plus" onClick={() => setEdit(empty)}>
          Add agent
        </Button>
      </PageTitle>
      <Panel>
        <div className="table-tabs">
          <div>
            {["All", "Premium", "Regular"].map((t) => (
              <button
                className={tab === t ? "active" : ""}
                key={t}
                onClick={() => setTab(t)}
              >
                {t} agents
              </button>
            ))}
          </div>
        </div>
        <div className="table-toolbar">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search agents, company or email"
          />
        </div>
        <div className="table-wrap">
          <table className="phone-records">
            <thead>
              <tr>
                <th>AGENT</th>
                <th>TYPE</th>
                <th>CONTACT</th>
                <th>SCHOOLS</th>
                <th>SUBSCRIPTION</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="phone-record-title">
                    <div className="person-cell">
                      <Avatar name={a.name} />
                      <div>
                        <strong>{a.name}</strong>
                        <small>{a.company}</small>
                      </div>
                    </div>
                  </td>
                  <td data-label="TYPE">
                    <Badge>{a.type}</Badge>
                  </td>
                  <td data-label="CONTACT">
                    {a.email}
                    <small className="block muted">{a.phone}</small>
                  </td>
                  <td data-label="SCHOOLS">
                    <a
                      href={workspaceLink(ctx, {
                        panel: a.type.toLowerCase(),
                        page: "schools",
                        agent: a.id,
                      })}
                    >
                      {data.schools.filter((s) => s.agent === a.id).length}{" "}
                      schools
                    </a>
                  </td>
                  <td data-label="SUBSCRIPTION">
                    {a.type === "Premium" ? (
                      <>
                        <span>{fmtDate(a.end)}</span>
                        <small className="block muted">Valid until</small>
                      </>
                    ) : (
                      "Not required"
                    )}
                  </td>
                  <td data-label="STATUS">
                    <Badge>{a.status}</Badge>
                  </td>
                  <td className="phone-record-actions">
                    <div className="row-actions">
                      <IconButton
                        icon="edit"
                        label={"Edit agent " + a.name}
                        onClick={() => setEdit({ ...a })}
                      />
                      <a
                        className="icon-btn"
                        aria-label={`Open account for ${a.name}`}
                        title={`Open account for ${a.name}`}
                        href={workspaceLink(ctx, {
                          panel: a.type.toLowerCase(),
                          page: "overview",
                          agent: a.id,
                        })}
                      >
                        <Icon name="external" size={16} />
                      </a>
                      <IconButton
                        icon="email"
                        label={`${a.setupAt ? "Resend" : "Send"} setup email for ${a.name}`}
                        onClick={() => setSetup(a)}
                      />
                      <IconButton
                        icon="trash"
                        label={`Delete agent ${a.name}`}
                        onClick={() => setRemoveAgent(a)}
                      />
                      <IconButton
                        icon="lock"
                        label={"Reset access for " + a.name}
                        onClick={() => setReset(a)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <Empty title="No matching agents" />}
      </Panel>
      <div className="two-col">
        <Callout icon="briefcase">
          <strong>Premium agent:</strong> school management, school photo PDFs,
          card/lanyard designs, print batches, and an own-printing option.
        </Callout>
        <Callout icon="user">
          <strong>Regular agent:</strong> assigned school management, school
          photo PDFs, and centrally fulfilled printing. No own-printing
          controls.
        </Callout>
      </div>
      {edit && edit !== "new" && (
        <Modal
          wide
          title={
            data.agents.some((a) => a.id === edit.id)
              ? "Edit agent"
              : "Add agent"
          }
          subtitle="A clear profile and the right level of access."
          onClose={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <div className="modal-body form-grid">
              {[
                ["name", "Agent name"],
                ["company", "Company"],
                ["email", "Email", "email"],
                ["phone", "Phone", "tel"],
                ["address", "Address"],
                ["city", "City"],
                ["state", "State"],
                ["country", "Country"],
                ["pin", "PIN code"],
              ].map(([k, l, t]) => (
                <Field
                  key={k}
                  label={l}
                  required={["name", "email", "phone"].includes(k)}
                >
                  <input
                    type={t || "text"}
                    required={["name", "email", "phone"].includes(k)}
                    value={edit[k] || ""}
                    pattern={k === "phone" ? "[6-9][0-9]{9}" : undefined}
                    onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                  />
                </Field>
              ))}
              <Field label="Agent type">
                <select
                  value={edit.type}
                  onChange={(e) => setEdit({ ...edit, type: e.target.value })}
                >
                  <option>Premium</option>
                  <option>Regular</option>
                </select>
              </Field>
              {edit.type === "Premium" && (
                <>
                  <Field label="Subscription starts">
                    <input
                      required
                      type="date"
                      value={edit.start}
                      onChange={(e) =>
                        setEdit({ ...edit, start: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Subscription ends">
                    <input
                      required
                      type="date"
                      min={edit.start}
                      value={edit.end}
                      onChange={(e) =>
                        setEdit({ ...edit, end: e.target.value })
                      }
                    />
                  </Field>
                </>
              )}
              <Field label="Status">
                <select
                  value={edit.status}
                  onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                >
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </Field>
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button type="submit">Save agent</Button>
            </div>
          </form>
        </Modal>
      )}
      {reset && (
        <Modal
          title="Reset agent access"
          subtitle={reset.email}
          onClose={() => setReset(null)}
        >
          <div className="modal-body">
            <Callout icon="lock">
              In the connected product this will send a secure password-reset
              email. This preview records the request only; passwords are never
              displayed.
            </Callout>
          </div>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setReset(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                update((d) =>
                  log(
                    d,
                    `Simulated access-reset request for ${reset.email}`,
                    "lock",
                  ),
                );
                notify("Demo reset request recorded. No email was sent.");
                setReset(null);
              }}
            >
              Simulate reset request
            </Button>
          </div>
        </Modal>
      )}
      {setup && (
        <SetupAccess
          ctx={ctx}
          account={setup}
          collection="agents"
          onClose={() => setSetup(null)}
        />
      )}
      {removeAgent && (
        <DeleteAccount
          account={removeAgent}
          onDelete={removeAgentData}
          onClose={() => setRemoveAgent(null)}
        >
          <ul>
            <li>
              The agent’s demo account and subscription details will be deleted.
            </li>
            <li>
              {data.schools.filter((s) => s.agent === removeAgent.id).length}{" "}
              schools will become unassigned. Their records and orders stay
              available.
            </li>
          </ul>
        </DeleteAccount>
      )}
    </>
  );
}
export function Staff({ ctx }) {
  const { data, school, update, notify, log } = ctx;
  const [query, setQuery] = useState(
      () =>
        data.staff.find(
          (row) => row.school === school.id && row.id === ctx.record,
        )?.name || "",
    ),
    [edit, setEdit] = useState(null),
    [remove, setRemove] = useState(null),
    [newRole, setNewRole] = useState("");
  const rows = data.staff.filter(
    (s) =>
      s.school === school.id &&
      `${s.name} ${s.role}`.toLowerCase().includes(query.toLowerCase()),
  );
  const save = (e) => {
    e.preventDefault();
    const errors = {
      ...validateStudent(edit, schoolFields(data, school.id, true)),
      ...validateExtras(edit, schoolExtras(data, school.id, true)),
    };
    if (Object.keys(errors).length) {
      notify(Object.values(errors)[0], "error");
      return;
    }

    update((d) =>
      log(
        {
          ...d,
          staff: d.staff.some((s) => s.id === edit.id)
            ? d.staff.map((s) =>
                s.id === edit.id ? { ...edit, printStatus: "In review" } : s,
              )
            : [...d.staff, edit],
        },
        `Saved staff record ${edit.name}`,
        "user",
      ),
    );
    setEdit(null);
    notify("Staff record saved.");
  };
  return (
    <>
      <PageTitle
        eyebrow="THE WHOLE SCHOOL BELONGS"
        title="A familiar face for every staff ID."
        description="Manage staff identities here. Staff records do not create a separate Teacher panel."
      >
        <Button
          icon="plus"
          onClick={() =>
            setEdit({
              id: uid("SF"),
              school: school.id,
              name: "",
              email: "",
              phone: "",
              address: "",
              role: "Office staff",
              status: "Active",
              photo: "",
              printStatus: "In review",
            })
          }
        >
          Add staff member
        </Button>
      </PageTitle>
      <Panel>
        <div className="table-toolbar">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search staff name or role"
          />
          <Button
            variant="text"
            icon="download"
            onClick={() =>
              download(
                "staff.csv",
                csvText(
                  rows,
                  ["name", "role", "email", "phone", "address", "status"].map(
                    (key) => ({ key, label: key }),
                  ),
                ),
                "text/csv",
              )
            }
          >
            Export staff
          </Button>
        </div>
        <div className="table-wrap">
          <table className="phone-records">
            <thead>
              <tr>
                <th>STAFF MEMBER</th>
                <th>ROLE</th>
                <th>CONTACT</th>
                <th>CARD STATUS</th>
                <th>RECORD STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="phone-record-title">
                    <div className="person-cell">
                      <Avatar name={s.name} photo={s.photo} />
                      <div>
                        <strong>{s.name}</strong>
                        <small>{s.id}</small>
                      </div>
                    </div>
                  </td>
                  <td data-label="ROLE">{s.role}</td>
                  <td data-label="CONTACT">
                    {s.email}
                    <small className="block muted">{s.phone}</small>
                  </td>
                  <td data-label="CARD STATUS">
                    <Badge>{s.printStatus}</Badge>
                  </td>
                  <td data-label="RECORD STATUS">
                    <Badge>{s.status}</Badge>
                  </td>
                  <td className="phone-record-actions">
                    <div className="row-actions">
                      {s.printStatus === "In review" && (
                        <IconButton
                          icon="check"
                          label={"Approve staff ID " + s.name}
                          onClick={() => {
                            if (!s.photo) {
                              notify(
                                "Add a staff photo before approving.",
                                "error",
                              );
                              return;
                            }
                            const errors = {
                              ...validateStudent(
                                s,
                                schoolFields(data, school.id, true),
                              ),
                              ...validateExtras(
                                s,
                                schoolExtras(data, school.id, true),
                              ),
                            };
                            if (Object.keys(errors).length) {
                              notify(Object.values(errors)[0], "error");
                              return;
                            }
                            update((d) => ({
                              ...d,
                              staff: d.staff.map((x) =>
                                x.id === s.id
                                  ? { ...x, printStatus: "Approved" }
                                  : x,
                              ),
                            }));
                            notify("Staff ID approved for printing.");
                          }}
                        />
                      )}
                      <IconButton
                        icon="edit"
                        label={"Edit staff " + s.name}
                        onClick={() => setEdit({ ...s })}
                      />
                      <IconButton
                        icon="trash"
                        label={"Delete staff " + s.name}
                        onClick={() => setRemove(s)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Empty
            title="No staff found"
            text="Add the people who make your school work."
          />
        )}
      </Panel>
      {edit && (
        <Modal
          wide
          title="Staff details"
          subtitle="School-admin managed identity record."
          onClose={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <div className="modal-body">
              <div className="student-editor-head">
                <Avatar name={edit.name} photo={edit.photo} size={64} />
                <label className="btn secondary upload-label">
                  <Icon name="upload" size={15} />
                  <span>Upload photo</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (
                        f.size > 2e6 ||
                        !["image/jpeg", "image/png", "image/webp"].includes(
                          f.type,
                        )
                      ) {
                        notify(
                          "Choose a JPG, PNG, or WebP image under 2 MB.",
                          "error",
                        );
                        return;
                      }
                      const r = new FileReader();
                      r.onload = () =>
                        setEdit((v) => ({ ...v, photo: r.result }));
                      r.readAsDataURL(f);
                    }}
                  />
                </label>
              </div>
              <div className="form-grid">
                {schoolFields(data, school.id, true).map(
                  ([k, l, t, required]) => (
                    <Field key={k} label={l} required={required}>
                      {["class", "section", "gender", "role"].includes(t) ? (
                        <select
                          required={required}
                          value={edit[k] || ""}
                          onChange={(e) =>
                            setEdit({ ...edit, [k]: e.target.value })
                          }
                        >
                          <option value="">Choose {l.toLowerCase()}</option>
                          {(t === "class"
                            ? data.classes
                            : t === "section"
                              ? data.sections
                              : t === "role"
                                ? data.staffRoles
                                : [
                                    "Male",
                                    "Female",
                                    "Other",
                                    "Prefer not to say",
                                  ]
                          ).map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          required={required}
                          type={t}
                          pattern={k === "phone" ? "[6-9][0-9]{9}" : undefined}
                          value={edit[k] || ""}
                          onChange={(e) =>
                            setEdit({ ...edit, [k]: e.target.value })
                          }
                        />
                      )}
                    </Field>
                  ),
                )}
                {schoolExtras(data, school.id, true).map((field) => (
                  <ExtraField
                    key={field.id}
                    field={field}
                    value={edit.custom?.[field.id]}
                    onChange={(value) =>
                      setEdit({
                        ...edit,
                        custom: { ...edit.custom, [field.id]: value },
                      })
                    }
                  />
                ))}
                <Field label="Status">
                  <select
                    value={edit.status}
                    onChange={(e) =>
                      setEdit({ ...edit, status: e.target.value })
                    }
                  >
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </Field>
              </div>
              <div className="inline-add">
                <input
                  placeholder="Add a staff role"
                  aria-label="New staff role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                />
                <Button
                  variant="secondary"
                  disabled={!newRole.trim()}
                  onClick={() => {
                    if (data.staffRoles.includes(newRole.trim())) return;
                    update((d) => ({
                      ...d,
                      schoolStaffRoles: {
                        ...d.schoolStaffRoles,
                        [school.id]: [
                          ...(d.schoolStaffRoles?.[school.id] || d.staffRoles),
                          newRole.trim(),
                        ],
                      },
                    }));
                    setEdit({ ...edit, role: newRole.trim() });
                    setNewRole("");
                  }}
                >
                  Add role
                </Button>
              </div>
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button type="submit">Save staff member</Button>
            </div>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal
          title={`Delete ${remove.name}?`}
          subtitle="This removes the local staff record."
          onClose={() => setRemove(null)}
        >
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setRemove(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                update((d) => ({
                  ...d,
                  staff: d.staff.filter((s) => s.id !== remove.id),
                }));
                setRemove(null);
                notify("Staff record removed.");
              }}
            >
              Delete staff member
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Classes({ ctx }) {
  const { data, school, schoolStudents, update, notify, go } = ctx;
  const [newClass, setNewClass] = useState(""),
    [newSection, setNewSection] = useState("");
  const [edit, setEdit] = useState(null);
  const [remove, setRemove] = useState(null);
  const scope = (key) =>
    key === "classes" ? "schoolClasses" : "schoolSections";
  const changeList = (d, key, values) => ({
    ...d,
    [scope(key)]: { ...d[scope(key)], [school.id]: values },
  });
  const add = (key, value, clear) => {
    if (!value.trim()) return;
    if (data[key].includes(value.trim())) {
      notify("This already exists.", "error");
      return;
    }
    update((d) =>
      changeList(d, key, [
        ...(d[scope(key)]?.[school.id] || d[key]),
        value.trim(),
      ]),
    );
    clear("");
    notify(key === "classes" ? "Class added." : "Section added.");
  };
  return (
    <>
      <PageTitle
        eyebrow="A PLACE FOR EVERY STUDENT"
        title="A little structure goes a long way."
        description="Organize classes and sections, and see where photos still need collecting."
      />
      <div className="two-col">
        <Panel title="Add a class">
          <div className="inline-add padded">
            <input
              aria-label="Class name"
              placeholder="e.g. 12"
              value={newClass}
              onChange={(e) => setNewClass(e.target.value)}
              maxLength="20"
            />
            <Button
              icon="plus"
              onClick={() => add("classes", newClass, setNewClass)}
            >
              Add class
            </Button>
          </div>
        </Panel>
        <Panel title="Available sections">
          <div className="sections-list">
            {data.sections.map((s) => (
              <span key={s}>
                <Badge>{s}</Badge>
                <IconButton
                  icon="trash"
                  label={`Delete section ${s}`}
                  onClick={() => setRemove({ key: "sections", value: s })}
                />
              </span>
            ))}
            <input
              aria-label="Section name"
              placeholder="e.g. C"
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              maxLength="12"
            />
            <Button
              icon="plus"
              variant="secondary"
              onClick={() => add("sections", newSection, setNewSection)}
            >
              Add section
            </Button>
          </div>
        </Panel>
      </div>
      <div className="class-grid">
        {data.classes.map((c) => {
          const students = schoolStudents.filter((s) => s.classNo === c);
          const photos = students.filter((s) => s.photo).length;
          return (
            <Panel key={c} className="class-card">
              <div>
                <span className="class-icon">
                  <Icon name="layers" />
                </span>
                <IconButton
                  icon="edit"
                  label={"Rename class " + c}
                  onClick={() => setEdit({ from: c, name: c })}
                />
                <IconButton
                  icon="trash"
                  label={`Delete class ${c}`}
                  onClick={() => setRemove({ key: "classes", value: c })}
                />
              </div>
              <h2>Class {c}</h2>
              <p>{data.sections.join(" · ")} sections</p>
              <div className="class-card-count">
                <strong>{students.length}</strong>
                <span>students</span>
              </div>
              <div className="progress-bar">
                <div
                  style={{
                    width:
                      (students.length ? (photos / students.length) * 100 : 0) +
                      "%",
                  }}
                />
              </div>
              <small>
                {photos} with photo · {students.length - photos} without photo
              </small>
              <Button
                variant="text"
                onClick={() => go("students", `class:${c}`)}
              >
                View students
                <Icon name="arrow" size={14} />
              </Button>
            </Panel>
          );
        })}
      </div>
      {edit && (
        <Modal
          title="Rename class"
          subtitle="Existing students will move to the renamed class."
          onClose={() => setEdit(null)}
        >
          <div className="modal-body">
            <Field label="Class name">
              <input
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
          </div>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button
              disabled={!edit.name.trim()}
              onClick={() => {
                if (
                  edit.name !== edit.from &&
                  data.classes.includes(edit.name.trim())
                ) {
                  notify("A class with that name exists.", "error");
                  return;
                }
                update((d) => ({
                  ...changeList(
                    d,
                    "classes",
                    (d.schoolClasses?.[school.id] || d.classes).map((c) =>
                      c === edit.from ? edit.name.trim() : c,
                    ),
                  ),
                  students: d.students.map((s) =>
                    s.school === school.id && s.classNo === edit.from
                      ? { ...s, classNo: edit.name.trim() }
                      : s,
                  ),
                }));
                setEdit(null);
                notify("Class renamed.");
              }}
            >
              Save class
            </Button>
          </div>
        </Modal>
      )}
      {remove && (
        <Modal
          title={`Delete ${remove.key === "classes" ? "class" : "section"} ${remove.value}?`}
          onClose={() => setRemove(null)}
        >
          <div className="modal-body">
            Classes and sections in use by this school must be reassigned before
            deletion.
          </div>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setRemove(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const key = remove.key === "classes" ? "classNo" : "section";
                if (
                  [...data.students, ...data.staff].some(
                    (record) =>
                      record.school === school.id &&
                      record[key] === remove.value,
                  )
                ) {
                  notify("This class or section is still in use.", "error");
                  return;
                }
                update((d) =>
                  changeList(
                    d,
                    remove.key,
                    (d[scope(remove.key)]?.[school.id] || d[remove.key]).filter(
                      (value) => value !== remove.value,
                    ),
                  ),
                );
                setRemove(null);
                notify("School setup updated.");
              }}
            >
              Confirm delete
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Promotion({ ctx }) {
  const { data, schoolStudents, school, update, notify, log } = ctx;
  const [from, setFrom] = useState(data.classes[0]),
    [section, setSection] = useState("A"),
    [to, setTo] = useState(data.classes[1] || data.classes[0]),
    [targetSection, setTargetSection] = useState("A"),
    [session, setSession] = useState(
      () =>
        ctx.sessions.find((item) => item.name > ctx.session)?.name ||
        nextSession(ctx.sessions.map((item) => item.name)),
    ),
    [selected, setSelected] = useState([]),
    [confirm, setConfirm] = useState(false);
  const rows = schoolStudents.filter(
    (s) => s.classNo === from && s.section === section && s.active,
  );
  const picked = rows.filter((s) => selected.includes(s.id));
  const promote = () => {
    const target = normaliseSession(session);
    if (!target) {
      notify("Enter a valid academic year.", "error");
      return;
    }
    if (target === ctx.session) {
      notify(
        "Choose a different academic session to preserve current records.",
        "error",
      );
      return;
    }
    const valid = picked.filter(
      (s) =>
        !data.students.some(
          (x) =>
            x.school === school.id &&
            x.session === target &&
            (x.promotedFrom === s.id ||
              (s.admission && x.admission === s.admission)),
        ),
    );
    if (!valid.length) {
      notify("These students already exist in the target session.", "error");
      return;
    }
    const next = valid.map((s) => ({
      ...s,
      id: uid("ST"),
      classNo: to,
      section: targetSection,
      session: target,
      batch: "",
      note: "",
      approvedAt: null,
      submittedAt: null,
      invitedAt: null,
      status: s.photo ? "In review" : "Draft",
      promotedFrom: s.id,
    }));
    update((d) =>
      log(
        {
          ...d,
          students: [...d.students, ...next],
          schoolSessions: {
            ...d.schoolSessions,
            [school.id]: sessionsFor(d, school.id).some(
              (item) => item.name === target,
            )
              ? sessionsFor(d, school.id)
              : [
                  ...sessionsFor(d, school.id),
                  { name: target, ...sessionDates(target), active: false },
                ],
          },
        },
        `Promoted ${next.length} students to Class ${to} (${target})`,
        "up",
      ),
    );
    setConfirm(false);
    setSelected([]);
    notify(
      `${next.length} students copied to ${target}. Switch sessions above to view them.`,
    );
  };
  return (
    <>
      <PageTitle
        eyebrow="READY FOR WHAT’S NEXT"
        title="A new year. A smooth move."
        description="Promote students into a new academic session while keeping the current year’s records."
      />
      <Panel title="Choose the move">
        <div className="promotion-form">
          <Field label="From class">
            <select
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setSelected([]);
              }}
            >
              {data.classes.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="From section">
            <select
              value={section}
              onChange={(e) => {
                setSection(e.target.value);
                setSelected([]);
              }}
            >
              {data.sections.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Icon name="arrow" />
          <Field label="To class">
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              {data.classes.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="To section">
            <select
              value={targetSection}
              onChange={(e) => setTargetSection(e.target.value)}
            >
              {data.sections.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="New session">
            <input
              aria-label="Target academic session"
              value={session}
              onChange={(e) => setSession(e.target.value)}
              placeholder="2027–28"
            />
          </Field>
        </div>
      </Panel>
      <Panel
        title="Select students"
        subtitle="New-session cards return to school review."
        action={
          <Button
            icon="up"
            disabled={!picked.length || !normaliseSession(session)}
            onClick={() => setConfirm(true)}
          >
            Promote {picked.length} students
          </Button>
        }
      >
        <div className="table-wrap">
          <table className="phone-records">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select students to promote"
                    checked={
                      rows.length > 0 &&
                      rows.every((s) => selected.includes(s.id))
                    }
                    onChange={() =>
                      setSelected(
                        rows.every((s) => selected.includes(s.id))
                          ? []
                          : rows.map((s) => s.id),
                      )
                    }
                  />
                </th>
                <th>STUDENT</th>
                <th>CURRENT CLASS</th>
                <th>NEW CLASS</th>
                <th>SESSION</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="phone-record-select">
                    <input
                      type="checkbox"
                      aria-label={"Promote " + s.name}
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
                    <div className="person-cell">
                      <Avatar name={s.name} />
                      <div>
                        <strong>{s.name}</strong>
                        <small>{s.admission}</small>
                      </div>
                    </div>
                  </td>
                  <td data-label="CURRENT CLASS">
                    {s.classNo} – {s.section}
                  </td>
                  <td data-label="NEW CLASS">
                    {to} – {targetSection}
                  </td>
                  <td data-label="SESSION">{session}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Empty
            title="No students in this class and section"
            text="Choose another source class."
          />
        )}
      </Panel>
      {confirm && (
        <Modal
          title={`Promote ${picked.length} students?`}
          subtitle={`Class ${from} ${section} → ${to} ${targetSection} · ${session}`}
          onClose={() => setConfirm(false)}
        >
          <div className="modal-body">
            <Callout>
              Current-session records stay available. Duplicate admissions in
              the target session will be skipped. Promoted ID cards need a fresh
              school approval.
            </Callout>
          </div>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={promote}>Confirm promotion</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Sessions({ ctx }) {
  const {
    data,
    school,
    sessions,
    session,
    availableSchools,
    role,
    update,
    notify,
    setSession,
  } = ctx;
  const newSessionForm = () => {
    const name = nextSession(sessions.map((entry) => entry.name));
    return {
      name,
      ...sessionDates(name),
      active: false,
      all: false,
      existing: false,
      datesTouched: false,
    };
  };
  const [edit, setEdit] = useState(() =>
    ctx.record === "nextSession" ? newSessionForm() : null,
  );
  const [makeCurrent, setMakeCurrent] = useState(null);
  const [created, setCreated] = useState(null);
  const multi = role !== "school";
  const startNext = () => setEdit(newSessionForm());
  const save = (event) => {
    event.preventDefault();
    const name = normaliseSession(edit.name);
    if (!name || edit.end < edit.start) {
      notify("Enter a valid academic year and date range.", "error");
      return;
    }
    const targets = edit.all ? availableSchools : [school];
    const eligible = targets.filter(
      ({ id }) =>
        edit.existing ||
        !sessionsFor(data, id).some((entry) => entry.name === name),
    );
    if (!eligible.length) {
      notify("That session already exists for the selected schools.", "error");
      return;
    }
    update((d) => {
      const schoolSessions = { ...d.schoolSessions };
      for (const { id } of eligible) {
        const list = sessionsFor(d, id);
        schoolSessions[id] = edit.existing
          ? list.map((entry) =>
              entry.name === name
                ? { ...entry, start: edit.start, end: edit.end }
                : entry,
            )
          : [
              ...list.map((entry) =>
                edit.active ? { ...entry, active: false } : entry,
              ),
              { name, start: edit.start, end: edit.end, active: edit.active },
            ];
      }
      return { ...d, schoolSessions };
    });
    if (!edit.existing && eligible.some((entry) => entry.id === school.id)) {
      if (edit.active) setSession(name);
      setCreated(name);
    }
    notify(
      edit.existing
        ? "Session dates saved."
        : `${name} added to ${eligible.length} school${eligible.length === 1 ? "" : "s"}.`,
    );
    setEdit(null);
  };
  return (
    <>
      <PageTitle
        title="Academic sessions"
        description="View previous years or start the next session for a school."
      >
        <Button icon="plus" onClick={startNext}>
          Start next session
        </Button>
      </PageTitle>
      {multi && (
        <div className="school-context-picker">
          <Field label="School">
            <select
              value={school.id}
              onChange={(e) => {
                ctx.setSchoolId(e.target.value);
                setCreated(null);
              }}
            >
              {availableSchools.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {created && (
        <Callout icon="calendar">
          <Button
            variant="text"
            onClick={() => {
              setSession(created);
              setCreated(null);
            }}
          >
            View {created}
          </Button>
        </Callout>
      )}
      <Panel title={school.name} subtitle={`Viewing ${session}`}>
        <div className="table-wrap">
          <table className="phone-records">
            <thead>
              <tr>
                <th>SESSION</th>
                <th>DATES</th>
                <th>STUDENTS</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {[...sessions]
                .sort((a, b) => b.name.localeCompare(a.name))
                .map((entry) => (
                  <tr key={entry.name}>
                    <td className="phone-record-title">
                      <strong>{entry.name}</strong>
                    </td>
                    <td data-label="Dates">
                      {fmtDate(entry.start)} – {fmtDate(entry.end)}
                    </td>
                    <td data-label="Students">
                      {
                        data.students.filter(
                          (student) =>
                            student.school === school.id &&
                            student.session === entry.name,
                        ).length
                      }
                    </td>
                    <td data-label="Status">
                      <Badge tone={entry.active ? "green" : "gray"}>
                        {entry.active ? "Current" : "Historical / planned"}
                      </Badge>
                    </td>
                    <td className="phone-record-actions">
                      <div className="button-row">
                        <Button
                          variant="secondary"
                          disabled={session === entry.name}
                          onClick={() => setSession(entry.name)}
                        >
                          {session === entry.name ? "Viewing" : "View session"}
                        </Button>
                        <IconButton
                          icon="edit"
                          label={`Edit dates of ${entry.name}`}
                          onClick={() => setEdit({ ...entry, existing: true })}
                        />
                        {!entry.active && (
                          <Button
                            variant="text"
                            onClick={() => setMakeCurrent(entry)}
                          >
                            Make current
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {edit && (
        <Modal
          title={
            edit.existing
              ? `Dates for ${edit.name}`
              : "Start a new academic session"
          }
          onClose={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <div className="modal-body form-grid">
              {!edit.existing && (
                <Field
                  label="Session"
                  hint="Enter the first year, for example 2027."
                  required
                >
                  <input
                    required
                    value={edit.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const parsed = normaliseSession(name);
                      setEdit({
                        ...edit,
                        name,
                        ...(parsed && !edit.datesTouched
                          ? sessionDates(parsed)
                          : {}),
                      });
                    }}
                  />
                </Field>
              )}
              <Field label="Starts" required>
                <input
                  type="date"
                  required
                  value={edit.start}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      start: e.target.value,
                      datesTouched: true,
                    })
                  }
                />
              </Field>
              <Field label="Ends" required>
                <input
                  type="date"
                  required
                  min={edit.start}
                  value={edit.end}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      end: e.target.value,
                      datesTouched: true,
                    })
                  }
                />
              </Field>
              {!edit.existing && (
                <>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={edit.active}
                      onChange={(e) =>
                        setEdit({ ...edit, active: e.target.checked })
                      }
                    />{" "}
                    Make this the current session
                  </label>
                  {multi && availableSchools.length > 1 && (
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={edit.all}
                        onChange={(e) =>
                          setEdit({ ...edit, all: e.target.checked })
                        }
                      />{" "}
                      Add for all my schools
                    </label>
                  )}
                </>
              )}
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button type="submit">Save session</Button>
            </div>
          </form>
        </Modal>
      )}
      {makeCurrent && (
        <Modal
          title={`Make ${makeCurrent.name} current?`}
          subtitle={school.name}
          onClose={() => setMakeCurrent(null)}
        >
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setMakeCurrent(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                update((d) => ({
                  ...d,
                  schoolSessions: {
                    ...d.schoolSessions,
                    [school.id]: sessionsFor(d, school.id).map((entry) => ({
                      ...entry,
                      active: entry.name === makeCurrent.name,
                    })),
                  },
                }));
                setSession(makeCurrent.name);
                setMakeCurrent(null);
                notify("Current academic session updated.");
              }}
            >
              Make current
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Settings({ ctx, onReset }) {
  const { data, school, update, notify, role } = ctx;
  const [tab, setTab] = useState("Profile"),
    [profile, setProfile] = useState({ ...ctx.userProfile }),
    [editSchool, setEditSchool] = useState(false),
    [extra, setExtra] = useState(""),
    [password, setPassword] = useState(false),
    [fieldTarget, setFieldTarget] = useState("Student"),
    [extraType, setExtraType] = useState("text"),
    [extraOptions, setExtraOptions] = useState(""),
    [extraRequired, setExtraRequired] = useState(false);
  const keys =
    fieldTarget === "Student"
      ? data.fieldScope[school.id] || data.enabledFields
      : data.staffFieldScope?.[school.id] || STAFF_FIELDS.map((f) => f[0]);
  const tabs =
    role === "school"
      ? ["Profile", "School details", "ID card fields", "Preview settings"]
      : ["Profile", "Preview settings"];
  return (
    <>
      <PageTitle
        eyebrow="MAKE IT YOURS"
        title="The right details, in the right place."
        description="Manage your profile, school information, and the fields students complete."
      />
      <div className="review-tabs">
        {tabs.map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Profile" && (
        <Panel
          title="Your profile"
          subtitle="Contact details for this local preview."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update((d) => ({
                ...d,
                profiles: { ...d.profiles, [ctx.profileKey]: profile },
              }));
              notify("Profile saved.");
            }}
          >
            <div className="padded form-grid max-form">
              {[
                ["name", "Full name"],
                ["email", "Email address", "email"],
                ["phone", "Phone number", "tel"],
              ].map(([k, l, t]) => (
                <Field key={k} label={l}>
                  <input
                    type={t || "text"}
                    required
                    value={profile[k]}
                    onChange={(e) =>
                      setProfile({ ...profile, [k]: e.target.value })
                    }
                  />
                </Field>
              ))}
            </div>
            <div className="panel-footer">
              <Button type="submit">Save profile</Button>
              <Button
                variant="secondary"
                icon="lock"
                onClick={() => setPassword(true)}
              >
                Reset password
              </Button>
            </div>
          </form>
        </Panel>
      )}
      {tab === "School details" && (
        <Panel
          title={school.name}
          action={
            <Button
              variant="secondary"
              icon="edit"
              onClick={() => setEditSchool(true)}
            >
              Edit school
            </Button>
          }
        >
          <dl className="details-list padded">
            {[
              ["School email", school.email],
              ["Principal", school.principal],
              ["Phone", school.phone],
              ["Address", school.address],
              ["Student printing rounds", school.studentRounds],
              ["Staff printing rounds", school.staffRounds],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      )}
      {tab === "ID card fields" && (
        <Panel
          title="The details your school needs"
          subtitle="Changes appear in manual student editing, the personal student link, and review screens."
        >
          <div className="field-target-tabs">
            <Button
              variant={fieldTarget === "Student" ? "soft" : "secondary"}
              onClick={() => setFieldTarget("Student")}
            >
              Student card fields
            </Button>
            <Button
              variant={fieldTarget === "Staff" ? "soft" : "secondary"}
              onClick={() => setFieldTarget("Staff")}
            >
              Staff card fields
            </Button>
          </div>
          <div className="field-switches parity-field-switches">
            {(fieldTarget === "Student" ? FIELDS : STAFF_FIELDS).map(
              ([key, label]) => {
                const staff = fieldTarget === "Staff";
                const locked = lockedFields(staff).includes(key);
                const enabled = locked || keys.includes(key);
                const required = Boolean(
                  schoolFields(data, school.id, staff).find(
                    ([id]) => id === key,
                  )?.[3],
                );
                const scope = staff ? "staffFieldScope" : "fieldScope";
                const requirements = staff
                  ? "staffFieldRequired"
                  : "fieldRequired";
                return (
                  <div className="parity-field-row" key={key}>
                    <strong>{label}</strong>
                    <div>
                      <label>
                        <input
                          type="checkbox"
                          role="switch"
                          aria-label={`Print ${label} on the card`}
                          checked={enabled}
                          disabled={locked}
                          onChange={() =>
                            update((d) => ({
                              ...d,
                              [scope]: {
                                ...d[scope],
                                [school.id]: enabled
                                  ? keys.filter((id) => id !== key)
                                  : [...keys, key],
                              },
                            }))
                          }
                        />{" "}
                        On card
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          role="switch"
                          aria-label={`Make ${label} compulsory`}
                          checked={required}
                          disabled={locked || !enabled}
                          onChange={() =>
                            update((d) => {
                              const defaults = (staff ? STAFF_FIELDS : FIELDS)
                                .filter((f) => f[3])
                                .map(([id]) => id);
                              const list =
                                d[requirements]?.[school.id] || defaults;
                              return {
                                ...d,
                                [requirements]: {
                                  ...d[requirements],
                                  [school.id]: required
                                    ? list.filter((id) => id !== key)
                                    : [...list, key],
                                },
                              };
                            })
                          }
                        />{" "}
                        Compulsory
                      </label>
                    </div>
                  </div>
                );
              },
            )}
          </div>
          <div className="padded">
            <h3>Extra school fields</h3>
            <p className="muted">
              Add a text field or a dropdown with your school’s own choices.
            </p>
            {data.customFields
              .filter(
                (f) =>
                  f.school === school.id &&
                  (fieldTarget === "Staff"
                    ? f.audience === "staff"
                    : f.audience !== "staff"),
              )
              .map((f) => (
                <div className="custom-field" key={f.id}>
                  <span>
                    {f.name}
                    {f.type === "select" ? ` · ${f.options.join(", ")}` : ""}
                  </span>
                  <label>
                    <input
                      type="checkbox"
                      checked={f.enabled !== false}
                      aria-label={`Print ${f.name} on the card`}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        update((d) => ({
                          ...d,
                          customFields: d.customFields.map((x) =>
                            x.id === f.id ? { ...x, enabled } : x,
                          ),
                        }));
                      }}
                    />{" "}
                    On card
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(f.required) && f.enabled !== false}
                      disabled={f.enabled === false}
                      aria-label={`Make ${f.name} compulsory`}
                      onChange={(e) => {
                        const required = e.target.checked;
                        update((d) => ({
                          ...d,
                          customFields: d.customFields.map((x) =>
                            x.id === f.id ? { ...x, required } : x,
                          ),
                        }));
                      }}
                    />{" "}
                    Compulsory
                  </label>
                  <IconButton
                    icon="trash"
                    label={"Remove field " + f.name}
                    onClick={() =>
                      update((d) => ({
                        ...d,
                        customFields: d.customFields.filter(
                          (x) => x.id !== f.id,
                        ),
                      }))
                    }
                  />
                </div>
              ))}
            <div className="form-grid">
              <Field label="Extra field type">
                <select
                  value={extraType}
                  onChange={(e) => setExtraType(e.target.value)}
                >
                  <option value="text">Text</option>
                  <option value="select">Dropdown</option>
                </select>
              </Field>
              {extraType === "select" && (
                <Field label="Choices" hint="Separate choices with commas.">
                  <input
                    value={extraOptions}
                    onChange={(e) => setExtraOptions(e.target.value)}
                    placeholder="Red, Blue, Green"
                  />
                </Field>
              )}
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={extraRequired}
                  onChange={(e) => setExtraRequired(e.target.checked)}
                />{" "}
                Compulsory field
              </label>
            </div>
            <div className="inline-add">
              <input
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder="e.g. House name"
                aria-label="Extra school field"
                maxLength="50"
              />
              <Button
                variant="secondary"
                disabled={!extra.trim()}
                icon="plus"
                onClick={() => {
                  if (
                    data.customFields.some(
                      (f) =>
                        f.school === school.id &&
                        (f.audience === "staff") ===
                          (fieldTarget === "Staff") &&
                        f.name.toLowerCase() === extra.trim().toLowerCase(),
                    )
                  ) {
                    notify("This extra field already exists.", "error");
                    return;
                  }
                  const options = [
                    ...new Set(
                      extraOptions
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    ),
                  ];
                  if (extraType === "select" && options.length < 2) {
                    notify("Enter at least two dropdown choices.", "error");
                    return;
                  }
                  update((d) => ({
                    ...d,
                    customFields: [
                      ...d.customFields,
                      {
                        id: uid("FIELD"),
                        school: school.id,
                        name: extra.trim(),
                        audience: fieldTarget === "Staff" ? "staff" : "student",
                        type: extraType,
                        options: extraType === "select" ? options : [],
                        enabled: true,
                        required: extraRequired,
                      },
                    ],
                  }));
                  setExtra("");
                  setExtraOptions("");
                  notify(
                    `Extra field added to the ${fieldTarget.toLowerCase()} form.`,
                  );
                }}
              >
                Add field
              </Button>
            </div>
          </div>
          <div className="table-note">
            <Icon name="checkCircle" size={15} />
            Field preferences save automatically in this browser.
          </div>
        </Panel>
      )}
      {tab === "Preview settings" && (
        <Panel
          title="Your preview, your pace"
          subtitle="A safe space to explore the whole product."
        >
          <div className="padded">
            <Callout icon="play">
              All schools, students, contacts, emails, and print records are
              fictional. Local edits persist in this browser. No backend or
              messaging service is connected.
            </Callout>
            <div className="settings-row">
              <div>
                <h3>Start fresh</h3>
                <p>
                  Restore the original sample records and remove your local
                  changes.
                </p>
              </div>
              <Button icon="reset" variant="secondary" onClick={onReset}>
                Reset demo data
              </Button>
            </div>
          </div>
        </Panel>
      )}
      {editSchool && (
        <SchoolForm
          ctx={ctx}
          value={school}
          onClose={() => setEditSchool(false)}
        />
      )}
      {password && (
        <Modal
          title="Reset password"
          subtitle="Account security is a backend integration step."
          onClose={() => setPassword(false)}
        >
          <div className="modal-body">
            <Callout icon="lock">
              This preview does not store passwords or authenticate users. A
              connected version will email a secure reset link to{" "}
              {profile.email}.
            </Callout>
          </div>
          <div className="modal-actions">
            <Button
              onClick={() => {
                setPassword(false);
                notify("Demo reset request recorded. No real email was sent.");
              }}
            >
              Simulate reset email
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Guide({ ctx }) {
  const { role, go } = ctx;
  const steps =
    role === "school"
      ? [
          [
            "students",
            "students",
            "Start with your school list",
            "Import a CSV or XLSX file with names, admission numbers, and existing email contacts.",
          ],
          [
            "email",
            "invitations",
            "Send personal invitations",
            "Select students and preview their email. Each student gets their own form link.",
          ],
          [
            "face",
            "review",
            "Check details and the photo",
            "Students confirm the demo code, complete the form, capture a photo, and submit. You review everything.",
          ],
          [
            "print",
            "printing",
            "Approve and send to print",
            "Create a batch using approved student and staff records. Track printing through delivery.",
          ],
        ]
      : [
          [
            "school",
            "schools",
            "Set up your schools",
            "Keep the school office contact and assigned agent up to date.",
          ],
          [
            "fileUp",
            "photos",
            "Upload school photo PDFs",
            "Select the school and upload a photo PDF. Add pages and notes for review.",
          ],
          [
            "review",
            "review",
            "Let the school approve",
            "School Admins review student details and photos. Teacher access is removed.",
          ],
          [
            "print",
            "printing",
            "Keep production moving",
            "Create approved batches, download card proofs and CSV data, then update the delivery timeline.",
          ],
        ];
  return (
    <>
      <PageTitle
        eyebrow="A GOOD PLACE TO START"
        title="Your first school ID, made simple."
        description="A short guide to who does what, and what happens next."
      />
      <div className="guide-banner">
        <Icon name="sparkles" size={32} />
        <div>
          <h2>One connected journey. Clear responsibilities.</h2>
          <p>
            School Admin → student invitation → school review → agent / print
            team → delivery.
          </p>
        </div>
      </div>
      <div className="guide-grid">
        {steps.map(([icon, page, title, text], i) => (
          <Panel className="guide-card" key={title}>
            <div>
              <span className="guide-number">0{i + 1}</span>
              <Icon name={icon} size={24} />
            </div>
            <h2>{title}</h2>
            <p>{text}</p>
            <Button variant="text" onClick={() => go(page)}>
              Open {page === "photos" ? "photo uploads" : page}
              <Icon name="arrow" size={14} />
            </Button>
          </Panel>
        ))}
      </div>
      <Panel
        title="Every panel, explained"
        subtitle="Use the Explore Panels dropdown at the top to walk through the full product."
      >
        <div className="role-explainer">
          {[
            [
              "shield",
              "Super Admin",
              "Manage agents and their subscription tiers, schools, academic sessions, designs, photo uploads, approval oversight, and production.",
            ],
            [
              "briefcase",
              "Premium Agent",
              "Manage assigned schools, upload school-wise photo PDFs, choose designs, and manage print batches with an own-printing option.",
            ],
            [
              "user",
              "Regular Agent",
              "Manage assigned schools, upload school-wise photo PDFs, and follow centrally fulfilled print orders.",
            ],
            [
              "school",
              "School Admin",
              "Manage students and staff, email invitations, manual corrections, classes, promotion, photo review, designs, and print submission.",
            ],
            [
              "graduation",
              "Student invitation",
              "Open a personal demo link, enter the sample verification code, complete ID fields, capture a photo, and submit for school approval.",
            ],
          ].map(([icon, name, text]) => (
            <div key={name}>
              <span>
                <Icon name={icon} />
              </span>
              <div>
                <h3>{name}</h3>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Callout icon="help">
        <strong>What changed:</strong> No separate Teacher panel or
        teacher-approval step. Teachers can still have staff ID records. Email
        links replace teacher-led student collection; WhatsApp is marked for the
        next phase. For this frontend preview, delivery, authentication, and
        identity verification are simulated.
      </Callout>
    </>
  );
}
export function Activity({ ctx }) {
  const [scope, setScope] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actor, setActor] = useState("");
  const [limit, setLimit] = useState(30);
  const permitted = new Set(
    (ctx.role === "school" ? [ctx.school] : ctx.availableSchools).map(
      ({ id }) => id,
    ),
  );
  const entries = ctx.data.audit.filter(
    (entry) => !entry.school || permitted.has(entry.school),
  );
  const actors = [
    ...new Set(entries.map((entry) => entry.actor).filter(Boolean)),
  ].sort();
  const rows = entries.filter((entry) => {
    const day = entry.time.slice(0, 10);
    return (
      (!scope || entry.school === scope) &&
      (!actor || entry.actor === actor) &&
      (!from || day >= from) &&
      (!to || day <= to)
    );
  });
  return (
    <>
      <PageTitle
        title="Activity log"
        description="See changes recorded in this browser."
      />
      <Panel title="Workspace activity">
        <div className="padded form-grid">
          {ctx.role !== "school" && (
            <Field label="Filter by school">
              <select
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value);
                  setLimit(30);
                }}
              >
                <option value="">All schools</option>
                {ctx.availableSchools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Filter by user">
            <select
              value={actor}
              onChange={(e) => {
                setActor(e.target.value);
                setLimit(30);
              }}
            >
              <option value="">All users</option>
              {actors.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </Field>
          <Field label="From date">
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setLimit(30);
              }}
            />
          </Field>
          <Field label="To date">
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.target.value);
                setLimit(30);
              }}
            />
          </Field>
        </div>
        <div className="full-activity">
          {rows.slice(0, limit).map((entry) => (
            <div key={entry.id}>
              <span className="activity-icon coral">
                <Icon name={entry.type} />
              </span>
              <div>
                <strong>{entry.text}</strong>
                <small>
                  {[entry.actor, new Date(entry.time).toLocaleString("en-IN")]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </div>
            </div>
          ))}
        </div>
        {!rows.length && (
          <Empty
            title="No matching activity"
            text="Clear filters or choose another date range."
          />
        )}
        {rows.length > limit && (
          <div className="padded">
            <Button variant="secondary" onClick={() => setLimit(limit + 30)}>
              Show more
            </Button>
          </div>
        )}
      </Panel>
    </>
  );
}
