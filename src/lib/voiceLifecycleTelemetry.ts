import { getDesktopClientSignal } from "./clientInfo";

type TelemetrySocket = {
  connected?: boolean;
  emit: (event: string, payload: Record<string, unknown>) => void;
};

export type VoiceLifecycleEvent = {
  event: string;
  reason?: string | null;
  severity?: "debug" | "info" | "warn" | "error";
  channelId?: string | null;
  callId?: string | null;
  voiceSessionId?: string | null;
  details?: Record<string, unknown> | null;
};

const localDedupe = new Map<string, number>();
const LOCAL_DEDUPE_MS = 5000;

export function emitClientSignal(socket: TelemetrySocket | null | undefined) {
  if (!socket?.connected) {
    return;
  }

  socket.emit("client_signal", getDesktopClientSignal());
}

export function emitVoiceLifecycle(socket: TelemetrySocket | null | undefined, event: VoiceLifecycleEvent) {
  if (!socket?.connected) {
    return;
  }

  const key = [
    event.event,
    event.reason || "",
    event.channelId || "",
    event.callId || "",
    event.voiceSessionId || "",
  ].join("|");
  const now = Date.now();
  const lastSentAt = localDedupe.get(key) || 0;
  if (now - lastSentAt < LOCAL_DEDUPE_MS) {
    return;
  }

  localDedupe.set(key, now);
  if (localDedupe.size > 200) {
    const cutoff = now - 60_000;
    for (const [entryKey, sentAt] of localDedupe.entries()) {
      if (sentAt < cutoff) {
        localDedupe.delete(entryKey);
      }
    }
  }

  socket.emit("voice_lifecycle_event", {
    severity: "info",
    ...event,
    client: getDesktopClientSignal(),
  });
}
