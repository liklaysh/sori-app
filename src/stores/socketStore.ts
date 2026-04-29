import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { useServerStore } from "./serverStore";
import { createRequestId } from "../lib/requestId";

type SocketStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

interface SocketState {
  socket: Socket | null;
  status: SocketStatus;
  connect: () => void;
  disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  status: "idle",

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

    const socket = io(bootstrap.endpoints.ws, {
      path: bootstrap.realtime.socketPath,
      transports: bootstrap.realtime.transports,
      withCredentials: true,
      autoConnect: false,
      auth: {
        requestId: createRequestId()
      }
    });

    socket.on("connect", () => {
      set({ socket, status: "connected" });
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

    socket.connect();
    set({ socket });
  },

  disconnect: () => {
    get().socket?.disconnect();
    set({ socket: null, status: "idle" });
  }
}));
