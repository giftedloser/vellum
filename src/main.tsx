import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { bootstrapStartupDocument } from "./startup";
import "./tokens.css";
import "./app.css";
import "./editor.css";

await bootstrapStartupDocument();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
