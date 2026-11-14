import React, { useEffect, useRef, useState } from "react";
import { Button, Callout, DateInput, Field, Icon, Steps } from "../components.jsx";
import { request } from "../api/client.js";

// Student link (Flow 2) against the live API. The invite token comes from the
// emailed or copied link; after verification a short-lived portal token is used.
const call = (path, opts = {}) => request(`/portal${path}`, { ...opts, token: opts.token ?? "" });

export default function PortalLive({ invite }) {
  const [info, setInfo] = useState(null),
    [token, setToken] = useState(null),
    [form, setForm] = useState(null),
    [draft, setDraft] = useState({}),
    [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [otpSent, setOtpSent] = useState(false),
    [code, setCode] = useState(""),
    [admission, setAdmission] = useState(""),
    [done, setDone] = useState(false),
    [consent, setConsent] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const videoRef = useRef(null),
    streamRef = useRef(null),
    [camera, setCamera] = useState(false);

  useEffect(() => {
    call(`/invite/${encodeURIComponent(invite)}`).then(setInfo).catch((e) => setError(e.message));
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [invite]);

  const wrap = async (fn) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const loadForm = async (t) => {
    const f = await call("/me", { token: t });
    setForm(f);
    setDraft(f.student);
    if (["APPROVED", "SUBMITTED_FOR_PRINT"].includes(f.student.status)) setDone(true);
  };
  const verify = () =>
    wrap(async () => {
      const body = info.verification === "EMAIL_OTP" ? { otp: code } : { admissionNo: admission };
      const r = await call(`/invite/${encodeURIComponent(invite)}/verify`, { method: "POST", body });
      setToken(r.token);
      await loadForm(r.token);
    });
  const saveDetails = () =>
    wrap(async () => {
      const body = {};
      for (const f of form.fields) if (!f.readOnly && !f.custom) body[f.key] = draft[f.key] ?? null;
      body.extra = Object.fromEntries(form.fields.filter((f) => f.custom).map((f) => [f.key, draft.extra?.[f.key] || ""]));
      const r = await call("/me", { method: "PUT", body, token });
      setDraft(r.student);
      setForm({ ...form, student: r.student, missing: r.missing });
      setStep(1);
    });
  const startCamera = () =>
    wrap(async () => {
      if (!consent) throw new Error("Please agree to take a photo for your school ID.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 } }, audio: false });
      streamRef.current = stream;
      setCamera(true);
      requestAnimationFrame(() => videoRef.current && (videoRef.current.srcObject = stream));
    });
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera(false);
  };
  const uploadPhoto = (blob, source) =>
    wrap(async () => {
      const fd = new FormData();
      fd.append("source", source);
      fd.append("photo", new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }));
      const r = await request("/portal/me/photo", { method: "POST", form: fd, token });
      setDraft(r.student);
      stopCamera();
    });
  const capture = () => {
    const v = videoRef.current;
    const w = v.videoWidth, h = v.videoHeight, cw = Math.min(w, h * 0.8);
    const canvas = Object.assign(document.createElement("canvas"), { width: 600, height: 750 });
    canvas.getContext("2d").drawImage(v, (w - cw) / 2, 0, cw, h, 0, 0, 600, 750);
    canvas.toBlob((b) => b && uploadPhoto(b, "CAMERA"), "image/jpeg", 0.9);
  };
  const submit = () =>
    wrap(async () => {
      await call("/me/submit", { method: "POST", body: { consent: true }, token });
      setDone(true);
    });

  if (error && !info) return <Centered title="This link cannot be opened" text={error} />;
  if (!info) return <Centered title="Opening your form…" />;
  if (done)
    return (
      <Centered
        title="Thank you!"
        text={`${info.school.name} has your ID card details. The school will review them and contact you if anything needs correcting.`}
        icon="checkCircle"
      />
    );

  if (!token)
    return (
      <div className="portal-live">
        <h1>{info.school.name}</h1>
        <p className="muted">Hello {info.studentFirstName}, confirm it is you to open your ID card form.</p>
        {error && <Callout icon="alert" tone="coral">{error}</Callout>}
        {info.verification === "EMAIL_OTP" ? (
          <div className="auth-form">
            {!otpSent ? (
              <Button disabled={busy} onClick={() => wrap(async () => (await call(`/invite/${encodeURIComponent(invite)}/otp`, { method: "POST", body: {} }), setOtpSent(true)))}>
                Email a code to {info.emailHint}
              </Button>
            ) : (
              <>
                <Field label={`Code sent to ${info.emailHint}`} required>
                  <input inputMode="numeric" maxLength="6" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                </Field>
                <Button disabled={busy || code.length !== 6} onClick={verify}>Continue</Button>
              </>
            )}
          </div>
        ) : (
          <div className="auth-form">
            <Field label="Your admission number" required hint="As written in the school's records.">
              <input value={admission} onChange={(e) => setAdmission(e.target.value)} autoFocus />
            </Field>
            <Button disabled={busy || !admission.trim()} onClick={verify}>Continue</Button>
          </div>
        )}
      </div>
    );

  if (!form) return <Centered title="Opening your form…" />;
  const editable = form.editable;
  const fields = form.fields.filter((f) => f.key !== "photoNo");
  const value = (f) => (f.custom ? draft.extra?.[f.key] : draft[f.key]) ?? "";
  const set = (f, v) => setDraft((d) => (f.custom ? { ...d, extra: { ...d.extra, [f.key]: v } } : { ...d, [f.key]: v }));
  const options = (f) =>
    f.type === "fatherPrefix" ? form.prefixes.father : f.type === "motherPrefix" ? form.prefixes.mother : f.type === "class" ? form.classes.map((c) => c.name) : f.type === "section" ? form.classes.find((c) => c.name === draft.className)?.sections || [] : f.type === "gender" ? ["Male", "Female", "Other"] : f.type === "blood" ? ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] : f.type === "select" ? f.options || [] : null;

  return (
    <div className="portal-live">
      <h1>{form.school.name}</h1>
      <Steps items={["Your details", "Photo", "Confirm"]} current={step} />
      {form.student.reviewNote && <Callout tone="amber">Correction requested: {form.student.reviewNote}</Callout>}
      {error && <Callout icon="alert" tone="coral">{error}</Callout>}
      {!editable && <Callout>Your details are with the school for review. You can no longer change them here.</Callout>}

      {step === 0 && (
        <>
          <div className="form-grid">
            {fields.map((f) => (
              <Field key={f.key} label={f.label} required={f.required} className={f.key === "address" ? "span-two" : ""}>
                {options(f) ? (
                  <select value={value(f)} disabled={!editable || f.readOnly} onChange={(e) => set(f, e.target.value)}>
                    <option value="">Choose {f.label.toLowerCase()}</option>
                    {options(f).map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  f.type === "date" ? (
                    <DateInput value={value(f)} disabled={!editable || f.readOnly} max={f.key === "dob" ? new Date().toISOString().slice(0, 10) : undefined} onChange={(v) => set(f, v)} />
                  ) : (
                    <input
                      type={f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"}
                      className={["name", "fatherName", "motherName"].includes(f.key) ? "upper" : undefined}
                      value={value(f)}
                      disabled={!editable || f.readOnly}
                      onChange={(e) => set(f, ["name", "fatherName", "motherName"].includes(f.key) ? e.target.value.toUpperCase() : e.target.value)}
                    />
                  )
                )}
              </Field>
            ))}
          </div>
          <div className="modal-actions">
            <Button disabled={busy || !editable} onClick={saveDetails}>Save and continue</Button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <div className="portal-photo">
            {camera ? <video ref={videoRef} autoPlay playsInline muted /> : draft.photoUrl ? <img src={draft.photoUrl} alt="Your ID photo" /> : <div className="photo-placeholder"><Icon name="camera" size={40} /></div>}
          </div>
          <Callout icon="camera">Face the camera in good light, with a plain background. No caps or dark glasses.</Callout>
          <label className="check-row">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I agree to take a photo for my school ID card.
          </label>
          <div className="modal-actions">
            {camera ? (
              <>
                <Button variant="secondary" onClick={stopCamera}>Cancel</Button>
                <Button icon="camera" disabled={busy} onClick={capture}>Take photo</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
                <Button variant="secondary" icon="camera" disabled={busy} onClick={startCamera}>{draft.photoUrl ? "Retake photo" : "Open camera"}</Button>
                <label className="btn secondary upload-label">
                  <Icon name="upload" size={15} />
                  <span>Upload photo</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0], "UPLOAD")} />
                </label>
                <Button disabled={!draft.photoUrl} onClick={() => setStep(2)}>Continue</Button>
              </>
            )}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="portal-confirm">
            {draft.photoUrl && <img src={draft.photoUrl} alt="" />}
            <dl className="details-list">
              {fields.filter((f) => value(f)).map((f) => (
                <div key={f.key}>
                  <dt>{f.label}</dt>
                  <dd>
                    {f.type === "date"
                      ? String(value(f)).split("-").reverse().join("-")
                      : String(value(f)).toUpperCase()}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> These details and the photo are correct.
          </label>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setStep(0)}>Edit details</Button>
            <Button disabled={!confirmed || busy} onClick={submit}>Submit to school</Button>
          </div>
        </>
      )}
    </div>
  );
}

function Centered({ title, text, icon = "help" }) {
  return (
    <div className="portal-live centered">
      <Icon name={icon} size={36} />
      <h1>{title}</h1>
      {text && <p className="muted">{text}</p>}
    </div>
  );
}
