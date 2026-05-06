import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { useAuthStore } from "../../stores/authStore";
import { chatContext, useChatStore } from "../../stores/chatStore";
import { useDirectCallStore, userToCallPeer } from "../../stores/directCallStore";
import { useServerStore } from "../../stores/serverStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSocketStore } from "../../stores/socketStore";
import { useVoiceStore } from "../../stores/voiceStore";
import { useT } from "../../lib/i18n";
import type { Channel, DMConversation, Member, Message, SoriUser, VoiceOccupant } from "../../types/sori";
import type { MemberMenuState, MessageActionMenuState, VoiceVolumeMenuState } from "./MainShellViews";
import { loadCollapsedCategories, saveCollapsedCategories } from "./mainShellStorage";
import { useMainSocketEvents } from "./useMainSocketEvents";

export function useMainShellController() {
  const t = useT();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memberMenu, setMemberMenu] = useState<MemberMenuState>(null);
  const [messageActionMenu, setMessageActionMenu] = useState<MessageActionMenuState>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [voiceVolumeMenu, setVoiceVolumeMenu] = useState<VoiceVolumeMenuState>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => loadCollapsedCategories());
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [isDirectCallExpanded, setIsDirectCallExpanded] = useState(false);

  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const bootstrap = useServerStore((state) => state.bootstrap);
  const socket = useSocketStore((state) => state.socket);
  const onlineUsers = useSocketStore((state) => state.onlineUsers);
  const channelMessagePopups = useSettingsStore((state) => state.channelMessagePopups);
  const directMessagePopups = useSettingsStore((state) => state.directMessagePopups);
  const participantVolumes = useSettingsStore((state) => state.participantVolumes);
  const setParticipantVolume = useSettingsStore((state) => state.setParticipantVolume);

  const channels = useChatStore((state) => state.channels);
  const conversations = useChatStore((state) => state.conversations);
  const members = useChatStore((state) => state.members);
  const messagesByContext = useChatStore((state) => state.messagesByContext);
  const typingUsers = useChatStore((state) => state.typingUsers);
  const activeMode = useChatStore((state) => state.activeMode);
  const activeChannelId = useChatStore((state) => state.activeChannelId);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const loading = useChatStore((state) => state.loading);
  const sending = useChatStore((state) => state.sending);
  const loadInitialData = useChatStore((state) => state.loadInitialData);
  const selectChannel = useChatStore((state) => state.selectChannel);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const startConversation = useChatStore((state) => state.startConversation);
  const sendActiveMessage = useChatStore((state) => state.sendActiveMessage);
  const addIncomingMessage = useChatStore((state) => state.addIncomingMessage);
  const updateReaction = useChatStore((state) => state.updateReaction);
  const addCallLog = useChatStore((state) => state.addCallLog);
  const upsertConversation = useChatStore((state) => state.upsertConversation);
  const setTyping = useChatStore((state) => state.setTyping);

  const directCallStatus = useDirectCallStore((state) => state.status);
  const directCallId = useDirectCallStore((state) => state.callId);
  const directCallPartner = useDirectCallStore((state) => state.partner);
  const directCallStartedAt = useDirectCallStore((state) => state.startedAt);
  const initiateCall = useDirectCallStore((state) => state.initiateCall);
  const endDirectCall = useDirectCallStore((state) => state.endCall);
  const receiveIncomingCall = useDirectCallStore((state) => state.receiveIncomingCall);
  const setOutgoingCallId = useDirectCallStore((state) => state.setOutgoingCallId);
  const handleCallAccepted = useDirectCallStore((state) => state.handleAccepted);
  const resetDirectCall = useDirectCallStore((state) => state.reset);

  const voiceStatus = useVoiceStore((state) => state.status);
  const connectedChannelId = useVoiceStore((state) => state.connectedChannelId);
  const voiceStartedAt = useVoiceStore((state) => state.startedAt);
  const occupantsByChannel = useVoiceStore((state) => state.occupantsByChannel);
  const isMuted = useVoiceStore((state) => state.isMuted);
  const isDeafened = useVoiceStore((state) => state.isDeafened);
  const joinVoiceChannel = useVoiceStore((state) => state.joinChannel);
  const leaveVoiceChannel = useVoiceStore((state) => state.leaveChannel);
  const setVoiceOccupants = useVoiceStore((state) => state.setOccupants);
  const updateVoiceOccupant = useVoiceStore((state) => state.updateOccupant);
  const updateVoiceUserReferences = useVoiceStore((state) => state.updateUserReferences);
  const toggleMute = useVoiceStore((state) => state.toggleMute);
  const toggleDeafen = useVoiceStore((state) => state.toggleDeafen);
  const updateUserReferences = useChatStore((state) => state.updateUserReferences);

  useEffect(() => {
    if (user && bootstrap) {
      loadInitialData();
    }
  }, [bootstrap, loadInitialData, user]);

  useEffect(() => {
    const activeSocketChannel = channels.find((channel) => channel.id === activeChannelId);
    if (socket && activeMode === "channel" && activeChannelId && activeSocketChannel?.type === "text") {
      socket.emit("join_channel", activeChannelId);
    }
  }, [activeChannelId, activeMode, channels, socket]);

  const socketEvents = useMemo(() => ({
    socket,
    activeChannelId,
    connectedChannelId,
    userId: user?.id,
    channelMessagePopups,
    directMessagePopups,
    addIncomingMessage,
    updateReaction,
    addCallLog,
    upsertConversation,
    receiveIncomingCall,
    setOutgoingCallId,
    handleCallAccepted,
    resetDirectCall,
    setVoiceOccupants,
    updateVoiceOccupant,
    updateUserReferences,
    updateVoiceUserReferences,
    setTyping
  }), [
    socket,
    activeChannelId,
    connectedChannelId,
    user?.id,
    channelMessagePopups,
    directMessagePopups,
    addIncomingMessage,
    updateReaction,
    addCallLog,
    upsertConversation,
    receiveIncomingCall,
    setOutgoingCallId,
    handleCallAccepted,
    resetDirectCall,
    setVoiceOccupants,
    updateVoiceOccupant,
    updateUserReferences,
    updateVoiceUserReferences,
    setTyping
  ]);

  useMainSocketEvents(socketEvents);

  useEffect(() => {
    if (!socket || !connectedChannelId || !user?.id) {
      return;
    }

    const syncVoicePresence = () => {
      if (!socket.connected) return;
      socket.emit("join_voice_channel", connectedChannelId);
      socket.emit("voice_heartbeat", { channelId: connectedChannelId });
      socket.emit("user_audio_status_update", {
        channelId: connectedChannelId,
        isMuted,
        isDeafened
      });
      updateVoiceOccupant(connectedChannelId, user.id, { isMuted, isDeafened });
    };

    syncVoicePresence();
    socket.on("connect", syncVoicePresence);
    const intervalId = window.setInterval(() => {
      if (socket.connected) {
        socket.emit("voice_heartbeat", { channelId: connectedChannelId });
      }
    }, 10000);

    return () => {
      socket.off("connect", syncVoicePresence);
      window.clearInterval(intervalId);
    };
  }, [connectedChannelId, isDeafened, isMuted, socket, updateVoiceOccupant, user?.id]);

  useEffect(() => {
    const close = () => {
      setMemberMenu(null);
      setMessageActionMenu(null);
      setVoiceVolumeMenu(null);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    if (directCallStatus !== "connected") {
      setIsDirectCallExpanded(false);
    }
  }, [directCallId, directCallStatus]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) || null;
  const activeChannel = channels.find((channel) => channel.id === activeChannelId) || null;
  const connectedChannel = channels.find((channel) => channel.id === connectedChannelId) || null;
  const activePeer = getConversationPeer(activeConversation, user);
  const activeTitle = activeMode === "dm"
    ? activePeer?.username || t.directMessages
    : activeChannel?.name || t.channels;
  const activeMessages = useMemo(() => {
    if (activeMode === "dm" && activeConversationId) {
      return messagesByContext[chatContext.conversation(activeConversationId)] || [];
    }
    if (activeMode === "channel" && activeChannelId) {
      return messagesByContext[chatContext.channel(activeChannelId)] || [];
    }
    return [];
  }, [activeChannelId, activeConversationId, activeMode, messagesByContext]);
  const totalUnreadDMs = conversations.reduce((acc, conversation) => acc + Number(conversation.unreadCount || 0), 0);
  const showCommunity = activeMode !== "dm";
  const canSendMessage = activeMode === "dm" ? Boolean(activeConversationId) : Boolean(activeChannelId && activeChannel?.type === "text");
  const isVoiceChannelView = activeMode === "channel" && activeChannel?.type === "voice";
  const typingUser = activeMode === "channel" && activeChannelId ? typingUsers[activeChannelId] : null;
  const filteredMessages = useMemo(() => {
    const query = messageSearchQuery.trim().toLowerCase();
    if (!query) return activeMessages;
    return activeMessages.filter((item) => (
      item.type !== "system_call" && "content" in item && item.content?.toLowerCase().includes(query)
    ));
  }, [activeMessages, messageSearchQuery]);
  const isExpandedDirectCall = directCallStatus === "connected" && isDirectCallExpanded && directCallPartner;

  const goCommunity = () => {
    const channelId = activeChannel?.id || channels.find((channel) => channel.type === "text")?.id;
    if (channelId) void selectChannel(channelId);
  };

  const goDM = () => {
    if (activeConversationId) return;
    const firstConversation = conversations[0]?.id;
    if (firstConversation) void selectConversation(firstConversation);
  };

  const handleMemberAction = async (member: Member, action: "chat" | "call") => {
    setMemberMenu(null);
    if (!user || member.id === user.id) return;
    if (action === "chat") {
      const conversation = await startConversation(member.id);
      if (conversation) await selectConversation(conversation.id);
      return;
    }
    if (directCallStatus === "idle") {
      initiateCall(userToCallPeer(member));
    }
  };

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      saveCollapsedCategories(next);
      return next;
    });
  };

  const handleSelectChannel = async (channel: Channel) => {
    await selectChannel(channel.id);
    if (channel.type === "voice" && connectedChannelId !== channel.id) {
      await joinVoiceChannel(channel.id);
    }
  };

  const openVoiceVolumeMenu = (occupant: VoiceOccupant, channelId: string, event: MouseEvent) => {
    if (connectedChannelId !== channelId || occupant.userId === user?.id) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setMemberMenu(null);
    setVoiceVolumeMenu({ occupant, x: event.clientX, y: event.clientY });
  };

  const openMessageActionMenu = (message: Message, event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setMemberMenu(null);
    setVoiceVolumeMenu(null);
    setMessageActionMenu({ message, x: event.clientX, y: event.clientY });
  };

  const toggleMessageReaction = (message: Message, emoji: string) => {
    if (!socket || !user || !message.channelId) {
      return;
    }

    const hasReaction = (message.reactions || []).some((reaction) => reaction.emoji === emoji && reaction.userId === user.id);
    socket.emit(hasReaction ? "remove_reaction" : "add_reaction", { messageId: message.id, emoji });
    updateReaction(message.id, emoji, user.id, hasReaction ? "remove" : "add");
  };

  const emitTyping = (isTyping: boolean) => {
    if (activeMode === "channel" && activeChannel?.type === "text" && activeChannelId) {
      socket?.emit("typing", { channelId: activeChannelId, isTyping });
    }
  };

  return {
    t,
    settingsOpen,
    setSettingsOpen,
    memberMenu,
    setMemberMenu,
    messageActionMenu,
    setMessageActionMenu,
    replyTo,
    setReplyTo,
    voiceVolumeMenu,
    setVoiceVolumeMenu,
    collapsedCategories,
    messageSearchQuery,
    setMessageSearchQuery,
    isDirectCallExpanded,
    setIsDirectCallExpanded,
    user,
    logout,
    bootstrap,
    socket,
    onlineUsers,
    participantVolumes,
    setParticipantVolume,
    channels,
    conversations,
    members,
    activeMode,
    activeChannelId,
    activeConversationId,
    loading,
    sending,
    selectConversation,
    sendActiveMessage,
    activeConversation,
    activeChannel,
    connectedChannel,
    activePeer,
    activeTitle,
    filteredMessages,
    totalUnreadDMs,
    showCommunity,
    canSendMessage,
    isVoiceChannelView,
    typingUser,
    directCallStatus,
    directCallPartner,
    directCallStartedAt,
    endDirectCall,
    isExpandedDirectCall,
    initiateCall,
    voiceStatus,
    connectedChannelId,
    voiceStartedAt,
    occupantsByChannel,
    isMuted,
    isDeafened,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen,
    goCommunity,
    goDM,
    handleMemberAction,
    toggleCategory,
    handleSelectChannel,
    openVoiceVolumeMenu,
    openMessageActionMenu,
    toggleMessageReaction,
    emitTyping
  };
}

function getConversationPeer(conversation: DMConversation | null, user: SoriUser | null) {
  if (!conversation || !user) return null;
  return (conversation.user1Id === user.id ? conversation.user2 : conversation.user1) || null;
}
