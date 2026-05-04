import { invoke } from "@tauri-apps/api/core";

interface DesktopHttpResponse {
  status: number;
  body: string;
}

interface DesktopUploadField {
  name: string;
  value: string;
}

interface DesktopUploadFile {
  name: string;
  fileName: string;
  mimeType: string;
  dataBase64: string;
}

const SESSION_STORAGE_KEY = "sori-app-session-token";

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function headersToRecord(headers: Headers) {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export async function desktopHttpRequest(url: string, method: string, headers: Headers, body?: BodyInit | null) {
  return invoke<DesktopHttpResponse>("desktop_http_request", {
    request: {
      url,
      method,
      headers: headersToRecord(headers),
      body: typeof body === "string" ? body : undefined
    }
  });
}

export async function desktopHttpUpload(url: string, headers: Headers, formData: FormData) {
  const fields: DesktopUploadField[] = [];
  const files: DesktopUploadFile[] = [];

  for (const [name, value] of formData.entries()) {
    if (value instanceof File) {
      files.push({
        name,
        fileName: value.name || "upload.bin",
        mimeType: value.type || "application/octet-stream",
        dataBase64: await blobToBase64(value)
      });
    } else {
      fields.push({ name, value });
    }
  }

  return invoke<DesktopHttpResponse>("desktop_http_upload", {
    request: {
      url,
      headers: headersToRecord(headers),
      fields,
      files
    }
  });
}

export async function getDesktopSessionToken() {
  if (!isTauriRuntime()) {
    return null;
  }

  return invoke<string | null>("desktop_http_session_token");
}

export async function persistDesktopSession() {
  if (!isTauriRuntime()) {
    return;
  }

  const token = await getDesktopSessionToken().catch(() => null);
  if (token) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

export async function restoreDesktopSession() {
  if (!isTauriRuntime()) {
    return;
  }

  const token = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!token) {
    return;
  }

  await invoke("desktop_http_set_session_token", { token }).catch(() => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  });
}

export function clearDesktopSession() {
  if (!isTauriRuntime()) {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  void invoke("desktop_http_clear_session").catch(() => undefined);
}

export async function openExternalUrl(url: string) {
  if (!isTauriRuntime()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  await invoke("desktop_open_external_url", { url });
}
