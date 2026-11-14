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
import PortalLive from "./pages/PortalLive.jsx";
import { Login, Onboard } from "./pages/Auth.jsx";
import { clearFiles } from "./files.js";
import { api, apiMode, auth, downloadFile, onAuthChange } from "./api/client.js";
import { loadWorkspace, pushChanges, onApprovalReport } from "./api/sync.js";
import { ROLE_FROM_API } from "./api/mappers.js";
import CommandPalette from "./CommandPalette.jsx";
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
    ["WORKSPACE", ["overview", "dashboard"], ["schools", "school"], ["sessions", "calendar"]],
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
/**
 * With VITE_API_URL set the app runs against the production API: people sign in,
 * see only what their role allows and every change is saved on the server.
 * Without it, the original self-contained preview (Explore Panels) still works.
 */
export default function Root() {
  const params = new URLSearchParams(window.location.search);
  const [state, setState] = useState(apiMode ? "loading" : "demo");
  const [initialData, setInitialData] = useState(null);
  const [onboard, setOnboard] = useState(params.get("onboard"));
  const invite = params.get("invite");
  const start = async () => {
    try {
      const school = new URLSearchParams(window.location.search).get("school");
      setInitialData(await loadWorkspace(school));
      setState("ready");
    } catch {
      setState("login");
    }
  };
  useEffect(() => {
    if (!apiMode || invite || onboard) return;
    auth.restore().then((ok) => (ok ? start() : setState("login")));
    return onAuthChange(() => {
      // Switching account (open account / return to super admin / sign in):
      // start on that account's own overview, not the page the last one was on.
      window.history.replaceState({}, "", auth.takeLanding() || "/");
      if (!auth.isSignedIn()) setState("login");
      else start();
    });
  }, [onboard]);
  if (!apiMode) return <App />;
  if (invite)
    return (
      <div className="student-shell">
        <header className="student-top">
          <span className="brand student-brand">
            <img src="/logo.svg" alt="ID Card Studio" />
          </span>
        </header>
        <PortalLive invite={invite} />
      </div>
    );
  if (onboard)
    return (
      <Onboard
        token={onboard}
        onDone={() => {
          window.history.replaceState({}, "", "/");
          setOnboard(null);
        }}
      />
    );
  if (state === "login") return <Login />;
  if (state !== "ready") return <div className="auth-shell"><p className="muted">Loading your workspace…</p></div>;
  return <App key={initialData.me.id + (auth.impersonating()?.id || "")} live initialData={initialData} />;
}

