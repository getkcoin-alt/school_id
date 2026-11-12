import React from "react";
import {
  PageTitle,
  Button,
  Icon,
  Panel,
  Avatar,
  Badge,
  CardPreview,
} from "../components.jsx";
import { fmtDate } from "../lib.js";
export default function Dashboard({ ctx }) {
  const { data, role, school, schoolStudents, go, availableSchools, session } =
    ctx;
  const isSchool = role === "school";
  const records = isSchool
    ? schoolStudents
    : data.students.filter(
        (s) =>
          availableSchools.some((sc) => sc.id === s.school) &&
          s.session === session,
      );
  const count = (s) => records.filter((x) => x.status === s).length;
  const review = count("In review");
  const approved = count("Approved");
  const invited = count("Invited");
  const pending = count("Draft") + invited + count("Changes requested");
  const submitted = records.length - pending;
  const completion = records.length
    ? Math.round((submitted / records.length) * 100)
    : 0;
  const metrics = isSchool
    ? [
        [
          "students",
          "Total students",
          records.length,
          "Across " + data.classes.length + " classes",
          "blue",
        ],
        [
          "email",
          "Details pending",
          pending,
          "Fill in yourself or send the student link",
          "amber",
        ],
        [
          "review",
          "Ready for review",
          review,
          "Your approval is the next step",
          "coral",
        ],
        [
          "badge",
          "Ready to print",
          approved,
          "Checked, approved & good to go",
          "green",
        ],
      ]
    : [
        [
          "school",
          "Partner schools",
          availableSchools.length,
          "Your growing school network",
          "blue",
        ],
        [
          "students",
          "Student records",
          records.length,
          "One place for every identity",
          "green",
        ],
        [
          "review",
          "Awaiting review",
          review,
          "School approval in progress",
          "amber",
        ],
        [
          "print",
          "Print batches",
          data.batches.filter((b) =>
            availableSchools.some((s) => s.id === b.school),
          ).length,
          "From collection to delivery",
          "coral",
        ],
      ];
  return (
    <>
      <PageTitle
        eyebrow={
          isSchool ? school.name.toUpperCase() : "YOUR IDENTITY OPERATIONS"
        }
        title={
          isSchool
            ? "A good day to get things done."
            : "Your schools. All connected."
        }
        description={
          isSchool
            ? `Welcome back, ${ctx.userProfile.name.split(" ").find((w) => !/^(mr|mrs|ms|miss|dr|sr|fr|br|prof|shri|smt|sri)\.?$/i.test(w)) || ctx.userProfile.name}. Here’s where your school IDs stand.`
            : "A clear view of your schools, photo collections, and card production."
        }
      >
        <Button variant="secondary" icon="guide" onClick={() => go("guide")}>
          Quick guide
        </Button>
        <Button
          icon={isSchool ? "send" : "plus"}
          onClick={() => go(isSchool ? "invitations" : "schools")}
        >
          {isSchool ? "Invite students" : "Manage schools"}
        </Button>
      </PageTitle>
      <section className="welcome-banner">
        <div className="banner-copy">
          <div className="banner-kicker">
            <span /> LESS PAPERWORK. MORE POSSIBILITY.
          </div>
          <h2>
            Every student.
            <br />
            An identity that belongs.
          </h2>
          <p>
            {isSchool
              ? "From the first invitation to the final card, keep every step simple, secure, and in one place."
              : "Collect school-wise photo PDFs, coordinate approvals, and keep every card moving forward."}
          </p>
          <Button
            onClick={() => go(isSchool ? "review" : "photos")}
            icon={isSchool ? "arrow" : "fileUp"}
          >
            {isSchool ? "Review student details" : "Upload school photo PDF"}
          </Button>
          <span className="banner-foot">
            <Icon name="shield" size={14} />
            {isSchool
              ? "Your school stays in control, at every step."
              : "Organized by school. Ready for the next step."}
          </span>
        </div>
        <div className="banner-art" aria-label="Sample school identity card">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="banner-dot dot-one" />
          <div className="banner-dot dot-two" />
          <div className="floating-icon">
            <Icon name="graduation" size={26} />
          </div>
          <div className="banner-card-back" />
          <div className="banner-card-front">
            <CardPreview
              student={records[0] || data.students[0]}
              school={school}
              small
              design={ctx.design}
            />
          </div>
          <div className="verified-chip">
            <span>
              <Icon name="check" size={15} />
            </span>
            <div>
              <strong>Ready for the school day</strong>
              <small>Designed for every little detail</small>
            </div>
          </div>
        </div>
      </section>
      <div className="metric-grid">
        {metrics.map(([icon, label, value, note, color]) => (
          <button
            className="metric"
            key={label}
            onClick={() =>
              go(
                icon === "email"
                  ? "invitations"
                  : icon === "review"
                    ? "review"
                    : icon === "school"
                      ? "schools"
                      : icon === "badge" || icon === "print"
                        ? "printing"
                        : "students",
              )
            }
          >
            <div>
              <span>{label}</span>
              <span className={`metric-icon ${color}`}>
                <Icon name={icon} size={20} />
              </span>
            </div>
            <strong>{value.toLocaleString("en-IN")}</strong>
            <p>
              {note}
              <Icon name="upRight" size={14} />
            </p>
          </button>
        ))}
      </div>
      <div className="dashboard-grid">
        <Panel
          title={isSchool ? "Your ID card journey" : "Your production journey"}
          subtitle="A clear next step, every time."
          action={
            <span className="live-label">
              <span /> Live overview
            </span>
          }
          className="journey-panel"
        >
          <div className="journey-track">
            {[
              ["email", "Invite", records.length - count("Draft")],
              ["face", "Collect", submitted],
              ["review", "Approve", approved],
              [
                "print",
                "Print",
                records.filter((s) => s.status === "Submitted for print")
                  .length,
              ],
            ].map(([icon, label, value], i) => (
              <React.Fragment key={label}>
                <button
                  onClick={() =>
                    go(["invitations", "students", "review", "printing"][i])
                  }
                  className={i === 2 ? "highlight" : ""}
                >
                  <span>
                    <Icon name={icon} size={20} />
                  </span>
                  <strong>{label}</strong>
                  <small>{value} students</small>
                </button>
                {i !== 3 && (
                  <div className="journey-line">
                    <Icon name="chevron" size={13} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="completion-label">
            <span>
              <b>{completion}%</b> of student details collected
            </span>
            <span>
              {submitted} of {records.length}
            </span>
          </div>
          <div className="progress-bar">
            <div style={{ width: completion + "%" }} />
          </div>
          <div className="next-step">
            <span>
              <Icon name="sparkles" size={17} />
              <div>
                <strong>
                  {review
                    ? `${review} submissions need your attention`
                    : "Keep your collection moving"}
                </strong>
                <small>
                  {review
                    ? "Review photos and details to move cards into printing."
                    : "Send invitations or a reminder to collect the remaining details."}
                </small>
              </div>
            </span>
            <Button
              variant="text"
              onClick={() => go(review ? "review" : "invitations")}
            >
              {review ? "Let’s review" : "Send a reminder"}
              <Icon name="arrow" size={14} />
            </Button>
          </div>
        </Panel>
        <Panel
          title="Your school, at a glance"
          subtitle={
            isSchool
              ? "Small details. A complete picture."
              : "The people behind the cards."
          }
          className="school-summary"
        >
          <div className="school-emblem">
            <Icon name="graduation" size={30} />
          </div>
          <h3>{school.name}</h3>
          <p>
            <Icon name="school" size={13} />
            {school.city}, Rajasthan
          </p>
          <div className="school-mini-stats">
            <div>
              <strong>{data.classes.length}</strong>
              <small>Classes</small>
            </div>
            <div>
              <strong>
                {data.staff.filter((s) => s.school === school.id).length}
              </strong>
              <small>Staff members</small>
            </div>
            <div>
              <strong>{data.designs.length}</strong>
              <small>Designs</small>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => go(isSchool ? "settings" : "schools")}
          >
            View school details
            <Icon name="arrow" size={14} />
          </Button>
        </Panel>
      </div>
      <div className="dashboard-lower">
        <Panel
          title={
            isSchool ? "Fresh from your students" : "Recent school submissions"
          }
          subtitle="The latest details, waiting for a quick look."
          action={
            <Button variant="text" onClick={() => go("review")}>
              View all
              <Icon name="arrow" size={14} />
            </Button>
          }
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>STUDENT</th>
                  <th>CLASS</th>
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {records
                  .filter((s) => s.status === "In review")
                  .slice(0, 4)
                  .map((s, i) => (
                    <tr key={s.id}>
                      <td>
                        <div className="person-cell">
                          <Avatar name={s.name} photo={s.photo} />
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
                        <Badge>{s.status}</Badge>
                      </td>
                      <td>
                        <button
                          className="table-link"
                          onClick={() => go("review")}
                        >
                          Review <Icon name="upRight" size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                {!review && (
                  <tr>
                    <td colSpan="4" className="padded muted">
                      You’re all caught up. New submissions will appear here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel
          title="A little momentum"
          subtitle="What’s been happening in your workspace."
        >
          <div className="activity-list">
            {data.audit.slice(0, 3).map((a, i) => (
              <div key={a.id}>
                <span
                  className={`activity-icon ${["coral", "blue", "green"][i % 3]}`}
                >
                  <Icon name={a.type} size={16} />
                </span>
                <div>
                  <strong>{a.text}</strong>
                  <small>{fmtDate(a.time)}</small>
                </div>
              </div>
            ))}
          </div>
          <button
            className="activity-more"
            onClick={() => go(role === "super" ? "activity" : "guide")}
          >
            {role === "super"
              ? "See all activity"
              : "See how the whole flow works"}
            <Icon name="arrow" size={14} />
          </button>
        </Panel>
      </div>
    </>
  );
}
