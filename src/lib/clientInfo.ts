import { CLIENT_VERSION } from "./version";

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};

export function getDesktopClientSignal() {
  return {
    clientType: "desktop",
    appVersion: CLIENT_VERSION,
    buildId: viteEnv.VITE_SORI_BUILD_ID || CLIENT_VERSION,
    commit: viteEnv.VITE_SORI_COMMIT || "unknown",
    livekitClientVersion: "unknown",
    platform: navigator.platform || "desktop",
    userAgent: navigator.userAgent,
  };
}
