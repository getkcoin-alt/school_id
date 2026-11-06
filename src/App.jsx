import React, { useState, useEffect, useRef } from "react";
import { ROLES, createSeed, STORAGE_KEY } from "./data.js";
import { loadData, saveData, uid } from "./lib.js";
import {
  Icon,
  IconButton,
  Avatar,
  Button,
  Modal,
  Badge,
} from "./components.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Students from "./pages/Students.jsx";
import { Invitations, ReviewQueue } from "./pages/Collection.jsx";
import {
  Schools,
  Agents,
  Staff,
  Classes,
  Promotion,
  Sessions,
  Settings,
  Guide,
  Activity,
} from "./pages/Management.jsx";
import { PrintOrders, Designs, PhotoUploads } from "./pages/Production.jsx";
import StudentPortal from "./pages/StudentPortal.jsx";
import { clearFiles } from "./files.js";
const pageNames = {
  overview: "Overview",
  students: "Students",
  invitations: "Student invitations",
  review: "Review submissions",
  staff: "Staff directory",
  classes: "Classes & sections",
  promotion: "Promote students",
  designs: "Card & lanyard designs",
  printing: "ID card printing",
  photos: "Photo uploads",
  settings: "Settings",
  guide: "Getting started",
  schools: "Schools",
  agents: "Agents & vendors",
  sessions: "Academic sessions",
  activity: "Activity log",
};
const menuItems = {
  school: [
    [
      "WORKSPACE",
      ["overview", "dashboard"],
      ["students", "students"],
      ["invitations", "email"],
      ["review", "review"],
    ],
    [
      "SCHOOL MANAGEMENT",
      ["staff", "user"],
      ["classes", "layers"],
      ["promotion", "up"],
    ],
    [
      "PRODUCTION",
      ["designs", "design"],
      ["printing", "print"],
      ["photos", "image"],
    ],
  ],
  super: [
    [
      "WORKSPACE",
      ["overview", "dashboard"],
      ["schools", "school"],
      ["agents", "briefcase"],
      ["review", "review"],
    ],
    [
      "PRODUCTION",
      ["printing", "print"],
      ["photos", "image"],
      ["designs", "design"],
    ],
    ["MANAGEMENT", ["sessions", "calendar"], ["activity", "clock"]],
  ],
  premium: [
    ["WORKSPACE", ["overview", "dashboard"], ["schools", "school"]],
    [
      "PRODUCTION",
      ["photos", "fileUp"],
      ["printing", "print"],
      ["designs", "design"],
    ],
  ],
  regular: [
    [
      "WORKSPACE",
      ["overview", "dashboard"],
      ["schools", "school"],
      ["photos", "fileUp"],
      ["printing", "print"],
    ],
  ],
};
export default function App() {
  const initial = new URLSearchParams(window.location.search);
  const [data, setData] = useState(loadData),
    [role, setRole] = useState(
      ROLES.some((r) => r.id === initial.get("panel"))
        ? initial.get("panel")
        : "school",
    );
  const [page, setPage] = useState(
    pageNames[initial.get("page")] ? initial.get("page") : "overview",
  );
  const [schoolId, setSchoolId] = useState(initial.get("school") || "SCH-001");
  const [session, setSession] = useState("2026–27");
  const [toast, setToast] = useState(null),
    [openRoles, setOpenRoles] = useState(false),
    [notifications, setNotifications] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [globalSearch, setGlobalSearch] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [reset, setReset] = useState(false);
  const toastTimer = useRef();
  const notify = (message, tone = "success") => {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };
  const update = (fn) =>
    setData((prev) => {
      const next = typeof fn === "function" ? fn(prev) : { ...prev, ...fn };
      return next;
    });
  const log = (draft, text, type = "check") => ({
    ...draft,
    audit: [
      { id: uid("EV"), text, type, time: new Date().toISOString() },
      ...draft.audit,
    ],
  });
  useEffect(() => {
    if (!saveData(data))
      notify(
        "Browser storage is full. Remove large photo files or reset the preview.",
        "error",
      );
  }, [data]);
  useEffect(() => {
    const sync = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const next = JSON.parse(e.newValue);
          if (next.version === 1) setData(next);
        } catch {}
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("panel", role);
    if (role !== "student") {
      u.searchParams.set("page", page);
      u.searchParams.set("school", schoolId);
      u.searchParams.delete("student");
      u.searchParams.delete("token");
    }
    window.history.replaceState({}, "", u);
  }, [role, page, schoolId]);
  useEffect(() => {
    const listener = (e) => {
      if (e.key === "Escape") {
        setOpenRoles(false);
        setNotifications(false);
        setSearchOpen(false);
        setMobileNav(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const availableSchools =
    role === "premium"
      ? data.schools.filter((s) => s.agent === "AG-001")
      : role === "regular"
        ? data.schools.filter((s) => s.agent === "AG-002")
        : data.schools;
  const school =
    availableSchools.find((s) => s.id === schoolId) ||
    availableSchools[0] ||
    data.schools[0];
  const go = (target) => {
    setPage(target);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const switchRole = (id) => {
    setRole(id);
    setPage("overview");
    setOpenRoles(false);
    setMobileNav(false);
    setSchoolId(id === "regular" ? "SCH-003" : "SCH-001");
    if (id === "student") {
      const u = new URL(window.location.href);
      u.searchParams.set("student", "ST-0019");
      u.searchParams.set("token", "demo-ST-0019");
      window.history.replaceState({}, "", u);
    }
  };
  const userProfile =
    data.profiles?.[role] ||
    (role === "school"
      ? data.profile
      : role === "super"
        ? {
            name: "Platform Admin",
            email: "admin@idstudio.example",
            phone: "9876500999",
          }
        : data.agents.find(
            (a) => a.id === (role === "regular" ? "AG-002" : "AG-001"),
          ) || data.profile);
  const ctx = {
    data,
    update,
    role,
    school,
    schoolId: school.id,
    availableSchools,
    session,
    setSession,
    go,
    notify,
    log,
    setSchoolId,
    userProfile,
    design: data.schoolDesigns?.[school.id] || data.design,
    schoolStudents: data.students.filter(
      (s) => s.school === school.id && s.session === session,
    ),
  };
  const selectedRole = ROLES.find((r) => r.id === role);
  const reviewCount = ctx.schoolStudents.filter(
    (s) => s.status === "In review",
  ).length;
  const unread = data.notifications.filter((n) => !n.read).length;
  const roleControl = (
    <div className="role-switcher">
      <button
        className="role-trigger"
        onClick={() => setOpenRoles(!openRoles)}
        aria-expanded={openRoles}
        aria-haspopup="menu"
      >
        <span className="role-icon">
          <Icon name={selectedRole.icon} size={17} />
        </span>
        <span>
          <small>EXPLORE PANELS</small>
          <strong>{selectedRole.name}</strong>
        </span>
        <Icon name="down" size={15} />
      </button>
      {openRoles && (
        <>
          <button
            className="popover-dismiss"
            aria-label="Close panel selector"
            onClick={() => setOpenRoles(false)}
          />
          <div className="role-menu" role="menu">
            <p>One project. Every perspective.</p>
            {ROLES.map((r) => (
              <button
                role="menuitem"
                key={r.id}
                onClick={() => switchRole(r.id)}
                className={role === r.id ? "selected" : ""}
              >
                <span>
                  <Icon name={r.icon} />
                </span>
                <div>
                  <strong>{r.name}</strong>
                  <small>{r.subtitle}</small>
                </div>
                {r.id === role && <Icon name="check" size={16} />}
              </button>
            ))}
            <footer>
              <span className="demo-dot" /> Interactive frontend preview
            </footer>
          </div>
        </>
      )}
    </div>
  );
  let content;
  switch (page) {
    case "students":
      content = <Students ctx={ctx} />;
      break;
    case "invitations":
      content = <Invitations ctx={ctx} />;
      break;
    case "review":
      content = <ReviewQueue ctx={ctx} />;
      break;
    case "schools":
      content = <Schools ctx={ctx} />;
      break;
    case "agents":
      content = <Agents ctx={ctx} />;
      break;
    case "staff":
      content = <Staff ctx={ctx} />;
      break;
    case "classes":
      content = <Classes ctx={ctx} />;
      break;
    case "promotion":
      content = <Promotion ctx={ctx} />;
      break;
    case "sessions":
      content = <Sessions ctx={ctx} />;
      break;
    case "settings":
      content = <Settings ctx={ctx} onReset={() => setReset(true)} />;
      break;
    case "guide":
      content = <Guide ctx={ctx} />;
      break;
    case "activity":
      content = <Activity ctx={ctx} />;
      break;
    case "photos":
      content = <PhotoUploads ctx={ctx} />;
      break;
    case "designs":
      content = <Designs ctx={ctx} />;
      break;
    case "printing":
      content = <PrintOrders ctx={ctx} />;
      break;
    default:
      content = <Dashboard ctx={ctx} />;
  }
  const searchResults = globalSearch.trim()
    ? data.students
        .filter(
          (s) =>
            (role === "super" ||
              availableSchools.some((sch) => sch.id === s.school)) &&
            `${s.name} ${s.admission}`
              .toLowerCase()
              .includes(globalSearch.toLowerCase()),
        )
        .slice(0, 5)
    : [];
  return (
    <div className={role === "student" ? "student-shell" : "app-shell"}>
      {role === "student" ? (
        <>
          <header className="student-top">
            <a href="/?panel=school" className="brand student-brand">
              <img src="/logo.svg" alt="ID Studio" />
            </a>
            {roleControl}
            <span className="preview-pill">
              <span /> Preview workspace
            </span>
          </header>
          <StudentPortal ctx={ctx} />
        </>
      ) : (
        <>
          {mobileNav && (
            <button
              className="nav-scrim"
              aria-label="Close navigation"
              onClick={() => setMobileNav(false)}
            />
          )}
          <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
            <a
              className="brand"
              href="/?panel=school"
              aria-label="ID Studio home"
            >
              <img src="/logo.svg" alt="ID Studio" />
              <span className="brand-tag">SCHOOL IDENTITY, SIMPLIFIED.</span>
            </a>
            <div className="sidebar-workspace">
              <span className="workspace-icon">
                <Icon name="school" size={19} />
              </span>
              <div>
                <strong>
                  {role === "school" ? "School workspace" : "Partner workspace"}
                </strong>
                <small>
                  {role === "super"
                    ? "Platform administration"
                    : role === "school"
                      ? school.name
                      : role === "regular"
                        ? "Papertrail Studio"
                        : "Northstar Print Co."}
                </small>
              </div>
            </div>
            <nav aria-label="Main navigation">
              {(menuItems[role] || menuItems.school).map(
                ([group, ...items]) => (
                  <div className="nav-group" key={group}>
                    <p>{group}</p>
                    {items.map(([key, icon]) => (
                      <button
                        key={key}
                        className={page === key ? "active" : ""}
                        onClick={() => go(key)}
                      >
                        <Icon name={icon} size={18} />
                        <span>{pageNames[key]}</span>
                        {key === "review" && reviewCount > 0 ? (
                          <b>{reviewCount}</b>
                        ) : key === "invitations" ? (
                          <span className="nav-new">NEW</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ),
              )}
            </nav>
            <div className="sidebar-bottom">
              <div className="guide-tile">
                <span>
                  <Icon name="sparkles" size={18} />
                  <strong>A little guidance?</strong>
                </span>
                <p>Your first batch, made easy.</p>
                <button onClick={() => go("guide")}>
                  Open quick-start guide <Icon name="arrow" size={14} />
                </button>
              </div>
              <button
                className={`bottom-nav ${page === "settings" ? "active" : ""}`}
                onClick={() => go("settings")}
              >
                <Icon name="settings" />
                <span>Settings</span>
              </button>
              <button
                className={`bottom-nav ${page === "guide" ? "active" : ""}`}
                onClick={() => go("guide")}
              >
                <Icon name="help" />
                <span>Help & getting started</span>
              </button>
              <div className="sidebar-profile">
                <Avatar name={userProfile.name} size={34} />
                <div>
                  <strong>{userProfile.name}</strong>
                  <small>{selectedRole.name}</small>
                </div>
                <IconButton
                  icon="settings"
                  label="Profile settings"
                  onClick={() => go("settings")}
                />
              </div>
            </div>
          </aside>
          <div className="main-shell">
            <header className="topbar">
              <div className="breadcrumbs">
                <IconButton
                  icon="menu"
                  label="Open navigation"
                  className="icon-btn mobile-menu"
                  onClick={() => setMobileNav(true)}
                />
                <Icon name="school" size={17} />
                <span>
                  {role === "school" ? "School workspace" : selectedRole.name}
                </span>
                <Icon name="chevron" size={13} />
                <strong>{pageNames[page]}</strong>
              </div>
              <div className="topbar-right">
                {roleControl}
                <span className="header-separator" />
                <button
                  className="icon-btn"
                  title="Search students"
                  aria-label="Search students"
                  onClick={() => setSearchOpen(true)}
                >
                  <Icon name="search" />
                </button>
                <div className="notifications-wrap">
                  <button
                    className="icon-btn notification-button"
                    aria-label="Notifications"
                    onClick={() => setNotifications(!notifications)}
                  >
                    <Icon name="bell" />
                    {unread > 0 && <i />}
                  </button>
                  {notifications && (
                    <div className="notification-menu">
                      <div>
                        <strong>Notifications</strong>
                        <button
                          onClick={() =>
                            update((d) => ({
                              ...d,
                              notifications: d.notifications.map((n) => ({
                                ...n,
                                read: true,
                              })),
                            }))
                          }
                        >
                          Mark all read
                        </button>
                      </div>
                      {data.notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => {
                            go(n.title.includes("PDF") ? "photos" : "review");
                            setNotifications(false);
                          }}
                        >
                          <span className={n.read ? "read" : ""} />
                          <div>
                            <strong>{n.title}</strong>
                            <small>{n.text}</small>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Avatar name={userProfile.name} size={34} />
              </div>
            </header>
            <main>
              <div className="workspace-context">
                <div>
                  <span className="demo-dot" />
                  <span>DEMO WORKSPACE</span>
                  <span className="context-divider">/</span>
                  <span>Fictional data · changes stay in this browser</span>
                </div>
                <div>
                  <Icon name="calendar" size={14} />
                  <select
                    aria-label="Academic session"
                    value={session}
                    onChange={(e) => setSession(e.target.value)}
                  >
                    {data.sessions.map((s) => (
                      <option key={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {content}
              <footer className="main-footer">
                <span>© 2026 ID Studio</span>
                <span>A little less admin. A lot more school.</span>
                <button onClick={() => go("guide")}>
                  Need a hand? <Icon name="upRight" size={13} />
                </button>
              </footer>
            </main>
          </div>
        </>
      )}
      {toast && (
        <div role="status" className={`toast ${toast.tone}`}>
          <Icon
            name={toast.tone === "error" ? "alert" : "checkCircle"}
            size={20}
          />
          <span>{toast.message}</span>
          <IconButton
            icon="x"
            label="Dismiss notification"
            onClick={() => setToast(null)}
          />
        </div>
      )}
      {searchOpen && (
        <Modal
          title="Find a student"
          subtitle="Search by name or admission number."
          onClose={() => setSearchOpen(false)}
        >
          <div className="modal-body">
            <div className="search-box">
              <Icon name="search" />
              <input
                autoFocus
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Try Aarav or 2026001"
                aria-label="Global student search"
              />
            </div>
            {searchResults.map((s) => (
              <button
                className="search-result"
                key={s.id}
                onClick={() => {
                  setSchoolId(s.school);
                  setSession(s.session);
                  go("students");
                  setSearchOpen(false);
                }}
              >
                <Avatar name={s.name} />
                <div>
                  <strong>{s.name}</strong>
                  <small>
                    {s.admission} · Class {s.classNo} {s.section}
                  </small>
                </div>
                <Badge>{s.status}</Badge>
              </button>
            ))}
            {globalSearch && !searchResults.length && (
              <p className="muted padded">No matching students.</p>
            )}
          </div>
        </Modal>
      )}
      {reset && (
        <Modal
          title="Reset this preview?"
          subtitle="This removes local edits, uploads, and submissions and restores the fictional sample data."
          onClose={() => setReset(false)}
        >
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setReset(false)}>
              Keep my changes
            </Button>
            <Button
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                clearFiles().catch(() => {});
                setData(createSeed());
                setReset(false);
                setSession("2026–27");
                notify("Preview reset to the original sample data.");
              }}
            >
              Reset preview
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
