import { invoke, isTauri } from "@tauri-apps/api/core";

type StartupEntry = {
  path: string;
};

const LIBRARY_KEY = "vellum.library:v1";
const DOCUMENT_KEY = "vellum.document:v1";

function readLibrary(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function bootstrapStartupDocument() {
  if (!isTauri()) return;

  try {
    const entry = await invoke<StartupEntry | null>("startup_document");
    if (!entry?.path) return;

    const roots = readLibrary();
    if (!roots.includes(entry.path)) {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify([...roots, entry.path]));
    }
    localStorage.setItem(DOCUMENT_KEY, JSON.stringify(entry.path));
  } catch (error) {
    console.error("Vellum could not process the startup document.", error);
  }
}