function App({ live = false, initialData = null }) {
  const initial = new URLSearchParams(window.location.search);
  const [data, setData] = useState(() => initialData || loadData()),
    [role, setRole] = useState(
      live
        ? ROLE_FROM_API(initialData.me)
        : ROLES.some((r) => r.id === initial.get("panel"))
          ? initial.get("panel")
          : "school",
    );
  const [page, setPage] = useState(
    pageNames[initial.get("page")] ? initial.get("page") : "overview",
  );
  const [schoolId, setSchoolId] = useState(
    live
      ? initialData.schools.find((s) => s.id === initial.get("school"))?.id ||
          initialData.me.schoolId ||
          initialData.schools[0]?.id ||
          ""
      : initial.get("school") || "SCH-001",
  );
  const [session, setSession] = useState(
    live ? initialData.currentSession : "2026–27",
  );
  const [syncing, setSyncing] = useState(0);
  const dataRef = useRef(data);
  const queue = useRef(Promise.resolve());
  const viewRef = useRef({ schoolId, session });
  viewRef.current = { schoolId, session };
  const [toast, setToast] = useState(null),
    [openRoles, setOpenRoles] = useState(false),
    [notifications, setNotifications] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [focus, setFocus] = useState(null),
    [reset, setReset] = useState(false);
  const notifRef = useRef(null);
  const toastTimer = useRef();
  const notify = (message, tone = "success") => {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };
  const replaceData = (next) => {
    dataRef.current = next;
    setData(next);
  };
  const reload = async () => {
    const { schoolId: sid, session: sess } = viewRef.current;
    const next = await loadWorkspace(sid, sess);
    replaceData(next);
    // Opening another school starts on that school's own current session.
    if (live && !sess && next.currentSession) {
      skipReload.current = true;
      setSession(next.currentSession);
    }
  };
  const skipReload = useRef(false);
  const changeSchool = (id) => {
    if (!id || id === viewRef.current.schoolId) return;
    setSchoolId(id);
    if (live) setSession("");
  };
  // In live mode every change is applied optimistically, then saved through the
  // API in order and the workspace reloaded from the server.
  const update = (fn) => {
    const prev = dataRef.current;
    const next = typeof fn === "function" ? fn(prev) : { ...prev, ...fn };
    replaceData(next);
    if (!live || next === prev) return;
    setSyncing((n) => n + 1);
    queue.current = queue.current
      .then(() => pushChanges(prev, next, viewRef.current.schoolId))
      .catch((e) => notify(e.message || "Could not save. Please try again.", "error"))
      .then(() => reload().catch(() => {}))
      .finally(() => setSyncing((n) => n - 1));
  };
  const log = (draft, text, type = "check") => ({
    ...draft,
    audit: [
      { id: uid("EV"), text, type, time: new Date().toISOString() },
      ...draft.audit,
    ],
  });
  useEffect(() => {
    if (!live) return;
    onApprovalReport((r) =>
      notify(
        `${r.approved} approved. ${r.failed.length} need attention: ${r.failed
          .slice(0, 3)
          .map((f) => `${f.name} (${f.reason})`)
          .join("; ")}`,
        "error",
      ),
    );
  }, []);
  // Switching school or session loads that slice of data from the server.
  const firstLoad = useRef(true);
  useEffect(() => {
    if (!live) return;
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    if (skipReload.current) {
      skipReload.current = false;
      return;
    }
    reload().catch((e) => notify(e.message, "error"));
  }, [schoolId, session]);
  useEffect(() => {
    if (live) return;
    if (!saveData(data))
      notify(
        "Browser storage is full. Remove large photo files or reset the preview.",
        "error",
      );
  }, [data]);
  useEffect(() => {
    if (live) return;
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
  // Ctrl/Cmd + K opens universal search from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setNotifications(false);
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Clicking anywhere outside the notifications panel closes it.
  useEffect(() => {
    if (!notifications) return;
    const close = (e) => {
      if (!notifRef.current?.contains(e.target)) setNotifications(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [notifications]);
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
  const availableSchools = live
    ? data.schools
    : role === "premium"
      ? data.schools.filter((s) => s.agent === "AG-001")
      : role === "regular"
        ? data.schools.filter((s) => s.agent === "AG-002")
        : data.schools;
  const school = availableSchools.find((s) => s.id === schoolId) ||
    availableSchools[0] ||
    data.schools[0] || { id: "", name: "No school yet", short: "—" };
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
  const liveAgent = live && data.agents.find((a) => a.id === data.me.agentId);
  const userProfile = live
    ? { name: data.me.name, email: data.me.email, phone: "" }
    : data.profiles?.[role] ||
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
    live,
    api,
    reload,
    permissions: data.permissions || {},
    download: (path, name) =>
      downloadFile(path, name).catch((e) => notify(e.message, "error")),
    role,
    school,
    schoolId: school.id,
    availableSchools,
    session,
    setSession,
    go,
    notify,
    log,
    setSchoolId: changeSchool,
    // One-shot request from search/actions for a page to open something.
    focus,
    clearFocus: () => setFocus(null),
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
  // The school's current session (what everyone works in by default).
  const currentName = data.sessions.find((s) => s.active)?.name || data.schoolCurrentSession || "";
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
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";
  // Pages and quick actions offered by universal search for this panel.
  const palettePages = [
    ...(menuItems[role] || menuItems.school).flatMap(([, ...items]) => items),
    ["settings", "settings"],
    ["guide", "help"],
  ].map(([key, icon]) => [key, pageNames[key], icon]);
  const act = (title, icon, target, name, keywords) => ({ title, icon, keywords, run: (x) => x.go(target, name) });
  const paletteActions = {
    school: [
      act("Add a student", "plus", "students", "addStudent", "new student create"),
      act("Import students from Excel", "upload", "students", "import", "upload sheet csv"),
      act("Send student links", "email", "invitations", null, "invite email"),
      act("Review submissions", "review", "review", null, "approve"),
      act("Create a print batch", "print", "printing", "createBatch", "print order"),
      act("Start the next session", "calendar", "sessions", "nextSession", "academic year new session"),
    ],
    super: [
      act("Add a school", "plus", "schools", "addSchool", "new school create"),
      act("Add an agent", "briefcase", "agents", "addAgent", "new agent vendor"),
      act("Create a print batch", "print", "printing", "createBatch", "print order"),
      act("Start the next session", "calendar", "sessions", "nextSession", "academic year new session"),
    ],
    premium: [
      act("Create a print batch", "print", "printing", "createBatch", "print order"),
      act("Start the next session", "calendar", "sessions", "nextSession", "academic year new session"),
    ],
    regular: [
      act("Create a print batch", "print", "printing", "createBatch", "print order"),
      act("Start the next session", "calendar", "sessions", "nextSession", "academic year new session"),
    ],
  }[role] || [];
  const runPalette = (item) => {
    setSearchOpen(false);
    if (!item) return;
    item.run({
      go: (target, name) => {
        go(target);
        if (name) setFocus({ type: "action", name });
      },
      openStudent: (st) => {
        if (st.schoolId) setSchoolId(st.schoolId);
        setSession(st.session || "");
        go("students");
        setFocus({ type: "student", id: st.id });
      },
      openSchool: (sc, target) => {
        changeSchool(sc.id);
        go(target || (role === "school" ? "overview" : "students"));
      },
    });
  };
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
          {live && syncing > 0 && <div className="sync-indicator">Saving…</div>}
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
                      : live
                        ? liveAgent?.company || liveAgent?.name || data.me.name
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
            {live && auth.impersonating() && (
              <div className="impersonation-bar" role="status">
                <Icon name="userCog" size={15} />
                <span>
                  You are working as <strong>{data.me.name}</strong> ({selectedRole.name}).
                  Every action is logged under your super admin account.
                </span>
                <Button variant="secondary" onClick={() => auth.stopImpersonating()}>
                  Return to super admin
                </Button>
              </div>
            )}

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
                {live ? (
                  <AccountMenu
                    me={data.me}
                    roleName={selectedRole.name}
                    syncing={syncing}
                    notify={notify}
                  />
                ) : (
                  roleControl
                )}
                <span className="header-separator" />
                <button
                  className="search-trigger"
                  title={`Search (${shortcut} K)`}
                  aria-label="Search"
                  aria-keyshortcuts="Control+K Meta+K"
                  onClick={() => setSearchOpen(true)}
                >
                  <Icon name="search" size={17} />
                  <span>Search</span>
                  <kbd>{shortcut} K</kbd>
                </button>
                <div className="notifications-wrap" ref={notifRef}>
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
                            if (!n.read)
                              update((d) => ({
                                ...d,
                                notifications: d.notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
                              }));
                            go(n.link && pageNames[n.link] ? n.link : n.title.includes("PDF") ? "photos" : n.title.toLowerCase().includes("batch") ? "printing" : "review");
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
                  <span>{live ? school.name.toUpperCase() : "DEMO WORKSPACE"}</span>
                  <span className="context-divider">/</span>
                  <span>
                    {live
                      ? syncing
                        ? "Saving changes…"
                        : "All changes saved"
                      : "Fictional data · changes stay in this browser"}
                  </span>
                </div>
                <div>
                  <Icon name="calendar" size={14} />
                  <select
                    aria-label="Academic session"
                    value={session}
                    onChange={(e) => setSession(e.target.value)}
                  >
                    {[...data.sessions]
                      .sort((a, b) => b.name.localeCompare(a.name))
                      .map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name}
                          {s.name === currentName ? " · current" : ""}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              {currentName && session !== currentName && !["sessions", "schools", "agents"].includes(page) && (
                <div className="session-banner" role="status">
                  <Icon name="calendar" size={16} />
                  <span>
                    You are viewing <strong>{session}</strong>{session > currentName ? " (upcoming)" : " (past)"}. The current session is <strong>{currentName}</strong>; changes here apply to {session}.
                  </span>
                  <Button variant="secondary" onClick={() => setSession(currentName)}>
                    Switch to {currentName}
                  </Button>
                </div>
              )}
              {content}
              <footer className="main-footer">
                <span>Software is powered by CTC. All rights reserved.</span>
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
      <CommandPalette
        open={searchOpen && role !== "student"}
        live={live}
        api={api}
        data={data}
        role={role}
        availableSchools={availableSchools}
        pages={palettePages}
        actions={paletteActions}
        onClose={runPalette}
      />
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

function AccountMenu({ me, roleName, syncing, notify }) {
  const [open, setOpen] = useState(false),
    [picker, setPicker] = useState(false),
    [users, setUsers] = useState([]),
    [q, setQ] = useState("");
  const canOpen = me.role === "SUPER_ADMIN" && !auth.impersonating();
  useEffect(() => {
    if (picker) api.get("/users").then((r) => setUsers(r.items.filter((u) => u.role !== "SUPER_ADMIN"))).catch((e) => notify(e.message, "error"));
  }, [picker]);
  const list = users.filter((u) => `${u.name} ${u.email} ${u.schoolName || ""} ${u.agentCode || ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="role-switcher">
      <button className="role-trigger" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <span className="role-icon">
          <Icon name="user" size={17} />
        </span>
        <span>
          <small>{roleName.toUpperCase()}</small>
          <strong>{me.name}</strong>
        </span>
        <Icon name="down" size={15} />
      </button>
      {open && (
        <>
          <button className="popover-dismiss" aria-label="Close account menu" onClick={() => setOpen(false)} />
          <div className="role-menu" role="menu">
            <p>{me.email}</p>
            {canOpen && (
              <button role="menuitem" onClick={() => (setPicker(true), setOpen(false))}>
                <span>
                  <Icon name="userCog" />
                </span>
                <div>
                  <strong>Open a school or agent account</strong>
                  <small>Work as them with full rights; actions stay logged to you</small>
                </div>
              </button>
            )}
            <button role="menuitem" onClick={() => auth.logout()}>
              <span>
                <Icon name="logOut" />
              </span>
              <div>
                <strong>{auth.impersonating() ? "Return to super admin" : "Sign out"}</strong>
                <small>{syncing ? "Saving changes…" : "All changes are saved"}</small>
              </div>
            </button>
          </div>
        </>
      )}
      {picker && (
        <Modal title="Open an account" subtitle="Choose a school admin or agent login." onClose={() => setPicker(false)}>
          <div className="modal-body">
            <input className="search-input" placeholder="Search by name, email, school or agent code" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <div className="account-list">
              {list.map((u) => (
                <button
                  key={u.id}
                  className="link-row"
                  onClick={async () => {
                    try {
                      await auth.impersonate(u.id);
                    } catch (e) {
                      notify(e.message, "error");
                    }
                  }}
                >
                  <Avatar name={u.name} />
                  <span>
                    <strong>{u.name}</strong>
                    <small>
                      {u.role === "AGENT" ? `Agent ${u.agentCode} · ${u.agentTier?.toLowerCase()}` : u.schoolName} · {u.email}
                      {u.status === "INVITED" ? " · setup pending" : ""}
                    </small>
                  </span>
                  <Icon name="external" size={16} />
                </button>
              ))}
              {!list.length && <p className="muted">No matching logins.</p>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
