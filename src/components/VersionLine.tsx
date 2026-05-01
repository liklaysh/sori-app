import { CLIENT_VERSION } from "../lib/version";
import { useServerStore } from "../stores/serverStore";
import { useEffect } from "react";

export function VersionLine() {
  const serverVersion = useServerStore((state) => state.serverVersion);
  const fetchServerVersion = useServerStore((state) => state.fetchServerVersion);

  useEffect(() => {
    void fetchServerVersion();
  }, [fetchServerVersion]);

  if (!serverVersion) {
    return (
      <p className="text-xs font-semibold text-sori-text-dim">
        SORI App {CLIENT_VERSION}
      </p>
    );
  }

  return (
    <p className="text-xs font-semibold text-sori-text-dim">
      SORI App {CLIENT_VERSION} • Server {serverVersion.version} • build {serverVersion.buildId}
    </p>
  );
}
