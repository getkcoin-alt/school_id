// Bridges the screens' single `data` snapshot to the API. Loading builds the
// snapshot from the server; pushing turns a before/after snapshot pair into
// API calls. The server stays the source of truth: after every push the
// workspace is reloaded, so anything the server rejected is reverted.
import { api, dataUrlToFile } from "./client.js";
import { FIELDS, STAFF_FIELDS, LOCKED_FIELDS } from "../data.js";
import {
  apiKey,
  batchStatusToApi,
  fromActivity,
  fromAgent,
  fromBatch,
  fromDesign,
  fromPdf,
  fromSchool,
  fromStaff,
  fromStudent,
  pdfStatusToApi,
  toAgent,
  toSchool,
  toStaff,
  toStudent,
  uiKey,
} from "./mappers.js";

async function allPages(path, size = 1000) {
  const first = await api.get(`${path}${path.includes("?") ? "&" : "?"}page=1&size=${size}`);
  const items = [...first.items];
  for (let page = 2; items.length < (first.total ?? 0); page++) {
    const next = await api.get(`${path}${path.includes("?") ? "&" : "?"}page=${page}&size=${size}`);
    if (!next.items.length) break;
    items.push(...next.items);
  }
  return items;
}

export async function loadWorkspace(schoolId, session) {
  const ws = await api.get(`/workspace${schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : ""}`);
  const sc = ws.school;
  const sid = sc?.id;
  const q = sid ? `schoolId=${sid}` : "";
  const sess = session || sc?.currentSession || "";
  const [students, staff, batches, pdfs, photos, notifications, activity, orderForms] = await Promise.all([
    sid ? allPages(`/students?${q}&session=${encodeURIComponent(sess)}`) : [],
    sid ? api.get(`/staff?${q}`).then((r) => r.items) : [],
    api.get(`/batches?size=200`).then((r) => r.items),
    api.get(`/media/pdfs${sid && ws.me.role === "SCHOOL_ADMIN" ? `?${q}` : ""}`).then((r) => r.items),
    sid ? api.get(`/media/photos?${q}&size=500`).then((r) => r.items) : [],
    api.get("/notifications"),
    api.get("/activity?size=100").catch(() => ({ items: [] })),
    api.get("/media/order-forms").then((r) => r.items).catch(() => []),
  ]);
  const studentFields = sc?.fields.student || [];
  const staffFields = sc?.fields.staff || [];
  const designName = (id) => ws.designs.find((d) => d.id === id)?.name;
  const agent = ws.agents.find((a) => a.id === ws.me.agentId);
  return {
    version: 1,
    apiMode: true,
    me: ws.me,
    permissions: ws.permissions,
    schools: ws.schools.map(fromSchool),
    agents: ws.agents.map(fromAgent),
    students: students.map(fromStudent),
    staff: staff.map(fromStaff),
    classes: sc?.classes.map((c) => c.name) || [],
    classRecords: sc?.classes || [],
    sections: [...new Set((sc?.classes || []).flatMap((c) => c.sections.map((s) => s.name)))].sort(),
    sessions: (sc?.sessions || []).map((s) => ({ id: s.id, name: s.name, start: s.startDate || "", end: s.endDate || "", active: s.isCurrent })),
    currentSession: sess,
    batches: batches.map(fromBatch),
    uploads: pdfs.map(fromPdf),
    designs: ws.designs.map(fromDesign),
    design: designName(sc?.studentDesignId) || ws.designs[0]?.name || "Classic",
    schoolDesigns: Object.fromEntries(ws.schools.filter((s) => s.studentDesignId).map((s) => [s.id, designName(s.studentDesignId)])),
    enabledFields: studentFields.filter((f) => f.enabled && !f.custom).map((f) => uiKey(f.key)),
    fieldScope: sid ? { [sid]: studentFields.filter((f) => f.enabled && !f.custom).map((f) => uiKey(f.key)) } : {},
    fieldRequired: sid ? { [sid]: studentFields.filter((f) => f.required && !f.custom).map((f) => uiKey(f.key)) } : {},
    staffFieldScope: sid ? { [sid]: staffFields.filter((f) => f.enabled && !f.custom).map((f) => uiKey(f.key)) } : {},
    customFields: [
      ...studentFields.filter((f) => f.custom).map((f) => ({ id: f.key, school: sid, name: f.label, audience: "student", enabled: f.enabled, required: f.required })),
      ...staffFields.filter((f) => f.custom).map((f) => ({ id: f.key, school: sid, name: f.label, audience: "staff", enabled: f.enabled, required: f.required })),
    ],
    notifications: notifications.items.map((n) => ({ id: n.id, title: n.title, text: n.body || "", read: Boolean(n.readAt), link: n.link })),
    audit: activity.items.map(fromActivity),
    outbox: [],
    profile: { name: ws.me.name, email: ws.me.email, phone: "" },
    profiles: {},
    ownPrinting: Boolean(agent?.printBySelf),
    staffRoles: sc?.staffRoles || [],
    photoLibrary: photos.map((p) => ({ id: p.id, school: sid, name: p.fileName, src: p.url })),
    orderForms,
    prefixes: ws.prefixes,
  };
}

