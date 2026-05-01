import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { useServerStore } from "./serverStore";
import { createRequestId } from "../lib/requestId";
import { getDesktopSessionToken } from "../lib/desktopHttp";

type SocketStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

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
          ...(token ? { token } : {})
        }
      });

      socket.on("connect", () => {
        set({ socket, status: "connected" });
        socket.emit("get_voice_state");
        toast.success("Connected to SORI realtime.");
      });

      socket.on("disconnect", (reason) => {
        set({ status: "disconnected" });
        if (reason !== "io client disconnect") {
          toast.warning("Realtime connection lost. Reconnecting...");
        }
      });

      socket.on("connect_error", (error) => {
        set({ status: "error" });
        toast.error(error.message || "Realtime connection failed.");
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
    get().socket?.disconnect();
    set({ socket: null, status: "idle", onlineUsers: new Set() });
  }
}));
