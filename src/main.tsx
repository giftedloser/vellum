import React from "react";
import ReactDOM from "react-dom/client";
import App, { readPreferences } from "./App";
import { applyInterfaceScale, bootstrapStartup } from "./startup";
import "./tokens.css";
import "./app.css";
import "./editor.css";

const preferences = readPreferences();
const [startup] = await Promise.all([bootstrapStartup(), applyInterfaceScale(preferences.interfaceScale)]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App initialPreferences={preferences} startup={startup} />
  </React.StrictMode>,
);
