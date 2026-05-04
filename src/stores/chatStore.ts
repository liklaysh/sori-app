import { create } from "zustand";
import { toast } from "sonner";
import type { Attachment, Channel, ChatItem, Community, DMConversation, Member, Message, SoriUser } from "../types/sori";
import { apiRequest } from "../lib/api";
import { useAuthStore } from "./authStore";
import { useServerStore } from "./serverStore";
import { useSocketStore } from "./socketStore";

type ChatMode = "channel" | "dm";

interface ChatState {
  communities: Community[];
  channels: Channel[];
  members: Member[];
  conversations: DMConversation[];
  messagesByContext: Record<string, ChatItem[]>;
  activeMode: ChatMode;
  activeChannelId: string | null;
  activeConversationId: string | null;
  typingUsers: Record<string, string>;
  loading: boolean;
  sending: boolean;
  loadInitialData: () => Promise<void>;
  selectChannel: (channelId: string) => Promise<void>;
  selectConversation: (conversationId: string) => Promise<void>;
  sendActiveMessage: (content: string, attachments?: Attachment[]) => Promise<void>;
  addIncomingMessage: (message: Message) => void;
  addCallLog: (log: ChatItem) => void;
  upsertConversation: (conversation: DMConversation) => void;
  startConversation: (targetUserId: string) => Promise<DMConversation | null>;
  setTyping: (channelId: string, username: string | null) => void;
  updateUserReferences: (user: { id: string; username?: string | null; avatarUrl?: string | null; status?: Member["status"] | null }) => void;
}

function channelContext(channelId: string) {
  return `channel:${channelId}`;
}

function conversationContext(conversationId: string) {
  return `conversation:${conversationId}`;
}

function normalizeConversation(conversation: DMConversation): DMConversation {
  return {
    ...conversation,
    unreadCount: Math.max(Number(conversation.unreadCount || 0), 0)
  };
}

function mergeMessage(existing: ChatItem[], message: ChatItem) {
  if (existing.some((item) => item.id === message.id)) {
    return existing;
  }

  return [...existing, message];
}

