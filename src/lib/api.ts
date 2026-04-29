import { useServerStore } from "../stores/serverStore";
import { createRequestId } from "./requestId";

let csrfToken: string | null = null;

export function rememberCsrfToken(data: unknown) {
  if (data && typeof data === "object" && "csrfToken" in data && typeof (data as { csrfToken?: unknown }).csrfToken === "string") {
    csrfToken = (data as { csrfToken: string }).csrfToken;
  }
}

export function clearCsrfToken() {
  csrfToken = null;
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

  const response = await fetch(`${getApiBaseUrl()}${normalizedPath}`, {
    ...init,
    method,
    headers,
    credentials: "include"
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  rememberCsrfToken(data);

  if (!response.ok) {
    const message = data?.error || data?.message || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

export async function uploadFormData<T>(path: string, formData: FormData): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const headers = new Headers({
    Accept: "application/json",
    "X-Request-ID": createRequestId()
  });

  const token = await ensureCsrfToken();
  if (token) {
    headers.set("X-CSRF-Token", token);
  }

  const response = await fetch(`${getApiBaseUrl()}${normalizedPath}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: formData
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  rememberCsrfToken(data);

  if (!response.ok) {
    const message = data?.error || data?.message || `Upload failed: ${response.status}`;
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
