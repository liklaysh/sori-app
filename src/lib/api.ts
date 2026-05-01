import { useServerStore } from "../stores/serverStore";
import { clearDesktopSession, desktopHttpRequest, desktopHttpUpload, isTauriRuntime } from "./desktopHttp";
import { createRequestId } from "./requestId";

let csrfToken: string | null = null;

export function rememberCsrfToken(data: unknown) {
  if (data && typeof data === "object" && "csrfToken" in data && typeof (data as { csrfToken?: unknown }).csrfToken === "string") {
    csrfToken = (data as { csrfToken: string }).csrfToken;
  }
}

export function clearCsrfToken() {
  csrfToken = null;
  clearDesktopSession();
}

function getApiBaseUrl() {
  const bootstrap = useServerStore.getState().bootstrap;
  if (!bootstrap) {
    throw new Error("SORI server is not configured.");
  }

  return bootstrap.endpoints.api.replace(/\/+$/, "");
}

function resolveAuthPath(kind: "login" | "me" | "refresh" | "logout") {
  const bootstrap = useServerStore.getState().bootstrap;
  if (!bootstrap) {
    throw new Error("SORI server is not configured.");
  }

  return {
    login: bootstrap.auth.loginPath,
    me: bootstrap.auth.mePath,
    refresh: bootstrap.auth.refreshPath,
    logout: bootstrap.auth.logoutPath
  }[kind];
}

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const csrfExemptPaths = new Set(["/auth/login", "/auth/register", "/auth/csrf"]);

async function ensureCsrfToken() {
  if (csrfToken) {
    return csrfToken;
  }

  const response = await apiRequest<{ csrfToken?: string }>("/auth/csrf");
  return response.csrfToken || null;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${getApiBaseUrl()}${normalizedPath}`;
  const headers = new Headers(init.headers);

  headers.set("Accept", "application/json");
  headers.set("X-Request-ID", createRequestId());

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (unsafeMethods.has(method) && !csrfExemptPaths.has(normalizedPath)) {
    const token = await ensureCsrfToken();
    if (token) {
      headers.set("X-CSRF-Token", token);
    }
  }

  let status: number;
  let ok: boolean;
  let text: string;

  if (isTauriRuntime()) {
    const response = await desktopHttpRequest(url, method, headers, init.body);
    status = response.status;
    ok = status >= 200 && status < 300;
    text = response.body;
  } else {
    const response = await fetch(url, {
      ...init,
      method,
      headers,
      credentials: "include"
    });
    status = response.status;
    ok = response.ok;
    text = await response.text();
  }

  const data = text ? JSON.parse(text) : null;
  rememberCsrfToken(data);

  if (!ok) {
    const message = data?.error || data?.message || `Request failed: ${status}`;
    throw new Error(message);
  }

  return data as T;
}

export async function uploadFormData<T>(path: string, formData: FormData): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${getApiBaseUrl()}${normalizedPath}`;
  const headers = new Headers({
    Accept: "application/json",
    "X-Request-ID": createRequestId()
  });

  const token = await ensureCsrfToken();
  if (token) {
    headers.set("X-CSRF-Token", token);
  }

  let status: number;
  let ok: boolean;
  let text: string;

  if (isTauriRuntime()) {
    const response = await desktopHttpUpload(url, headers, formData);
    status = response.status;
    ok = status >= 200 && status < 300;
    text = response.body;
  } else {
    const response = await fetch(url, {
      method: "POST",
      headers,
      credentials: "include",
      body: formData
    });
    status = response.status;
    ok = response.ok;
    text = await response.text();
  }

  const data = text ? JSON.parse(text) : null;
  rememberCsrfToken(data);

  if (!ok) {
    const message = data?.error || data?.message || `Upload failed: ${status}`;
    throw new Error(message);
  }

  return data as T;
}

export const authPaths = {
  login: () => resolveAuthPath("login"),
  me: () => resolveAuthPath("me"),
  refresh: () => resolveAuthPath("refresh"),
  logout: () => resolveAuthPath("logout")
};