export const useChatStore = create<ChatState>((set, get) => ({
  communities: [],
  channels: [],
  members: [],
  conversations: [],
  messagesByContext: {},
  activeMode: "channel",
  activeChannelId: null,
  activeConversationId: null,
  typingUsers: {},
  loading: false,
  sending: false,

  loadInitialData: async () => {
    const bootstrap = useServerStore.getState().bootstrap;
    if (!bootstrap) {
      return;
    }

    set({ loading: true });
    try {
      const communityId = bootstrap.server.defaultCommunityId;
      const [communities, channels, members, conversations] = await Promise.all([
        apiRequest<Community[]>("/communities"),
        apiRequest<Channel[]>(`/communities/${communityId}/channels`),
        apiRequest<Member[]>(`/communities/${communityId}/members`),
        apiRequest<DMConversation[]>("/dm/conversations")
      ]);

      const firstTextChannel = channels.find((channel) => channel.type === "text");
      set({
        communities,
        channels,
        members,
        conversations: conversations.map(normalizeConversation),
        activeChannelId: get().activeChannelId || firstTextChannel?.id || null,
        loading: false
      });

      const activeChannelId = get().activeChannelId;
      if (activeChannelId) {
        await get().selectChannel(activeChannelId);
      }
    } catch (error) {
      set({ loading: false });
      toast.error(error instanceof Error ? error.message : "Failed to load SORI data.");
    }
  },

  selectChannel: async (channelId) => {
    const socket = useSocketStore.getState().socket;
    const channel = get().channels.find((item) => item.id === channelId) || null;
    if (channel?.type === "text") {
      socket?.emit("join_channel", channelId);
    }
    set({ activeMode: "channel", activeChannelId: channelId, activeConversationId: null });

    if (channel?.type === "voice") {
      return;
    }

    const context = channelContext(channelId);
    if (get().messagesByContext[context]) {
      return;
    }

    try {
      const messages = await apiRequest<ChatItem[]>(`/channels/${channelId}/messages`);
      set((state) => ({
        messagesByContext: {
          ...state.messagesByContext,
          [context]: messages
        }
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load channel messages.");
    }
  },

  selectConversation: async (conversationId) => {
    set({ activeMode: "dm", activeConversationId: conversationId, activeChannelId: null });

    const context = conversationContext(conversationId);
    if (!get().messagesByContext[context]) {
      try {
        const messages = await apiRequest<ChatItem[]>(`/dm/conversations/${conversationId}/messages`);
        set((state) => ({
          messagesByContext: {
            ...state.messagesByContext,
            [context]: messages
          }
        }));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load direct messages.");
      }
    }

    apiRequest(`/dm/conversations/${conversationId}/read`, { method: "POST" }).catch(() => undefined);
    set((state) => ({
      conversations: state.conversations.map((conversation) => (
        conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation
      ))
    }));
  },

  sendActiveMessage: async (content, attachments = []) => {
    const trimmed = content.trim();
    if ((!trimmed && attachments.length === 0) || get().sending) {
      return;
    }

    set({ sending: true });
    try {
      const { activeMode, activeChannelId, activeConversationId } = get();
      if (activeMode === "channel" && activeChannelId) {
        const message = await apiRequest<Message>(`/channels/${activeChannelId}/messages`, {
          method: "POST",
          body: JSON.stringify({ content: trimmed, attachments })
        });
        get().addIncomingMessage(message);
      } else if (activeMode === "dm" && activeConversationId) {
        const message = await apiRequest<Message>(`/dm/conversations/${activeConversationId}/messages`, {
          method: "POST",
          body: JSON.stringify({ content: trimmed, attachments })
        });
        get().addIncomingMessage(message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send message.");
    } finally {
      set({ sending: false });
    }
  },

  addIncomingMessage: (message) => set((state) => {
    const context = message.channelId
      ? channelContext(message.channelId)
      : message.conversationId
        ? conversationContext(message.conversationId)
        : null;

    if (!context) {
      return state;
    }

    const userId = useAuthStore.getState().user?.id;
    const isOwnMessage = message.authorId === userId;
    const isOpenConversation = state.activeMode === "dm" && state.activeConversationId === message.conversationId;

    return {
      messagesByContext: {
        ...state.messagesByContext,
        [context]: mergeMessage(state.messagesByContext[context] || [], message)
      },
      conversations: message.conversationId
        ? state.conversations.map((conversation) => {
          if (conversation.id !== message.conversationId) {
            return conversation;
          }
          return {
            ...conversation,
            lastMessage: message.content,
            unreadCount: !isOwnMessage && !isOpenConversation
              ? Number(conversation.unreadCount || 0) + 1
              : conversation.unreadCount || 0
          };
        })
        : state.conversations
    };
  }),

  addCallLog: (log) => set((state) => {
    const conversationId = (log as { conversationId?: string }).conversationId;
    if (!conversationId) {
      return state;
    }

    const context = conversationContext(conversationId);
    return {
      messagesByContext: {
        ...state.messagesByContext,
        [context]: mergeMessage(state.messagesByContext[context] || [], log)
      },
      conversations: state.conversations.map((conversation) => (
        conversation.id === conversationId
          ? { ...conversation, unreadCount: Number(conversation.unreadCount || 0) + 1 }
          : conversation
      ))
    };
  }),

  upsertConversation: (conversation) => set((state) => {
    const normalized = normalizeConversation(conversation);
    const exists = state.conversations.some((item) => item.id === normalized.id);
    return {
      conversations: exists
        ? state.conversations.map((item) => item.id === normalized.id ? { ...item, ...normalized } : item)
        : [normalized, ...state.conversations]
    };
  }),

  startConversation: async (targetUserId) => {
    const currentUserId = useAuthStore.getState().user?.id;
    if (!targetUserId || targetUserId === currentUserId) {
      return null;
    }

    try {
      const conversation = await apiRequest<DMConversation>("/dm/conversations", {
        method: "POST",
        body: JSON.stringify({ targetUserId })
      });
      get().upsertConversation(conversation);
      return normalizeConversation(conversation);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start direct message.");
      return null;
    }
  },

  setTyping: (channelId, username) => set((state) => {
    const next = { ...state.typingUsers };
    if (username) {
      next[channelId] = username;
    } else {
      delete next[channelId];
    }
    return { typingUsers: next };
  }),

  updateUserReferences: (user) => set((state) => {
    const patchUser = <T extends SoriUser | Member | null | undefined>(candidate: T): T => {
      if (!candidate || candidate.id !== user.id) {
        return candidate;
      }

      return {
        ...candidate,
        ...(user.username !== undefined && user.username !== null ? { username: user.username } : {}),
        ...(user.avatarUrl !== undefined ? { avatarUrl: user.avatarUrl } : {}),
        ...(user.status !== undefined && user.status !== null && "status" in candidate ? { status: user.status } : {}),
      };
    };

    const patchMessage = (item: ChatItem): ChatItem => {
      if (item.type === "system_call") {
        return item;
      }

      const message = item as Message;
      return {
        ...message,
        ...(message.authorId === user.id && user.username ? { username: user.username } : {}),
        author: patchUser(message.author),
      };
    };

    return {
      members: state.members.map((member) => member.id === user.id ? patchUser(member)! : member),
      conversations: state.conversations.map((conversation) => ({
        ...conversation,
        user1: patchUser(conversation.user1),
        user2: patchUser(conversation.user2),
      })),
      messagesByContext: Object.fromEntries(
        Object.entries(state.messagesByContext).map(([contextKey, messages]) => [
          contextKey,
          messages.map(patchMessage),
        ]),
      ),
    };
  })
}));

export const chatContext = {
  channel: channelContext,
  conversation: conversationContext
};
