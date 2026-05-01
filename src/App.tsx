import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { TitleBar } from "./components/TitleBar";
import { ServerConnectScreen } from "./screens/ServerConnectScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { MainShell } from "./screens/MainShell";
import { useAuthStore } from "./stores/authStore";
import { useServerStore } from "./stores/serverStore";
import { useSocketStore } from "./stores/socketStore";
import { preloadNotificationSounds } from "./lib/notificationSounds";
import { useT } from "./lib/i18n";

export function App() {
  const t = useT();
  const bootstrap = useServerStore((state) => state.bootstrap);
  const domain = useServerStore((state) => state.domain);
  const authStatus = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const fetchMe = useAuthStore((state) => state.fetchMe);
  const connectSocket = useSocketStore((state) => state.connect);
  const disconnectSocket = useSocketStore((state) => state.disconnect);

  useEffect(() => {
    if (bootstrap) {
      fetchMe();
      preloadNotificationSounds();
    }
  }, [bootstrap, fetchMe]);

  useEffect(() => {
    if (bootstrap && user) {
      connectSocket();
      return;
    }

    disconnectSocket();
  }, [bootstrap, connectSocket, disconnectSocket, user]);

  return (
    <div className="h-screen overflow-hidden bg-sori-surface-base text-sori-text-primary">
      <TitleBar />
      <div className="h-[calc(100vh-2.5rem)]">
        {!bootstrap ? (
          <ServerConnectScreen />
        ) : authStatus === "checking" ? (
          <div className="grid h-full place-items-center">
            <div className="flex items-center gap-3 text-sm font-bold text-sori-text-muted">
              <Loader2 className="h-5 w-5 animate-spin text-sori-accent-primary" />
              {t.checkingSession.replace("{domain}", domain || "SORI")}
            </div>
          </div>
        ) : user ? (
          <MainShell />
        ) : (
          <LoginScreen />
        )}
      </div>
    </div>
  );
}
