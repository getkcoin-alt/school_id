import React, { useEffect, useState } from "react";
import { Button, Callout, Field, Icon } from "../components.jsx";
import { api, auth } from "../api/client.js";

const ROLE_LABEL = { SUPER_ADMIN: "Super Admin", AGENT: "Agent", SCHOOL_ADMIN: "School Admin" };
const strong = (p) => p.length >= 8 && /[a-z]/i.test(p) && /\d/.test(p);

function Shell({ title, subtitle, children }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <img src="/logo.svg" alt="ID Card Studio" className="auth-logo" />
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
      <p className="auth-foot">ID Card Studio · School identity, simplified.</p>
    </div>
  );
}

function PasswordInput({ value, onChange, autoComplete = "current-password", id }) {
  const [show, setShow] = useState(false);
  return (
    <span className="password-input">
      <input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required />
      <button type="button" className="icon-btn" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>
        <Icon name={show ? "eyeOff" : "eye"} size={16} />
      </button>
    </span>
  );
}

export function Login() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [otp, setOtp] = useState(""),
    [error, setError] = useState(""),
    [info, setInfo] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") await auth.login(email, password);
      else if (mode === "forgot") {
        await api.post("/auth/password/forgot", { email });
        setInfo("If this email is registered, a 6-digit code is on its way.");
        setMode("reset");
      } else {
        if (!strong(password)) throw new Error("Use at least 8 characters with a letter and a number.");
        await api.post("/auth/password/reset", { email, otp, password });
        setInfo("Password updated. Sign in with your new password.");
        setMode("login");
        setPassword("");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell
      title={mode === "login" ? "Sign in" : mode === "forgot" ? "Reset your password" : "Choose a new password"}
      subtitle={mode === "login" ? "Schools, agents and administrators sign in here." : "We will email you a 6-digit code."}
    >
      <form onSubmit={submit} className="auth-form">
        {info && <Callout icon="checkCircle" tone="green">{info}</Callout>}
        {error && <Callout icon="alert" tone="coral">{error}</Callout>}
        <Field label="Email address" required>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
        </Field>
        {mode === "reset" && (
          <Field label="6-digit code" required>
            <input inputMode="numeric" maxLength="6" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} required />
          </Field>
        )}
        {mode !== "forgot" && (
          <Field label={mode === "reset" ? "New password" : "Password"} required>
            <PasswordInput value={password} onChange={setPassword} autoComplete={mode === "reset" ? "new-password" : "current-password"} />
          </Field>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "forgot" ? "Send code" : "Save password"}
        </Button>
        <button type="button" className="link-button" onClick={() => (setMode(mode === "login" ? "forgot" : "login"), setError(""), setInfo(""))}>
          {mode === "login" ? "Forgot your password?" : "Back to sign in"}
        </button>
      </form>
    </Shell>
  );
}

/** Account setup from the emailed invitation link (?onboard=TOKEN). */
export function Onboard({ token, onDone }) {
  const [info, setInfo] = useState(null),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .get(`/auth/onboard/${encodeURIComponent(token)}`)
      .then((r) => (setInfo(r), setName(r.name), setPhone(r.phone || "")))
      .catch((e) => setError(e.message));
  }, [token]);
  const submit = async (e) => {
    e.preventDefault();
    if (!strong(password)) return setError("Use at least 8 characters with a letter and a number.");
    if (password !== confirm) return setError("The passwords do not match.");
    setBusy(true);
    try {
      await auth.onboard(token, password, { name: name.trim() || undefined, phone: phone.trim() || undefined });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  if (!info)
    return (
      <Shell title="Set up your account">
        {error ? <Callout icon="alert" tone="coral">{error}</Callout> : <p className="muted">Checking your link…</p>}
        {error && <a className="btn secondary" href="/">Go to sign in</a>}
      </Shell>
    );
  return (
    <Shell title={`Welcome, ${info.name.split(" ")[0]}`} subtitle={`Create a password for your ${ROLE_LABEL[info.role]} account (${info.email}).`}>
      <form onSubmit={submit} className="auth-form">
        {error && <Callout icon="alert" tone="coral">{error}</Callout>}
        <Field label="Your name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Mobile number">
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Password" required hint="At least 8 characters with a letter and a number.">
          <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" required>
          <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </Field>
        <Button type="submit" disabled={busy}>{busy ? "Setting up…" : "Create account"}</Button>
      </form>
    </Shell>
  );
}