const byId = (list = []) => new Map(list.map((x) => [x.id, x]));
const changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b);

/** Applies every difference between two snapshots through the API. */
export async function pushChanges(prev, next, schoolId) {
  const tasks = [], late = [];
  const run = (fn) => tasks.push(fn);

  // Schools and agents (super admin; agents edit their own profile).
  diff(prev.schools, next.schools, {
    add: (s) => run(() => api.post("/schools", { ...toSchool(s), createDefaultClasses: true, ...(s.adminEmail ? { admin: { name: s.principal || s.name, email: s.adminEmail } } : {}) })),
    update: (s) => run(() => api.patch(`/schools/${s.id}`, toSchool(s))),
    remove: (s) => run(() => api.del(`/schools/${s.id}`)),
  });
  diff(prev.agents, next.agents, {
    add: (a) => run(() => api.post("/agents", { ...toAgent(a), email: a.email })),
    update: (a) => run(() => api.patch(`/agents/${a.id}`, toAgent(a))),
    remove: (a) => run(() => api.del(`/agents/${a.id}`)),
  });

  // ID card field settings for the selected school.
  if (schoolId) {
    const fieldsChanged =
      changed(prev.fieldScope?.[schoolId], next.fieldScope?.[schoolId]) ||
      changed(prev.fieldRequired?.[schoolId], next.fieldRequired?.[schoolId]) ||
      changed(prev.customFields.filter((f) => f.audience !== "staff"), next.customFields.filter((f) => f.audience !== "staff"));
    if (fieldsChanged) {
      const enabled = next.fieldScope?.[schoolId] || next.enabledFields;
      const required = next.fieldRequired?.[schoolId] || FIELDS.filter((f) => f[3]).map((f) => f[0]);
      run(() =>
        api.put(`/schools/${schoolId}/fields`, {
          audience: "STUDENT",
          fields: [
            ...FIELDS.map(([k, label]) => ({ key: apiKey(k), label, enabled: LOCKED_FIELDS.includes(k) || enabled.includes(k), required: LOCKED_FIELDS.includes(k) || (enabled.includes(k) && required.includes(k)) })),
            ...next.customFields.filter((f) => f.school === schoolId && f.audience !== "staff").map((f) => ({ ...(f.id.startsWith("x_") ? { key: f.id } : {}), label: f.name, enabled: f.enabled ?? true, required: Boolean(f.required) })),
          ],
        }),
      );
    }
    const staffChanged = changed(prev.staffFieldScope?.[schoolId], next.staffFieldScope?.[schoolId]) || changed(prev.customFields.filter((f) => f.audience === "staff"), next.customFields.filter((f) => f.audience === "staff"));
    if (staffChanged) {
      const enabled = next.staffFieldScope?.[schoolId] || STAFF_FIELDS.map((f) => f[0]);
      const known = ["name", "role", "phone", "email", "address", "gender", "dob", "classNo", "section"];
      run(() =>
        api.put(`/schools/${schoolId}/fields`, {
          audience: "STAFF",
          fields: [
            ...STAFF_FIELDS.filter(([k]) => known.includes(k)).map(([k, label, , req]) => ({ key: apiKey(k), label, enabled: req || enabled.includes(k), required: req })),
            ...next.customFields.filter((f) => f.school === schoolId && f.audience === "staff").map((f) => ({ ...(f.id.startsWith("x_") ? { key: f.id } : {}), label: f.name, enabled: true, required: false })),
          ],
        }),
      );
    }
    if (changed(prev.staffRoles, next.staffRoles)) run(() => api.put(`/schools/${schoolId}/staff-roles`, { roles: next.staffRoles }));

    // Classes / sections: names are per school on the server. A same-length list
    // with one name changed is a rename (students move with the class).
    const added = next.classes.filter((c) => !prev.classes.includes(c));
    const removed = prev.classes.filter((c) => !next.classes.includes(c));
    if (added.length === 1 && removed.length === 1 && prev.classes.length === next.classes.length) {
      const rec = prev.classRecords?.find((c) => c.name === removed[0]);
      if (rec) run(() => api.patch(`/schools/${schoolId}/classes/${rec.id}`, { name: added[0] }));
      added.length = removed.length = 0;
    }
    for (const name of added) run(() => api.post(`/schools/${schoolId}/classes`, { name, sections: next.sections.length ? next.sections : ["A"] }));
    for (const name of removed) {
      const rec = prev.classRecords?.find((c) => c.name === name);
      if (rec) run(() => api.del(`/schools/${schoolId}/classes/${rec.id}`));
    }
    for (const sec of prev.sections.filter((s) => !next.sections.includes(s))) {
      for (const c of prev.classRecords || []) {
        const rec = c.sections.find((x) => x.name === sec);
        if (rec) run(() => api.del(`/schools/${schoolId}/classes/${c.id}/sections/${rec.id}`));
      }
    }
    for (const sec of next.sections.filter((s) => !prev.sections.includes(s))) {
      for (const c of next.classRecords || []) run(() => api.post(`/schools/${schoolId}/classes/${c.id}/sections`, { name: sec }).catch(() => {}));
    }
    // Sessions
    for (const s of next.sessions.filter((s) => !prev.sessions.some((p) => p.name === s.name))) run(() => api.post(`/schools/${schoolId}/sessions`, { name: s.name, startDate: s.start, endDate: s.end, isCurrent: s.active }));
    for (const s of next.sessions) {
      const before = prev.sessions.find((p) => p.name === s.name);
      if (before?.id && s.active && !before.active) run(() => api.patch(`/schools/${schoolId}/sessions/${before.id}`, { isCurrent: true }));
    }
    // Design choice for the school
    const design = next.schoolDesigns?.[schoolId] || next.design;
    if (design !== (prev.schoolDesigns?.[schoolId] || prev.design)) {
      const d = next.designs.find((x) => x.name === design);
      if (d) run(() => api.patch(`/schools/${schoolId}`, { studentDesignId: d.id }));
    }
  }

  // Students
  const approve = [], unapprove = [], corrections = new Map();
  diff(prev.students, next.students, {
    add: (s) =>
      run(async () => {
        const created = await api.post("/students", { ...toStudent(s), schoolId: s.school });
        await pushPhoto(created.id, s, null, next.photoLibrary);
      }),
    update: (s, before) => {
      const body = toStudent(s, before);
      if (Object.keys(body).length) run(() => api.patch(`/students/${s.id}`, body));
      if (s.photo !== before.photo) run(() => pushPhoto(s.id, s, before, next.photoLibrary));
      if (s.status !== before.status) {
        if (s.status === "Approved") approve.push(s.id);
        else if (s.status === "Changes requested") corrections.set(s.note || "Please review your details.", [...(corrections.get(s.note) || []), s.id]);
        else if (before.status === "Approved" && s.status === "In review") unapprove.push(s.id);
      }
    },
    remove: (s) => run(() => api.del(`/students/${s.id}`)),
  });

  // Staff
  const staffApprove = [];
  diff(prev.staff, next.staff, {
    add: (s) =>
      run(async () => {
        const created = await api.post("/staff", { ...toStaff(s), schoolId: s.school });
        if (s.photo?.startsWith("data:")) await api.upload(`/staff/${created.id}/photo`, { photo: await dataUrlToFile(s.photo) });
      }),
    update: (s, before) => {
      if (changed(toStaff(s), toStaff(before))) run(() => api.patch(`/staff/${s.id}`, toStaff(s)));
      if (s.photo !== before.photo && s.photo?.startsWith("data:")) run(async () => api.upload(`/staff/${s.id}/photo`, { photo: await dataUrlToFile(s.photo) }));
      if (s.printStatus === "Approved" && before.printStatus !== "Approved") staffApprove.push(s.id);
    },
    remove: (s) => run(() => api.del(`/staff/${s.id}`)),
  });

  // Photo library additions/removals
  diff(prev.photoLibrary, next.photoLibrary, {
    add: (p) => run(async () => api.upload("/media/photos", { schoolId: p.school, files: [await dataUrlToFile(p.src, p.name)] })),
    remove: (p) => run(() => api.del(`/media/photos/${p.id}`)),
  });

  // Invitations prepared in the outbox are emailed by the server.
  const newMail = next.outbox.filter((m) => !prev.outbox.some((p) => p.id === m.id));
  if (newMail.length) run(() => api.post("/invitations/email", { studentIds: [...new Set(newMail.map((m) => m.student))], message: newMail[0].message?.slice(0, 500) }));

  // Batches: new ones are created on the server from their record ids.
  diff(prev.batches, next.batches, {
    add: (b) => late.push(() => api.post("/batches", { schoolId: b.school, name: b.name, studentIds: b.studentIds || [], staffIds: b.staffIds || [] })),
    update: (b, before) => {
      const body = {};
      if (b.status !== before.status && batchStatusToApi[b.status]) body.status = batchStatusToApi[b.status];
      if (b.tracking !== before.tracking) body.tracking = b.tracking || null;
      if (b.carrier !== before.carrier) body.carrier = b.carrier || null;
      if (Object.keys(body).length) run(() => api.patch(`/batches/${b.id}`, body));
    },
  });

  diff(prev.uploads, next.uploads, {
    update: (u, before) => {
      if (u.status !== before.status || u.note !== before.note || u.pages !== before.pages)
        run(() => api.patch(`/media/pdfs/${u.id}`, { status: pdfStatusToApi[u.status], note: u.note, pages: Number(u.pages) || undefined }));
    },
    remove: (u) => run(() => api.del(`/media/pdfs/${u.id}`)),
  });
  diff(prev.designs, next.designs, { remove: (d) => run(() => api.del(`/designs/${d.id}`)) });

  const read = next.notifications.filter((n) => n.read && prev.notifications.find((p) => p.id === n.id && !p.read)).map((n) => n.id);
  if (read.length) run(() => api.post("/notifications/read", { ids: read }));
  if (prev.ownPrinting !== next.ownPrinting && next.me?.agentId) run(() => api.patch(`/agents/${next.me.agentId}`, { printBySelf: next.ownPrinting }));
  if (changed(prev.profile, next.profile)) run(() => api.patch("/users/me", { name: next.profile.name, phone: next.profile.phone || undefined }));

  // Order matters: records first, then review decisions, then print batches.
  for (const t of tasks) await t();
  if (approve.length) await reportApproval(await api.post("/students/approve", { ids: approve }));
  if (unapprove.length) await api.post("/students/unapprove", { ids: unapprove });
  for (const [note, ids] of corrections) await api.post("/students/request-changes", { ids, note });
  if (staffApprove.length) await api.post("/staff/approve", { ids: staffApprove });
  for (const t of late) await t();
}

let approvalListener = null;
export const onApprovalReport = (fn) => (approvalListener = fn);
async function reportApproval(res) {
  if (res.failed?.length && approvalListener) approvalListener(res);
}

async function pushPhoto(id, s, before, library) {
  if (!s.photo || s.photo === before?.photo) return;
  if (s.photo.startsWith("data:")) {
    const camera = /camera|capture/i.test(s.photoSource || "");
    return api.upload(`/students/${id}/photo`, { photo: await dataUrlToFile(s.photo, "photo.jpg"), source: camera ? "CAMERA" : "UPLOAD" });
  }
  const asset = library.find((p) => p.src === s.photo);
  if (asset) return api.post(`/students/${id}/photo`, { photoAssetId: asset.id });
}

function diff(before = [], after = [], { add, update, remove }) {
  const a = byId(before), b = byId(after);
  for (const [id, item] of b) {
    if (!a.has(id)) add?.(item);
    else if (changed(item, a.get(id))) update?.(item, a.get(id));
  }
  for (const [id, item] of a) if (!b.has(id)) remove?.(item);
}
