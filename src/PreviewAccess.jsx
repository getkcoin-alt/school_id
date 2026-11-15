import React, { useState } from "react";
import { Button, Callout, Field, Modal } from "./components.jsx";
import { ROLES } from "./data.js";

export const DEMO_CODE = "246810";
const accounts = ROLES.filter((entry) => entry.id !== "student");

export default function PreviewAccess({
  onClose,
  onEnter,
  initialRole = "school",
  standalone = false,
  message: initialMessage = "",
}) {
  const [mode, setMode] = useState("signin");
  const [role, setRole] = useState(
    accounts.some((entry) => entry.id === initialRole) ? initialRole : "school",
  );
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const move = (next) => {
    setError("");
    setMessage("");
    setMode(next);
    setCode("");
  };
  const submit = (event) => {
    event.preventDefault();
    if ((mode === "signin" || mode === "reset") && code !== DEMO_CODE) {
      setError(`Enter the demo code ${DEMO_CODE}.`);
    } else if (mode === "signin") {
      onEnter(role);
    } else if (mode === "forgot") {
      setMode("reset");
    } else {
      const wasReset = mode === "reset";
      move("signin");
      setMessage(
        wasReset
          ? "Demo reset complete."
          : "Demo setup complete. You can now open a workspace.",
      );
    }
  };
  const title = {
    signin: "Sign in to ID Studio",
    forgot: "Request reset code",
    reset: "Verify demo reset code",
    setup: "Account setup preview",
  }[mode];
  const codeField = (
    <Field
      label="Demo access code"
      hint={`Use ${DEMO_CODE}`}
      error={error}
      required
    >
      <input
        required
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        aria-invalid={Boolean(error)}
        value={code}
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, ""));
          setError("");
        }}
      />
    </Field>
  );
  const form = (
    <form onSubmit={submit}>
      <div className="modal-body">
        {message && (
          <Callout>
            <span role="status">{message}</span>
          </Callout>
        )}
        {mode === "signin" && (
          <>
            <Field label="Demo account">
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {accounts.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </Field>
            {codeField}
            <details className="login-terms">
              <summary>Terms and conditions</summary>
              <ul>
                <li>Use only the account issued to you.</li>
                <li>
                  Student and staff details are collected for ID card
                  production.
                </li>
                <li>
                  Schools review card details before sending a print batch.
                </li>
                <li>
                  Print rounds, rates and delivery follow the agreed order form.
                </li>
              </ul>
            </details>
            <div className="button-row">
              <Button variant="text" onClick={() => move("forgot")}>
                Forgot password
              </Button>
              <Button variant="text" onClick={() => move("setup")}>
                Preview account setup
              </Button>
            </div>
          </>
        )}
        {mode === "forgot" && (
          <p>
            Continue to see the screen where account holders enter their email
            code.
          </p>
        )}
        {mode === "reset" && codeField}
        {mode === "setup" && (
          <p>
            In the connected app, an invited School Admin or agent opens an
            emailed setup link and chooses a password.
          </p>
        )}
      </div>
      <div className="modal-actions">
        {(!standalone || mode !== "signin") && (
          <Button
            variant="secondary"
            onClick={mode === "signin" ? onClose : () => move("signin")}
          >
            {mode === "signin" ? "Close" : "Back"}
          </Button>
        )}
        <Button type="submit">
          {
            {
              signin: "Sign in",
              forgot: "Show demo reset",
              reset: "Verify code",
              setup: "Finish demo setup",
            }[mode]
          }
        </Button>
      </div>
    </form>
  );
  if (!standalone)
    return (
      <Modal title={title} onClose={onClose}>
        {form}
      </Modal>
    );
  return (
    <main className="phone-workspace phone-access">
      <header className="phone-access-header">
        <span className="phone-brand">
          <img src="/logo.svg" alt="" />
        </span>
        <div>
          <h1>{title}</h1>
          <p>Choose a demo account to explore with sample data.</p>
        </div>
      </header>
      {form}
    </main>
  );
}
