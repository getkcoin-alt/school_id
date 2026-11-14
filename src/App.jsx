import React, { useState, useEffect, useRef } from "react";
import { ROLES, createSeed, STORAGE_KEY } from "./data.js";
import {
  loadData,
  readPreviewData,
  saveData,
  uid,
  sessionsFor,
  currentSession,
} from "./lib.js";
import {
  Icon,
  IconButton,
  Avatar,
  Button,
  Modal,
  Badge,
  Empty,
  Feedback,
  FeedbackContext,
} from "./components.jsx";
import PreviewAccess from "./PreviewAccess.jsx";
import WorkspaceSearch from "./WorkspaceSearch.jsx";
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
import PhoneWorkspace, { PhoneHome } from "./PhoneWorkspace.jsx";
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
      ["sessions", "calendar"],
      ["promotion", "up"],
    ],
    [
      "PRODUCTION",
      ["designs", "design"],
      ["printing", "print"],
      ["photos", "image"],
    ],
    ["MANAGEMENT", ["activity", "clock"]],
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
    [
      "WORKSPACE",
      ["overview", "dashboard"],
      ["schools", "school"],
      ["sessions", "calendar"],
    ],
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
      ["sessions", "calendar"],
      ["photos", "fileUp"],
      ["printing", "print"],
    ],
  ],
};
export default function App() {
  const initial = new URLSearchParams(window.location.search);
  const appRoute = /^\/app\/?$/.test(window.location.pathname);
  const [narrowScreen, setNarrowScreen] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const phoneView = appRoute || narrowScreen;
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const change = () => setNarrowScreen(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const [data, setData] = useState(loadData),
    [role, setRole] = useState(
      ROLES.some((r) => r.id === initial.get("panel"))
        ? initial.get("panel")
        : "school",
    );
  const [page, setPage] = useState(
    pageNames[initial.get("page")] ? initial.get("page") : "overview",
  );
  const [requestedAgent, setRequestedAgent] = useState(initial.get("agent"));
  const [schoolId, setSchoolId] = useState(initial.get("school") || "SCH-001");
  const [screenRecord, setScreenRecord] = useState(initial.get("record"));
  const [recordVisit, setRecordVisit] = useState(0);
  const [sessionView, setSessionView] = useState(() => ({
    school: initial.get("school") || "SCH-001",
    name: initial.get("session") || "",
  }));
  const [toast, setToast] = useState(null),
    [openRoles, setOpenRoles] = useState(false),
    [notifications, setNotifications] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [accessOpen, setAccessOpen] = useState(initial.get("access") === "demo"),
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
          const next = readPreviewData(e.newValue);
          if (next) setData(next);
        } catch {}
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    const listener = (e) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "k" &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        if (
          new URLSearchParams(window.location.search).get("panel") !== "student"
        )
          setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setOpenRoles(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const isAgent = ["premium", "regular"].includes(role);
  const defaultAgent = data.agents.find(
    (a) =>
      a.id === (role === "regular" ? "AG-002" : "AG-001") &&
      a.type.toLowerCase() === role,
  );
  const agent = isAgent
    ? data.agents.find(
        (a) => a.id === requestedAgent && a.type.toLowerCase() === role,
      ) ||
      defaultAgent ||
      data.agents.find((a) => a.type.toLowerCase() === role)
    : null;
  const availableSchools = isAgent
    ? data.schools.filter((s) => s.agent === agent?.id && agent)
    : data.schools;
  const school = availableSchools.find((s) => s.id === schoolId) ||
    availableSchools[0] || { id: "", name: "No school assigned" };
  const sessions = sessionsFor(data, school.id);
  const session =
    sessionView.school === school.id &&
    sessions.some((item) => item.name === sessionView.name)
      ? sessionView.name
      : currentSession(data, school.id);
  const setSession = (name, targetSchool = school.id) =>
    setSessionView({ school: targetSchool, name });
  const changeSchool = (id) => {
    setSchoolId(id);
    setSessionView({ school: id, name: "" });
  };
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("panel", role);
    if (requestedAgent && ["regular", "premium"].includes(role))
      u.searchParams.set("agent", requestedAgent);
    else u.searchParams.delete("agent");
    if (role !== "student") {
      u.searchParams.set("session", session);
      u.searchParams.set("page", page);
      u.searchParams.set("school", schoolId);
      if (
        [
          "review",
          "students",
          "photos",
          "staff",
          "schools",
          "agents",
          "printing",
        ].includes(page) &&
        screenRecord
      )
        u.searchParams.set("record", screenRecord);
      else u.searchParams.delete("record");
      u.searchParams.delete("student");
      u.searchParams.delete("token");
      if (!accessOpen) u.searchParams.delete("access");
    }
    window.history.replaceState({}, "", u);
  }, [role, page, schoolId, screenRecord, requestedAgent, session, accessOpen]);
  const go = (target, record = null) => {
    if (phoneView && (target !== page || record !== screenRecord))
      window.history.pushState({}, "", window.location.href);
    setPage(target);
    setScreenRecord(record);
    if (["review", "photos"].includes(target) || record)
      setRecordVisit((visit) => visit + 1);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const switchRole = (id) => {
    if (phoneView && id !== role)
      window.history.pushState({}, "", window.location.href);
    setRole(id);
    setRequestedAgent(null);
    setPage("overview");
    setScreenRecord(null);
    setOpenRoles(false);
    setAccessOpen(false);
    changeSchool(id === "regular" ? "SCH-003" : "SCH-001");
    if (id === "student") {
      const u = new URL(window.location.href);
      u.searchParams.set("student", "ST-0019");
      u.searchParams.set("token", "demo-ST-0019");
      window.history.replaceState({}, "", u);
    }
  };
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const panel = params.get("panel");
      const screen = params.get("page");
      setRole(ROLES.some((entry) => entry.id === panel) ? panel : "school");
      setPage(pageNames[screen] ? screen : "overview");
      setRequestedAgent(params.get("agent"));
      setSchoolId(params.get("school") || "SCH-001");
      setSessionView({
        school: params.get("school") || "SCH-001",
        name: params.get("session") || "",
      });
      setScreenRecord(params.get("record"));
      setOpenRoles(false);
      setNotifications(false);
      setSearchOpen(false);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const profileKey =
    role === "school"
      ? `school:${school.id}`
      : isAgent
        ? `agent:${agent?.id || role}`
        : role;
  const legacyProfile =
    (role === "school" && school.id === "SCH-001") ||
    (isAgent && agent && agent.id === defaultAgent?.id) ||
    role === "super"
      ? data.profiles?.[role]
      : null;
  const userProfile =
    data.profiles?.[profileKey] ||
    legacyProfile ||
    (role === "school"
      ? school.id === "SCH-001"
        ? data.profile
        : {
            name: school.principal || school.name,
            email: school.email || "",
            phone: school.phone || "",
          }
      : role === "super"
        ? {
            name: "Platform Admin",
            email: "admin@idstudio.example",
            phone: "9876500999",
          }
        : agent || { name: "Agent", email: "", phone: "" });
  const log = (draft, text, type = "check") => ({
    ...draft,
    audit: [
      {
        id: uid("EV"),
        text,
        type,
        time: new Date().toISOString(),
        school: school.id,
        actor: userProfile.name,
      },
      ...draft.audit,
    ],
  });
  const ctx = {
    data: {
      ...data,
      classes: data.schoolClasses?.[school.id] || data.classes,
      sections: data.schoolSections?.[school.id] || data.sections,
      staffRoles: data.schoolStaffRoles?.[school.id] || data.staffRoles,
    },
    update,
    role,
    school,
    schoolId: school.id,
    availableSchools,
    session,
    sessions,
    setSession,
    go,
    notify,
    log,
    setSchoolId: changeSchool,
    userProfile,
    profileKey,
    agentId: agent?.id,
    phoneView,
    reviewRecord: page === "review" ? screenRecord : null,
    studentRecord: page === "students" ? screenRecord : null,
    photoRecord: page === "photos" ? screenRecord : null,
    record: screenRecord,
    design: data.schoolDesigns?.[school.id] || data.design,
    schoolStudents: data.students.filter(
      (s) => s.school === school.id && s.session === session,
    ),
  };
  const selectedRole = ROLES.find((r) => r.id === role);
  const reviewCount = ctx.schoolStudents.filter(
    (s) => s.status === "In review",
  ).length;
  const alerts = data.notifications.flatMap((item) => {
    const legacySchool = data.schools.find((entry) =>
      item.text?.startsWith(`${entry.name} ·`),
    );
    const alertSchool =
      item.school ||
      legacySchool?.id ||
      ([1, 2].includes(item.id) ? "SCH-001" : school.id);
    const student = item.student
      ? data.students.find((record) => record.id === item.student)
      : legacySchool &&
        data.students.find(
          (record) =>
            record.school === alertSchool &&
            item.title === `${record.name} submitted ID details`,
        );
    const target =
      item.page || (item.title === "Photo PDF received" ? "photos" : "review");
    const canOpen = (menuItems[role] || []).some(([, ...items]) =>
      items.some(([key]) => key === target),
    );
    const inScope =
      role === "school"
        ? alertSchool === school.id
        : availableSchools.some((entry) => entry.id === alertSchool);
    return canOpen && inScope
      ? [{ ...item, target, alertSchool, student }]
      : [];
  });
  const hasUnread = alerts.some((item) => !item.read);
  const markRead = (ids) => {
    update((d) => ({
      ...d,
      notifications: d.notifications.map((item) =>
        ids.includes(item.id) && !item.read ? { ...item, read: true } : item,
      ),
    }));
  };
  const openAlert = (item) => {
    markRead([item.id]);
    setSchoolId(item.alertSchool);
    if (item.student) setSession(item.student.session, item.alertSchool);
    if (item.batch) go("printing", item.batch);
    else if (item.student?.status === "Submitted for print")
      go("printing", item.student.batch);
    else {
      const pdf =
        item.target === "photos" &&
        data.uploads.find(
          (file) =>
            file.school === item.alertSchool &&
            (item.pdf
              ? file.id === item.pdf
              : item.text?.startsWith(`${file.name} ·`)),
        );
      go(item.target, item.student?.id || pdf?.id || null);
    }
    setNotifications(false);
  };
  const roleControl = (
    <div className="role-switcher">
      <button
        className="role-trigger"
        onClick={() => setOpenRoles(!openRoles)}
        aria-expanded={openRoles}
        aria-haspopup={phoneView ? "dialog" : "menu"}
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
      {openRoles && !phoneView && (
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
      content = (
        <Students
          key={`${screenRecord || "students"}-${recordVisit}`}
          ctx={ctx}
        />
      );
      break;
    case "invitations":
      content = <Invitations ctx={ctx} />;
      break;
    case "review":
      content = (
        <ReviewQueue
          key={`${screenRecord || "review"}-${recordVisit}`}
          ctx={ctx}
        />
      );
      break;
    case "schools":
      content = (
        <Schools
          key={`-${screenRecord || "Schools"}-${recordVisit}`}
          ctx={ctx}
        />
      );
      break;
    case "agents":
      content = (
        <Agents key={`-${screenRecord || "Agents"}-${recordVisit}`} ctx={ctx} />
      );
      break;
    case "staff":
      content = (
        <Staff
          key={`${school.id}-${screenRecord || "Staff"}-${recordVisit}`}
          ctx={ctx}
        />
      );
      break;
    case "classes":
      content = <Classes ctx={ctx} />;
      break;
    case "promotion":
      content = <Promotion key={`${school.id}-${session}`} ctx={ctx} />;
      break;
    case "sessions":
      content = (
        <Sessions
          key={`${school.id}-${screenRecord || "Sessions"}-${recordVisit}`}
          ctx={ctx}
        />
      );
      break;
    case "settings":
      content = (
        <Settings key={profileKey} ctx={ctx} onReset={() => setReset(true)} />
      );
      break;
    case "guide":
      content = <Guide ctx={ctx} />;
      break;
    case "activity":
      content = <Activity ctx={ctx} />;
      break;
    case "photos":
      content = (
        <PhotoUploads
          key={`${school.id}-${screenRecord || "photos"}-${recordVisit}`}
          ctx={ctx}
        />
      );
      break;
    case "designs":
      content = <Designs ctx={ctx} />;
      break;
    case "printing":
      content = (
        <PrintOrders
          key={`-${screenRecord || "PrintOrders"}-${recordVisit}`}
          ctx={ctx}
        />
      );
      break;
    default:
      content = phoneView ? <PhoneHome ctx={ctx} /> : <Dashboard ctx={ctx} />;
  }
  if (
    isAgent &&
    !school.id &&
    ["photos", "printing", "designs", "sessions"].includes(page)
  ) {
    content = (
      <Empty
        title="Add a school to get started"
        text="Assign a school to this agent before managing photos, designs, or print batches."
        action={<Button onClick={() => go("schools")}>Go to schools</Button>}
      />
    );
  }
  const searchablePages = [
    ...(menuItems[role] || []).flatMap(([, ...items]) => items),
    ["settings", "settings"],
    ["guide", "help"],
  ].map(([key, icon]) => [key, pageNames[key], icon]);
  const workspace = (
    <div
      className={
        role === "student"
          ? `student-shell ${phoneView ? "student-app" : ""}`
          : phoneView
            ? "phone-workspace"
            : "app-shell"
      }
    >
      {role === "student" ? (
        <>
          <header className="student-top">
            <a
              href={`${appRoute ? "/app" : "/"}?panel=school`}
              className="brand student-brand"
            >
              <img src="/logo.svg" alt="ID Studio" />
            </a>
            {roleControl}
            <span className="preview-pill">
              <span /> Preview workspace
            </span>
          </header>
          <StudentPortal ctx={ctx} />
        </>
      ) : phoneView ? (
        <PhoneWorkspace
          ctx={ctx}
          page={page}
          pageNames={pageNames}
          groups={menuItems[role] || menuItems.school}
          selectedRole={selectedRole}
          onRoles={() => setOpenRoles(true)}
          onSearch={() => setSearchOpen(true)}
          onNotifications={() => setNotifications(true)}
          hasUnread={hasUnread}
          reviewCount={reviewCount}
        >
          {content}
        </PhoneWorkspace>
      ) : (
        <>
          <aside className="sidebar">
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
                  title="Search workspace (Ctrl/⌘ + K)"
                  aria-label="Search workspace"
                  onClick={() => setSearchOpen(true)}
                >
                  <Icon name="search" />
                </button>
                <button
                  className="icon-btn notification-button"
                  aria-label="Notifications"
                  aria-haspopup="dialog"
                  onClick={() => setNotifications(true)}
                >
                  <Icon name="bell" />
                  {hasUnread && <i aria-hidden="true" />}
                </button>
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
                    {sessions.map((s) => (
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
      <Feedback />
      {openRoles && phoneView && (
        <Modal
          title="Switch panel"
          placement="top"
          onClose={() => setOpenRoles(false)}
        >
          <div className="modal-body phone-menu">
            {ROLES.map((item) => (
              <button
                key={item.id}
                className="phone-menu-row"
                aria-current={role === item.id ? "true" : undefined}
                onClick={() => switchRole(item.id)}
              >
                <Icon name={item.icon} size={22} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.subtitle}</small>
                </span>
                <Icon name={role === item.id ? "check" : "chevron"} size={17} />
              </button>
            ))}
            {role !== "student" && (
              <Button
                variant="secondary"
                icon="lock"
                onClick={() => {
                  setOpenRoles(false);
                  setAccessOpen(true);
                }}
              >
                Preview sign-in and account setup
              </Button>
            )}
          </div>
        </Modal>
      )}
      {notifications && (
        <Modal
          title="Notifications"
          placement="top"
          onClose={() => setNotifications(false)}
        >
          <div className="modal-body notification-list">
            {hasUnread && (
              <Button
                variant="text"
                onClick={() => markRead(alerts.map(({ id }) => id))}
              >
                Mark all as read
              </Button>
            )}
            {!alerts.length && <p className="muted">No notifications yet.</p>}
            {alerts.map((item) => (
              <button
                key={item.id}
                className="phone-menu-row notification-row"
                onClick={() => openAlert(item)}
              >
                <span
                  className="notification-indicator"
                  data-unread={!item.read || undefined}
                  aria-label={item.read ? "Read" : "Unread"}
                  role="img"
                />
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
      {accessOpen && (
        <PreviewAccess
          onClose={() => setAccessOpen(false)}
          onEnter={switchRole}
        />
      )}
      {searchOpen && (
        <WorkspaceSearch
          ctx={ctx}
          pages={searchablePages}
          onClose={() => setSearchOpen(false)}
        />
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
  return (
    <FeedbackContext.Provider
      value={toast ? { ...toast, dismiss: () => setToast(null) } : null}
    >
      {workspace}
    </FeedbackContext.Provider>
  );
}
