import { useServerStore } from "../stores/serverStore";

export function getLiveKitEndpoint() {
  const bootstrap = useServerStore.getState().bootstrap;
  if (!bootstrap) {
    throw new Error("SORI server is not configured.");
  }

  return bootstrap.endpoints.livekit;
}
