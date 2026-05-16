import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { useServerStore } from "./serverStore";
import { useSettingsStore } from "./settingsStore";
import { createRequestId } from "../lib/requestId";
import { getDesktopSessionToken } from "../lib/desktopHttp";
import { getDesktopClientSignal } from "../lib/clientInfo";
import { emitClientSignal } from "../lib/voiceLifecycleTelemetry";

type SocketStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

let reconnectToastId: string | number | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastDisconnectReason: string | null = null;

function getRealtimeLabels() {
  return useSettingsStore.getState().language === "ru"
    ? {
      reconnecting: "Соединение прервано. Переподключаемся...",
      failed: "Ошибка realtime-соединения."
    }
    : {
      reconnecting: "Connection interrupted. Reconnecting...",
      failed: "Realtime connection failed."
    };
}

function clearReconnectNotice() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (reconnectToastId !== null) {
    toast.dismiss(reconnectToastId);
    reconnectToastId = null;
  }
}

interface SocketState {
  socket: Socket | null;
  status: SocketStatus;
  onlineUsers: Set<string>;
  connect: () => void;
  disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  status: "idle",
  onlineUsers: new Set(),

  connect: () => {
    const bootstrap = useServerStore.getState().bootstrap;
    if (!bootstrap) {
      return;
    }

    const existing = get().socket;
    if (existing?.connected || get().status === "connecting") {
      return;
    }

    existing?.disconnect();
    set({ status: "connecting" });

    void (async () => {
      const token = await getDesktopSessionToken().catch(() => null);

      const socket = io(bootstrap.endpoints.ws, {
        path: bootstrap.realtime.socketPath,
        transports: bootstrap.realtime.transports,
        withCredentials: true,
        autoConnect: false,
        auth: {
          requestId: createRequestId(),
          client: getDesktopClientSignal(),
          ...(token ? { token } : {})
        }
      });

      socket.on("connect", () => {
        set({ socket, status: "connected" });
        clearReconnectNotice();
        emitClientSignal(socket);
        if (lastDisconnectReason) {
          socket.emit("voice_lifecycle_event", {
            event: "socket_reconnected",
            reason: lastDisconnectReason,
            severity: "info",
            client: getDesktopClientSignal(),
            details: { lastDisconnectReason },
          });
          lastDisconnectReason = null;
        }
        socket.emit("get_voice_state");
      });

      socket.on("disconnect", (reason) => {
        lastDisconnectReason = reason;
        set({ status: "disconnected" });
        if (reason !== "io client disconnect" && !reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            if (!socket.connected && reconnectToastId === null) {
              reconnectToastId = toast.loading(getRealtimeLabels().reconnecting);
            }
          }, 2500);
        }
      });

      socket.on("connect_error", (error) => {
        set({ status: "error" });
        clearReconnectNotice();
        toast.error(error.message || getRealtimeLabels().failed);
      });

      socket.on("initial_presence", (userIds: string[]) => {
        set({ onlineUsers: new Set(userIds) });
      });

      socket.on("presence_update", (data: { userId: string; status: string }) => {
        set((state) => {
          const onlineUsers = new Set(state.onlineUsers);
          if (data.status === "online") {
            onlineUsers.add(data.userId);
          } else {
            onlineUsers.delete(data.userId);
          }
          return { onlineUsers };
        });
      });

      socket.connect();
      set({ socket });
    })();
  },

  disconnect: () => {
    clearReconnectNotice();
    get().socket?.disconnect();
    set({ socket: null, status: "idle", onlineUsers: new Set() });
  }
}));
