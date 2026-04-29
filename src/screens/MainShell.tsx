import { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Hash, Headphones, Loader2, LogOut, Mic2, Paperclip, Phone, Send, Settings, X, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { DirectCallOverlay } from "../components/DirectCallOverlay";
import { SettingsPanel } from "../components/SettingsPanel";
import { useAuthStore } from "../stores/authStore";
import { useChatStore, chatContext } from "../stores/chatStore";
import { useDirectCallStore, userToCallPeer } from "../stores/directCallStore";
import { useServerStore } from "../stores/serverStore";
import { useSocketStore } from "../stores/socketStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useVoiceStore } from "../stores/voiceStore";
import { useT } from "../lib/i18n";
import { cn } from "../lib/cn";
import { playNotificationSound } from "../lib/notificationSounds";
import { uploadAttachment } from "../lib/upload";
import type { Attachment, ChatItem, DMConversation, Message, SoriUser } from "../types/sori";

const VoiceSession = lazy(() =>
  import("../components/VoiceSession").then((module) => ({ default: module.VoiceSession }))
);

export function MainShell() {
  const t = useT();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const soundedMessageIds = useRef(new Set<string>());
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const bootstrap = useServerStore((state) => state.bootstrap);
  const domain = useServerStore((state) => state.domain);
  const socket = useSocketStore((state) => state.socket);
  const socketStatus = useSocketStore((state) => state.status);
  const channelMessagePopups = useSettingsStore((state) => state.channelMessagePopups);
  const directMessagePopups = useSettingsStore((state) => state.directMessagePopups);
  const isConnected = socketStatus === "connected";

  const channels = useChatStore((state) => state.channels);
  const conversations = useChatStore((state) => state.conversations);
  const members = useChatStore((state) => state.members);
  const messagesByContext = useChatStore((state) => state.messagesByContext);
  const activeMode = useChatStore((state) => state.activeMode);
  const activeChannelId = useChatStore((state) => state.activeChannelId);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const loading = useChatStore((state) => state.loading);
  const sending = useChatStore((state) => state.sending);
  const loadInitialData = useChatStore((state) => state.loadInitialData);
  const selectChannel = useChatStore((state) => state.selectChannel);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const sendActiveMessage = useChatStore((state) => state.sendActiveMessage);
  const addIncomingMessage = useChatStore((state) => state.addIncomingMessage);
  const addCallLog = useChatStore((state) => state.addCallLog);
  const upsertConversation = useChatStore((state) => state.upsertConversation);
  const directCallStatus = useDirectCallStore((state) => state.status);
  const initiateCall = useDirectCallStore((state) => state.initiateCall);
  const receiveIncomingCall = useDirectCallStore((state) => state.receiveIncomingCall);
  const setOutgoingCallId = useDirectCallStore((state) => state.setOutgoingCallId);
  const handleCallAccepted = useDirectCallStore((state) => state.handleAccepted);
  const resetDirectCall = useDirectCallStore((state) => state.reset);
  const voiceStatus = useVoiceStore((state) => state.status);
  const connectedChannelId = useVoiceStore((state) => state.connectedChannelId);
  const occupantsByChannel = useVoiceStore((state) => state.occupantsByChannel);
  const isMuted = useVoiceStore((state) => state.isMuted);
  const isDeafened = useVoiceStore((state) => state.isDeafened);
  const joinVoiceChannel = useVoiceStore((state) => state.joinChannel);
  const leaveVoiceChannel = useVoiceStore((state) => state.leaveChannel);
  const setVoiceOccupants = useVoiceStore((state) => state.setOccupants);
  const updateVoiceOccupant = useVoiceStore((state) => state.updateOccupant);
  const toggleMute = useVoiceStore((state) => state.toggleMute);
  const toggleDeafen = useVoiceStore((state) => state.toggleDeafen);

  useEffect(() => {
    if (user && bootstrap) {
      loadInitialData();
    }
  }, [bootstrap, loadInitialData, user]);

  useEffect(() => {
    if (socket && activeChannelId) {
      socket.emit("join_channel", activeChannelId);
    }
  }, [activeChannelId, socket]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleMessage = (message: Message) => {
      addIncomingMessage(message);
      const isOwn = message.authorId === user?.id;
      const isDm = Boolean(message.conversationId);
      const shouldToast = !isOwn && (isDm ? directMessagePopups : channelMessagePopups);
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
    const handleConversation = (conversation: DMConversation) => upsertConversation(conversation);
    const handleIncomingCall = (data: { callId: string; caller: any }) => receiveIncomingCall(data.callId, data.caller);
    const handleOutgoingStarted = (data: { callId: string }) => setOutgoingCallId(data.callId);
    const handleAccepted = (data: { callId: string }) => {
      handleCallAccepted(data.callId);
    };
    const handleReset = () => resetDirectCall();

    socket.on("new_message", handleMessage);
    socket.on("new_direct_message", handleMessage);
    socket.on("new_call_log", addCallLog);
    socket.on("dm_conversation_updated", handleConversation);
    socket.on("incoming_call", handleIncomingCall);
    socket.on("outgoing_call_started", handleOutgoingStarted);
    socket.on("call_accepted", handleAccepted);
    socket.on("call_rejected", handleReset);
    socket.on("call_ended", handleReset);
    socket.on("call_missed", handleReset);
    socket.on("call_timed_out", handleReset);
    socket.on("voice_occupants_update", ({ channelId, occupants }: { channelId: string; occupants: any[] }) => {
      setVoiceOccupants(channelId, occupants);
    });
    socket.on("voice_occupants_state", (state: Record<string, any[]>) => {
      Object.entries(state).forEach(([channelId, occupants]) => setVoiceOccupants(channelId, occupants));
    });
    socket.on("user_speaking_status", (data: { channelId: string; userId: string; isSpeaking: boolean }) => {
      updateVoiceOccupant(data.channelId, data.userId, { isSpeaking: data.isSpeaking });
    });
    socket.on("user_audio_status", (data: { channelId: string; userId: string; isMuted: boolean; isDeafened: boolean }) => {
      updateVoiceOccupant(data.channelId, data.userId, { isMuted: data.isMuted, isDeafened: data.isDeafened });
    });

    return () => {
      socket.off("new_message", handleMessage);
      socket.off("new_direct_message", handleMessage);
      socket.off("new_call_log", addCallLog);
      socket.off("dm_conversation_updated", handleConversation);
      socket.off("incoming_call", handleIncomingCall);
      socket.off("outgoing_call_started", handleOutgoingStarted);
      socket.off("call_accepted", handleAccepted);
      socket.off("call_rejected", handleReset);
      socket.off("call_ended", handleReset);
      socket.off("call_missed", handleReset);
      socket.off("call_timed_out", handleReset);
      socket.off("voice_occupants_update");
      socket.off("voice_occupants_state");
      socket.off("user_speaking_status");
      socket.off("user_audio_status");
    };
  }, [
    addCallLog,
    addIncomingMessage,
    channelMessagePopups,
    directMessagePopups,
    handleCallAccepted,
    receiveIncomingCall,
    resetDirectCall,
    setOutgoingCallId,
    setVoiceOccupants,
    socket,
    updateVoiceOccupant,
    upsertConversation,
    user?.id
  ]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) || null;
  const activeChannel = channels.find((channel) => channel.id === activeChannelId) || null;
  const activeTitle = activeMode === "dm"
    ? getConversationPeer(activeConversation, user)?.username || "Direct message"
    : activeChannel?.name || "Channel";
  const activeMessages = useMemo(() => {
    if (activeMode === "dm" && activeConversationId) {
      return messagesByContext[chatContext.conversation(activeConversationId)] || [];
    }

    if (activeChannelId) {
      return messagesByContext[chatContext.channel(activeChannelId)] || [];
    }

    return [];
  }, [activeChannelId, activeConversationId, activeMode, messagesByContext]);

  return (
    <main className="flex h-full bg-sori-bg">
      <aside className="flex w-20 flex-col items-center border-r border-sori-border bg-sori-bg py-4">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-sori-primary text-sm font-black text-white shadow-glow">
          S
        </div>
        <div className="mt-auto space-y-3">
          <IconButton label={t.settings} onClick={() => setSettingsOpen(true)}>
            <Settings className="h-5 w-5" />
          </IconButton>
          <IconButton label={t.logout} onClick={logout}>
            <LogOut className="h-5 w-5" />
          </IconButton>
        </div>
      </aside>

      <aside className="flex w-80 flex-col border-r border-sori-border bg-sori-panel">
        <div className="border-b border-sori-border p-5">
          <div className="text-lg font-black tracking-tight">{bootstrap?.server.name || "SORI"}</div>
          <div className="mt-1 truncate text-xs text-sori-muted">{domain}</div>
          <div className={cn(
            "mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-wider",
            isConnected
              ? "border-sori-secondary/40 bg-sori-secondary/10 text-sori-secondary"
              : "border-sori-warning/40 bg-sori-warning/10 text-sori-warning"
          )}>
            {isConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {isConnected ? t.connectedStatus : t.disconnectedStatus}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <SectionTitle>{t.channels}</SectionTitle>
          <div className="mb-6 space-y-1">
            {channels.map((channel) => {
              const occupants = occupantsByChannel[channel.id] || [];
              const isConnectedVoice = connectedChannelId === channel.id;
              return (
              <button
                key={channel.id}
                type="button"
                className={cn(
                  "flex w-full flex-col rounded-xl px-3 py-2.5 text-left text-sm font-bold transition",
                  (activeMode === "channel" && activeChannelId === channel.id) || isConnectedVoice
                    ? "bg-sori-primary text-white"
                    : "text-sori-muted hover:bg-sori-hover hover:text-sori-text"
                )}
                onClick={() => channel.type === "text" ? selectChannel(channel.id) : (isConnectedVoice ? leaveVoiceChannel() : joinVoiceChannel(channel.id))}
              >
                <span className="flex w-full items-center gap-3">
                  {channel.type === "text" ? <Hash className="h-4 w-4" /> : <Mic2 className="h-4 w-4" />}
                  <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                  <span className="text-[9px] uppercase opacity-70">
                    {channel.type === "text" ? t.textChannel : (isConnectedVoice ? t.voiceConnected : t.voiceChannel)}
                  </span>
                </span>
                {channel.type === "voice" && occupants.length > 0 && (
                  <span className="mt-2 flex w-full flex-col gap-1 pl-7">
                    {occupants.map((occupant) => (
                      <span key={occupant.userId} className="flex items-center gap-2 text-xs opacity-85">
                        <span className={cn("h-2 w-2 rounded-full", occupant.isSpeaking ? "bg-sori-secondary" : "bg-sori-muted")} />
                        <span className="min-w-0 flex-1 truncate">{occupant.username}</span>
                      </span>
                    ))}
                  </span>
                )}
              </button>
              );
            })}
          </div>

          <SectionTitle>{t.directMessages}</SectionTitle>
          <div className="space-y-1">
            {conversations.map((conversation) => {
              const peer = getConversationPeer(conversation, user);
              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition",
                    activeMode === "dm" && activeConversationId === conversation.id
                      ? "bg-sori-primary text-white"
                      : "text-sori-muted hover:bg-sori-hover hover:text-sori-text"
                  )}
                  onClick={() => selectConversation(conversation.id)}
                >
                  <Avatar name={peer?.username || "?"} src={peer?.avatarUrl} />
                  <span className="min-w-0 flex-1 truncate">{peer?.username || "User"}</span>
                  {peer && (
                    <span
                      className="grid h-7 w-7 place-items-center rounded-lg bg-sori-elevated text-sori-secondary"
                      title={t.call}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (directCallStatus === "idle") {
                          initiateCall(userToCallPeer(peer));
                        }
                      }}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </span>
                  )}
                  {Number(conversation.unreadCount || 0) > 0 && (
                    <span className="rounded-full bg-sori-warning px-2 py-0.5 text-[10px] font-black text-black">
                      {conversation.unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-20 items-center justify-between border-b border-sori-border px-8">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black">{activeTitle}</h1>
            <p className="truncate text-sm text-sori-muted">{t.desktopReady}</p>
          </div>
          {activeMode === "dm" && activeConversation && getConversationPeer(activeConversation, user) && (
            <button
              type="button"
              disabled={directCallStatus !== "idle"}
              className="inline-flex items-center gap-2 rounded-xl bg-sori-primary px-4 py-3 text-xs font-black text-white shadow-glow transition disabled:opacity-50"
              onClick={() => {
                const peer = getConversationPeer(activeConversation, user);
                if (peer) {
                  initiateCall(userToCallPeer(peer));
                }
              }}
            >
              <Phone className="h-4 w-4" />
              {t.call}
            </button>
          )}
        </header>

        {loading ? (
          <div className="grid flex-1 place-items-center">
            <div className="flex items-center gap-3 text-sm font-bold text-sori-muted">
              <Loader2 className="h-5 w-5 animate-spin text-sori-primary" />
              {t.loadingChat}
            </div>
          </div>
        ) : (
          <>
            <MessageList items={activeMessages} currentUserId={user?.id} emptyText={t.noMessages} />
            <MessageComposer
              disabled={sending || (!activeChannelId && !activeConversationId)}
              placeholder={`${t.messagePlaceholder} ${activeTitle}`}
              sendLabel={t.send}
              attachLabel={t.attach}
              uploadingLabel={t.uploading}
              onSend={sendActiveMessage}
            />
          </>
        )}
      </section>

      <aside className="hidden w-72 flex-col border-l border-sori-border bg-sori-panel xl:flex">
        <div className="border-b border-sori-border p-5 text-[10px] font-black uppercase tracking-[0.2em] text-sori-muted">
          {t.members}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
              <Avatar name={member.username} src={member.avatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{member.username}</div>
                <div className="text-xs text-sori-muted">{member.role || "member"}</div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {connectedChannelId && (
        <div className="fixed bottom-5 left-24 z-40 flex items-center gap-2 rounded-2xl border border-sori-border bg-sori-panel p-3 shadow-2xl">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sori-primary/20 text-sori-secondary">
            <Headphones className="h-5 w-5" />
          </div>
          <div className="min-w-0 pr-2">
            <div className="truncate text-sm font-black">
              {channels.find((channel) => channel.id === connectedChannelId)?.name || t.voiceConnected}
            </div>
            <div className="text-xs text-sori-muted">{voiceStatus}</div>
          </div>
          <button
            type="button"
            className={cn("rounded-xl px-3 py-2 text-xs font-black transition", isMuted ? "bg-sori-warning text-black" : "bg-sori-elevated text-sori-muted hover:text-sori-text")}
            onClick={toggleMute}
          >
            {t.mute}
          </button>
          <button
            type="button"
            className={cn("rounded-xl px-3 py-2 text-xs font-black transition", isDeafened ? "bg-sori-warning text-black" : "bg-sori-elevated text-sori-muted hover:text-sori-text")}
            onClick={toggleDeafen}
          >
            {t.deafen}
          </button>
          <button
            type="button"
            className="rounded-xl bg-sori-danger px-3 py-2 text-xs font-black text-white transition hover:brightness-110"
            onClick={() => leaveVoiceChannel()}
          >
            {t.leaveVoice}
          </button>
        </div>
      )}
      {(connectedChannelId || directCallStatus === "connected") && (
        <Suspense fallback={null}>
          <VoiceSession />
        </Suspense>
      )}
      <DirectCallOverlay />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}

function MessageList(props: { items: ChatItem[]; currentUserId?: string; emptyText: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
      {props.items.length === 0 ? (
        <div className="grid h-full place-items-center text-sm font-bold text-sori-dim">{props.emptyText}</div>
      ) : (
        <div className="space-y-4">
          {props.items.map((item) => {
            if (item.type === "system_call") {
              return <SystemCallRow key={item.id} item={item} />;
            }

            const message = item as Message;
            const isOwn = message.authorId === props.currentUserId;
            const authorName = message.author?.username || message.username || (isOwn ? "You" : "User");
            return (
              <div key={message.id} className={cn("flex gap-3", isOwn && "justify-end")}>
                {!isOwn && <Avatar name={authorName} src={message.author?.avatarUrl} />}
                <div className={cn(
                  "max-w-[68%] rounded-2xl border px-4 py-3",
                  isOwn
                    ? "border-sori-primary/40 bg-sori-primary/20"
                    : "border-sori-border bg-sori-panel"
                )}>
                  <div className="mb-1 flex items-center gap-2 text-xs">
                    <span className="font-black">{authorName}</span>
                    <span className="text-sori-dim">{formatTime(message.createdAt)}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-sm leading-6 text-sori-text">
                    {message.isDeleted ? "This message was deleted." : message.content}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MessageComposer(props: {
  disabled: boolean;
  placeholder: string;
  sendLabel: string;
  attachLabel: string;
  uploadingLabel: string;
  onSend: (content: string, attachments?: Attachment[]) => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = content.trim();
    if (!value && attachments.length === 0) {
      return;
    }

    setContent("");
    setAttachments([]);
    await props.onSend(value, attachments);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    setUploading(true);
    try {
      const uploaded = await Promise.all(Array.from(files).slice(0, 10).map(uploadAttachment));
      setAttachments((current) => [...current, ...uploaded].slice(0, 10));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-t border-sori-border bg-sori-panel px-6 py-4">
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <span key={attachment.fileUrl} className="inline-flex items-center gap-2 rounded-lg bg-sori-elevated px-3 py-1.5 text-xs font-bold text-sori-muted">
              {attachment.fileName}
              <button
                type="button"
                className="text-sori-dim hover:text-sori-text"
                onClick={() => setAttachments((current) => current.filter((item) => item.fileUrl !== attachment.fileUrl))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-sori-elevated px-4 text-xs font-black text-sori-muted transition hover:text-sori-text">
          <Paperclip className="h-4 w-4" />
          {uploading ? props.uploadingLabel : props.attachLabel}
          <input
            type="file"
            multiple
            className="hidden"
            disabled={props.disabled || uploading}
            onChange={(event) => {
              handleFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <input
          className="min-w-0 flex-1 rounded-2xl border border-sori-border bg-sori-elevated px-5 py-3 text-sm font-medium outline-none transition focus:border-sori-primary"
          disabled={props.disabled}
          placeholder={props.placeholder}
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <button
          type="submit"
          disabled={props.disabled || uploading || (!content.trim() && attachments.length === 0)}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-sori-primary px-5 text-sm font-black text-white shadow-glow transition active:scale-95 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {props.sendLabel}
        </button>
      </div>
    </form>
  );
}

function SectionTitle(props: { children: string }) {
  return (
    <div className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.2em] text-sori-muted">
      {props.children}
    </div>
  );
}

function IconButton(props: { label: string; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      className="grid h-11 w-11 place-items-center rounded-2xl text-sori-muted transition hover:bg-sori-hover hover:text-sori-text"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function Avatar(props: { name: string; src?: string | null }) {
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-sori-elevated text-xs font-black text-sori-secondary">
      {props.src ? <img src={props.src} alt="" className="h-full w-full object-cover" /> : props.name[0]?.toUpperCase()}
    </div>
  );
}

function SystemCallRow(props: { item: ChatItem }) {
  return (
    <div className="flex justify-center">
      <div className="rounded-full border border-sori-border bg-sori-panel px-4 py-2 text-xs font-bold text-sori-muted">
        Call {String((props.item as { status?: string }).status || "event")}
      </div>
    </div>
  );
}

function getConversationPeer(conversation: DMConversation | null, user: SoriUser | null) {
  if (!conversation || !user) {
    return null;
  }

  return conversation.user1Id === user.id ? conversation.user2 : conversation.user1;
}

function formatTime(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
