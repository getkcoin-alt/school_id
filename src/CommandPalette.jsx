import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Badge } from "./components.jsx";
import { STATUS } from "./api/mappers.js";

/**
 * Universal search (Ctrl/Cmd + K). Pages and quick actions for the current
 * panel are matched locally; students, staff, schools, agents and print
 * batches come from GET /search in live mode (scoped by the server to what the
 * signed-in person may see) or from the preview data otherwise.
 */
export default function CommandPalette({ live, api, data, availableSchools, role, pages, actions, open, onClose }) {
  const [q, setQ] = useState(""),
    [remote, setRemote] = useState(null),
    [loading, setLoading] = useState(false),
    [active, setActive] = useState(0);
  const inputRef = useRef(null),
    listRef = useRef(null);
  const term = q.trim().toLowerCase();

  // Server search, debounced.
  useEffect(() => {
    if (!live || term.length < 2) {
      setRemote(null);
      return;
    }
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .get(`/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => alive && setRemote(r))
        .catch(() => alive && setRemote(null))
        .finally(() => alive && setLoading(false));
    }, 180);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [term, live]);

  const groups = useMemo(() => {
    const has = (...v) => v.filter(Boolean).join(" ").toLowerCase().includes(term);
    const out = [];
    const pageItems = pages.filter(([, label]) => !term || has(label)).map(([key, label, icon]) => ({ key: "p" + key, icon, title: label, hint: "Page", run: (x) => x.go(key) }));
    const actionItems = actions.filter((a) => !term || has(a.title, a.keywords)).map((a, i) => ({ key: "a" + i, icon: a.icon, title: a.title, hint: a.hint || "Action", run: a.run }));
    if (!term) {
      out.push(["Quick actions", actionItems]);
      out.push(["Go to", pageItems]);
      return out.filter(([, items]) => items.length);
    }
    let students = [], staff = [], schools = [], agents = [], batches = [];
    if (live) {
      if (remote) ({ students, staff, schools, agents, batches } = remote);
    } else {
      const mine = (sid) => role === "super" || availableSchools.some((s) => s.id === sid);
      students = data.students.filter((s) => mine(s.school) && has(s.name, s.admission)).slice(0, 8).map((s) => ({ id: s.id, name: s.name, admissionNo: s.admission, className: s.classNo, section: s.section, session: s.session, status: s.status, schoolId: s.school, schoolName: data.schools.find((x) => x.id === s.school)?.name, current: true }));
      schools = role === "school" ? [] : availableSchools.filter((s) => has(s.name, s.city)).slice(0, 5).map((s) => ({ id: s.id, name: s.name, city: s.city }));
      agents = role === "super" ? data.agents.filter((a) => has(a.name, a.company)).slice(0, 5) : [];
      batches = data.batches.filter((b) => has(b.name, b.id)).slice(0, 5).map((b) => ({ id: b.id, code: b.id, name: b.name, status: b.status, schoolId: b.school }));
    }
    out.push([
      "Students",
      students.map((s) => ({
        key: "s" + s.id,
        icon: "user",
        title: s.name,
        sub: [s.admissionNo && `Adm. ${s.admissionNo}`, s.className && `Class ${s.className}${s.section ? ` – ${s.section}` : ""}`, role !== "school" && s.schoolName, !s.current && s.session].filter(Boolean).join(" · "),
        badge: STATUS[s.status] || s.status,
        run: (x) => x.openStudent(s),
      })),
    ]);
    out.push(["Schools", schools.map((s) => ({ key: "sc" + s.id, icon: "school", title: s.name, sub: s.city, run: (x) => x.openSchool(s) }))]);
    out.push(["Agents", agents.map((a) => ({ key: "ag" + a.id, icon: "briefcase", title: a.name, sub: a.company, run: (x) => x.go("agents", { search: a.name }) }))]);
    out.push(["Staff", staff.map((s) => ({ key: "st" + s.id, icon: "user", title: s.name, sub: [s.role, role !== "school" && s.schoolName].filter(Boolean).join(" · "), run: (x) => x.openSchool({ id: s.schoolId }, "staff") }))]);
    out.push(["Print batches", batches.map((b) => ({ key: "b" + b.id, icon: "print", title: `${b.code} · ${b.name}`, sub: b.schoolName, run: (x) => x.go("printing") }))]);
    out.push(["Actions", actionItems]);
    out.push(["Pages", pageItems]);
    return out.filter(([, items]) => items.length);
  }, [term, remote, pages, actions, data, availableSchools, role, live]);

  const flat = groups.flatMap(([, items]) => items);
  useEffect(() => setActive(0), [term, remote]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  useEffect(() => {
    if (open) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);
  if (!open) return null;

  const choose = (item) => {
    if (!item) return;
    onClose(item);
  };
  const onKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(flat[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose(null);
    }
  };
  let index = -1;
  return (
    <div className="palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose(null)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search">
        <div className="palette-input">
          <Icon name="search" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={role === "school" ? "Search students, staff, pages or actions…" : "Search students, schools, batches, pages or actions…"}
            aria-label="Search"
            aria-controls="palette-results"
            aria-activedescendant={flat[active] ? `pal-${flat[active].key}` : undefined}
          />
          {loading && <span className="palette-loading">Searching…</span>}
          <kbd>Esc</kbd>
        </div>
        <div className="palette-results" id="palette-results" role="listbox" ref={listRef}>
          {groups.map(([label, items]) => (
            <div key={label} className="palette-group">
              <p>{label}</p>
              {items.map((item) => {
                index++;
                const i = index;
                return (
                  <button
                    key={item.key}
                    id={`pal-${item.key}`}
                    type="button"
                    role="option"
                    data-index={i}
                    aria-selected={i === active}
                    className={i === active ? "active" : ""}
                    onMouseMove={() => i !== active && setActive(i)}
                    onClick={() => choose(item)}
                  >
                    <Icon name={item.icon || "arrow"} size={17} />
                    <span className="palette-text">
                      <strong>{item.title}</strong>
                      {item.sub && <small>{item.sub}</small>}
                    </span>
                    {item.badge && <Badge>{item.badge}</Badge>}
                    {item.hint && <em>{item.hint}</em>}
                  </button>
                );
              })}
            </div>
          ))}
          {term && !flat.length && !loading && <p className="palette-empty">Nothing found for “{q.trim()}”.</p>}
          {live && term.length === 1 && <p className="palette-empty">Type one more letter to search records.</p>}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
          <span><kbd>Enter</kbd> to open</span>
          <span><kbd>{navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}</kbd><kbd>K</kbd> anywhere</span>
        </div>
      </div>
    </div>
  );
}
