import { create } from "zustand";
import { toast } from "sonner";
import type { VoiceOccupant } from "../types/sori";
import { apiRequest } from "../lib/api";
import { playNotificationSound } from "../lib/notificationSounds";
import { useSocketStore } from "./socketStore";

type VoiceStatus = "idle" | "connecting" | "connected" | "error";

interface VoiceState {
  status: VoiceStatus;
  connectedChannelId: string | null;
  livekitToken: string | null;
  startedAt: number | null;
  occupantsByChannel: Record<string, VoiceOccupant[]>;
  isMuted: boolean;
  isDeafened: boolean;
  joinChannel: (channelId: string) => Promise<void>;
  leaveChannel: (options?: { silent?: boolean }) => void;
  setOccupants: (channelId: string, occupants: VoiceOccupant[]) => void;
  updateOccupant: (channelId: string, userId: string, data: Partial<VoiceOccupant>) => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  status: "idle",
  connectedChannelId: null,
  livekitToken: null,
  startedAt: null,
  occupantsByChannel: {},
  isMuted: false,
  isDeafened: false,

  joinChannel: async (channelId) => {
    const socket = useSocketStore.getState().socket;
    set({ status: "connecting" });
    try {
      const tokenData = await apiRequest<{ token: string; startedAt?: number }>("/calls/token", {
        method: "POST",
        body: JSON.stringify({ channelId })
      });

      socket?.emit("join_voice_channel", channelId);
      set({
        status: "connected",
        connectedChannelId: channelId,
        livekitToken: tokenData.token,
        startedAt: tokenData.startedAt || Date.now()
      });
      playNotificationSound("voiceJoin");
      toast.success("Joined voice channel.");
    } catch (error) {
      set({ status: "error", connectedChannelId: null, livekitToken: null, startedAt: null });
      toast.error(error instanceof Error ? error.message : "Failed to join voice channel.");
    }
  },

  leaveChannel: (options) => {
    const { connectedChannelId } = get();
    if (connectedChannelId) {
      useSocketStore.getState().socket?.emit("leave_voice_channel", connectedChannelId);
      if (!options?.silent) {
        playNotificationSound("voiceLeave");
      }
    }

    set({
      status: "idle",
      connectedChannelId: null,
      livekitToken: null,
      startedAt: null,
      isMuted: false,
      isDeafened: false
    });
  },

  setOccupants: (channelId, occupants) => set((state) => ({
    occupantsByChannel: {
      ...state.occupantsByChannel,
      [channelId]: occupants
    }
  })),

  updateOccupant: (channelId, userId, data) => set((state) => ({
    occupantsByChannel: {
      ...state.occupantsByChannel,
      [channelId]: (state.occupantsByChannel[channelId] || []).map((occupant) => (
        occupant.userId === userId ? { ...occupant, ...data } : occupant
      ))
    }
  })),

  toggleMute: () => {
    const nextMuted = !get().isMuted;
    const channelId = get().connectedChannelId;
    set({ isMuted: nextMuted });
    if (channelId) {
      useSocketStore.getState().socket?.emit("user_audio_status_update", {
        channelId,
        isMuted: nextMuted,
        isDeafened: get().isDeafened
      });
    }
  },

  toggleDeafen: () => {
    const nextDeafened = !get().isDeafened;
    const channelId = get().connectedChannelId;
    set({ isDeafened: nextDeafened });
    if (channelId) {
      useSocketStore.getState().socket?.emit("user_audio_status_update", {
        channelId,
        isMuted: get().isMuted,
        isDeafened: nextDeafened
      });
    }
  }
}));
