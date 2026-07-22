import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize2, Minus, X } from "lucide-react";

const appWindow = isTauri() ? getCurrentWindow() : undefined;

export default function WindowControls() {
  return (
    <div className="sidebar-window-controls" aria-label="Window controls">
      <button type="button" onClick={() => void appWindow?.minimize()} title="Minimize" aria-label="Minimize"><Minus size={13} /></button>
      <button type="button" onClick={() => void appWindow?.toggleMaximize()} title="Maximize or restore" aria-label="Maximize or restore"><Maximize2 size={12} /></button>
      <button type="button" className="close" onClick={() => void appWindow?.close()} title="Close" aria-label="Close"><X size={14} /></button>
    </div>
  );
}
