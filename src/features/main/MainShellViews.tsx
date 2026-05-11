import { FormEvent, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Film,
  Globe,
  Hash,
  Headphones,
  Home,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Maximize2,
  MessageCircle,
  MessageSquare,
  Mic,
  MicOff,
  Music,
  Paperclip,
  Phone,
  PhoneMissed,
  PhoneOff,
  Reply,
  Search,
  Send,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Smile,
  Save,
  UploadCloud,
  UserRound,
  Volume2,
  Waves,
  X
} from "lucide-react";
import { toast } from "sonner";
import { useT } from "../../lib/i18n";
import { cn } from "../../lib/cn";
import { apiRequest } from "../../lib/api";
import { openExternalUrl } from "../../lib/desktopHttp";
import { uploadAttachment } from "../../lib/upload";
import { useSettingsStore } from "../../stores/settingsStore";
import { useServerStore } from "../../stores/serverStore";
import type { Attachment, Channel, ChatItem, DMConversation, LinkMetadata, Member, Message, SoriUser, VoiceOccupant } from "../../types/sori";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

export type MemberMenuState = { member: Member; x: number; y: number } | null;
export type MessageActionMenuState = { message: Message; x: number; y: number } | null;
export type VoiceVolumeMenuState = { occupant: VoiceOccupant; x: number; y: number } | null;
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const linkPreviewCache = new Map<string, LinkMetadata | null>();
const hasFileTransfer = (event: DragEvent | React.DragEvent) => Array.from(event.dataTransfer?.types || []).includes("Files");

type MediaMenuState = {
  type: "mic" | "output";
  left: number;
  right: number;
  top: number;
  bottom: number;
} | null;

export function ServerRail(props: {
  activeModule: "community" | "dm";
  totalUnreadDMs: number;
  onCommunity: () => void;
  onDM: () => void;
  onSettings: () => void;
  onLogout: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <aside className="flex h-full w-20 shrink-0 flex-col items-center gap-4 overflow-hidden border-r border-sori-border-subtle bg-sori-surface-base py-4">
      <RailButton label={props.t.community} active={props.activeModule === "community"} onClick={props.onCommunity}>
        <Home className="h-6 w-6" />
      </RailButton>
      <div className="h-px w-8 bg-sori-border-subtle" />
      <RailButton label={props.t.directMessages} active={props.activeModule === "dm"} onClick={props.onDM} badge={props.totalUnreadDMs}>
        <MessageCircle className="h-6 w-6" />
      </RailButton>
      <div className="mt-auto flex flex-col items-center gap-3">
        <RailUtilityButton label={props.t.settings} onClick={props.onSettings}>
          <Settings className="h-6 w-6" />
        </RailUtilityButton>
        <RailUtilityButton label={props.t.logout} danger onClick={props.onLogout}>
          <LogOut className="h-6 w-6" />
        </RailUtilityButton>
      </div>
    </aside>
  );
}

export function RailButton(props: { label: string; active?: boolean; danger?: boolean; badge?: number; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      className={cn(
        "relative grid h-12 w-12 place-items-center rounded-xl transition-all active:scale-95",
        props.active
          ? "bg-sori-accent-primary text-black shadow-lg"
          : props.danger
            ? "text-sori-accent-danger hover:bg-sori-surface-danger-subtle"
            : "bg-sori-surface-panel text-sori-text-muted hover:bg-sori-surface-hover hover:text-sori-accent-primary"
      )}
      onClick={props.onClick}
    >
      {props.children}
      {props.badge ? (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-sori-surface-panel bg-sori-accent-secondary px-1 text-[10px] font-black text-black">
          {props.badge > 99 ? "99+" : props.badge}
        </span>
      ) : null}
    </button>
  );
}

