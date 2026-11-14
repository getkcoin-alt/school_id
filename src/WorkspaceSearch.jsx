import React, { useState } from "react";
import { Icon, Modal } from "./components.jsx";
import { batchSession } from "./lib.js";

export default function WorkspaceSearch({ ctx, pages, onClose }) {
  const { data, school, role, availableSchools, go } = ctx;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const term = query.trim().toLowerCase();
  const has = (...values) =>
    values.filter(Boolean).join(" ").toLowerCase().includes(term);
  const scoped = new Set(
    (role === "school" ? [school] : availableSchools).map(({ id }) => id),
  );
  const jump = (page, record, schoolId, session) => {
    go(page, record);
    if (schoolId && schoolId !== school.id) ctx.setSchoolId(schoolId);
    if (session) ctx.setSession(session, schoolId);
  };
  const actions = [
    {
      title: "Add a student",
      icon: "plus",
      page: "students",
      record: "addStudent",
    },
    {
      title: "Import students from Excel",
      icon: "upload",
      page: "students",
      record: "importStudents",
      keywords: "spreadsheet CSV",
    },
    {
      title: "Send student links",
      icon: "email",
      page: "invitations",
      keywords: "invite email",
    },
    {
      title: "Create a print batch",
      icon: "print",
      page: "printing",
      record: "createBatch",
    },
    {
      title: "Start the next session",
      icon: "calendar",
      page: "sessions",
      record: "nextSession",
      keywords: "academic year",
    },
    {
      title: "Add a school",
      icon: "plus",
      page: "schools",
      record: "addSchool",
    },
    { title: "Add an agent", icon: "plus", page: "agents", record: "addAgent" },
  ].filter(
    (item) =>
      pages.some(([page]) => page === item.page) &&
      has(item.title, item.keywords),
  );
  const groups = [
    [
      "Quick actions",
      actions.map((item) => ({
        ...item,
        run: () => jump(item.page, item.record),
      })),
    ],
    [
      "Pages",
      pages
        .filter(([, title]) => has(title))
        .map(([page, title, icon]) => ({ title, icon, run: () => jump(page) })),
    ],
    ...(term
      ? [
          [
            "Students",
            data.students
              .filter(
                (row) =>
                  scoped.has(row.school) &&
                  has(row.name, row.admission, row.srn),
              )
              .slice(0, 8)
              .map((row) => ({
                title: row.name,
                icon: "students",
                hint: [
                  row.admission,
                  row.classNo && `Class ${row.classNo}`,
                  row.session,
                ]
                  .filter(Boolean)
                  .join(" · "),
                run: () => jump("students", row.id, row.school, row.session),
              })),
          ],
          [
            "Staff",
            data.staff
              .filter(
                (row) => scoped.has(row.school) && has(row.name, row.role),
              )
              .slice(0, 5)
              .map((row) => ({
                title: row.name,
                icon: "user",
                hint: row.role,
                run: () => jump("staff", row.id, row.school),
              })),
          ],
          [
            "Schools",
            (role === "school" ? [] : availableSchools)
              .filter((row) => has(row.name, row.city, row.id))
              .slice(0, 5)
              .map((row) => ({
                title: row.name,
                icon: "school",
                hint: row.city,
                run: () => jump("schools", row.id, row.id),
              })),
          ],
          [
            "Agents",
            (role === "super" ? data.agents : [])
              .filter((row) => has(row.name, row.company, row.id))
              .slice(0, 5)
              .map((row) => ({
                title: row.name,
                icon: "briefcase",
                hint: row.company,
                run: () => jump("agents", row.id),
              })),
          ],
          [
            "Print batches",
            data.batches
              .filter((row) => scoped.has(row.school) && has(row.name, row.id))
              .slice(0, 5)
              .map((row) => ({
                title: row.name,
                icon: "print",
                hint: row.status,
                run: () =>
                  jump("printing", row.id, row.school, batchSession(row)),
              })),
          ],
        ]
      : []),
  ].filter(([, items]) => items.length);
  const results = groups.flatMap(([, items]) => items);
  const choose = (item) => {
    if (!item) return;
    onClose();
    item.run();
  };
  return (
    <Modal title="Search workspace" placement="top" onClose={onClose}>
      <div className="modal-body workspace-search">
        <div className="search-box">
          <Icon name="search" />
          <input
            data-initial-focus
            aria-label="Search workspace"
            placeholder="Find records, pages or actions"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                choose(results[active]);
              }
              if (
                (e.key === "ArrowDown" || e.key === "ArrowUp") &&
                results.length
              ) {
                e.preventDefault();
                const next =
                  (active + results.length + (e.key === "ArrowDown" ? 1 : -1)) %
                  results.length;
                setActive(next);
                e.target
                  .closest(".workspace-search")
                  .querySelectorAll("button")
                  [next]?.scrollIntoView({ block: "nearest" });
              }
            }}
          />
        </div>
        {groups.map(([group, items]) => (
          <section key={group}>
            <h3>{group}</h3>
            {items.map((item, index) => (
              <button
                type="button"
                className="search-result"
                key={`${item.title}-${index}`}
                data-highlighted={results[active] === item || undefined}
                onClick={() => choose(item)}
              >
                <Icon name={item.icon} />
                <div>
                  <strong>{item.title}</strong>
                  {item.hint && <small>{item.hint}</small>}
                </div>
                <Icon name="chevron" size={16} />
              </button>
            ))}
          </section>
        ))}
        {!results.length && (
          <p className="muted padded">No matching records, pages or actions.</p>
        )}
      </div>
    </Modal>
  );
}
