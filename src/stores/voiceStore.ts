import { create } from "zustand";
import { toast } from "sonner";
import type { VoiceOccupant } from "../types/sori";
import { apiRequest } from "../lib/api";
import { ensureMicrophoneAccess } from "../lib/mediaDevices";
import { playNotificationSound } from "../lib/notificationSounds";
import { useAuthStore } from "./authStore";
import { useSettingsStore } from "./settingsStore";
import { useSocketStore } from "./socketStore";

type VoiceStatus = "idle" | "connecting" | "connected" | "error";

function patchOccupant(
  occupantsByChannel: Record<string, VoiceOccupant[]>,
  channelId: string,
  userId: string,
  data: Partial<VoiceOccupant>,
) {
  return {
    ...occupantsByChannel,
    [channelId]: (occupantsByChannel[channelId] || []).map((occupant) => (
      occupant.userId === userId ? { ...occupant, ...data } : occupant
    )),
  };
}

function removeOccupant(
  occupantsByChannel: Record<string, VoiceOccupant[]>,
  channelId: string,
  userId: string,
) {
  return {
    ...occupantsByChannel,
    [channelId]: (occupantsByChannel[channelId] || []).filter((occupant) => occupant.userId !== userId),
  };
}

interface VoiceState {
  status: VoiceStatus;
  connectedChannelId: string | null;
  livekitToken: string | null;
  startedAt: number | null;
  occupantsByChannel: Record<string, VoiceOccupant[]>;
  isMuted: boolean;
  isDeafened: boolean;
  joinChannel: (channelId: string, options?: { silent?: boolean }) => Promise<void>;
  leaveChannel: (options?: { silent?: boolean }) => void;
  setOccupants: (channelId: string, occupants: VoiceOccupant[]) => void;
  updateOccupant: (channelId: string, userId: string, data: Partial<VoiceOccupant>) => void;
  updateUserReferences: (user: { id: string; username?: string | null; avatarUrl?: string | null }) => void;
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

  joinChannel: async (channelId, options) => {
    const socket = useSocketStore.getState().socket;
    set({ status: "connecting" });
    try {
      await ensureMicrophoneAccess(useSettingsStore.getState().activeMicId);

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
      if (!options?.silent) {
        playNotificationSound("voiceJoin");
        toast.success("Joined voice channel.");
      }
    } catch (error) {
      set({ status: "error", connectedChannelId: null, livekitToken: null, startedAt: null });
      if (!options?.silent) {
        toast.error(error instanceof Error ? error.message : "Failed to join voice channel.");
      }
    }
  },

  leaveChannel: (options) => {
    const { connectedChannelId } = get();
    const socket = useSocketStore.getState().socket;
    const userId = useAuthStore.getState().user?.id;
    if (connectedChannelId) {
      socket?.emit("user_speaking_update", { channelId: connectedChannelId, isSpeaking: false });
      socket?.emit("user_streaming_update", { channelId: connectedChannelId, isStreaming: false });
      socket?.emit("leave_voice_channel", connectedChannelId);
      if (!options?.silent) {
        playNotificationSound("voiceLeave");
      }
    }

    set((state) => ({
      status: "idle",
      connectedChannelId: null,
      livekitToken: null,
      startedAt: null,
      isMuted: false,
      isDeafened: false,
      occupantsByChannel: connectedChannelId && userId
        ? removeOccupant(state.occupantsByChannel, connectedChannelId, userId)
        : state.occupantsByChannel
    }));
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

  updateUserReferences: (user) => set((state) => ({
    occupantsByChannel: Object.fromEntries(
      Object.entries(state.occupantsByChannel).map(([channelId, occupants]) => [
        channelId,
        occupants.map((occupant) => occupant.userId === user.id ? {
          ...occupant,
          ...(user.username !== undefined && user.username !== null ? { username: user.username } : {}),
          ...(user.avatarUrl !== undefined ? { avatarUrl: user.avatarUrl } : {}),
        } : occupant),
      ]),
    ),
  })),

  toggleMute: () => {
    const nextMuted = !get().isMuted;
    const channelId = get().connectedChannelId;
    const userId = useAuthStore.getState().user?.id;
    set((state) => ({
      isMuted: nextMuted,
      occupantsByChannel: channelId && userId
        ? patchOccupant(state.occupantsByChannel, channelId, userId, { isMuted: nextMuted })
        : state.occupantsByChannel
    }));
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
    const userId = useAuthStore.getState().user?.id;
    set((state) => ({
      isDeafened: nextDeafened,
      occupantsByChannel: channelId && userId
        ? patchOccupant(state.occupantsByChannel, channelId, userId, { isDeafened: nextDeafened })
        : state.occupantsByChannel
    }));
    if (channelId) {
      useSocketStore.getState().socket?.emit("user_audio_status_update", {
        channelId,
        isMuted: get().isMuted,
        isDeafened: nextDeafened
      });
    }
  }
}));
