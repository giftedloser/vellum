import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { emptySession, type SessionState } from "./session";

type StartupEntry = {
  path: string;
};

export type StartupState = {
  documentPath?: string;
  session: SessionState;
  sessionError?: string;
};

export async function applyInterfaceScale(scale: number) {
  if (!isTauri()) return;

  try {
    await getCurrentWebview().setZoom(scale / 100);
  } catch (error) {
    console.error("Vellum could not apply its interface scale.", error);
  }
}

export async function bootstrapStartup(): Promise<StartupState> {
  const native = isTauri();
  const document = native ? invoke<StartupEntry | null>("startup_document").catch((error) => {
    console.error("Vellum could not process the startup document.", error);
    return null;
  }) : undefined;
  let session = emptySession();
  let sessionError: string | undefined;
  try {
    const stored = native ? await invoke<string | null>("load_session") : localStorage.getItem("vellum.session:v1");
    if (stored) session = JSON.parse(stored) as SessionState;
  } catch (error) {
    sessionError = `Vellum could not load its recovery session: ${String(error)}`;
  }
  return { documentPath: (await document)?.path, session, sessionError };
}
