import { create } from "zustand";
import { toast } from "sonner";
import type { SoriUser } from "../types/sori";
import { apiRequest } from "../lib/api";
import { startNotificationSoundLoop, stopNotificationSoundLoop } from "../lib/notificationSounds";
import { useSocketStore } from "./socketStore";

type DirectCallStatus = "idle" | "calling" | "ringing" | "connected";

interface DirectCallPeer {
  id: string;
  username: string;
  avatarUrl?: string | null;
}

interface DirectCallState {
  status: DirectCallStatus;
  callId: string | null;
  partner: DirectCallPeer | null;
  livekitToken: string | null;
  startedAt: number | null;
  initiateCall: (target: DirectCallPeer) => void;
  receiveIncomingCall: (callId: string, caller: DirectCallPeer) => void;
  setOutgoingCallId: (callId: string) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  handleAccepted: (callId: string) => Promise<void>;
  reset: () => void;
}

export const useDirectCallStore = create<DirectCallState>((set, get) => ({
  status: "idle",
  callId: null,
  partner: null,
  livekitToken: null,
  startedAt: null,

  initiateCall: (target) => {
    const socket = useSocketStore.getState().socket;
    if (!socket || get().status !== "idle") {
      return;
    }

    set({ status: "calling", partner: target, callId: null, livekitToken: null, startedAt: null });
    socket.emit("direct_call_initiate", { targetUserId: target.id });
  },

  receiveIncomingCall: (callId, caller) => {
    const socket = useSocketStore.getState().socket;
    const current = get();
    if (current.status !== "idle") {
      if (current.callId === callId) {
        return;
      }
      socket?.emit("direct_call_reject", { callId });
      return;
    }

    set({ status: "ringing", callId, partner: caller, livekitToken: null, startedAt: null });
    startNotificationSoundLoop("directCall");
    toast("Incoming call", { description: caller.username });
  },

  setOutgoingCallId: (callId) => {
    set({ callId });
  },

  acceptCall: () => {
    const { callId } = get();
    if (!callId) {
      return;
    }

    stopNotificationSoundLoop("directCall");
    useSocketStore.getState().socket?.emit("direct_call_accept", { callId });
  },

  rejectCall: () => {
    const { callId } = get();
    stopNotificationSoundLoop("directCall");
    if (callId) {
      useSocketStore.getState().socket?.emit("direct_call_reject", { callId });
    }
    get().reset();
  },

  endCall: () => {
    const { callId } = get();
    stopNotificationSoundLoop("directCall");
    if (callId) {
      useSocketStore.getState().socket?.emit("direct_call_end", { callId });
    }
    get().reset();
  },

  handleAccepted: async (callId) => {
    try {
      stopNotificationSoundLoop("directCall");
      const tokenData = await apiRequest<{ token: string; startedAt?: number }>("/calls/token", {
        method: "POST",
        body: JSON.stringify({ callId })
      });

      set({
        status: "connected",
        callId,
        livekitToken: tokenData.token,
        startedAt: tokenData.startedAt || Date.now()
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to join direct call.");
      get().endCall();
    }
  },

  reset: () => {
    stopNotificationSoundLoop("directCall");
    set({ status: "idle", callId: null, partner: null, livekitToken: null, startedAt: null });
  }
}));

export function userToCallPeer(user: Pick<SoriUser, "id" | "username" | "avatarUrl">): DirectCallPeer {
  return {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl
  };
}