export function RailUtilityButton(props: { label: string; danger?: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      className={cn(
        "grid h-12 w-12 place-items-center rounded-xl transition-all active:scale-95",
        props.danger
          ? "text-sori-accent-danger hover:bg-sori-surface-danger-subtle"
          : "text-sori-text-muted hover:bg-sori-surface-hover hover:text-sori-accent-primary"
      )}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function ChannelSidebar(props: {
  serverName: string;
  channels: Channel[];
  activeChannelId: string | null;
  connectedChannelId: string | null;
  collapsedCategories: Set<string>;
  occupantsByChannel: Record<string, VoiceOccupant[]>;
  currentUserId?: string;
  onSelectChannel: (channel: Channel) => void;
  onToggleCategory: (categoryId: string) => void;
  onVoiceOccupantContextMenu: (occupant: VoiceOccupant, channelId: string, event: MouseEvent) => void;
  footer: ReactNode;
  t: ReturnType<typeof useT>;
}) {
  const categories = useMemo(() => buildChannelCategories(props.channels, props.t), [props.channels, props.t]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sori-border-subtle bg-sori-surface-panel">
      <header className="flex h-14 shrink-0 items-center border-b border-sori-border-subtle px-4">
        <div className="truncate text-sm font-black text-sori-text-strong">{props.serverName}</div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 no-scrollbar">
        {categories.map((category) => {
          const collapsed = props.collapsedCategories.has(category.id);
          return (
            <ChannelSection
              key={category.id}
              title={category.name}
              collapsed={collapsed}
              onToggle={() => props.onToggleCategory(category.id)}
            >
              {category.channels.map((channel) => {
                const occupants = [...(props.occupantsByChannel[channel.id] || [])].sort((a, b) => Number(a.joinedAt || 0) - Number(b.joinedAt || 0));
                const isActive = props.activeChannelId === channel.id;
                const isConnected = props.connectedChannelId === channel.id;
                const canShowVoiceActivity = channel.type === "voice" && isConnected;
                const canOpenOccupantMenu = channel.type === "voice" && isConnected;
                return (
                  <div key={channel.id} className="mb-1">
                    <ChannelButton
                      channel={channel}
                      active={isActive}
                      connected={isConnected}
                      onClick={() => props.onSelectChannel(channel)}
                    />
                    {channel.type === "voice" && occupants.length > 0 && (
                      <div className="ml-6 mt-1 space-y-0.5">
                        {occupants.map((occupant) => (
                          <VoiceOccupantRow
                            key={occupant.userId}
                            occupant={occupant}
                            showActivity={canShowVoiceActivity}
                            onContextMenu={canOpenOccupantMenu ? (event) => props.onVoiceOccupantContextMenu(occupant, channel.id, event) : undefined}
                            t={props.t}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </ChannelSection>
          );
        })}
      </div>
      {props.footer}
    </aside>
  );
}

export function ChannelSection(props: { title: string; collapsed: boolean; children: ReactNode; onToggle: () => void }) {
  return (
    <section className="mb-5">
      <button
        type="button"
        className="group mb-2 flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-[11px] font-extrabold uppercase tracking-wider text-sori-text-muted transition hover:text-sori-text-strong"
        onClick={props.onToggle}
      >
        {props.collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <span className="min-w-0 truncate">{props.title}</span>
      </button>
      {!props.collapsed && <div className="space-y-0.5">{props.children}</div>}
    </section>
  );
}

export function ChannelButton(props: { channel: Channel; active: boolean; connected: boolean; onClick: () => void }) {
  const Icon = props.channel.type === "voice" ? Volume2 : Hash;
  return (
    <button
      type="button"
      className={cn(
        "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-all",
        props.active
          ? "bg-sori-surface-selected text-sori-accent-primary"
          : props.connected
            ? "text-sori-accent-secondary hover:bg-sori-surface-hover"
            : "text-sori-text-muted hover:bg-sori-surface-hover hover:text-sori-text-strong"
      )}
      onClick={props.onClick}
    >
      <Icon className={cn("h-4 w-4 shrink-0", props.active ? "text-sori-accent-primary" : "text-sori-text-dim group-hover:text-sori-text-muted")} />
      <span className="min-w-0 flex-1 truncate text-sm font-bold">{props.channel.name}</span>
    </button>
  );
}

export function VoiceOccupantRow(props: { occupant: VoiceOccupant; showActivity: boolean; t: ReturnType<typeof useT>; onContextMenu?: (event: MouseEvent) => void }) {
  const speaking = props.showActivity && Boolean(props.occupant.isSpeaking);
  const streaming = props.showActivity && Boolean(props.occupant.isStreaming);
  const muted = Boolean(props.occupant.isMuted);
  const deafened = Boolean(props.occupant.isDeafened);
  const username = props.occupant.username || "SORI";
  return (
    <button
      type="button"
      className={cn(
        "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition",
        "text-sori-text-muted hover:bg-sori-surface-hover hover:text-sori-text-strong"
      )}
      onContextMenu={props.onContextMenu}
      onClick={(event) => {
        if (!props.onContextMenu) return;
        props.onContextMenu(event);
      }}
    >
      <span className="relative shrink-0">
        <span className={cn(
          "grid h-6 w-6 place-items-center overflow-hidden rounded-full border text-[9px] font-black transition-all group-hover:scale-105",
          speaking
            ? "speaking-pulse bg-sori-surface-base text-sori-text-strong"
            : "border-sori-border-subtle bg-sori-surface-elevated text-sori-text-muted"
        )}>
          {props.occupant.avatarUrl ? (
            <img src={props.occupant.avatarUrl} alt={username} className="h-full w-full object-cover" />
          ) : (
            username[0]?.toUpperCase()
          )}
        </span>
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-[12px] font-bold transition-colors", speaking ? "text-white" : undefined)}>{username}</span>
      {streaming && (
        <span className="flex shrink-0 items-center gap-1 rounded-md bg-sori-accent-danger px-1.5 py-0.5 text-[8px] font-black uppercase leading-none tracking-tight text-white shadow-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          LIVE
        </span>
      )}
      {deafened && <DeafenIcon active className="h-3.5 w-3.5 text-sori-accent-danger" />}
      {muted && <MicOff className="h-3.5 w-3.5 text-sori-accent-danger" />}
    </button>
  );
}

export function VoiceChannelView(props: {
  channel: Channel | null;
  connected: boolean;
  connecting: boolean;
  occupants: VoiceOccupant[];
  currentUserId?: string;
  startedAt: number | null;
  isMuted: boolean;
  isDeafened: boolean;
  onVoiceOccupantContextMenu: (occupant: VoiceOccupant, event: MouseEvent) => void;
  onJoin: () => void;
  onMute: () => void;
  onDeafen: () => void;
  onLeave: () => void;
  t: ReturnType<typeof useT>;
}) {
  const duration = useDurationLabel(props.connected ? props.startedAt : null);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8 text-center">
      <div className="w-full max-w-4xl rounded-[2rem] border border-sori-border-subtle bg-sori-surface-main p-6 shadow-2xl">
        <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[2rem] border border-sori-border-accent bg-sori-surface-accent-subtle text-sori-accent-primary shadow-glow">
          <Volume2 className="h-9 w-9" />
        </div>
        <h2 className="text-2xl font-black text-sori-text-strong">{props.t.voiceChannelTitle.replace("{name}", props.channel?.name || props.t.voiceChannel)}</h2>
        <p className="mt-2 text-sm font-medium text-sori-text-muted">
          {props.connected ? `${props.t.voiceConnected} · ${duration}` : props.t.voiceChannelDescription}
        </p>
        {props.connected && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button type="button" className={voiceRoomControlClass(props.isMuted)} onClick={props.onMute}>
              {props.isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              <span>{props.t.mute}</span>
            </button>
            <button type="button" className={voiceRoomControlClass(props.isDeafened)} onClick={props.onDeafen}>
              <Headphones className="h-5 w-5" />
              <span>{props.t.deafen}</span>
            </button>
            <button type="button" className="inline-flex h-[52px] items-center gap-2 rounded-2xl bg-sori-accent-danger px-5 text-xs font-black uppercase tracking-widest text-white transition hover:brightness-110" onClick={props.onLeave}>
              <PhoneOff className="h-5 w-5" />
              <span>{props.t.leaveVoice}</span>
            </button>
          </div>
        )}
      </div>
      {!props.connected && (
        <button
          type="button"
          disabled={props.connecting}
          className="inline-flex items-center gap-3 rounded-2xl bg-sori-accent-primary px-8 py-4 text-sm font-black text-black shadow-lg transition active:scale-95 disabled:bg-sori-surface-active disabled:text-sori-text-muted"
          onClick={props.onJoin}
        >
          {props.connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
          {props.t.joinVoiceChannel}
        </button>
      )}
      {props.occupants.length > 0 && (
        <div className="w-full max-w-4xl rounded-2xl border border-sori-border-subtle bg-sori-surface-panel p-4 text-left">
          <div className="mb-2 px-2 text-[10px] font-black uppercase tracking-widest text-sori-text-muted">
            {props.t.members} · {props.occupants.length}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {props.occupants.map((occupant) => (
              <VoiceOccupantRow
                key={occupant.userId}
                occupant={occupant}
                showActivity={props.connected}
                onContextMenu={(event) => props.onVoiceOccupantContextMenu(occupant, event)}
                t={props.t}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function voiceRoomControlClass(active: boolean) {
  return cn(
    "inline-flex h-[52px] items-center gap-2 rounded-2xl px-5 text-xs font-black uppercase tracking-widest transition",
    active
      ? "bg-sori-accent-danger-subtle text-sori-accent-danger"
      : "bg-sori-surface-elevated text-sori-text-muted hover:bg-sori-surface-hover hover:text-sori-text-strong"
  );
}

export function DirectCallRoom(props: {
  partner: { username: string; avatarUrl?: string | null };
  startedAt: number | null;
  onMinimize: () => void;
  onEnd: () => void;
  t: ReturnType<typeof useT>;
}) {
  const duration = useDurationLabel(props.startedAt);

  return (
    <div className="flex flex-1 items-center justify-center bg-sori-surface-main px-8 py-10">
      <div className="w-full max-w-4xl rounded-[2rem] border border-sori-border-accent bg-sori-surface-panel p-8 text-center shadow-2xl">
        <div className="mx-auto mb-6">
          <Avatar name={props.partner.username} src={props.partner.avatarUrl} size="lg" />
        </div>
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.3em] text-sori-accent-primary">
          {props.t.activeCall}
        </div>
        <h2 className="text-3xl font-black text-sori-text-strong">{props.partner.username}</h2>
        <div className="mt-3 font-mono text-sm font-black tabular-nums text-sori-text-muted">{duration}</div>
        <div className="mt-8 flex items-center justify-center gap-3">
          <button type="button" className="inline-flex h-[52px] items-center gap-2 rounded-2xl bg-sori-surface-elevated px-5 text-xs font-black uppercase tracking-widest text-sori-text-muted transition hover:bg-sori-surface-hover hover:text-sori-text-strong" onClick={props.onMinimize}>
            <Maximize2 className="h-5 w-5 rotate-180" />
            <span>{props.t.minimizeCall}</span>
          </button>
          <button type="button" className="inline-flex h-[52px] items-center gap-2 rounded-2xl bg-sori-accent-danger px-5 text-xs font-black uppercase tracking-widest text-white transition hover:brightness-110" onClick={props.onEnd}>
            <PhoneOff className="h-5 w-5" />
            <span>{props.t.endCall}</span>
          </button>
        </div>
        </div>
    </div>
  );
}

export function DMSidebar(props: {
  conversations: DMConversation[];
  user: SoriUser | null;
  activeConversationId: string | null;
  onlineUsers: Set<string>;
  onSelect: (conversationId: string) => void;
  onCall: (peer: SoriUser) => void;
  footer: ReactNode;
  t: ReturnType<typeof useT>;
}) {
  const [query, setQuery] = useState("");
  const filteredConversations = props.conversations.filter((conversation) => {
    const peer = getConversationPeer(conversation, props.user);
    if (!peer) return false;
    return peer.username.toLowerCase().includes(query.trim().toLowerCase());
  });

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sori-border-subtle bg-sori-surface-panel">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-sori-border-subtle px-4">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-sori-text-muted">{props.t.directMessages}</h2>
        <span className="rounded-full bg-sori-surface-elevated px-2 py-1 text-[9px] font-black text-sori-text-dim">
          {props.conversations.length}
        </span>
      </header>
      <div className="border-b border-sori-border-subtle p-3">
        <div className="flex items-center gap-2 rounded-xl border border-sori-border-subtle bg-sori-surface-base px-3 py-2 text-sori-text-muted focus-within:border-sori-border-accent">
          <Search className="h-4 w-4 shrink-0 text-sori-text-dim" />
          <input
            className="min-w-0 flex-1 bg-transparent text-xs font-bold text-sori-text-strong outline-none placeholder:text-sori-text-dim"
            value={query}
            placeholder={props.t.searchDirectMessages}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 no-scrollbar">
        {props.conversations.length === 0 ? (
          <DMEmptyState title={props.t.noDirectMessages} description={props.t.noDirectMessagesDescription} />
        ) : filteredConversations.length === 0 ? (
          <DMEmptyState title={props.t.noMatchingDirectMessages} description={props.t.noMatchingDirectMessagesDescription} />
        ) : filteredConversations.map((conversation) => {
          const peer = getConversationPeer(conversation, props.user);
          if (!peer) return null;
          const active = props.activeConversationId === conversation.id;
          const online = props.onlineUsers.has(peer.id);
          const preview = conversation.lastMessage || props.t.noMessages;
          return (
            <button
              key={conversation.id}
              type="button"
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all",
                active ? "bg-sori-surface-selected text-sori-accent-primary" : "text-sori-text-muted hover:bg-sori-surface-hover hover:text-sori-text-strong"
              )}
              onClick={() => props.onSelect(conversation.id)}
            >
              <Avatar name={peer.username} src={peer.avatarUrl} online={online} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate text-xs font-black">{peer.username}</div>
                </div>
                <div className="mt-0.5 truncate text-[10px] font-semibold text-sori-text-dim">{preview}</div>
                <div className="mt-0.5 text-[9px] font-black uppercase tracking-tighter text-sori-text-dim">{online ? props.t.onlineStatus : props.t.offlineStatus}</div>
              </div>
              {Number(conversation.unreadCount || 0) > 0 && (
                <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-sori-accent-secondary px-1 text-[9px] font-black text-black">
                  {conversation.unreadCount}
                </span>
              )}
              <span
                className="grid h-8 w-8 place-items-center rounded-lg text-sori-text-dim opacity-0 transition group-hover:bg-sori-surface-elevated group-hover:text-sori-accent-primary group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onCall(peer);
                }}
              >
                <Phone className="h-4 w-4" />
              </span>
            </button>
          );
        })}
      </div>
      {props.footer}
    </aside>
  );
}

export function DMEmptyState(props: { title: string; description: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-5 py-10 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-sori-border-subtle bg-sori-surface-elevated text-sori-text-dim">
        <MessageCircle className="h-5 w-5" />
      </div>
      <div className="text-xs font-black uppercase tracking-wider text-sori-text-muted">{props.title}</div>
      <p className="mt-2 text-xs leading-5 text-sori-text-dim">{props.description}</p>
    </div>
  );
}

export function ChatHeader(props: {
  mode: "channel" | "dm";
  title: string;
  channel: Channel | null;
  peer: SoriUser | null;
  online: boolean;
  directCallStatus: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onCall: () => void;
  t: ReturnType<typeof useT>;
}) {
  const isVoice = props.channel?.type === "voice";
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-sori-border-subtle bg-sori-surface-main px-4">
      <div className="flex min-w-0 items-center gap-3">
        {props.mode === "dm" && props.peer ? (
          <>
            <Avatar name={props.peer.username} src={props.peer.avatarUrl} online={props.online} />
            <div className="min-w-0">
              <h1 className="truncate text-[13px] font-bold text-sori-text-strong">{props.peer.username}</h1>
              <p className="text-[9px] font-black uppercase tracking-wider text-sori-text-muted">
                {props.online ? props.t.onlineStatus : props.t.offlineStatus}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-sori-border-subtle bg-sori-surface-elevated text-sori-text-muted">
              {isVoice ? <Volume2 className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
            </div>
            <h1 className="truncate text-[15px] font-bold text-sori-text-strong">{props.title}</h1>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!isVoice && (
          <div className="hidden h-9 w-56 items-center gap-2 rounded-xl border border-sori-border-subtle bg-sori-surface-base px-3 text-sori-text-muted focus-within:border-sori-border-accent lg:flex">
            <Search className="h-3.5 w-3.5 shrink-0 text-sori-text-dim" />
            <input
              className="min-w-0 flex-1 bg-transparent text-xs font-bold text-sori-text-strong outline-none placeholder:text-sori-text-dim"
              value={props.searchQuery}
              placeholder={props.t.searchMessages}
              onChange={(event) => props.onSearchChange(event.target.value)}
            />
            {props.searchQuery && (
              <button type="button" className="text-sori-text-dim hover:text-sori-text-strong" onClick={() => props.onSearchChange("")}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
        {props.mode === "dm" && props.peer && (
          <button
            type="button"
            disabled={props.directCallStatus !== "idle"}
            className="grid h-10 w-10 place-items-center rounded-2xl border border-sori-border-accent bg-sori-surface-accent-subtle text-sori-accent-primary transition hover:bg-sori-accent-primary hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
            onClick={props.onCall}
          >
            <Phone className="h-4 w-4" />
          </button>
        )}
      </div>
    </header>
  );
}

export function MemberSidebar(props: {
  members: Member[];
  onlineUsers: Set<string>;
  currentUserId?: string;
  onMemberClick: (member: Member, event: MouseEvent) => void;
  t: ReturnType<typeof useT>;
}) {
  const online = props.members.filter((member) => props.onlineUsers.has(member.id));
  const offline = props.members.filter((member) => !props.onlineUsers.has(member.id));
  return (
    <aside className="hidden h-full min-h-0 w-64 shrink-0 flex-col border-l border-sori-border-subtle bg-sori-surface-panel xl:flex">
      <header className="flex h-14 shrink-0 items-center border-b border-sori-border-subtle px-4">
        <span className="text-[10px] font-black uppercase tracking-widest text-sori-text-muted">{formatCountLabel(props.t.membersTitle, props.members.length)}</span>
      </header>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 no-scrollbar">
        <MemberGroup title={formatCountLabel(props.t.membersOnline, online.length)} accent members={online} currentUserId={props.currentUserId} onMemberClick={props.onMemberClick} t={props.t} />
        <MemberGroup title={formatCountLabel(props.t.membersOffline, offline.length)} members={offline} currentUserId={props.currentUserId} onMemberClick={props.onMemberClick} t={props.t} />
      </div>
    </aside>
  );
}

export function MemberGroup(props: {
  title: string;
  accent?: boolean;
  members: Member[];
  currentUserId?: string;
  onMemberClick: (member: Member, event: MouseEvent) => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 px-2 text-[9px] font-black uppercase tracking-[0.2em] text-sori-text-dim">
        {props.accent && <span className="h-1.5 w-1.5 rounded-full bg-sori-accent-secondary" />}
        {props.title}
      </h3>
      <div className="space-y-1">
        {props.members.map((member) => (
          <button
            key={member.id}
            type="button"
            className={cn(
              "group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all hover:bg-sori-surface-hover active:scale-[0.98]",
              props.accent ? "hover:shadow-[inset_0_0_0_1px_var(--sori-border-accent)]" : "text-sori-text-dim grayscale hover:grayscale-0"
            )}
            onClick={(event) => props.onMemberClick(member, event)}
          >
            <div className="relative shrink-0">
              <div className={cn(
                "grid h-8 w-8 place-items-center overflow-hidden rounded-xl border text-[10px] font-black transition-transform group-hover:scale-105",
                props.accent
                  ? "border-sori-border-accent bg-sori-surface-accent-subtle text-sori-accent-secondary"
                  : "border-sori-border-subtle bg-sori-surface-panel text-sori-text-muted"
              )}>
                {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" /> : member.username?.[0]?.toUpperCase()}
              </div>
              {props.accent && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sori-surface-panel bg-sori-accent-secondary shadow-sm" />}
            </div>
            <span className={cn("min-w-0 flex-1 truncate text-sm font-bold", props.accent ? "text-sori-accent-secondary" : "text-sori-text-muted")}>
              {member.username}{member.id === props.currentUserId ? ` · ${props.t.you}` : ""}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function MemberContextMenu(props: {
  menu: Exclude<MemberMenuState, null>;
  isOnline: boolean;
  isCurrentUser: boolean;
  onChat: () => void;
  onCall: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div
      className="fixed z-[70] min-w-[220px] animate-in zoom-in-95 overflow-hidden rounded-2xl border border-sori-border-subtle bg-sori-surface-panel p-0 shadow-2xl shadow-black ring-1 ring-sori-border-subtle"
      style={floatingMenuPosition(props.menu.x, props.menu.y, 304, 260)}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="h-12 w-full bg-sori-accent-primary shadow-inner" />
      <div className="-mt-6 px-4 pb-4">
        <div className="relative inline-block">
          {props.menu.member.avatarUrl ? (
            <img
              src={props.menu.member.avatarUrl}
              className="h-16 w-16 rounded-2xl border-4 border-sori-surface-panel object-cover shadow-xl"
              alt={props.menu.member.username}
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-sori-surface-panel bg-sori-surface-base text-xl font-black text-sori-accent-primary shadow-xl">
              {props.menu.member.username[0]?.toUpperCase()}
            </div>
          )}
          <span className={cn(
            "absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-sori-surface-panel",
            props.isOnline ? "bg-sori-accent-secondary" : "bg-sori-surface-active"
          )} />
        </div>

        <div className="mt-2 text-left">
          <p className="truncate text-base font-black text-sori-text-strong">{props.menu.member.username}</p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-sori-accent-primary">
            {props.menu.member.role || "member"}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-sori-text-muted">
            <span className={cn("h-1.5 w-1.5 rounded-full", props.isOnline ? "animate-pulse bg-sori-accent-secondary" : "bg-sori-surface-active")} />
            {props.isOnline ? props.t.onlineStatus : props.t.offlineStatus}
          </p>
        </div>

        <div className="my-3 h-px bg-sori-border-subtle" />

        {!props.isCurrentUser && (
          <>
            <MenuAction icon={<MessageSquare className="h-4 w-4" />} label={props.t.membersChat} onClick={props.onChat} />
            <MenuAction icon={<Phone className="h-4 w-4" />} label={props.t.membersCall} onClick={props.onCall} disabled={!props.isOnline} accent />
          </>
        )}
      </div>
    </div>
  );
}

export function MessageActionMenu(props: {
  menu: Exclude<MessageActionMenuState, null>;
  currentUser: SoriUser | null;
  onReply: () => void;
  onCopy: () => void;
  onReaction: (emoji: string) => void;
  t: ReturnType<typeof useT>;
}) {
  const canReact = Boolean(props.menu.message.channelId && !props.menu.message.isDeleted);
  const currentUserReactions = new Set(
    (props.menu.message.reactions || [])
      .filter((reaction) => reaction.userId === props.currentUser?.id)
      .map((reaction) => reaction.emoji)
  );

  return (
    <div
      className="fixed z-[80] min-w-[220px] animate-in zoom-in-95 rounded-2xl border border-sori-border-subtle bg-sori-surface-panel py-2 shadow-2xl shadow-black ring-1 ring-sori-border-subtle"
      style={floatingMenuPosition(props.menu.x, props.menu.y, 260, canReact ? 220 : 120)}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MenuAction icon={<Reply className="h-4 w-4" />} label={props.t.reply} onClick={props.onReply} />
      <MenuAction icon={<Copy className="h-4 w-4" />} label={props.t.copyMessage} onClick={props.onCopy} />
      {canReact && (
        <>
          <div className="mx-2 my-1 h-px bg-sori-border-subtle" />
          <div className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-sori-text-dim">
            {props.t.reactions}
          </div>
          <div className="flex justify-between gap-1 px-4 py-1.5">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                className={cn(
                  "rounded-lg p-1 text-xl transition-all hover:scale-125 active:scale-90",
                  currentUserReactions.has(emoji) ? "bg-sori-surface-accent-subtle ring-1 ring-sori-border-accent" : "hover:bg-sori-surface-hover"
                )}
                onClick={() => props.onReaction(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function VoiceVolumeMenu(props: {
  menu: Exclude<VoiceVolumeMenuState, null>;
  volume: number;
  onChange: (volume: number) => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div
      className="fixed z-[75] w-72 animate-in fade-in-0 zoom-in-95 rounded-2xl border border-sori-border-subtle bg-sori-surface-panel p-4 shadow-2xl"
      style={floatingMenuPosition(props.menu.x, props.menu.y, 304, 190)}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={props.menu.occupant.username} src={props.menu.occupant.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-sori-text-strong">{props.menu.occupant.username}</div>
          <div className="text-[10px] font-bold uppercase text-sori-text-muted">{props.t.participantVolume}</div>
        </div>
        <SlidersHorizontal className="h-4 w-4 text-sori-accent-primary" />
      </div>
      <div className="rounded-2xl border border-sori-border-subtle bg-sori-surface-main p-4">
        <div className="mb-3 flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
          <span className="text-sori-text-muted">{props.t.volume}</span>
          <span className="text-sori-text-strong">{props.volume}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={200}
          step={1}
          value={props.volume}
          className="w-full accent-sori-accent-primary"
          onChange={(event) => props.onChange(Number(event.target.value))}
        />
      </div>
    </div>
  );
}

export function MenuAction(props: { icon: ReactNode; label: string; disabled?: boolean; accent?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-all",
        props.disabled
          ? "cursor-not-allowed text-sori-text-dim"
          : props.accent
            ? "text-sori-text-muted hover:bg-sori-surface-accent-subtle hover:text-sori-accent-secondary"
            : "text-sori-text-muted hover:bg-sori-surface-hover hover:text-sori-accent-primary"
      )}
      onClick={props.onClick}
    >
      {props.icon}
      {props.label}
    </button>
  );
}

export function UserControlBlock(props: {
  user: SoriUser | null;
  connectedChannel: Channel | null;
  voiceStatus: string;
  isMuted: boolean;
  isDeafened: boolean;
  onMute: () => void;
  onDeafen: () => void;
  onLeaveVoice: () => void;
  t: ReturnType<typeof useT>;
}) {
  const username = props.user?.username || "SORI";
  const isVoiceConnected = Boolean(props.connectedChannel);
  const activeMicId = useSettingsStore((state) => state.activeMicId);
  const activeOutputId = useSettingsStore((state) => state.activeOutputId);
  const micGain = useSettingsStore((state) => state.micGain);
  const outputVolume = useSettingsStore((state) => state.outputVolume);
  const noiseSuppression = useSettingsStore((state) => state.noiseSuppression);
  const setMediaSettings = useSettingsStore((state) => state.setMediaSettings);
  const [openMediaMenu, setOpenMediaMenu] = useState<MediaMenuState>(null);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const handleDocumentClick = () => setOpenMediaMenu(null);
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  useEffect(() => {
    if (!openMediaMenu) return;
    let cancelled = false;
    const refreshDevices = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setMicDevices(devices.filter((device) => device.kind === "audioinput"));
        setOutputDevices(devices.filter((device) => device.kind === "audiooutput"));
      } catch {
        setMicDevices([]);
        setOutputDevices([]);
      }
    };
    void refreshDevices();
    return () => {
      cancelled = true;
    };
  }, [openMediaMenu]);

  return (
    <div className="mt-auto border-t border-sori-border-subtle bg-sori-surface-panel p-2">
      <div className="relative overflow-hidden rounded-2xl border border-sori-border-subtle bg-sori-surface-elevated shadow-2xl">
        {isVoiceConnected && (
          <div className="rounded-t-2xl border-b border-sori-border-subtle bg-sori-surface-main px-3 py-2 animate-in slide-in-from-bottom-1">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sori-surface-success-subtle text-sori-accent-secondary">
                <Volume2 className="h-4 w-4 animate-pulse" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-black uppercase leading-none text-sori-accent-secondary">{props.t.voiceConnected}</div>
                <div className="mt-1 truncate text-[11px] font-bold text-sori-text-muted">{props.connectedChannel?.name || props.voiceStatus}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className={userControlVoiceIconClass(noiseSuppression, "accent")}
                  onClick={() => setMediaSettings({ noiseSuppression: !noiseSuppression })}
                  title={props.t.noiseSuppression}
                >
                  <Waves className="h-4 w-4" />
                </button>
                <button type="button" className={userControlVoiceIconClass(true, "danger")} onClick={props.onLeaveVoice} title={props.t.leaveVoice}>
                  <PhoneOff className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 p-2 group/user">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1 transition hover:bg-sori-surface-hover">
            <div className="relative shrink-0">
              <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-sori-border-accent bg-sori-surface-accent-subtle text-[11px] font-black text-sori-accent-primary transition-transform group-hover/user:scale-105">
                {props.user?.avatarUrl ? (
                  <img src={props.user.avatarUrl} className="h-full w-full object-cover" alt={username} />
                ) : (
                  username[0]?.toUpperCase()
                )}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-sori-surface-panel bg-sori-accent-secondary shadow-sm" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-black leading-tight text-sori-text-strong">{username}</div>
              <div className="text-[8px] font-bold uppercase tracking-tighter text-sori-text-dim">{props.t.onlineStatus}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <MediaControlGroup
              active={props.isMuted}
              menuOpen={openMediaMenu?.type === "mic"}
              menu={
                <MediaDeviceMenu
                  anchor={openMediaMenu?.type === "mic" ? openMediaMenu : null}
                  title={props.t.inputDevice}
                  volumeLabel={props.t.inputVolume}
                  selectedDeviceId={activeMicId}
                  devices={micDevices}
                  fallbackLabel={props.t.microphone}
                  emptyLabel={props.t.selectMicrophone}
                  volume={micGain}
                  maxVolume={100}
                  onSelectDevice={(deviceId) => setMediaSettings({ activeMicId: deviceId })}
                  onVolumeChange={(value) => setMediaSettings({ micGain: value })}
                />
              }
              onToggle={props.onMute}
              onToggleMenu={(event) => {
                event.stopPropagation();
                setOpenMediaMenu(openMediaMenu?.type === "mic" ? null : mediaMenuAnchor("mic", event.currentTarget));
              }}
              title={props.t.mute}
            >
              {props.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </MediaControlGroup>
            <MediaControlGroup
              active={props.isDeafened}
              menuOpen={openMediaMenu?.type === "output"}
              menu={
                <MediaDeviceMenu
                  anchor={openMediaMenu?.type === "output" ? openMediaMenu : null}
                  title={props.t.outputDevice}
                  volumeLabel={props.t.outputVolume}
                  selectedDeviceId={activeOutputId}
                  devices={outputDevices}
                  fallbackLabel={props.t.speaker}
                  emptyLabel={props.t.selectSpeaker}
                  volume={outputVolume}
                  maxVolume={200}
                  onSelectDevice={(deviceId) => setMediaSettings({ activeOutputId: deviceId })}
                  onVolumeChange={(value) => setMediaSettings({ outputVolume: value })}
                />
              }
              onToggle={props.onDeafen}
              onToggleMenu={(event) => {
                event.stopPropagation();
                setOpenMediaMenu(openMediaMenu?.type === "output" ? null : mediaMenuAnchor("output", event.currentTarget));
              }}
              title={props.t.deafen}
            >
              <DeafenIcon active={props.isDeafened} />
            </MediaControlGroup>
          </div>
        </div>
      </div>
    </div>
  );
}

function userControlVoiceIconClass(active: boolean, variant: "danger" | "accent" = "danger") {
  return cn(
    "grid h-8 w-8 place-items-center rounded-lg transition",
    active && variant === "accent" && "bg-sori-surface-accent-subtle text-sori-accent-secondary",
    active && variant === "danger" && "bg-sori-accent-danger-subtle text-sori-accent-danger",
    !active && "bg-sori-surface-elevated text-sori-text-muted hover:bg-sori-surface-hover hover:text-sori-text-strong"
  );
}

function userControlIconButtonClass(active: boolean) {
  return cn(
    "grid h-8 w-8 place-items-center rounded-lg transition",
    active
      ? "bg-sori-accent-danger-subtle text-sori-accent-danger"
      : "text-sori-text-muted hover:bg-sori-surface-hover hover:text-sori-text-strong"
  );
}

function MediaControlGroup(props: {
  active: boolean;
  menuOpen: boolean;
  menu: ReactNode;
  title: string;
  children: ReactNode;
  onToggle: () => void;
  onToggleMenu: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="relative flex items-center rounded-lg bg-sori-surface-base">
      <button type="button" className={userControlIconButtonClass(props.active)} onClick={props.onToggle} title={props.title}>
        {props.children}
      </button>
      <button
        type="button"
        className={cn(
          "grid h-8 w-5 place-items-center rounded-r-lg text-sori-text-dim transition hover:bg-sori-surface-hover hover:text-sori-text-strong",
          props.menuOpen && "text-sori-accent-primary"
        )}
        onClick={props.onToggleMenu}
        title={props.title}
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", props.menuOpen && "rotate-180")} />
      </button>
      {props.menuOpen && props.menu}
    </div>
  );
}

function MediaDeviceMenu(props: {
  anchor: MediaMenuState;
  title: string;
  volumeLabel: string;
  selectedDeviceId: string;
  devices: MediaDeviceInfo[];
  fallbackLabel: string;
  emptyLabel: string;
  volume: number;
  maxVolume: number;
  onSelectDevice: (deviceId: string) => void;
  onVolumeChange: (volume: number) => void;
}) {
  if (!props.anchor) return null;

  const options = props.devices.length > 0
    ? props.devices.map((device, index) => ({
      id: device.deviceId || "default",
      key: `${device.deviceId || "default"}-${index}`,
      label: device.label || `${props.fallbackLabel} ${index + 1}`
    }))
    : [{ id: "default", key: "default", label: props.emptyLabel }];

  return (
    <div
      className="fixed z-[90] w-72 rounded-2xl border border-sori-border-subtle bg-sori-surface-panel p-4 shadow-2xl animate-in fade-in-0 zoom-in-95"
      style={floatingMenuPositionFromRect(props.anchor, 288, props.anchor.type === "output" ? -40 : 0)}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="space-y-4">
        <div>
          <p className="mb-3 ml-1 text-[10px] font-black uppercase tracking-widest text-sori-text-muted">{props.title}</p>
          <div className="max-h-40 space-y-1 overflow-y-auto no-scrollbar">
            {options.map((option) => (
              <button
                key={option.key}
                type="button"
                className={cn(
                  "w-full rounded-xl px-3 py-2 text-left text-[11px] transition-all",
                  props.selectedDeviceId === option.id
                    ? "bg-sori-surface-accent-subtle font-bold text-sori-accent-primary"
                    : "text-sori-text-muted hover:bg-sori-surface-hover hover:text-sori-text-strong"
                )}
                onClick={() => props.onSelectDevice(option.id)}
              >
                <span className="block truncate">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-sori-border-strong" />

        <div>
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-sori-accent-primary">{props.volumeLabel}</p>
            <span className="text-[11px] font-bold text-sori-accent-primary">{props.volume}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={props.maxVolume}
            step={1}
            value={props.volume}
            className="w-full accent-sori-accent-primary"
            onChange={(event) => props.onVolumeChange(Number(event.target.value))}
          />
        </div>
      </div>
    </div>
  );
}

function mediaMenuAnchor(type: "mic" | "output", node: HTMLElement): Exclude<MediaMenuState, null> {
  const rect = node.getBoundingClientRect();
  return {
    type,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom
  };
}

function DeafenIcon(props: { active: boolean; className?: string }) {
  return (
    <div className={cn("relative h-4 w-4", props.className)}>
      <Headphones className={cn("h-full w-full", props.active && "text-sori-accent-danger")} />
      {props.active && (
        <span className="absolute left-1/2 top-1/2 h-[2px] w-[125%] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-sori-accent-danger" />
      )}
    </div>
  );
}

export function MessageList(props: {
  items: ChatItem[];
  currentUser: SoriUser | null;
  emptyText: string;
  t: ReturnType<typeof useT>;
  onMessageContextMenu?: (message: Message, event: MouseEvent) => void;
  onReaction?: (message: Message, emoji: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distanceFromBottom < 240) {
      node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    }
  }, [props.items.length]);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-6 no-scrollbar">
      {props.items.length === 0 ? (
        <div className="grid h-full place-items-center">
          <div className="text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-sori-border-subtle bg-sori-surface-panel text-sori-text-dim">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div className="text-sm font-black text-sori-text-muted">{props.emptyText}</div>
          </div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[76rem] space-y-1">
          {props.items.map((item, index) => {
            const previous = props.items[index - 1];
            const showDate = !previous || !isSameMessageDay(previous.createdAt, item.createdAt);
            if (item.type === "system_call") {
              return (
                <div key={item.id}>
                  {showDate && <DateDivider label={formatDateLabel(item.createdAt)} />}
                  <SystemCallRow item={item} t={props.t} />
                </div>
              );
            }

            const message = item as Message;
            return (
              <div key={message.id}>
                {showDate && <DateDivider label={formatDateLabel(message.createdAt)} />}
                <MessageRow
                  message={message}
                  currentUser={props.currentUser}
                  t={props.t}
                  onContextMenu={props.onMessageContextMenu}
                  onReaction={props.onReaction}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DateDivider(props: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-4">
      <div className="h-px flex-1 bg-sori-border-subtle" />
      <div className="rounded-full border border-sori-border-subtle bg-sori-surface-panel px-3 py-1 text-[10px] font-black uppercase tracking-widest text-sori-text-dim">
        {props.label}
      </div>
      <div className="h-px flex-1 bg-sori-border-subtle" />
    </div>
  );
}

export function MessageRow(props: {
  message: Message;
  currentUser: SoriUser | null;
  t: ReturnType<typeof useT>;
  onContextMenu?: (message: Message, event: MouseEvent) => void;
  onReaction?: (message: Message, emoji: string) => void;
}) {
  const message = props.message;
  const isOwn = message.authorId === props.currentUser?.id;
  const authorName = message.author?.username || message.username || (isOwn ? props.currentUser?.username || props.t.you : props.t.deletedUser);
  const avatarUrl = message.author?.avatarUrl || (isOwn ? props.currentUser?.avatarUrl : null);
  const attachments = getMessageAttachments(message);
  const [lightboxAttachment, setLightboxAttachment] = useState<Attachment | null>(null);
  const callType = getCallMessageType(message);

  const groupedReactions = (message.reactions || []).reduce((acc, reaction) => {
    acc[reaction.emoji] = acc[reaction.emoji] || { count: 0, mine: false };
    acc[reaction.emoji].count += 1;
    if (reaction.userId === props.currentUser?.id) acc[reaction.emoji].mine = true;
    return acc;
  }, {} as Record<string, { count: number; mine: boolean }>);

  return (
    <div
      id={`msg-${message.id}`}
      className={cn("group flex flex-col gap-1 py-1", isOwn ? "items-end" : "items-start")}
      onContextMenu={(event) => props.onContextMenu?.(message, event)}
    >
      <div className={cn("flex max-w-full gap-3", isOwn && "flex-row-reverse")}>
        <Avatar name={authorName} src={avatarUrl} />
        <div className={cn("flex min-w-0 max-w-[min(42rem,calc(100vw-22rem))] flex-col", isOwn ? "items-end" : "items-start")}>
          <div className="mb-0.5 flex items-baseline gap-2 px-1">
            <span className={cn("text-[11px] font-black", isOwn ? "text-sori-accent-primary" : "text-sori-accent-secondary")}>
              {isOwn ? props.t.you : authorName}
            </span>
            <span className="text-[10px] font-bold text-sori-text-dim">{formatTime(message.createdAt)}</span>
          </div>

          <div className={cn("flex w-full flex-col gap-2", isOwn ? "items-end" : "items-start")}>
            {callType ? (
              <CallMessageCard type={callType} createdAt={message.createdAt} content={message.content} t={props.t} />
            ) : message.content || message.isDeleted ? (
              <div
                className={cn(
                  "rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm transition-all select-text cursor-text",
                  message.isDeleted
                    ? "border border-sori-border-subtle bg-sori-surface-base text-sori-text-dim italic"
                    : isOwn
                      ? "rounded-tr-none border border-sori-chat-bubble-me-border bg-sori-chat-bubble-me text-sori-text-strong"
                      : "rounded-tl-none bg-sori-surface-panel text-sori-text-primary shadow-[inset_0_0_0_1px_var(--sori-border-subtle)]"
                )}
              >
                <div className="whitespace-pre-wrap break-words">
                  {message.isDeleted ? props.t.messageDeleted : renderContentWithLinks(message.content)}
                </div>
              </div>
            ) : null}

            {attachments.length > 0 && !message.isDeleted && (
              <div className={cn("flex w-full flex-col gap-2", isOwn ? "items-end" : "items-start")}>
                {attachments.map((attachment, index) => (
                  <MessageAttachment key={`${message.id}:${attachment.fileUrl}:${index}`} attachment={attachment} onOpen={() => setLightboxAttachment(attachment)} />
                ))}
              </div>
            )}

            {!message.isDeleted && (
              <MessageLinkPreviews message={message} />
            )}

            {Object.keys(groupedReactions).length > 0 && !message.isDeleted && (
              <div className={cn("mt-1.5 flex flex-wrap gap-1.5", isOwn ? "justify-end" : "justify-start")}>
                {Object.entries(groupedReactions).map(([emoji, reaction]) => (
                  <button
                    type="button"
                    key={emoji}
                    className={cn(
                      "flex items-center gap-1 rounded-lg border px-1.5 py-0.5 transition-colors",
                      reaction.mine
                        ? "border-sori-border-accent bg-sori-surface-accent-subtle"
                        : "border-sori-border-subtle bg-sori-surface-panel hover:bg-sori-surface-hover"
                    )}
                    onClick={() => props.onReaction?.(message, emoji)}
                  >
                    <span className="text-xs">{emoji}</span>
                    <span className="text-[9px] font-black text-sori-text-dim">{reaction.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {lightboxAttachment && (
        <AttachmentLightbox
          attachment={lightboxAttachment}
          onClose={() => setLightboxAttachment(null)}
          onCopy={() => {
            void navigator.clipboard?.writeText(lightboxAttachment.fileUrl).then(() => toast.success("Link copied."));
          }}
        />
      )}
    </div>
  );
}

export function MessageAttachment(props: { attachment: Attachment; onOpen?: () => void }) {
  const isImage = props.attachment.fileType?.startsWith("image/");
  const isVideo = props.attachment.fileType?.startsWith("video/");
  const isAudio = props.attachment.fileType?.startsWith("audio/");

  if (isImage) {
    return (
      <button type="button" onClick={props.onOpen} className="block max-w-md overflow-hidden rounded-2xl border border-sori-border-subtle bg-sori-surface-elevated text-left shadow-lg">
        <img src={props.attachment.fileUrl} alt={props.attachment.fileName || ""} className="max-h-80 w-auto object-contain transition hover:brightness-110" loading="lazy" />
      </button>
    );
  }

  if (isVideo) {
    return (
      <div className="max-w-md overflow-hidden rounded-2xl border border-sori-border-subtle bg-sori-surface-elevated shadow-lg">
        <video src={props.attachment.fileUrl} controls className="max-h-80 w-auto" />
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className="flex min-w-[280px] max-w-md items-center gap-4 rounded-2xl border border-sori-border-subtle bg-sori-surface-elevated p-4 shadow-lg">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-sori-border-accent bg-sori-surface-accent-subtle text-sori-accent-primary">
          <Music className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-2 truncate text-xs font-bold text-sori-text-strong">{props.attachment.fileName}</p>
          <audio src={props.attachment.fileUrl} controls preload="metadata" className="h-9 w-full min-w-[220px] max-w-sm accent-sori-accent-primary" />
          <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-sori-text-muted">{formatFileSize(props.attachment.fileSize)}</p>
        </div>
        <a
          href={props.attachment.fileUrl}
          download={props.attachment.fileName}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sori-surface-accent-subtle text-sori-accent-primary transition hover:bg-sori-accent-primary hover:text-black"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void openSafeExternalUrl(props.attachment.fileUrl);
          }}
        >
          <Download className="h-5 w-5" />
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-w-[240px] max-w-md items-center gap-4 rounded-2xl border border-sori-border-subtle bg-sori-surface-elevated p-4 shadow-lg">
      <FileText className="h-6 w-6 shrink-0 text-sori-accent-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-sori-text-strong">{props.attachment.fileName}</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-sori-text-muted">{formatFileSize(props.attachment.fileSize)}</p>
      </div>
      <a
        href={props.attachment.fileUrl}
        download={props.attachment.fileName}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sori-surface-accent-subtle text-sori-accent-primary transition hover:bg-sori-accent-primary hover:text-black"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void openSafeExternalUrl(props.attachment.fileUrl);
        }}
      >
        <Download className="h-5 w-5" />
      </a>
    </div>
  );
}

function AttachmentLightbox(props: { attachment: Attachment; onClose: () => void; onCopy: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-sori-surface-base p-8 animate-in fade-in duration-300"
      onClick={props.onClose}
    >
      <div className="absolute right-6 top-6 flex gap-3">
        <button
          type="button"
          className="grid h-12 w-12 place-items-center rounded-2xl border border-sori-border-subtle bg-sori-surface-panel text-sori-text-strong shadow-lg transition hover:bg-sori-surface-hover"
          onClick={(event) => {
            event.stopPropagation();
            props.onCopy();
          }}
        >
          <Copy className="h-6 w-6" />
        </button>
        <a
          href={props.attachment.fileUrl}
          download={props.attachment.fileName}
          className="grid h-12 w-12 place-items-center rounded-2xl border border-sori-border-subtle bg-sori-surface-panel text-sori-text-strong shadow-lg transition hover:bg-sori-accent-primary hover:text-black"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void openSafeExternalUrl(props.attachment.fileUrl);
          }}
        >
          <Save className="h-6 w-6" />
        </a>
        <button
          type="button"
          className="grid h-12 w-12 place-items-center rounded-2xl bg-sori-surface-panel text-sori-text-strong shadow-lg transition hover:bg-sori-accent-danger hover:text-white"
          onClick={(event) => {
            event.stopPropagation();
            props.onClose();
          }}
        >
          <X className="h-6 w-6" />
        </button>
      </div>
      <img
        src={props.attachment.fileUrl}
        className="max-h-full max-w-full object-contain shadow-2xl animate-in zoom-in-95 duration-300"
        alt={props.attachment.fileName || "Preview"}
      />
    </div>
  );
}

function MessageLinkPreviews(props: { message: Message }) {
  const metadata = useMessageLinkPreviews(props.message);
  if (metadata.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-2">
      {metadata.map((item) => (
        <EmbedCard key={item.url} data={item} />
      ))}
    </div>
  );
}

function useMessageLinkPreviews(message: Message) {
  const [previews, setPreviews] = useState<LinkMetadata[]>(() => parseLinkMetadata(message.linkMetadata));

  useEffect(() => {
    const embedded = parseLinkMetadata(message.linkMetadata);
    if (embedded.length > 0) {
      setPreviews(embedded);
      return;
    }

    const urls = Array.from(new Set((message.content || "").match(URL_REGEX) || [])).slice(0, 3);
    if (urls.length === 0) {
      setPreviews([]);
      return;
    }

    let cancelled = false;
    const next: LinkMetadata[] = [];
    void Promise.all(urls.map(async (url) => {
      if (linkPreviewCache.has(url)) {
        const cached = linkPreviewCache.get(url);
        if (cached) next.push(cached);
        return;
      }

      try {
        const data = await apiRequest<LinkMetadata>(`/utils/link-preview?url=${encodeURIComponent(url)}`);
        linkPreviewCache.set(url, data);
        next.push(data);
      } catch {
        linkPreviewCache.set(url, null);
      }
    })).then(() => {
      if (!cancelled) setPreviews(next);
    });

    return () => {
      cancelled = true;
    };
  }, [message.content, message.linkMetadata]);

  return previews;
}

function EmbedCard(props: { data: LinkMetadata }) {
  let domain = props.data.url;
  try {
    domain = new URL(props.data.url).hostname.replace("www.", "");
  } catch {
    // Keep the raw URL when metadata is malformed.
  }

  if (!props.data.isPrivate && props.data.title === "Preview Unavailable") {
    return null;
  }

  if (props.data.isPrivate) {
    return (
      <div className="flex max-w-sm items-center gap-4 rounded-2xl border-2 border-dashed border-sori-border-danger bg-sori-surface-panel p-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sori-surface-danger-subtle text-sori-accent-danger">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div>
          <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-sori-accent-danger">SORI GUARD</p>
          <p className="truncate text-xs font-bold text-sori-text-muted">Internal protocol blocked</p>
        </div>
      </div>
    );
  }

  return (
    <a
      href={props.data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group/embed flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-sori-border-subtle bg-sori-surface-panel shadow-2xl transition hover:border-sori-border-accent hover:bg-sori-surface-hover"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void openSafeExternalUrl(props.data.url);
      }}
    >
      {props.data.image && (
        <div className="relative aspect-video w-full overflow-hidden border-b border-sori-border-subtle bg-sori-surface-base">
          <img
            src={props.data.image}
            alt={props.data.title || domain}
            className="h-full w-full object-cover transition-transform duration-700 group-hover/embed:scale-105"
            onError={(event) => {
              event.currentTarget.parentElement?.classList.add("hidden");
            }}
          />
          <div className="absolute right-2 top-2 rounded-lg bg-sori-surface-base p-1.5 text-sori-text-dim opacity-0 transition group-hover/embed:text-sori-accent-primary group-hover/embed:opacity-100">
            <ExternalLink className="h-3 w-3" />
          </div>
        </div>
      )}
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <div className="relative flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded border border-sori-border-strong bg-sori-surface-base">
            <Globe className="h-2.5 w-2.5 text-sori-text-muted" />
            <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} className="absolute inset-0 h-full w-full" alt="" />
          </div>
          <span className="truncate text-[9px] font-black uppercase tracking-[0.2em] text-sori-text-muted transition group-hover/embed:text-sori-accent-primary">
            {props.data.siteName || domain}
          </span>
        </div>
        <div className="space-y-1">
          <h4 className="max-h-8 overflow-hidden text-xs font-black leading-tight text-white transition group-hover/embed:text-sori-accent-primary">
            {props.data.title || props.data.url}
          </h4>
          {props.data.description && (
            <p className="max-h-12 overflow-hidden text-[10px] font-medium leading-relaxed text-sori-text-muted">
              {props.data.description}
            </p>
          )}
        </div>
      </div>
    </a>
  );
}

export function MessageComposer(props: {
  disabled: boolean;
  placeholder: string;
  sendLabel: string;
  attachLabel: string;
  uploadingLabel: string;
  typingUser?: string | null;
  typingLabel: string;
  t: ReturnType<typeof useT>;
  replyTo?: Message | null;
  onClearReply?: () => void;
  onTypingChange?: (isTyping: boolean) => void;
  onSend: (content: string, attachments?: Attachment[], parentId?: string | null) => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const maxUploadSizeMb = useServerStore((state) => state.bootstrap?.upload.maxUploadSizeMb || 25);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const typingStopTimeoutRef = useRef<number | null>(null);
  const lastTypingEmitAtRef = useRef(0);

  useEffect(() => () => {
    if (typingStopTimeoutRef.current) {
      window.clearTimeout(typingStopTimeoutRef.current);
    }
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = content.trim();
    if (!value && attachments.length === 0) return;
    setContent("");
    setAttachments([]);
    setShowEmojiPicker(false);
    props.onTypingChange?.(false);
    const parentId = props.replyTo?.id || null;
    props.onClearReply?.();
    try {
      await props.onSend(value, attachments, parentId);
    } finally {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const handleInputChange = (value: string) => {
    setContent(value);

    if (!props.onTypingChange) {
      return;
    }

    if (typingStopTimeoutRef.current) {
      window.clearTimeout(typingStopTimeoutRef.current);
    }

    const now = Date.now();
    if (value.length > 0 && now - lastTypingEmitAtRef.current >= 300) {
      props.onTypingChange(true);
      lastTypingEmitAtRef.current = now;
    }

    typingStopTimeoutRef.current = window.setTimeout(() => {
      props.onTypingChange?.(false);
      typingStopTimeoutRef.current = null;
    }, 1200);
  };

  const handleFiles = async (files: FileList | File[] | null) => {
    const queue = Array.from(files || []).slice(0, 10);
    if (queue.length === 0) return;
    const maxBytes = maxUploadSizeMb * 1024 * 1024;
    const uploadable = queue.filter((file) => {
      if (file.size <= maxBytes) {
        return true;
      }
      toast.error(props.t.fileTooLarge.replace("{size}", String(maxUploadSizeMb)));
      return false;
    });
    if (uploadable.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(uploadable.map(uploadAttachment));
      setAttachments((current) => [...current, ...uploaded].slice(0, 10));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (props.disabled) {
      dragDepthRef.current = 0;
      setDragActive(false);
      return;
    }

    const onDragEnter = (event: DragEvent) => {
      if (!hasFileTransfer(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setDragActive(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!hasFileTransfer(event)) return;
      event.preventDefault();
      setDragActive(true);
    };

    const onDragLeave = (event: DragEvent) => {
      if (!hasFileTransfer(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setDragActive(false);
      }
    };

    const onDrop = (event: DragEvent) => {
      if (!hasFileTransfer(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setDragActive(false);
      void handleFiles(event.dataTransfer?.files || null);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [props.disabled, maxUploadSizeMb]);

  return (
    <footer
      className="relative shrink-0 bg-sori-surface-base px-3 pb-3"
      onDragEnter={(event) => {
        if (!hasFileTransfer(event)) return;
        event.preventDefault();
        event.stopPropagation();
        dragDepthRef.current += 1;
        setDragActive(true);
      }}
      onDragOver={(event) => {
        if (!hasFileTransfer(event)) return;
        event.preventDefault();
        event.stopPropagation();
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        if (!hasFileTransfer(event)) return;
        event.preventDefault();
        event.stopPropagation();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragActive(false);
      }}
      onDrop={(event) => {
        if (!hasFileTransfer(event)) return;
        event.preventDefault();
        event.stopPropagation();
        dragDepthRef.current = 0;
        setDragActive(false);
        void handleFiles(event.dataTransfer.files);
      }}
      onPaste={(event) => {
        const files = Array.from(event.clipboardData.files || []);
        if (files.length === 0) return;
        event.preventDefault();
        void handleFiles(files);
      }}
    >
      {dragActive && (
        <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-black/35 backdrop-blur-sm">
          <div className="mx-8 flex min-h-56 w-[min(38rem,calc(100vw-4rem))] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-sori-border-accent bg-sori-surface-main/95 shadow-2xl">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-sori-border-accent bg-sori-surface-accent-subtle text-sori-accent-primary">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div className="text-sm font-black uppercase tracking-widest text-sori-text-strong">{props.t.dropFiles}</div>
            <div className="mt-1 text-xs font-bold text-sori-text-muted">{props.t.dropFilesDescription}</div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-sori-text-dim">
              {props.t.dropFilesMaxSize.replace("{size}", String(maxUploadSizeMb))}
            </div>
          </div>
        </div>
      )}
      {props.typingUser && (
        <div className="mx-auto mb-2 w-full max-w-[76rem] px-3 text-[11px] font-bold text-sori-text-muted">
          {props.typingLabel.replace("{name}", props.typingUser)}
        </div>
      )}
      {props.replyTo && (
        <div className="mx-auto mb-3 flex w-full max-w-[76rem] items-center justify-between rounded-r-2xl border-l-4 border-sori-accent-primary bg-sori-surface-panel p-3 animate-in slide-in-from-bottom-2">
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-widest text-sori-accent-primary">
              {props.t.replyingTo.replace("{name}", props.replyTo.author?.username || props.replyTo.username || props.t.deletedUser)}
            </div>
            <div className="mt-0.5 truncate text-xs font-medium text-sori-text-muted">{props.replyTo.content || props.replyTo.attachments?.[0]?.fileName || props.t.attach}</div>
          </div>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-full text-sori-text-muted transition hover:bg-sori-surface-hover hover:text-sori-text-strong" onClick={props.onClearReply}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {attachments.length > 0 && (
        <div className="mx-auto mb-3 w-full max-w-[76rem] rounded-2xl border border-sori-border-medium bg-sori-surface-main p-3">
          <div className="mb-2 px-1 text-[10px] font-black uppercase tracking-widest text-sori-text-muted">{props.attachLabel} · {attachments.length}</div>
          <div className="flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <AttachmentPreview key={attachment.fileUrl} attachment={attachment} onRemove={() => setAttachments((current) => current.filter((item) => item.fileUrl !== attachment.fileUrl))} />
          ))}
          </div>
        </div>
      )}

      <form onSubmit={submit} className="mx-auto flex w-full max-w-[76rem] items-center gap-3 rounded-2xl border border-sori-border-subtle bg-sori-surface-panel px-4 py-2.5 shadow-2xl transition focus-within:border-sori-border-accent">
        <label className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center text-sori-text-muted transition hover:text-sori-accent-primary">
          <Paperclip className="h-5 w-5" />
          <span className="sr-only">{uploading ? props.uploadingLabel : props.attachLabel}</span>
          <input
            type="file"
            multiple
            className="hidden"
            disabled={props.disabled || uploading}
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <input
          ref={inputRef}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm font-medium text-sori-text-strong outline-none placeholder:text-sori-text-dim"
          disabled={props.disabled}
          placeholder={props.placeholder}
          value={content}
          onChange={(event) => handleInputChange(event.target.value)}
        />
        <div className="relative">
          <button
            type="button"
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sori-text-muted transition hover:bg-sori-surface-hover hover:text-sori-accent-primary",
              showEmojiPicker && "bg-sori-surface-accent-subtle text-sori-accent-primary"
            )}
            onClick={() => setShowEmojiPicker((value) => !value)}
            title="Emoji"
          >
            <Smile className="h-5 w-5" />
          </button>
          {showEmojiPicker && (
            <div className="absolute bottom-12 right-0 z-[80] overflow-hidden rounded-2xl border border-sori-border-subtle bg-sori-surface-panel shadow-2xl">
              <Suspense fallback={<div className="grid h-64 w-80 place-items-center text-xs font-bold text-sori-text-muted">Emoji</div>}>
                <EmojiPicker
                  theme={"dark" as any}
                  width={320}
                  height={400}
                  onEmojiClick={(emojiData: { emoji: string }) => {
                    handleInputChange(content + emojiData.emoji);
                    setShowEmojiPicker(false);
                  }}
                />
              </Suspense>
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={props.disabled || uploading || (!content.trim() && attachments.length === 0)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sori-accent-primary text-black transition active:scale-95 disabled:opacity-50"
          title={props.sendLabel}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </footer>
  );
}

export function AttachmentPreview(props: { attachment: Attachment; onRemove: () => void }) {
  const isImage = props.attachment.fileType?.startsWith("image/");
  const isVideo = props.attachment.fileType?.startsWith("video/");
  const isAudio = props.attachment.fileType?.startsWith("audio/");
  const Icon = isImage ? ImageIcon : isVideo ? Film : isAudio ? Music : FileText;

  return (
    <div className="group relative flex max-w-72 items-center gap-3 rounded-xl border border-sori-border-subtle bg-sori-surface-panel p-2 pr-9">
      <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-sori-surface-elevated text-sori-accent-primary">
        {isImage ? (
          <img src={props.attachment.fileUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon className="h-5 w-5" />
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-black text-sori-text-strong">{props.attachment.fileName}</div>
        <div className="mt-0.5 text-[10px] font-semibold text-sori-text-dim">{formatFileSize(props.attachment.fileSize)}</div>
      </div>
      <button
        type="button"
        className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-lg text-sori-text-dim transition hover:bg-sori-surface-hover hover:text-sori-text-strong"
        onClick={props.onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function Avatar(props: { name: string; src?: string | null; online?: boolean; size?: "sm" | "lg" }) {
  const large = props.size === "lg";
  return (
    <div className="relative shrink-0">
      <div className={cn(
        "grid place-items-center overflow-hidden border border-sori-border-accent bg-sori-surface-accent-subtle font-black text-sori-accent-primary",
        large ? "h-14 w-14 rounded-2xl text-lg" : "h-9 w-9 rounded-xl text-xs"
      )}>
        {props.src ? <img src={props.src} alt="" className="h-full w-full object-cover" /> : props.name[0]?.toUpperCase()}
      </div>
      {typeof props.online === "boolean" && (
        <span className={cn(
          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-sori-surface-panel",
          props.online ? "bg-sori-accent-secondary" : "bg-sori-text-dim"
        )} />
      )}
    </div>
  );
}

export function SystemCallRow(props: { item: ChatItem; t: ReturnType<typeof useT> }) {
  const item = props.item as CallLogLike;
  return (
    <div className="flex justify-center py-2">
      <div className="rounded-full border border-sori-border-subtle bg-sori-surface-panel px-4 py-2 text-xs font-bold text-sori-text-muted">
        {callLabel(item.status, props.t)}{item.duration ? ` · ${formatDuration(Number(item.duration))}` : ""}
      </div>
    </div>
  );
}

type CallMessageType = "missed" | "ended" | "rejected";
type CallLogLike = { status?: string; duration?: number | null };

export function CallMessageCard(props: { type: CallMessageType; createdAt: string | number; content?: string | null; t: ReturnType<typeof useT> }) {
  const Icon = props.type === "missed" ? PhoneMissed : props.type === "ended" ? Phone : PhoneOff;
  const label = props.type === "missed"
    ? props.t.missedCall
    : props.type === "ended"
      ? props.t.callEnded
      : props.t.declinedCall;
  const accentClass = props.type === "rejected"
    ? "border-sori-accent-warning bg-sori-accent-warning text-black"
    : props.type === "missed"
      ? "border-sori-border-danger bg-sori-surface-danger-subtle text-sori-accent-danger"
      : "border-sori-border-accent bg-sori-surface-accent-subtle text-sori-accent-primary";

  return (
    <div className={cn("my-1 flex items-center gap-3 rounded-2xl border px-5 py-3", accentClass)}>
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-black/10">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-tight">{label}</p>
        <p className="text-[10px] font-bold opacity-75">
          {props.type === "ended" && props.content ? props.t.duration.replace("{duration}", props.content) : formatTime(props.createdAt)}
        </p>
      </div>
    </div>
  );
}

function floatingMenuPosition(x: number, y: number, width: number, height: number) {
  const margin = 12;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const openRight = x < viewportWidth / 2;
  const openDown = y < viewportHeight / 2;
  const preferredLeft = openRight ? x : x - width;
  const preferredTop = openDown ? y : y - height;

  return {
    left: clamp(preferredLeft, margin, viewportWidth - width - margin),
    top: clamp(preferredTop, margin, viewportHeight - height - margin)
  };
}

function floatingMenuPositionFromRect(
  rect: Exclude<MediaMenuState, null>,
  width: number,
  alignOffset = 0
) {
  const margin = 12;
  const gap = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const anchorCenterX = (rect.left + rect.right) / 2;
  const anchorCenterY = (rect.top + rect.bottom) / 2;
  const openRight = anchorCenterX < viewportWidth / 2;
  const openDown = anchorCenterY < viewportHeight / 2;
  const horizontal = openRight
    ? { left: clamp(rect.left + alignOffset, margin, viewportWidth - width - margin) }
    : { right: clamp(viewportWidth - rect.right + alignOffset, margin, viewportWidth - width - margin) };

  return openDown
    ? { ...horizontal, top: rect.bottom + gap, maxHeight: viewportHeight - rect.bottom - gap - margin }
    : { ...horizontal, bottom: viewportHeight - rect.top + gap, maxHeight: rect.top - gap - margin };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function formatCountLabel(template: string, count: number) {
  return template.replace("{count}", String(count));
}

function formatFileSize(size?: number | null) {
  if (!size || size <= 0) {
    return "";
  }
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getMessageAttachments(message: Message) {
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const single = message.attachment ? [message.attachment] : [];
  const seen = new Set<string>();
  return [...attachments, ...single].filter((attachment) => {
    if (!attachment?.fileUrl || seen.has(attachment.fileUrl)) {
      return false;
    }
    seen.add(attachment.fileUrl);
    return true;
  });
}

function parseLinkMetadata(raw: Message["linkMetadata"]): LinkMetadata[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((item) => Boolean(item?.url));
  if (typeof raw === "object") return raw.url ? [raw] : [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((item) => Boolean(item?.url));
    if (parsed && typeof parsed === "object" && parsed.url) return [parsed as LinkMetadata];
  } catch {
    return [];
  }
  return [];
}

function renderContentWithLinks(content?: string | null) {
  if (!content) return "";
  return content.split(URL_REGEX).map((part, index) => {
    if (!part.match(URL_REGEX)) return part;
    return (
      <a
        key={`${part}:${index}`}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="break-all text-sori-text-strong underline decoration-sori-border-strong underline-offset-2 transition hover:text-sori-accent-primary hover:decoration-sori-accent-primary"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void openSafeExternalUrl(part);
        }}
      >
        {part}
      </a>
    );
  });
}

async function openSafeExternalUrl(url: string) {
  try {
    await openExternalUrl(url);
  } catch {
    toast.error("Failed to open link.");
  }
}

function getCallMessageType(message: Message): CallMessageType | null {
  if (message.type === "call_missed") return "missed";
  if (message.type === "call_ended") return "ended";
  if (message.type === "call_rejected") return "rejected";
  return null;
}

function callLabel(status: string | undefined, t: ReturnType<typeof useT>) {
  if (status === "missed" || status === "timeout") return t.missedCall;
  if (status === "rejected") return t.declinedCall;
  if (status === "accepted" || status === "ended") return t.callEnded;
  return t.callEvent;
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const secs = (safeSeconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function getConversationPeer(conversation: DMConversation | null, user: SoriUser | null) {
  if (!conversation || !user) return null;
  return (conversation.user1Id === user.id ? conversation.user2 : conversation.user1) || null;
}

function buildChannelCategories(channels: Channel[], t: ReturnType<typeof useT>) {
  const categories = new Map<string, { id: string; name: string; channels: Channel[] }>();

  channels.forEach((channel) => {
    const id = channel.categoryId || `uncategorized:${channel.type}`;
    const fallbackName = channel.type === "voice" ? t.categoryVoiceChannels : t.categoryTextChannels;
    const existing = categories.get(id);
    if (existing) {
      existing.channels.push(channel);
      return;
    }

    categories.set(id, {
      id,
      name: channel.categoryName || fallbackName,
      channels: [channel]
    });
  });

  return Array.from(categories.values());
}

function loadCollapsedCategories() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const raw = window.localStorage.getItem("sori-app-collapsed-channel-categories");
    const values = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function saveCollapsedCategories(categories: Set<string>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem("sori-app-collapsed-channel-categories", JSON.stringify(Array.from(categories)));
}

function useDurationLabel(startedAt: number | null | undefined) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startedAt) {
      setNow(Date.now());
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  if (!startedAt) {
    return "00:00";
  }

  return formatDuration(Math.floor((now - startedAt) / 1000));
}

function formatTime(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString([], { day: "2-digit", month: "long", year: "numeric" });
}

function isSameMessageDay(a: string | number, b: string | number) {
  const left = new Date(a);
  const right = new Date(b);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return false;
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}
