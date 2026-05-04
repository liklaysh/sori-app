import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { playNotificationSound } from "../../lib/notificationSounds";
import { useAuthStore } from "../../stores/authStore";
import type { DMConversation, Message, SoriUser, VoiceOccupant } from "../../types/sori";

interface MainSocketEventsOptions {
  socket: {
    on: (event: string, listener: (...args: any[]) => void) => void;
    off: (event: string, listener?: (...args: any[]) => void) => void;
  } | null;
  activeChannelId: string | null;
  connectedChannelId: string | null;
  userId?: string;
  channelMessagePopups: boolean;
  directMessagePopups: boolean;
  addIncomingMessage: (message: Message) => void;
  addCallLog: (log: any) => void;
  upsertConversation: (conversation: DMConversation) => void;
  receiveIncomingCall: (callId: string, caller: SoriUser) => void;
  setOutgoingCallId: (callId: string) => void;
  handleCallAccepted: (callId: string) => Promise<void>;
  resetDirectCall: () => void;
  setVoiceOccupants: (channelId: string, occupants: VoiceOccupant[]) => void;
  updateVoiceOccupant: (channelId: string, userId: string, data: Partial<VoiceOccupant>) => void;
  updateUserReferences: (user: { id: string; username?: string | null; avatarUrl?: string | null; status?: "online" | "offline" | "idle" | "dnd" | null }) => void;
  updateVoiceUserReferences: (user: { id: string; username?: string | null; avatarUrl?: string | null }) => void;
  setTyping: (channelId: string, username: string | null) => void;
}

export function useMainSocketEvents(options: MainSocketEventsOptions) {
  const soundedMessageIds = useRef(new Set<string>());

  useEffect(() => {
    if (!options.socket) return;

    const handleMessage = (message: Message) => {
      options.addIncomingMessage(message);
      const isOwn = message.authorId === options.userId;
      const isDm = Boolean(message.conversationId);
      const shouldToast = !isOwn && (isDm ? options.directMessagePopups : options.channelMessagePopups);

      if (!isOwn && !soundedMessageIds.current.has(message.id)) {
        soundedMessageIds.current.add(message.id);
        playNotificationSound("newMessage");
      }

      if (shouldToast) {
        toast(message.author?.username || message.username || "SORI", {
          description: message.content || message.attachments?.[0]?.fileName || "Attachment"
        });
      }
    };

    const handleConversation = (conversation: DMConversation) => options.upsertConversation(conversation);
    const handleIncomingCall = (data: { callId: string; caller: SoriUser }) => options.receiveIncomingCall(data.callId, data.caller);
    const handleOutgoingStarted = (data: { callId: string }) => options.setOutgoingCallId(data.callId);
    const handleAccepted = (data: { callId: string }) => void options.handleCallAccepted(data.callId);
    const handleReset = () => options.resetDirectCall();
    const handleVoiceUserJoined = (data: { channelId: string; userId: string }) => {
      if (data.userId !== options.userId && data.channelId === options.connectedChannelId) {
        playNotificationSound("voiceJoin");
      }
    };
    const handleVoiceUserLeft = (data: { channelId: string; userId: string }) => {
      if (data.userId !== options.userId && data.channelId === options.connectedChannelId) {
        playNotificationSound("voiceLeave");
      }
    };
    const handleUserUpdated = (data: { id: string; username?: string | null; avatarUrl?: string | null; status?: "online" | "offline" | "idle" | "dnd" | null }) => {
      options.updateUserReferences(data);
      options.updateVoiceUserReferences(data);
      const currentUser = useAuthStore.getState().user;
      if (currentUser?.id === data.id) {
        useAuthStore.getState().setUser({
          ...currentUser,
          ...(data.username !== undefined && data.username !== null ? { username: data.username } : {}),
          ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        });
      }
    };

    options.socket.on("new_message", handleMessage);
    options.socket.on("new_direct_message", handleMessage);
    options.socket.on("new_call_log", options.addCallLog);
    options.socket.on("dm_conversation_updated", handleConversation);
    options.socket.on("incoming_call", handleIncomingCall);
    options.socket.on("outgoing_call_started", handleOutgoingStarted);
    options.socket.on("call_accepted", handleAccepted);
    options.socket.on("call_rejected", handleReset);
    options.socket.on("call_ended", handleReset);
    options.socket.on("call_missed", handleReset);
    options.socket.on("call_timed_out", handleReset);
    options.socket.on("voice_occupants_update", ({ channelId, occupants }: { channelId: string; occupants: VoiceOccupant[] }) => {
      options.setVoiceOccupants(channelId, occupants);
    });
    options.socket.on("voice_occupants_state", (state: Record<string, VoiceOccupant[]>) => {
      Object.entries(state).forEach(([channelId, occupants]) => options.setVoiceOccupants(channelId, occupants));
    });
    options.socket.on("voice_user_joined", handleVoiceUserJoined);
    options.socket.on("voice_user_left", handleVoiceUserLeft);
    options.socket.on("user_speaking_status", (data: { channelId: string; userId: string; isSpeaking: boolean }) => {
      options.updateVoiceOccupant(data.channelId, data.userId, { isSpeaking: data.isSpeaking });
    });
    options.socket.on("user_audio_status", (data: { channelId: string; userId: string; isMuted: boolean; isDeafened: boolean }) => {
      options.updateVoiceOccupant(data.channelId, data.userId, { isMuted: data.isMuted, isDeafened: data.isDeafened });
    });
    options.socket.on("user_updated", handleUserUpdated);
    options.socket.on("user_typing", (data: { userId: string; username: string; isTyping: boolean }) => {
      if (!options.activeChannelId || data.userId === options.userId) return;
      options.setTyping(options.activeChannelId, data.isTyping ? data.username : null);
    });

    return () => {
      options.socket?.off("new_message", handleMessage);
      options.socket?.off("new_direct_message", handleMessage);
      options.socket?.off("new_call_log", options.addCallLog);
      options.socket?.off("dm_conversation_updated", handleConversation);
      options.socket?.off("incoming_call", handleIncomingCall);
      options.socket?.off("outgoing_call_started", handleOutgoingStarted);
      options.socket?.off("call_accepted", handleAccepted);
      options.socket?.off("call_rejected", handleReset);
      options.socket?.off("call_ended", handleReset);
      options.socket?.off("call_missed", handleReset);
      options.socket?.off("call_timed_out", handleReset);
      options.socket?.off("voice_occupants_update");
      options.socket?.off("voice_occupants_state");
      options.socket?.off("voice_user_joined", handleVoiceUserJoined);
      options.socket?.off("voice_user_left", handleVoiceUserLeft);
      options.socket?.off("user_speaking_status");
      options.socket?.off("user_audio_status");
      options.socket?.off("user_updated", handleUserUpdated);
      options.socket?.off("user_typing");
    };
  }, [options]);
}
