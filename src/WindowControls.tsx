import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize2, Minus, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

const appWindow = isTauri() ? getCurrentWindow() : undefined;
export const windowControlsWidth = 108;
const windowControlsHeight = 32;
const revealDelayMs = 2000;

// Sandbox documents have their own pointer events. Report only transitions
// into and out of the corner so the host can apply the same hover delay.
export const windowControlsFrameEvents = `
  let overWindowCorner;
  const updateWindowCorner = (over) => {
    if (over === overWindowCorner) return;
    overWindowCorner = over;
    parent.postMessage({ type: "vellum-window-corner", over }, "*");
  };
  const leaveWindowCorner = () => {
    if (overWindowCorner) {
      parent.postMessage({ type: "vellum-window-corner", over: false, frameExit: true }, "*");
    }
    overWindowCorner = undefined;
  };
  const reportWindowCorner = (event) => updateWindowCorner(
    event.pointerType !== "touch" && event.buttons === 0 &&
    event.clientY >= 0 && event.clientY < ${windowControlsHeight} &&
    event.clientX >= innerWidth - ${windowControlsWidth} && event.clientX < innerWidth
  );
  addEventListener("pointermove", reportWindowCorner, true);
  addEventListener("pointerup", reportWindowCorner, true);
  addEventListener("pointerdown", () => updateWindowCorner(false), true);
  addEventListener("pointerout", (event) => {
    if (event.relatedTarget === null) leaveWindowCorner();
  });
  addEventListener("blur", leaveWindowCorner);
`;

export default function WindowControls({ frameRef }: { frameRef: RefObject<HTMLIFrameElement | null> }) {
  const controlsRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    let inCorner = false;
    let timer: number | undefined;

    const trackCorner = (over: boolean) => {
      if (over === inCorner) return;
      inCorner = over;
      if (!over) {
        window.clearTimeout(timer);
        timer = undefined;
        setRevealed(false);
        return;
      }
      timer = window.setTimeout(() => {
        timer = undefined;
        setRevealed(true);
      }, revealDelayMs);
    };
    const onPointer = (event: PointerEvent) => {
      const { clientX, clientY, pointerType, buttons } = event;
      const bounds = controls.getBoundingClientRect();
      trackCorner(pointerType !== "touch" && (buttons === 0 || controls.matches(":hover")) &&
        clientX >= bounds.left && clientX < bounds.right && clientY >= bounds.top && clientY < bounds.bottom);
    };
    const leave = () => trackCorner(false);
    const onPointerOut = (event: PointerEvent) => {
      if ((event.relatedTarget === null || event.relatedTarget === frameRef.current) &&
          !controls.matches(":hover")) leave();
    };
    const onFrameMessage = (event: MessageEvent) => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow ||
          event.data?.type !== "vellum-window-corner" || typeof event.data.over !== "boolean") return;
      // Revealing the controls can move the pointer from the frame onto a
      // button without mouse movement. The frame's exit must not hide it.
      if (!event.data.frameExit || !controls.matches(":hover")) trackCorner(event.data.over);
    };
    window.addEventListener("pointermove", onPointer, true);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("pointerup", onPointer, true);
    window.addEventListener("pointerout", onPointerOut, true);
    window.addEventListener("pointercancel", leave, true);
    window.addEventListener("blur", leave);
    window.addEventListener("message", onFrameMessage);
    controls.addEventListener("pointerleave", leave);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onPointer, true);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("pointerup", onPointer, true);
      window.removeEventListener("pointerout", onPointerOut, true);
      window.removeEventListener("pointercancel", leave, true);
      window.removeEventListener("blur", leave);
      window.removeEventListener("message", onFrameMessage);
      controls.removeEventListener("pointerleave", leave);
    };
  }, [frameRef]);

  return (
    <div
      ref={controlsRef}
      className={revealed ? "window-controls revealed" : "window-controls"}
      style={{ width: windowControlsWidth, height: windowControlsHeight }}
      role="group"
      aria-label="Window controls"
    >
      <button type="button" onClick={() => void appWindow?.minimize()} title="Minimize" aria-label="Minimize"><Minus size={13} /></button>
      <button type="button" onClick={() => void appWindow?.toggleMaximize()} title="Maximize or restore" aria-label="Maximize or restore"><Maximize2 size={12} /></button>
      <button type="button" className="close" onClick={() => void appWindow?.close()} title="Close" aria-label="Close"><X size={14} /></button>
    </div>
  );
}
