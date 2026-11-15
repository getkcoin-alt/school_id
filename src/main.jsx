import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import PhoneApp from "./PhoneApp.jsx";
import { apiMode } from "./api/client.js";
import "./style.css";
import "./phone.css";

// The demo preview opens the phone workspace on /app and on phone-sized screens;
// the live app (with an API) always uses the full workspace.
const phonePreview = !apiMode && (/^\/app\/?$/.test(window.location.pathname) || window.matchMedia("(max-width: 760px)").matches);
createRoot(document.getElementById("root")).render(phonePreview ? <PhoneApp /> : <App />);
