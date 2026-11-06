import React, { useState, useRef, useEffect } from "react";
import { FIELDS, personIcon } from "../data.js";
import {
  Icon,
  Button,
  Panel,
  Field,
  Callout,
  Steps,
  CardPreview,
  Badge,
} from "../components.jsx";
import { validateStudent } from "../lib.js";
export default function StudentPortal({ ctx }) {
  const { data, update, notify, log } = ctx;
  const q = new URLSearchParams(window.location.search);
  const studentId = q.get("student") || "ST-0019";
  const token = q.get("token");
  const original = data.students.find((s) => s.id === studentId);
  const school = data.schools.find((s) => s.id === original?.school);
  const [draft, setDraft] = useState(
    original ? structuredClone(original) : null,
  );
  const [step, setStep] = useState(-1),
    [code, setCode] = useState(""),
    [codeError, setCodeError] = useState(""),
    [errors, setErrors] = useState({}),
    [stream, setStream] = useState(null),
    [cameraError, setCameraError] = useState(""),
    [ready, setReady] = useState(false),
    [consent, setConsent] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [submitted, setSubmitted] = useState(
      original &&
        ["In review", "Approved", "Submitted for print"].includes(
          original.status,
        ),
    );
  const video = useRef(),
    canvas = useRef(),
    streamRef = useRef(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => {
    if (stream && video.current) {
      video.current.srcObject = stream;
      video.current.play().catch(() => {});
    }
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);
  if (!original || !school || token !== `demo-${studentId}`)
    return (
      <div className="student-invalid">
        <Icon name="lock" size={44} />
        <h1>This invitation isn’t available.</h1>
        <p>
          Check the complete link in your email, or ask your school admin for a
          new invitation.
        </p>
        <a className="btn secondary" href="/?panel=school&page=invitations">
          Back to preview workspace
        </a>
      </div>
    );
  const design = data.schoolDesigns?.[school.id] || data.design;
  const keys = data.fieldScope[school.id] || data.enabledFields;
  const fields = FIELDS.filter((f) => keys.includes(f[0]));
  const change = (key, val) => {
    setDraft((d) => ({ ...d, [key]: val }));
    setErrors((e) => ({ ...e, [key]: null }));
  };
  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setReady(false);
  };
  const start = async () => {
    if (!consent) {
      setCameraError("Please agree to take a photo for your school ID.");
      return;
    }
    setCameraError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("Camera is not supported in this browser.");
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 800 },
        },
        audio: false,
      });
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = media;
      setStream(media);
    } catch (e) {
      setCameraError(
        e.name === "NotAllowedError"
          ? "Camera access was declined. Allow camera access in your browser and try again."
          : e.name === "NotFoundError"
            ? "No camera was found. Open this link on a phone or another device."
            : e.message,
      );
    }
  };
  const capture = () => {
    const v = video.current,
      c = canvas.current;
    if (!v || !v.videoWidth) return;
    const size = Math.min(v.videoWidth, v.videoHeight * 0.8);
    const height = size * 1.25;
    c.width = 400;
    c.height = 500;
    const g = c.getContext("2d");
    g.drawImage(
      v,
      (v.videoWidth - size) / 2,
      (v.videoHeight - height) / 2,
      size,
      height,
      0,
      0,
      400,
      500,
    );
    setDraft((d) => ({
      ...d,
      photo: c.toDataURL("image/jpeg", 0.8),
      photoSource: "Live camera",
      captureAt: new Date().toISOString(),
    }));
    stop();
  };
  const next = () => {
    const e = validateStudent(draft, fields);
    if (Object.keys(e).length) {
      setErrors(e);
      notify("Please check the highlighted details.", "error");
      document
        .querySelector(".error")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setStep(1);
    window.scrollTo(0, 0);
  };
  const submit = () => {
    if (
      !confirmed ||
      !draft.photo ||
      !["Live camera", "Demo capture"].includes(draft.photoSource)
    )
      return;
    const errors = validateStudent(draft, fields);
    if (Object.keys(errors).length) {
      setErrors(errors);
      setStep(0);
      return;
    }
    update((d) =>
      log(
        {
          ...d,
          students: d.students.map((s) =>
            s.id === original.id
              ? {
                  ...draft,
                  status: "In review",
                  note: "",
                  submittedAt: new Date().toISOString(),
                }
              : s,
          ),
          notifications: [
            {
              id: Date.now(),
              title: `${draft.name} submitted ID details`,
              text: `${school.name} · Ready for school review`,
              read: false,
            },
            ...d.notifications,
          ],
        },
        `${draft.name} submitted an ID form`,
        "face",
      ),
    );
    setSubmitted(true);
    stop();
    notify("Your details were submitted for school review.");
  };
  return (
    <div className="student-page">
      <div className="student-school">
        <div className="school-emblem">
          <Icon name="graduation" size={27} />
        </div>
        <div>
          <strong>{school.name}</strong>
          <span>STUDENT ID CARD · {draft.session}</span>
        </div>
        <Badge tone="green">School invitation</Badge>
      </div>
      <div className="student-page-grid">
        <div className="student-form-area">
          {submitted ? (
            <Panel className="student-success">
              <div className="success-circle">
                <Icon name="check" size={33} />
              </div>
              <span className="eyebrow">YOU’VE DONE YOUR PART</span>
              <h1>Your school ID is on its way.</h1>
              <p>
                Your details are{" "}
                {original.status === "Approved"
                  ? "approved"
                  : "with your school for review"}
                . Your school admin will check your photo and information before
                printing.
              </p>
              <div className="receipt">
                <span>REFERENCE NUMBER</span>
                <strong>{original.id}</strong>
                <Badge>
                  {data.students.find((s) => s.id === original.id)?.status ||
                    "In review"}
                </Badge>
              </div>
              <div className="receipt-steps">
                <div>
                  <Icon name="checkCircle" />
                  <span>Details submitted</span>
                </div>
                <div>
                  <Icon name="review" />
                  <span>School review</span>
                </div>
                <div>
                  <Icon name="print" />
                  <span>Printing & delivery</span>
                </div>
              </div>
              <Callout>
                Need to change something? Contact {school.email} or call +91{" "}
                {school.phone}. Your school admin can make corrections.
              </Callout>
              <a href="/?panel=school&page=review" className="btn secondary">
                Back to school preview <Icon name="arrow" size={16} />
              </a>
            </Panel>
          ) : step === -1 ? (
            <Panel className="verification-panel">
              <span className="secure-form-icon">
                <Icon name="email" size={27} />
              </span>
              <span className="eyebrow">
                HELLO, {draft.name.split(" ")[0].toUpperCase()}
              </span>
              <h1>Your school ID starts here.</h1>
              <p>
                A few details, a clear photo, and you’re done. First, let’s
                check your invitation.
              </p>
              <div className="invitation-address">
                <Icon name="lock" size={17} />
                <div>
                  <span>Invitation email</span>
                  <strong>{draft.email}</strong>
                </div>
              </div>
              <Field
                label="Enter the 6-digit verification code"
                error={codeError}
              >
                <input
                  className="otp-input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength="6"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, ""));
                    setCodeError("");
                  }}
                  placeholder="• • • • • •"
                />
              </Field>
              <Button
                icon="arrow"
                onClick={() => {
                  if (code === "246810") {
                    setStep(0);
                  } else
                    setCodeError(
                      "For this preview, enter the demo code 246810.",
                    );
                }}
              >
                Verify & continue
              </Button>
              <Callout icon="play">
                <strong>Try the full experience.</strong> This is a demo
                verification step. Use code <b>246810</b>. No code has been sent
                and this does not authenticate your identity.
              </Callout>
              <div className="student-help">
                <Icon name="clock" size={15} />
                About 3 minutes · Your school reviews the final details
              </div>
            </Panel>
          ) : (
            <>
              <Steps
                items={["Your details", "Your photo", "Review & submit"]}
                current={step}
              />
              <Panel className="student-form-panel">
                <div className="student-form-heading">
                  <span className="eyebrow">STEP {step + 1} OF 3</span>
                  <h1>
                    {
                      [
                        "Let’s get the details right.",
                        "A photo that looks like you.",
                        "One last look. Then you’re done.",
                      ][step]
                    }
                  </h1>
                  <p>
                    {
                      [
                        "Check the information below. It will appear on your school ID.",
                        "Take a fresh photo using your device camera. Find a well-lit spot.",
                        "Make sure your details are correct before sending them to school.",
                      ][step]
                    }
                  </p>
                </div>
                {original.note && (
                  <Callout tone="amber" icon="alert">
                    <b>Your school requested a correction:</b> {original.note}
                  </Callout>
                )}
                {step === 0 && (
                  <div className="form-grid">
                    {fields.map(([key, label, type, required]) => (
                      <Field
                        key={key}
                        label={label}
                        required={required}
                        error={errors[key]}
                        className={key === "address" ? "span-two" : ""}
                      >
                        {["class", "section", "gender", "blood"].includes(
                          type,
                        ) ? (
                          <select
                            value={draft[key] || ""}
                            onChange={(e) => change(key, e.target.value)}
                          >
                            <option value="">
                              Choose {label.toLowerCase()}
                            </option>
                            {(type === "class"
                              ? data.classes
                              : type === "section"
                                ? data.sections
                                : type === "gender"
                                  ? [
                                      "Male",
                                      "Female",
                                      "Other",
                                      "Prefer not to say",
                                    ]
                                  : [
                                      "A+",
                                      "A−",
                                      "B+",
                                      "B−",
                                      "AB+",
                                      "AB−",
                                      "O+",
                                      "O−",
                                    ]
                            ).map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={type}
                            value={draft[key] || ""}
                            onChange={(e) => change(key, e.target.value)}
                          />
                        )}
                      </Field>
                    ))}
                    {data.customFields
                      .filter(
                        (f) => f.school === school.id && f.audience !== "staff",
                      )
                      .map((f) => (
                        <Field key={f.id} label={f.name}>
                          <input
                            value={draft.custom?.[f.id] || ""}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                custom: { ...d.custom, [f.id]: e.target.value },
                              }))
                            }
                          />
                        </Field>
                      ))}
                  </div>
                )}
                {step === 1 && (
                  <>
                    <div className="photo-tips">
                      <span>
                        <Icon name="checkCircle" size={16} />
                        Face the camera
                      </span>
                      <span>
                        <Icon name="checkCircle" size={16} />
                        Good, even lighting
                      </span>
                      <span>
                        <Icon name="checkCircle" size={16} />
                        No filters or sunglasses
                      </span>
                    </div>
                    <div
                      className={`camera-stage ${stream ? "streaming" : ""}`}
                    >
                      {stream ? (
                        <>
                          <video
                            ref={video}
                            muted
                            playsInline
                            autoPlay
                            onLoadedData={() => setReady(true)}
                          />
                          <div className="face-oval" />
                          <span className="camera-label">
                            <i />
                            CAMERA IS ON
                          </span>
                        </>
                      ) : draft.photo &&
                        ["Live camera", "Demo capture"].includes(
                          draft.photoSource,
                        ) ? (
                        <>
                          <img
                            src={draft.photo}
                            alt="Your captured ID portrait"
                          />
                          <Badge
                            tone={
                              draft.photoSource === "Demo capture"
                                ? "amber"
                                : "green"
                            }
                          >
                            {draft.photoSource === "Demo capture"
                              ? "Sample photo · demo only"
                              : "Live camera photo"}
                          </Badge>
                        </>
                      ) : (
                        <div className="camera-placeholder">
                          <Icon name="face" size={60} />
                          <h3>You, front and centre.</h3>
                          <p>Your live portrait goes here.</p>
                        </div>
                      )}
                    </div>
                    <canvas ref={canvas} hidden />
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      <span>
                        I agree to use my camera and provide a photo for my
                        school ID. In this preview, it stays in this browser.
                      </span>
                    </label>
                    {cameraError && (
                      <p role="alert" className="error camera-error">
                        {cameraError}
                      </p>
                    )}
                    <div className="button-row camera-actions">
                      {stream ? (
                        <>
                          <Button variant="secondary" onClick={stop}>
                            Stop camera
                          </Button>
                          <Button
                            disabled={!ready}
                            icon="camera"
                            onClick={capture}
                          >
                            Take photo
                          </Button>
                        </>
                      ) : (
                        <Button
                          disabled={!consent}
                          icon="camera"
                          onClick={start}
                        >
                          {draft.photoSource === "Live camera"
                            ? "Retake photo"
                            : "Open camera"}
                        </Button>
                      )}
                      <Button
                        variant="text"
                        disabled={!consent}
                        onClick={() => {
                          stop();
                          setDraft((d) => ({
                            ...d,
                            photo: personIcon(0),
                            photoSource: "Demo capture",
                            captureAt: new Date().toISOString(),
                          }));
                        }}
                      >
                        Use sample photo for demo
                      </Button>
                    </div>
                    <Callout icon="shield">
                      A live photo helps the school review your submission.
                      Automated liveness detection and identity matching are not
                      implemented in this frontend.
                    </Callout>
                  </>
                )}
                {step === 2 && (
                  <>
                    <div className="final-card-preview">
                      <CardPreview
                        student={draft}
                        school={school}
                        design={design}
                      />
                    </div>
                    <dl className="details-list final-details">
                      {fields.map(([key, label]) => (
                        <div key={key}>
                          <dt>{label}</dt>
                          <dd>{draft[key] || "—"}</dd>
                        </div>
                      ))}
                      {data.customFields
                        .filter(
                          (f) =>
                            f.school === school.id && f.audience !== "staff",
                        )
                        .map((f) => (
                          <div key={f.id}>
                            <dt>{f.name}</dt>
                            <dd>{draft.custom?.[f.id] || "—"}</dd>
                          </div>
                        ))}
                    </dl>
                    <label className="check-label confirmation-check">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      <span>
                        I confirm these details are correct and this submission
                        is for my school ID. My school may contact me to confirm
                        the information.
                      </span>
                    </label>
                  </>
                )}
                <div className="student-form-footer">
                  <Button
                    variant="secondary"
                    icon="back"
                    onClick={() => {
                      stop();
                      setStep(step - 1);
                    }}
                  >
                    Back
                  </Button>
                  {step === 0 ? (
                    <Button icon="arrow" onClick={next}>
                      Continue to photo
                    </Button>
                  ) : step === 1 ? (
                    <Button
                      icon="arrow"
                      disabled={
                        !draft.photo ||
                        !["Live camera", "Demo capture"].includes(
                          draft.photoSource,
                        )
                      }
                      onClick={() => {
                        stop();
                        setStep(2);
                      }}
                    >
                      Review my details
                    </Button>
                  ) : (
                    <Button icon="send" disabled={!confirmed} onClick={submit}>
                      Submit to my school
                    </Button>
                  )}
                </div>
              </Panel>
            </>
          )}
        </div>
        <aside className="student-side">
          <div className="student-side-inner">
            <span className="eyebrow">A LITTLE CARD. A BIG BELONGING.</span>
            <h2>
              Your identity.
              <br />
              Your school story.
            </h2>
            {step !== 2 && (
              <CardPreview student={draft} school={school} design={design} />
            )}
            <div className="student-assurance">
              <span>
                <Icon name="shield" />
                <div>
                  <strong>Your school is in control</strong>
                  <p>Only your school approves what goes on your ID.</p>
                </div>
              </span>
              <span>
                <Icon name="camera" />
                <div>
                  <strong>One fresh photo</strong>
                  <p>No old albums. Take a clear, current portrait.</p>
                </div>
              </span>
              <span>
                <Icon name="help" />
                <div>
                  <strong>Here if you need a hand</strong>
                  <p>Ask your school office if any details need correcting.</p>
                </div>
              </span>
            </div>
            <div className="powered-by">
              Made simple with <b>ID Studio</b>
            </div>
          </div>
        </aside>
      </div>
      <footer className="student-footer">
        <Icon name="lock" size={13} />
        Frontend preview · fictional records · no real email or identity
        verification
      </footer>
    </div>
  );
}
