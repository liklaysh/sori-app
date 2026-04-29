export interface ClientBootstrapPayload {
  version: 1;
  server: {
    name: string;
    installMode: "single-community";
    defaultCommunityId: string;
  };
  endpoints: {
    web: string;
    api: string;
    ws: string;
    livekit: string;
    media: string;
    health: string;
  };
  auth: {
    mode: "cookie";
    loginPath: string;
    mePath: string;
    refreshPath: string;
    logoutPath: string;
  };
  realtime: {
    socketPath: string;
    transports: ["websocket"];
  };
  upload: {
    maxUploadSizeMb: number;
  };
  features: {
    directMessages: boolean;
    directCalls: boolean;
    voiceChannels: boolean;
    mediaUploads: boolean;
    multiCommunity: boolean;
  };
  generatedAt: string;
}

export interface SoriUser {
  id: string;
  username: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
  noiseSuppression?: boolean;
  micGain?: number;
  outputVolume?: number;
}

export interface Community {
  id: string;
  name: string;
  iconUrl?: string | null;
}

export interface Channel {
  id: string;
  name: string;
  type: "text" | "voice";
  communityId: string;
  categoryId?: string | null;
  categoryName?: string | null;
}

export interface Member {
  id: string;
  username: string;
  avatarUrl?: string | null;
  status?: "online" | "offline" | "idle" | "dnd";
  role?: string;
}

export interface VoiceOccupant {
  userId: string;
  username: string;
  avatarUrl?: string | null;
  joinedAt: number;
  isSpeaking?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;
}

export interface Attachment {
  fileUrl: string;
  fileName: string;
  fileSize?: number | null;
  fileType?: string | null;
}

export interface Message {
  id: string;
  content: string;
  authorId: string;
  username?: string;
  author?: SoriUser | null;
  channelId?: string | null;
  conversationId?: string | null;
  createdAt: number | string;
  isEdited?: boolean;
  isDeleted?: boolean;
  attachments?: Attachment[] | null;
  attachment?: Attachment | null;
  type?: string;
  requestId?: string;
}

export interface CallLog {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  status: "accepted" | "ended" | "missed" | "rejected" | "timeout" | "error";
  duration?: number | null;
  createdAt: number | string;
  type: "system_call";
}

export type ChatItem = Message | CallLog;

export interface DMConversation {
  id: string;
  user1Id: string;
  user2Id: string;
  user1?: SoriUser | null;
  user2?: SoriUser | null;
  messages?: Message[];
  lastMessage?: string | null;
  updatedAt: number | string;
  unreadCount?: number;
}

export interface SystemVersionPayload {
  name: "SORI";
  version: string;
  apiVersion: "v1";
  buildId: string;
  commit: string;
  environment: "production" | "development";
}
