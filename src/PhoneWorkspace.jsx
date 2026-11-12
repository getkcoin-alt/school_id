import React, { useEffect, useState } from "react";
import { Avatar, Badge, Button, Icon, Modal } from "./components.jsx";
import { ROLES } from "./data.js";
import { eligible, firstName, isNotSubmitted } from "./lib.js";
import { ImportStudents } from "./pages/Students.jsx";

const homeTab = ["overview", "Home", "dashboard"];
const printTab = ["printing", "Print", "print"];
const schoolsTab = ["schools", "Schools", "school"];
const phoneTabs = {
  school: [
    homeTab,
    ["students", "Students", "students"],
    ["review", "Review", "review"],
    printTab,
  ],
  super: [homeTab, schoolsTab, ["agents", "Agents", "briefcase"], printTab],
  premium: [homeTab, schoolsTab, ["photos", "Photos", "fileUp"], printTab],
  regular: [homeTab, schoolsTab, ["photos", "Photos", "fileUp"], printTab],
};

export default function PhoneWorkspace({
  ctx,
  page,
  pageNames,
  groups,
  selectedRole,
  switchRole,
  onSearch,
  reviewCount,
  children,
}) {
  const { data, go, role, update } = ctx;
  const [sheet, setSheet] = useState(null);
  const tabs = phoneTabs[role];
  const close = () => setSheet(null);
  const navigate = (target) => {
    close();
    go(target);
  };
  const hasUnread = data.notifications.some((item) => !item.read);
  const moreActive = !tabs.some(([key]) => key === page);
  useEffect(() => {
    setSheet(null);
  }, [page, role]);

  return (
    <>
      <header className="phone-bar">
        <button
          className="phone-brand"
          aria-label="ID Studio home"
          onClick={() => navigate("overview")}
        >
          <img src="/logo.svg" alt="" />
        </button>
        <button
          className="phone-role"
          aria-label={`Switch panel, current panel ${selectedRole.name}`}
          onClick={() => setSheet("roles")}
        >
          <span>ID Studio</span>
          <small>
            {selectedRole.name} <Icon name="down" size={13} />
          </small>
        </button>
        <button
          className="phone-icon"
          aria-label="Search students"
          onClick={onSearch}
        >
          <Icon name="search" size={21} />
        </button>
        <button
          className="phone-icon phone-bell"
          aria-label="Notifications"
          onClick={() => setSheet("notifications")}
        >
          <Icon name="bell" size={21} />
          {hasUnread && <i />}
        </button>
      </header>
      <main className={`phone-page phone-page-${page}`}>
        {page !== "overview" && (
          <h1 className="phone-page-title">{pageNames[page]}</h1>
        )}
        {children}
      </main>
      <nav className="phone-tabs" aria-label="App navigation">
        {tabs.map(([key, label, icon]) => (
          <button
            key={key}
            aria-current={page === key ? "page" : undefined}
            onClick={() => navigate(key)}
          >
            <span className="phone-tab-icon">
              <Icon name={icon} size={22} />
              {key === "review" && reviewCount > 0 && <i aria-hidden="true" />}
            </span>
            {label}
          </button>
        ))}
        <button
          aria-current={moreActive ? "page" : undefined}
          aria-expanded={sheet === "menu"}
          onClick={() => setSheet("menu")}
        >
          <span className="phone-tab-icon">
            <Icon name="more" size={22} />
          </span>
          More
        </button>
      </nav>
      {sheet === "menu" && (
        <Modal title="Menu" onClose={close}>
          <div className="modal-body phone-menu">
            <label className="phone-session">
              <Icon name="calendar" size={18} />
              <span>Academic session</span>
              <select
                value={ctx.session}
                onChange={(e) => ctx.setSession(e.target.value)}
              >
                {data.sessions.map(({ name }) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            {[
              ...groups,
              ["Account", ["settings", "settings"], ["guide", "help"]],
            ].map(([group, ...items]) => (
              <section key={group}>
                <h3>{group}</h3>
                {items.map(([key, icon]) => (
                  <button
                    key={key}
                    className="phone-menu-row"
                    aria-current={page === key ? "page" : undefined}
                    onClick={() => navigate(key)}
                  >
                    <Icon name={icon} size={20} />
                    <span>{pageNames[key]}</span>
                    <Icon name="chevron" size={16} />
                  </button>
                ))}
              </section>
            ))}
          </div>
        </Modal>
      )}
      {sheet === "roles" && (
        <Modal title="Switch panel" onClose={close}>
          <div className="modal-body phone-menu">
            {ROLES.map((item) => (
              <button
                key={item.id}
                className="phone-menu-row"
                aria-current={role === item.id ? "true" : undefined}
                onClick={() => {
                  close();
                  switchRole(item.id);
                }}
              >
                <Icon name={item.icon} size={22} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.subtitle}</small>
                </span>
                <Icon name={role === item.id ? "check" : "chevron"} size={17} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {sheet === "notifications" && (
        <Modal title="Notifications" onClose={close}>
          <div className="modal-body phone-menu">
            {hasUnread && (
              <Button
                variant="text"
                onClick={() =>
                  update((d) => ({
                    ...d,
                    notifications: d.notifications.map((item) => ({
                      ...item,
                      read: true,
                    })),
                  }))
                }
              >
                Mark all read
              </Button>
            )}
            {data.notifications.length === 0 && <p>No notifications yet.</p>}
            {data.notifications.map((item) => (
              <button
                key={item.id}
                className="phone-menu-row"
                onClick={() =>
                  navigate(item.title.includes("PDF") ? "photos" : "review")
                }
              >
                <Icon name={item.read ? "bell" : "dot"} size={20} />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.text}</small>
                </span>
                <Icon name="chevron" size={16} />
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

export function PhoneHome({ ctx }) {
  const {
    data,
    role,
    school,
    schoolStudents,
    availableSchools,
    userProfile,
    go,
    session,
    setSession,
  } = ctx;
  const [importing, setImporting] = useState(false);
  const schoolAdmin = role === "school";
  const forReview = schoolStudents.filter(
    (student) => student.status === "In review",
  );
  const approved = schoolStudents.filter(eligible).length;
  const waiting = schoolStudents.filter(isNotSubmitted).length;
  const batches = data.batches.filter((batch) =>
    availableSchools.some((item) => item.id === batch.school),
  );
  const stats = schoolAdmin
    ? [
        ["students", "Students", schoolStudents.length, "students"],
        ["review", "To review", forReview.length + waiting, "review"],
        ["print", "Ready to print", approved, "printing"],
      ]
    : [
        ["school", "Schools", availableSchools.length, "schools"],
        [
          "fileUp",
          "Photo PDFs",
          data.uploads.filter((upload) =>
            availableSchools.some((item) => item.id === upload.school),
          ).length,
          "photos",
        ],
        ["print", "Batches", batches.length, "printing"],
      ];
  const actions = schoolAdmin
    ? [
        ["send", "Invite students", () => go("invitations")],
        ["upload", "Import Excel", () => setImporting(true)],
        ["review", "Review students", () => go("review")],
        ["print", "Print batches", () => go("printing")],
        ["fileUp", "Review photo PDFs", () => go("photos")],
      ]
    : [
        ["school", "Manage schools", () => go("schools")],
        ["fileUp", "Upload photo PDF", () => go("photos")],
        ["print", "Print batches", () => go("printing")],
        role === "super"
          ? ["briefcase", "Manage agents", () => go("agents")]
          : ["help", "Quick guide", () => go("guide")],
      ];

  return (
    <>
      <section className="phone-welcome" aria-labelledby="phone-home-title">
        <div className="phone-welcome-context">
          <span>
            <Icon name="school" size={16} />{" "}
            {schoolAdmin
              ? school.name
              : ROLES.find((item) => item.id === role).name}
          </span>
          <select
            aria-label="Academic session"
            value={session}
            onChange={(e) => setSession(e.target.value)}
          >
            {data.sessions.map(({ name }) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
        <h1 id="phone-home-title">Hello, {firstName(userProfile.name)}.</h1>
        <p>School ID workspace</p>
        <div className="phone-stats">
          {stats.map(([icon, label, count, target]) => (
            <button key={label} onClick={() => go(target)}>
              <Icon name={icon} size={18} />
              <strong>{count}</strong>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>
      <section
        className="phone-home-section"
        aria-labelledby="quick-actions-title"
      >
        <h2 id="quick-actions-title">Quick actions</h2>
        <div className="phone-actions">
          {actions.map(([icon, label, action]) => (
            <button key={label} onClick={action}>
              <span>
                <Icon name={icon} size={21} />
              </span>
              <strong>{label}</strong>
              <Icon name="chevron" size={16} />
            </button>
          ))}
        </div>
      </section>
      {schoolAdmin ? (
        <section
          className="phone-home-section"
          aria-labelledby="phone-reviews-title"
        >
          <div className="phone-section-heading">
            <h2 id="phone-reviews-title">Awaiting review</h2>
            <Button variant="text" onClick={() => go("review")}>
              View all
            </Button>
          </div>
          <div className="phone-home-list">
            {forReview.length === 0 && <p>No submissions to review.</p>}
            {forReview.slice(0, 3).map((student) => (
              <button key={student.id} onClick={() => go("review", student.id)}>
                <Avatar name={student.name} photo={student.photo} size={40} />
                <span>
                  <strong>{student.name}</strong>
                  <small>
                    Class {student.classNo} · {student.section}
                  </small>
                </span>
                <Icon name="chevron" size={17} />
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section
          className="phone-home-section"
          aria-labelledby="phone-batches-title"
        >
          <div className="phone-section-heading">
            <h2 id="phone-batches-title">Recent print batches</h2>
            <Button variant="text" onClick={() => go("printing")}>
              View all
            </Button>
          </div>
          <div className="phone-home-list">
            {batches.length === 0 && <p>No print batches yet.</p>}
            {batches.slice(0, 3).map((batch) => (
              <button key={batch.id} onClick={() => go("printing")}>
                <Icon name="print" size={20} />
                <span>
                  <strong>{batch.name}</strong>
                  <small>{batch.count} cards</small>
                </span>
                <Badge>{batch.status}</Badge>
              </button>
            ))}
          </div>
        </section>
      )}
      <p className="phone-demo-note">Demo workspace · Sample data</p>
      {importing && (
        <ImportStudents ctx={ctx} onClose={() => setImporting(false)} />
      )}
    </>
  );
}
