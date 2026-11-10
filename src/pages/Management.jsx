import React, { useEffect, useState } from "react";
import { FIELDS, STAFF_FIELDS, LOCKED_FIELDS, personIcon } from "../data.js";
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
} from "../components.jsx";
import {
  uid,
  fmtDate,
  exportCSV,
  download,
  csvText,
  requiredKeys,
} from "../lib.js";
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
          agent: ctx.role === "regular" ? "AG-002" : "AG-001",
          status: "Active",
          studentRounds: 1,
          staffRounds: 1,
          color: "#326b5b",
        },
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
      title={value ? "Edit school" : "Add a school"}
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
              ["city", "City"],
              ["state", "State"],
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
            <Field label="Assigned agent">
              <select
                value={s.agent}
                onChange={(e) => set("agent", e.target.value)}
              >
                {data.agents
                  .filter(
                    (a) =>
                      ctx.role === "super" ||
                      a.id === (ctx.role === "regular" ? "AG-002" : "AG-001"),
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
                value={s.studentRounds}
                onChange={(e) => set("studentRounds", +e.target.value)}
              />
            </Field>
            <Field label="Staff printing rounds">
              <input
                type="number"
                min="1"
                max="10"
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
    [edit, setEdit] = useState(null),
    [detail, setDetail] = useState(null);
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
          <table>
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
                  <td>
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
                  <td>
                    {s.email}
                    <small className="block muted">+91 {s.phone}</small>
                  </td>
                  <td>
                    {data.agents.find((a) => a.id === s.agent)?.name ||
                      "Unassigned"}
                  </td>
                  <td>
                    {data.students.filter((x) => x.school === s.id).length}
                  </td>
                  <td>
                    <Badge>{s.status}</Badge>
                  </td>
                  <td>
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
                            name: s.name + " copy",
                            email: "",
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
          value={edit.name ? edit : null}
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
                href={`/?panel=school&school=${detail.id}`}
              >
                Open School Admin <Icon name="external" size={15} />
              </a>
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
    </>
  );
}
export function Agents({ ctx }) {
  const { data, update, notify, log } = ctx;
  const [tab, setTab] = useState("All"),
    [query, setQuery] = useState(""),
    [edit, setEdit] = useState(null),
    [reset, setReset] = useState(null);
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
          <table>
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
                  <td>
                    <div className="person-cell">
                      <Avatar name={a.name} />
                      <div>
                        <strong>{a.name}</strong>
                        <small>{a.company}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge>{a.type}</Badge>
                  </td>
                  <td>
                    {a.email}
                    <small className="block muted">{a.phone}</small>
                  </td>
                  <td>
                    <a
                      href={`/?panel=${a.type === "Premium" ? "premium" : "regular"}&page=schools`}
                    >
                      {data.schools.filter((s) => s.agent === a.id).length}{" "}
                      schools
                    </a>
                  </td>
                  <td>
                    {a.type === "Premium" ? (
                      <>
                        <span>{fmtDate(a.end)}</span>
                        <small className="block muted">Valid until</small>
                      </>
                    ) : (
                      "Not required"
                    )}
                  </td>
                  <td>
                    <Badge>{a.status}</Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      <IconButton
                        icon="edit"
                        label={"Edit agent " + a.name}
                        onClick={() => setEdit({ ...a })}
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
      {edit && (
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
    </>
  );
}
export function Staff({ ctx }) {
  const { data, school, update, notify, log } = ctx;
  const [query, setQuery] = useState(""),
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
          <table>
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
                  <td>
                    <div className="person-cell">
                      <Avatar name={s.name} photo={s.photo} />
                      <div>
                        <strong>{s.name}</strong>
                        <small>{s.id}</small>
                      </div>
                    </div>
                  </td>
                  <td>{s.role}</td>
                  <td>
                    {s.email}
                    <small className="block muted">{s.phone}</small>
                  </td>
                  <td>
                    <Badge>{s.printStatus}</Badge>
                  </td>
                  <td>
                    <Badge>{s.status}</Badge>
                  </td>
                  <td>
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
                {STAFF_FIELDS.filter((f) =>
                  (
                    data.staffFieldScope?.[school.id] ||
                    STAFF_FIELDS.map((f) => f[0])
                  ).includes(f[0]),
                ).map(([k, l, t, required]) => (
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
                              : ["Male", "Female", "Other", "Prefer not to say"]
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
                ))}
                {data.customFields
                  .filter(
                    (f) => f.school === school.id && f.audience === "staff",
                  )
                  .map((f) => (
                    <Field key={f.id} label={f.name}>
                      <input
                        value={edit.custom?.[f.id] || ""}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            custom: { ...edit.custom, [f.id]: e.target.value },
                          })
                        }
                      />
                    </Field>
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
                      staffRoles: [...d.staffRoles, newRole.trim()],
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
  const { data, schoolStudents, update, notify, go } = ctx;
  const [newClass, setNewClass] = useState(""),
    [newSection, setNewSection] = useState("");
  const [edit, setEdit] = useState(null);
  const add = (key, value, clear) => {
    if (!value.trim()) return;
    if (data[key].includes(value.trim())) {
      notify("This already exists.", "error");
      return;
    }
    update((d) => ({ ...d, [key]: [...d[key], value.trim()] }));
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
            {data.sections.map((sec) => (
              <span className="section-chip" key={sec}>
                <Badge>{sec}</Badge>
                <IconButton
                  icon="x"
                  label={"Delete section " + sec}
                  onClick={() => {
                    const n = schoolStudents.filter((st) => st.section === sec).length;
                    if (n) {
                      notify(`Section ${sec} has ${n} student${n === 1 ? "" : "s"}. Move them first.`, "error");
                      return;
                    }
                    update((d) => ({ ...d, sections: d.sections.filter((x) => x !== sec) }));
                    notify(`Section ${sec} deleted.`);
                  }}
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
                <span className="row-actions">
                  <IconButton
                    icon="edit"
                    label={"Rename class " + c}
                    onClick={() => setEdit({ from: c, name: c })}
                  />
                  <IconButton
                    icon="trash"
                    label={"Delete class " + c}
                    onClick={() => {
                      if (students.length) {
                        notify(`Class ${c} has ${students.length} students. Move or delete them first.`, "error");
                        return;
                      }
                      if (!window.confirm(`Delete class ${c}?`)) return;
                      update((d) => ({ ...d, classes: d.classes.filter((x) => x !== c) }));
                      notify(`Class ${c} deleted.`);
                    }}
                  />
                </span>
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
              <Button variant="text" onClick={() => go("students")}>
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
                  data.classes.includes(edit.name)
                ) {
                  notify("A class with that name exists.", "error");
                  return;
                }
                update((d) => ({
                  ...d,
                  classes: d.classes.map((c) =>
                    c === edit.from ? edit.name : c,
                  ),
                  students: d.students.map((s) =>
                    s.classNo === edit.from ? { ...s, classNo: edit.name } : s,
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
    </>
  );
}
export function Promotion({ ctx }) {
  const { data, schoolStudents, school, update, notify, log } = ctx;
  const [from, setFrom] = useState(data.classes[0]),
    [section, setSection] = useState("A"),
    [to, setTo] = useState(data.classes[1] || data.classes[0]),
    [targetSection, setTargetSection] = useState("A"),
    [session, setSession] = useState("2027–28"),
    [selected, setSelected] = useState([]),
    [confirm, setConfirm] = useState(false);
  const rows = schoolStudents.filter(
    (s) => s.classNo === from && s.section === section && s.active,
  );
  const picked = rows.filter((s) => selected.includes(s.id));
  const promote = () => {
    if (session === ctx.session) {
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
            x.session === session &&
            x.admission === s.admission,
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
      session,
      status: s.photo ? "In review" : "Draft",
      promotedFrom: s.id,
    }));
    update((d) =>
      log(
        {
          ...d,
          students: [...d.students, ...next],
          sessions: d.sessions.some((s) => s.name === session)
            ? d.sessions
            : [
                ...d.sessions,
                {
                  name: session,
                  start: "2027-04-01",
                  end: "2028-03-31",
                  active: false,
                },
              ],
        },
        `Promoted ${next.length} students to Class ${to} (${session})`,
        "up",
      ),
    );
    setConfirm(false);
    setSelected([]);
    notify(
      `${next.length} students copied to ${session}. Switch sessions above to view them.`,
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
            disabled={!picked.length || !/^\d{4}[–-]\d{2}$/.test(session)}
            onClick={() => setConfirm(true)}
          >
            Promote {picked.length} students
          </Button>
        }
      >
        <div className="table-wrap">
          <table>
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
                  <td>
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
                  <td>
                    <div className="person-cell">
                      <Avatar name={s.name} />
                      <div>
                        <strong>{s.name}</strong>
                        <small>{s.admission}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {s.classNo} – {s.section}
                  </td>
                  <td>
                    {to} – {targetSection}
                  </td>
                  <td>{session}</td>
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
  const { data, update, notify } = ctx;
  const [edit, setEdit] = useState(null);
  return (
    <>
      <PageTitle
        eyebrow="ONE SCHOOL YEAR AT A TIME"
        title="Keep every academic year in order."
        description="Separate this year’s identities from the next, without losing history."
      >
        <Button
          icon="plus"
          onClick={() =>
            setEdit({
              name: "2027–28",
              start: "2027-04-01",
              end: "2028-03-31",
              active: false,
            })
          }
        >
          Add session
        </Button>
      </PageTitle>
      <Panel>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ACADEMIC SESSION</th>
                <th>START DATE</th>
                <th>END DATE</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => (
                <tr key={s.name}>
                  <td>
                    <strong>{s.name}</strong>
                  </td>
                  <td>{fmtDate(s.start)}</td>
                  <td>{fmtDate(s.end)}</td>
                  <td>
                    <Badge tone={s.active ? "green" : "gray"}>
                      {s.active ? "Current" : "Archived / planned"}
                    </Badge>
                  </td>
                  <td>
                    {!s.active && (
                      <Button
                        variant="text"
                        onClick={() => {
                          update((d) => ({
                            ...d,
                            sessions: d.sessions.map((x) => ({
                              ...x,
                              active: x.name === s.name,
                            })),
                          }));
                          ctx.setSession(s.name);
                          notify("Current academic session updated.");
                        }}
                      >
                        Set as current
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {edit && (
        <Modal title="Add academic session" onClose={() => setEdit(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (data.sessions.some((s) => s.name === edit.name)) {
                notify("That session already exists.", "error");
                return;
              }
              update((d) => ({ ...d, sessions: [...d.sessions, edit] }));
              setEdit(null);
              notify("Academic session added.");
            }}
          >
            <div className="modal-body form-grid">
              <Field label="Session name">
                <input
                  required
                  pattern="[0-9]{4}[–-][0-9]{2}"
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </Field>
              <Field label="Start date">
                <input
                  type="date"
                  required
                  value={edit.start}
                  onChange={(e) => setEdit({ ...edit, start: e.target.value })}
                />
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  min={edit.start}
                  required
                  value={edit.end}
                  onChange={(e) => setEdit({ ...edit, end: e.target.value })}
                />
              </Field>
            </div>
            <div className="modal-actions">
              <Button type="submit">Save session</Button>
            </div>
          </form>
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
    [fieldTarget, setFieldTarget] = useState("Student");
  const keys =
    fieldTarget === "Student"
      ? data.fieldScope[school.id] || data.enabledFields
      : data.staffFieldScope?.[school.id] || STAFF_FIELDS.map((f) => f[0]);
  const tabs = (
    role === "school"
      ? ["Profile", "School details", "ID card fields", "Preview settings"]
      : ["Profile", "Preview settings"]
  ).filter((t) => !(ctx.live && t === "Preview settings"));
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
                profiles: { ...d.profiles, [role]: profile },
                ...(role === "school" ? { profile } : {}),
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
          <div className="field-switches">
            {(fieldTarget === "Student" ? FIELDS : STAFF_FIELDS).map(
              ([key, label, type, required]) => {
                const locked =
                  fieldTarget === "Student"
                    ? LOCKED_FIELDS.includes(key)
                    : required;
                const printed = locked || keys.includes(key);
                const compulsory =
                  locked ||
                  (fieldTarget === "Student" &&
                    printed &&
                    requiredKeys(data, school.id).includes(key));
                return (
                  <label key={key} className="field-switch-row">
                    <span>
                      <strong>{label}</strong>
                      <small>
                        {!printed
                          ? "Not printed or collected"
                          : compulsory
                            ? "Compulsory"
                            : "Optional"}
                      </small>
                    </span>
                    <span className="field-switch-controls">
                      <span className="switch-caption">On card</span>
                      <input
                        type="checkbox"
                        role="switch"
                        aria-label={`Print ${label} on the card`}
                        disabled={locked}
                        checked={printed}
                        onChange={() =>
                          update((d) => ({
                            ...d,
                            [fieldTarget === "Student"
                              ? "fieldScope"
                              : "staffFieldScope"]: {
                              ...(fieldTarget === "Student"
                                ? d.fieldScope
                                : d.staffFieldScope),
                              [school.id]: keys.includes(key)
                                ? keys.filter((k) => k !== key)
                                : [...keys, key],
                            },
                          }))
                        }
                      />
                      {fieldTarget === "Student" && (
                        <>
                          <span className="switch-caption">Compulsory</span>
                          <input
                            type="checkbox"
                            role="switch"
                            aria-label={`Make ${label} compulsory`}
                            disabled={locked || !printed}
                            checked={compulsory}
                            onChange={() =>
                              update((d) => {
                                const req = requiredKeys(d, school.id);
                                return {
                                  ...d,
                                  fieldRequired: {
                                    ...d.fieldRequired,
                                    [school.id]: req.includes(key)
                                      ? req.filter((k) => k !== key)
                                      : [...req, key],
                                  },
                                };
                              })
                            }
                          />
                        </>
                      )}
                    </span>
                  </label>
                );
              },
            )}
          </div>
          <div className="padded">
            <h3>Extra school fields</h3>
            <p className="muted">
              Optional fields for details specific to your school.
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
                  <span>{f.name}</span>
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
                        f.name.toLowerCase() === extra.trim().toLowerCase(),
                    )
                  ) {
                    notify("This extra field already exists.", "error");
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
                      },
                    ],
                  }));
                  setExtra("");
                  notify("Extra field added to the student form.");
                }}
              >
                Add field
              </Button>
            </div>
          </div>
          <div className="table-note">
            <Icon name="checkCircle" size={15} />
            Students can leave optional fields blank; compulsory fields must be
            filled before a card can be approved.
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
      {password && ctx.live && <ChangePassword ctx={ctx} onClose={() => setPassword(false)} />}
      {password && !ctx.live && (
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
function ChangePassword({ ctx, onClose }) {
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const save = async () => {
    if (next.length < 8 || !/[a-z]/i.test(next) || !/\d/.test(next))
      return setError("Use at least 8 characters with a letter and a number.");
    setBusy(true);
    try {
      await ctx.api.post("/auth/password/change", { currentPassword: current, newPassword: next });
      ctx.notify("Password changed. Other devices have been signed out.");
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Change password" onClose={onClose}>
      <div className="modal-body form-grid">
        {error && <Callout tone="coral">{error}</Callout>}
        <Field label="Current password" required>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" required hint="At least 8 characters with a letter and a number.">
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy || !current || !next} onClick={save}>
          Change password
        </Button>
      </div>
    </Modal>
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
  const { data, live, role } = ctx;
  const [filters, setFilters] = useState({ userId: "", schoolId: "", from: "", to: "" });
  const [rows, setRows] = useState(null),
    [cursor, setCursor] = useState(null),
    [users, setUsers] = useState([]),
    [error, setError] = useState("");
  const query = (c) =>
    new URLSearchParams(
      Object.entries({ ...filters, size: 50, cursor: c || "" }).filter(([, v]) => v),
    ).toString();
  const load = async (more = false) => {
    setError("");
    try {
      const r = await ctx.api.get(`/activity?${query(more ? cursor : "")}`);
      setRows((prev) => (more ? [...(prev || []), ...r.items] : r.items));
      setCursor(r.nextCursor);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    if (live) load();
  }, [live, filters]);
  useEffect(() => {
    if (live && role !== "regular" && role !== "premium")
      ctx.api.get("/users").then((r) => setUsers(r.items)).catch(() => {});
  }, [live]);
  const list = live
    ? (rows || []).map((l) => ({
        id: l.id,
        text: l.summary,
        who: l.impersonatedBy ? `${l.actorName} · opened by ${l.impersonatedBy}` : l.actorName,
        school: data.schools.find((s) => s.id === l.schoolId)?.name,
        time: l.createdAt,
        type: l.action.startsWith("batch") ? "print" : l.action.includes("invit") ? "email" : "check",
      }))
    : data.audit;
  return (
    <>
      <PageTitle
        eyebrow="A CLEAR TRAIL"
        title="Every step, accounted for."
        description={
          live
            ? role === "super"
              ? "Every action by schools, agents and administrators."
              : role === "school"
                ? "Actions on your school's records."
                : "Your own actions and your schools' activity."
            : "A browser-local record of changes made while exploring the preview."
        }
      />
      {live && (
        <div className="filters activity-filters">
          {users.length > 0 && (
            <select aria-label="Filter by user" value={filters.userId} onChange={(e) => setFilters({ ...filters, userId: e.target.value })}>
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.email}
                </option>
              ))}
            </select>
          )}
          {role !== "school" && (
            <select aria-label="Filter by school" value={filters.schoolId} onChange={(e) => setFilters({ ...filters, schoolId: e.target.value })}>
              <option value="">All schools</option>
              {data.schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <label className="date-filter">
            From <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </label>
          <label className="date-filter">
            To <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </label>
        </div>
      )}
      <Panel title="Workspace activity">
        {error && <Callout tone="coral">{error}</Callout>}
        <div className="full-activity">
          {list.map((a) => (
            <div key={a.id}>
              <span className="activity-icon coral">
                <Icon name={a.type} />
              </span>
              <div>
                <strong>{a.text}</strong>
                <small>
                  {[a.who, a.school, new Date(a.time).toLocaleString("en-IN")].filter(Boolean).join(" · ")}
                </small>
              </div>
            </div>
          ))}
        </div>
        {live && rows && !rows.length && <Empty title="No activity found" text="Try a wider date range or clear the filters." />}
        {live && cursor && (
          <div className="panel-footer">
            <Button variant="secondary" onClick={() => load(true)}>
              Load more
            </Button>
          </div>
        )}
      </Panel>
    </>
  );
}
