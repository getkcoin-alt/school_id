import React, { useState } from "react";
import { Button, Callout, Field, Modal } from "./components.jsx";
import { ROLES } from "./data.js";

export default function PreviewAccess({ onClose, onEnter }) {
  const [mode, setMode] = useState("signin");
  const [role, setRole] = useState("school");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const move = (next) => {
    setError("");
    setMessage("");
    setMode(next);
    setCode("");
  };
  const submit = (event) => {
    event.preventDefault();
    if (mode === "signin") {
      onEnter(role);
    } else if (mode === "forgot") {
      setMode("reset");
    } else if (mode === "reset" && code !== "246810") {
      setError("Enter the demo code 246810.");
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
    signin: "Demo sign-in",
    forgot: "Request reset code",
    reset: "Verify demo reset code",
    setup: "Account setup preview",
  }[mode];
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <Callout>
            Explore the account screens with sample data. The preview uses the
            demo code 246810 and does not collect passwords.
          </Callout>
          {message && <p role="status">{message}</p>}
          {mode === "signin" && (
            <>
              <Field label="Demo workspace">
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLES.filter((entry) => entry.id !== "student").map(
                    (entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ),
                  )}
                </select>
              </Field>
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
                    Print rounds, rates and delivery follow the agreed order
                    form.
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
          {mode === "reset" && (
            <Field label="Six-digit demo code" error={error} required>
              <input
                required
                inputMode="numeric"
                maxLength="6"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
          )}
          {mode === "setup" && (
            <p>
              In the connected app, an invited School Admin or agent opens an
              emailed setup link and chooses a password.
            </p>
          )}
        </div>
        <div className="modal-actions">
          <Button
            variant="secondary"
            onClick={mode === "signin" ? onClose : () => move("signin")}
          >
            {mode === "signin" ? "Close" : "Back"}
          </Button>
          <Button type="submit">
            {
              {
                signin: "Open demo workspace",
                forgot: "Show demo reset",
                reset: "Verify code",
                setup: "Finish demo setup",
              }[mode]
            }
          </Button>
        </div>
      </form>
    </Modal>
  );
}
