import { invoke, isTauri } from "@tauri-apps/api/core";

type StartupEntry = {
  path: string;
};

const STARTUP_DOCUMENT_KEY = "vellum.startup-document:v1";

export async function bootstrapStartupDocument() {
  if (!isTauri()) return;

  try {
    const entry = await invoke<StartupEntry | null>("startup_document");
    if (entry?.path) localStorage.setItem(STARTUP_DOCUMENT_KEY, JSON.stringify(entry.path));
  } catch (error) {
    console.error("Vellum could not process the startup document.", error);
  }
}
