import { CLIENT_VERSION } from "../lib/version";
import { useServerStore } from "../stores/serverStore";

export function VersionLine() {
  const serverVersion = useServerStore((state) => state.serverVersion);

  if (!serverVersion) {
    return (
      <p className="text-xs text-sori-dim">
        SORI App {CLIENT_VERSION}
      </p>
    );
  }

  return (
    <p className="text-xs text-sori-dim">
      SORI App {CLIENT_VERSION} • Server {serverVersion.version} • build {serverVersion.buildId}
    </p>
  );
}
