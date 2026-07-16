import React from "react";
import ReactDOM from "react-dom/client";
import VellumApp from "./VellumApp";
import { bootstrapStartupDocument } from "./startup";
import "./styles.css";
import "./refinement.css";
import "./final.css";
import "./control-system.css";
import "./editor.css";

await bootstrapStartupDocument();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <VellumApp />
  </React.StrictMode>,
);
