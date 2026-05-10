import { AudioTrack, isTrackReference, LiveKitRoom, useLocalParticipant, useRemoteParticipants, useRoomContext, useTracks, VideoTrack } from "@livekit/components-react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { ConnectionState, ParticipantEvent, RoomEvent, Track } from "livekit-client";
import { ChevronDown, Headphones, Mic, MicOff, Monitor, Phone, PhoneOff, ScreenShare, StopCircle, Video, VideoOff, Waves } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildTelemetrySnapshot,
  collectReportMetrics,
  getParticipantAudioReport,
  getWorstConnectionQuality,
  type StatsBaselineMap,
} from "../lib/callTelemetry";
import { cn } from "../lib/cn";
import { useT } from "../lib/i18n";
import { ensureCameraAccess } from "../lib/mediaDevices";
import { useAuthStore } from "../stores/authStore";
import { useDirectCallStore } from "../stores/directCallStore";
import { useServerStore } from "../stores/serverStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useSocketStore } from "../stores/socketStore";
import { useVoiceStore } from "../stores/voiceStore";

type VoicePresentation = "hidden" | "voice-room" | "direct-call";
type ControlMenuAnchor = { left: number; right: number; top: number; bottom: number } | null;

interface VoiceSessionProps {
  presentation?: VoicePresentation;
  title?: string;
  startedAt?: number | null;
  onMinimize?: () => void;
}

export function VoiceSession(props: VoiceSessionProps) {
  const bootstrap = useServerStore((state) => state.bootstrap);
  const voiceToken = useVoiceStore((state) => state.livekitToken);
  const connectedChannelId = useVoiceStore((state) => state.connectedChannelId);
  const voiceStartedAt = useVoiceStore((state) => state.startedAt);
  const leaveChannel = useVoiceStore((state) => state.leaveChannel);
  const callToken = useDirectCallStore((state) => state.livekitToken);
  const callId = useDirectCallStore((state) => state.callId);
  const callStatus = useDirectCallStore((state) => state.status);
  const callStartedAt = useDirectCallStore((state) => state.startedAt);
  const callPartner = useDirectCallStore((state) => state.partner);
  const endCall = useDirectCallStore((state) => state.endCall);
  const socket = useSocketStore((state) => state.socket);
  const outputVolume = useSettingsStore((state) => state.outputVolume);
  const participantVolumes = useSettingsStore((state) => state.participantVolumes);
  const isDeafened = useVoiceStore((state) => state.isDeafened);
  const token = callStatus === "connected" && callToken ? callToken : voiceToken;
  const isDirectCall = callStatus === "connected" && Boolean(callToken);
  const presentation = props.presentation || "hidden";
  const visible = presentation !== "hidden";

  if (!bootstrap || !token || (!connectedChannelId && !isDirectCall)) {
    return null;
  }

  const title = props.title || (isDirectCall ? callPartner?.username || "Direct call" : "Voice channel");
  const startedAt = props.startedAt ?? (isDirectCall ? callStartedAt : voiceStartedAt);

  return (
    <LiveKitRoom
      audio
      video={false}
      token={token}
      serverUrl={bootstrap.endpoints.livekit}
      connect
      options={{ webAudioMix: true }}
      onDisconnected={() => {
        if (isDirectCall) {
          return;
        }
        // Keep the SORI voice state alive through transient LiveKit reconnects.
      }}
      onMediaDeviceFailure={(failure) => {
        toast.error(`Media device access failed: ${String(failure)}`);
      }}
      className={visible ? "flex min-h-0 flex-1" : "sr-only"}
    >
      <ParticipantAudioRenderer outputVolume={outputVolume} participantVolumes={participantVolumes} muted={Boolean(!isDirectCall && isDeafened)} />
      <CallTelemetryReporter socket={socket} callId={isDirectCall ? callId : null} channelId={isDirectCall ? null : connectedChannelId} />
      <VoicePresenceSync channelId={connectedChannelId} />
      <StreamingPresenceSync channelId={connectedChannelId} />
      {visible && (
        <DesktopVoiceRoom
          mode={presentation}
          title={title}
          startedAt={startedAt}
          channelId={connectedChannelId}
          onLeave={isDirectCall ? endCall : () => leaveChannel()}
          onMinimize={props.onMinimize}
        />
      )}
    </LiveKitRoom>
  );
}

const TELEMETRY_INTERVAL_MS = 10_000;

function CallTelemetryReporter(props: {
  socket: { emit: (event: string, payload: Record<string, unknown>) => void } | null;
  callId: string | null;
  channelId: string | null;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const baselinesRef = useRef<StatsBaselineMap>(new Map());
  const reconnectCountRef = useRef(0);
  const localParticipantRef = useRef(localParticipant);
  const remoteParticipantsRef = useRef(remoteParticipants);

  useEffect(() => {
    localParticipantRef.current = localParticipant;
  }, [localParticipant]);

  useEffect(() => {
    remoteParticipantsRef.current = remoteParticipants;
  }, [remoteParticipants]);

  useEffect(() => {
    const onReconnected = () => {
      reconnectCountRef.current += 1;
    };

    room.on(RoomEvent.Reconnected, onReconnected);
    return () => {
      room.off(RoomEvent.Reconnected, onReconnected);
    };
  }, [room]);

  useEffect(() => {
    if (!props.socket || (!props.callId && !props.channelId)) {
      return;
    }

    let cancelled = false;

    const sendTelemetry = async () => {
      if (cancelled || room.state !== ConnectionState.Connected) {
        return;
      }

      const currentLocalParticipant = localParticipantRef.current;
      const currentRemoteParticipants = remoteParticipantsRef.current;
      const metricReports = [];

      const localReport = await getParticipantAudioReport(currentLocalParticipant);
      if (localReport) {
        metricReports.push(collectReportMetrics(localReport, `local:${currentLocalParticipant.identity}`, baselinesRef.current));
      }

      const remoteReports = await Promise.all(
        currentRemoteParticipants.map(async (participant) => {
          const report = await getParticipantAudioReport(participant);
          if (!report) {
            return null;
          }

          return collectReportMetrics(report, `remote:${participant.identity}`, baselinesRef.current);
        }),
      );

      metricReports.push(...remoteReports.filter((report): report is NonNullable<typeof report> => Boolean(report)));

      const connectionQuality = getWorstConnectionQuality([
        currentLocalParticipant.connectionQuality,
        ...currentRemoteParticipants.map((participant) => participant.connectionQuality),
      ]);

      const snapshot = buildTelemetrySnapshot({
        metrics: metricReports,
        quality: connectionQuality,
        participantCount: currentRemoteParticipants.length + 1,
        reconnectCount: reconnectCountRef.current,
      });

      props.socket?.emit("call_telemetry_update", {
        callId: props.callId || undefined,
        channelId: props.channelId || undefined,
        ...snapshot,
      });
    };

    void sendTelemetry();
    const intervalId = window.setInterval(() => {
      void sendTelemetry();
    }, TELEMETRY_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [props.callId, props.channelId, props.socket, room]);

  return null;
}

function ParticipantAudioRenderer(props: { outputVolume: number; participantVolumes: Record<string, number>; muted: boolean }) {
  const tracks = useTracks([Track.Source.Microphone], { onlySubscribed: true });

  return (
    <>
      {tracks
        .filter((trackRef) => !trackRef.participant.isLocal)
        .map((trackRef) => {
          const participantVolume = props.participantVolumes[trackRef.participant.identity] ?? 100;
          const volume = props.muted ? 0 : (props.outputVolume / 100) * (participantVolume / 100);
          return (
            <AudioTrack
              key={`${trackRef.participant.identity}:${trackRef.publication.trackSid}`}
              trackRef={trackRef}
              volume={volume}
            />
          );
        })}
    </>
  );
}

function StreamingPresenceSync(props: { channelId: string | null }) {
  const socket = useSocketStore((state) => state.socket);
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (!socket || !props.channelId) return;

    const syncStreamingStatus = () => {
      const isStreaming = Array.from(localParticipant.trackPublications.values())
        .some((publication) => publication.source === Track.Source.ScreenShare);
      socket.emit("user_streaming_update", {
        channelId: props.channelId,
        isStreaming
      });
    };

    syncStreamingStatus();
    localParticipant.on(ParticipantEvent.TrackPublished, syncStreamingStatus);
    localParticipant.on(ParticipantEvent.TrackUnpublished, syncStreamingStatus);
    localParticipant.on(ParticipantEvent.LocalTrackPublished, syncStreamingStatus);
    localParticipant.on(ParticipantEvent.LocalTrackUnpublished, syncStreamingStatus);

    return () => {
      localParticipant.off(ParticipantEvent.TrackPublished, syncStreamingStatus);
      localParticipant.off(ParticipantEvent.TrackUnpublished, syncStreamingStatus);
      localParticipant.off(ParticipantEvent.LocalTrackPublished, syncStreamingStatus);
      localParticipant.off(ParticipantEvent.LocalTrackUnpublished, syncStreamingStatus);
      socket.emit("user_streaming_update", {
        channelId: props.channelId,
        isStreaming: false
      });
    };
  }, [localParticipant, props.channelId, socket]);

  return null;
}

function VoicePresenceSync(props: { channelId: string | null }) {
  const socket = useSocketStore((state) => state.socket);
  const updateOccupant = useVoiceStore((state) => state.updateOccupant);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { localParticipant } = useLocalParticipant();
  const lastSpeakingRef = useRef(false);
  const stopSpeakingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!socket || !props.channelId) return;
    const channelId = props.channelId;
    const occupantUserId = currentUserId || localParticipant.identity;

    const clearStopSpeakingTimeout = () => {
      if (stopSpeakingTimeoutRef.current) {
        window.clearTimeout(stopSpeakingTimeoutRef.current);
        stopSpeakingTimeoutRef.current = null;
      }
    };

    const syncSpeaking = (isSpeaking: boolean) => {
      if (isSpeaking === lastSpeakingRef.current) return;
      socket.emit("user_speaking_update", { channelId, isSpeaking });
      updateOccupant(channelId, occupantUserId, { isSpeaking });
      lastSpeakingRef.current = isSpeaking;
    };

    const handleSpeakingChange = (isSpeaking: boolean) => {
      if (isSpeaking) {
        clearStopSpeakingTimeout();
        syncSpeaking(true);
        return;
      }

      clearStopSpeakingTimeout();
      stopSpeakingTimeoutRef.current = window.setTimeout(() => {
        syncSpeaking(false);
        stopSpeakingTimeoutRef.current = null;
      }, 180);
    };

    handleSpeakingChange(localParticipant.isSpeaking);
    localParticipant.on(ParticipantEvent.IsSpeakingChanged, handleSpeakingChange);

    return () => {
      localParticipant.off(ParticipantEvent.IsSpeakingChanged, handleSpeakingChange);
      clearStopSpeakingTimeout();
    };
  }, [currentUserId, localParticipant, props.channelId, socket, updateOccupant]);

  useEffect(() => {
    if (!socket || !props.channelId) return;
    const channelId = props.channelId;
    const occupantUserId = currentUserId || localParticipant.identity;

    return () => {
      if (stopSpeakingTimeoutRef.current) {
        window.clearTimeout(stopSpeakingTimeoutRef.current);
        stopSpeakingTimeoutRef.current = null;
      }
      socket.emit("user_speaking_update", { channelId, isSpeaking: false });
      updateOccupant(channelId, occupantUserId, { isSpeaking: false });
      lastSpeakingRef.current = false;
    };
  }, [currentUserId, localParticipant.identity, props.channelId, socket, updateOccupant]);

  return null;
}

function DesktopVoiceRoom(props: {
  mode: VoicePresentation;
  title: string;
  startedAt?: number | null;
  channelId: string | null;
  onLeave: () => void;
  onMinimize?: () => void;
}) {
  const t = useT();
  const duration = useDurationLabel(props.startedAt);
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false }
  ], { onlySubscribed: false });
  const [focusedTrack, setFocusedTrack] = useState<TrackReferenceOrPlaceholder | null>(null);
  const [hideSelfCamera, setHideSelfCamera] = useState(false);
  const [page, setPage] = useState(0);
  const participants = useMemo(() => {
    let visibleTracks = tracks.filter((track) => track.source === Track.Source.Camera || track.source === Track.Source.ScreenShare);
    if (hideSelfCamera) {
      visibleTracks = visibleTracks.filter((track) => !(track.participant.isLocal && track.source === Track.Source.Camera));
    }
    return visibleTracks;
  }, [hideSelfCamera, tracks]);
  const pageSize = 9;
  const totalPages = Math.max(1, Math.ceil(participants.length / pageSize));
  const visibleTracks = participants.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  useEffect(() => {
    if (!focusedTrack) return;
    const stillExists = participants.some((track) => track.participant.identity === focusedTrack.participant.identity && track.source === focusedTrack.source);
    if (!stillExists) setFocusedTrack(null);
  }, [focusedTrack, participants]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-sori-surface-base">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-50 flex h-14 shrink-0 items-center justify-between border-b border-sori-border-subtle bg-sori-surface-main px-6">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-sori-border-accent bg-sori-surface-hover text-sori-accent-primary shadow-sm">
              <Phone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-black uppercase tracking-widest text-sori-text-strong">{props.title}</h2>
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-sori-text-muted">
                <span>{t.activeCall}</span>
                <span className="font-mono tabular-nums tracking-normal text-sori-accent-primary">{duration}</span>
              </p>
            </div>
          </div>
          {props.mode === "direct-call" && props.onMinimize && (
            <button type="button" className="rounded-xl border border-sori-border-subtle bg-sori-surface-hover px-4 py-2 text-xs font-black text-sori-text-muted transition hover:text-sori-text-strong" onClick={props.onMinimize}>
              {t.minimizeCall}
            </button>
          )}
        </header>

        <section className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-sori-surface-base">
          {focusedTrack ? (
            <div className="h-full w-full p-8">
              <div className="relative h-full w-full overflow-hidden rounded-[2rem] border border-sori-border-subtle bg-sori-surface-panel shadow-2xl">
                <ParticipantTile trackRef={focusedTrack} large />
                <button type="button" className="absolute right-5 top-5 rounded-xl bg-sori-surface-overlay px-4 py-2 text-xs font-black text-sori-text-strong" onClick={() => setFocusedTrack(null)}>
                  {t.minimizeCall}
                </button>
              </div>
            </div>
          ) : (
            <div className={cn("grid w-full justify-center gap-6 p-8 transition-all", gridClass(visibleTracks.length))}>
              {visibleTracks.map((track) => (
                <button
                  key={`${track.participant.identity}:${track.source}`}
                  type="button"
                  className="group relative aspect-video overflow-hidden rounded-[2rem] border border-sori-border-subtle bg-sori-surface-panel text-left shadow-2xl transition hover:border-sori-accent-primary"
                  onClick={() => track.source === Track.Source.ScreenShare && setFocusedTrack(track)}
                >
                  <ParticipantTile trackRef={track} />
                </button>
              ))}
            </div>
          )}

          {totalPages > 1 && !focusedTrack && (
            <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-sori-border-subtle bg-sori-surface-main px-5 py-3 shadow-2xl">
              <button type="button" disabled={page === 0} className="text-sori-text-muted disabled:opacity-30" onClick={() => setPage((value) => Math.max(0, value - 1))}>‹</button>
              <span className="text-[10px] font-black uppercase tracking-widest text-sori-text-muted">{page + 1} / {totalPages}</span>
              <button type="button" disabled={page === totalPages - 1} className="text-sori-text-muted disabled:opacity-30" onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}>›</button>
            </div>
          )}
        </section>

        <SessionControls mode={props.mode} hideSelfCamera={hideSelfCamera} setHideSelfCamera={setHideSelfCamera} onLeave={props.onLeave} />
      </div>
    </div>
  );
}

function ParticipantTile(props: { trackRef: TrackReferenceOrPlaceholder; large?: boolean }) {
  const t = useT();
  const participant = props.trackRef.participant;
  const isScreenShare = props.trackRef.source === Track.Source.ScreenShare;
  const isVideoEnabled = isScreenShare || participant.isCameraEnabled;
  const metadata = useMemo(() => {
    try {
      return participant.metadata ? JSON.parse(participant.metadata) as { avatar?: string } : {};
    } catch {
      return {};
    }
  }, [participant.metadata]);
  const avatarUrl = metadata.avatar;
  const name = participant.name || participant.identity;
  const initial = name[0]?.toUpperCase() || "?";

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-sori-surface-main">
      {isVideoEnabled && isTrackReference(props.trackRef) ? (
        <VideoTrack trackRef={props.trackRef} className={cn("h-full w-full", isScreenShare ? "object-contain" : "object-cover")} />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={cn(
            "relative grid place-items-center overflow-hidden rounded-full bg-sori-surface-accent-subtle font-black text-sori-accent-primary shadow-2xl transition-all duration-300",
            participant.isSpeaking ? "speaking-pulse" : "border border-sori-border-subtle",
            props.large ? "h-32 w-32 text-5xl" : "h-24 w-24 text-4xl"
          )}>
            {avatarUrl ? <img src={avatarUrl} alt={name} className="h-full w-full object-cover" /> : initial}
          </div>
          <div className="mt-4 h-1 w-12 rounded-full bg-sori-accent-primary" />
        </div>
      )}

      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-xl border border-sori-border-subtle bg-sori-surface-panel px-3 py-1.5 shadow-lg">
        <span className="text-[11px] font-black uppercase tracking-wide text-white">{name}</span>
        {participant.isLocal && <span className="rounded-md border border-sori-border-subtle bg-sori-surface-hover px-1.5 py-0.5 text-[8px] font-bold text-sori-text-strong">{t.you}</span>}
      </div>

      {!participant.isMicrophoneEnabled && (
        <div className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-xl bg-sori-accent-danger text-white shadow-lg">
          <MicOff className="h-4 w-4" />
        </div>
      )}

      {isScreenShare && (
        <div className="absolute right-3 bottom-3 flex items-center gap-2 rounded-lg border border-sori-border-accent bg-sori-surface-panel px-2 py-1 text-[9px] font-black uppercase tracking-widest text-sori-accent-danger">
          <Monitor className="h-3 w-3" />
          LIVE
        </div>
      )}
    </div>
  );
}

function SessionControls(props: { mode: VoicePresentation; hideSelfCamera: boolean; setHideSelfCamera: (value: boolean) => void; onLeave: () => void }) {
  const t = useT();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const isMuted = useVoiceStore((state) => state.isMuted);
  const isDeafened = useVoiceStore((state) => state.isDeafened);
  const toggleMute = useVoiceStore((state) => state.toggleMute);
  const toggleDeafen = useVoiceStore((state) => state.toggleDeafen);
  const noiseSuppression = useSettingsStore((state) => state.noiseSuppression);
  const activeMicId = useSettingsStore((state) => state.activeMicId);
  const activeOutputId = useSettingsStore((state) => state.activeOutputId);
  const activeCameraId = useSettingsStore((state) => state.activeCameraId);
  const micGain = useSettingsStore((state) => state.micGain);
  const outputVolume = useSettingsStore((state) => state.outputVolume);
  const setMediaSettings = useSettingsStore((state) => state.setMediaSettings);
  const isVoiceChannel = props.mode === "voice-room";
  const [audioMenuAnchor, setAudioMenuAnchor] = useState<ControlMenuAnchor>(null);
  const [cameraMenuAnchor, setCameraMenuAnchor] = useState<ControlMenuAnchor>(null);
  const [noiseMenuAnchor, setNoiseMenuAnchor] = useState<ControlMenuAnchor>(null);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    void localParticipant.setMicrophoneEnabled(!isMuted).catch(() => undefined);
  }, [isMuted, localParticipant]);

  const toggleMic = () => {
    toggleMute();
  };

  const muted = isMuted || !isMicrophoneEnabled;

  useEffect(() => {
    const close = () => {
      setAudioMenuAnchor(null);
      setCameraMenuAnchor(null);
      setNoiseMenuAnchor(null);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    if (!audioMenuAnchor && !cameraMenuAnchor) return;
    let cancelled = false;
    const refreshDevices = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setMicDevices(devices.filter((device) => device.kind === "audioinput"));
        setOutputDevices(devices.filter((device) => device.kind === "audiooutput"));
        setCameraDevices(devices.filter((device) => device.kind === "videoinput"));
      } catch {
        setMicDevices([]);
        setOutputDevices([]);
        setCameraDevices([]);
      }
    };
    void refreshDevices();
    return () => {
      cancelled = true;
    };
  }, [audioMenuAnchor, cameraMenuAnchor]);

  const toggleCamera = () => {
    const options = activeCameraId && activeCameraId !== "default" ? { deviceId: activeCameraId } : undefined;
    void (async () => {
      try {
        if (!isCameraEnabled) {
          await ensureCameraAccess();
        }
        await localParticipant.setCameraEnabled(!isCameraEnabled, options);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(message.includes("Permission denied") || message.includes("NotAllowedError")
          ? "Camera permission denied. Allow camera access for SORI App in system settings."
          : message
        );
      }
    })();
  };

  return (
    <div className="z-50 flex h-[4.5rem] w-full shrink-0 items-center justify-center gap-2 border-t border-sori-border-subtle bg-sori-surface-base px-6">
      <div className="flex items-center gap-0.5 rounded-xl border border-sori-border-subtle bg-sori-surface-panel p-1">
        <button type="button" className={controlButtonClass(muted, "danger")} onClick={toggleMic} title={t.mute}>
          {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        <button
          type="button"
          className="grid h-10 w-5 place-items-center text-sori-text-muted hover:text-sori-accent-primary"
          title={t.inputDevice}
          onClick={(event) => {
            event.stopPropagation();
            setAudioMenuAnchor((current) => current ? null : rectAnchor(event.currentTarget));
            setCameraMenuAnchor(null);
            setNoiseMenuAnchor(null);
          }}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 rounded-xl border border-sori-border-subtle bg-sori-surface-panel p-1">
        <button type="button" className={controlButtonClass(isCameraEnabled, "primary")} onClick={toggleCamera} title={t.camera}>
          {isCameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </button>
        <button
          type="button"
          className="grid h-10 w-5 place-items-center text-sori-text-muted hover:text-sori-accent-primary"
          title={t.videoDevice}
          onClick={(event) => {
            event.stopPropagation();
            setCameraMenuAnchor((current) => current ? null : rectAnchor(event.currentTarget));
            setAudioMenuAnchor(null);
            setNoiseMenuAnchor(null);
          }}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <button type="button" className={controlButtonClass(isScreenShareEnabled, "secondary")} onClick={() => void localParticipant.setScreenShareEnabled(!isScreenShareEnabled).catch(() => undefined)}>
        {isScreenShareEnabled ? <StopCircle className="h-5 w-5" /> : <ScreenShare className="h-5 w-5" />}
      </button>

      {isVoiceChannel && (
        <button type="button" className={controlButtonClass(isDeafened, "danger")} onClick={toggleDeafen} title={t.deafen}>
          <HeadphoneSlashIcon active={isDeafened} />
        </button>
      )}

      <button
        type="button"
        className={controlButtonClass(noiseSuppression, "primary")}
        onClick={(event) => {
          event.stopPropagation();
          setNoiseMenuAnchor((current) => current ? null : rectAnchor(event.currentTarget));
          setAudioMenuAnchor(null);
          setCameraMenuAnchor(null);
        }}
        title={t.noiseSuppression}
      >
        <Waves className="h-5 w-5" />
      </button>

      <button type="button" className="grid h-11 w-11 place-items-center rounded-xl bg-sori-accent-danger text-white shadow-lg transition hover:brightness-110 active:scale-95" onClick={props.onLeave} title={t.endCall}>
        <PhoneOff className="h-5 w-5" />
      </button>

      {audioMenuAnchor && (
        <AudioDeviceMenu
          anchor={audioMenuAnchor}
          micDevices={micDevices}
          outputDevices={outputDevices}
          activeMicId={activeMicId}
          activeOutputId={activeOutputId}
          micGain={micGain}
          outputVolume={outputVolume}
          onSelectMic={(deviceId) => setMediaSettings({ activeMicId: deviceId })}
          onSelectOutput={(deviceId) => setMediaSettings({ activeOutputId: deviceId })}
          onMicGain={(value) => setMediaSettings({ micGain: value })}
          onOutputVolume={(value) => setMediaSettings({ outputVolume: value })}
        />
      )}
      {cameraMenuAnchor && (
        <CameraDeviceMenu
          anchor={cameraMenuAnchor}
          devices={cameraDevices}
          activeCameraId={activeCameraId}
          hideSelfCamera={props.hideSelfCamera}
          onSelectCamera={(deviceId) => setMediaSettings({ activeCameraId: deviceId })}
          onToggleHideSelf={props.setHideSelfCamera}
        />
      )}
      {noiseMenuAnchor && (
        <NoiseSuppressionMenu
          anchor={noiseMenuAnchor}
          enabled={noiseSuppression}
          onToggle={(enabled) => setMediaSettings({ noiseSuppression: enabled })}
        />
      )}
    </div>
  );
}

function AudioDeviceMenu(props: {
  anchor: ControlMenuAnchor;
  micDevices: MediaDeviceInfo[];
  outputDevices: MediaDeviceInfo[];
  activeMicId: string;
  activeOutputId: string;
  micGain: number;
  outputVolume: number;
  onSelectMic: (deviceId: string) => void;
  onSelectOutput: (deviceId: string) => void;
  onMicGain: (value: number) => void;
  onOutputVolume: (value: number) => void;
}) {
  const t = useT();
  if (!props.anchor) return null;

  return (
    <div
      className="fixed z-[120] w-72 rounded-2xl border border-sori-border-subtle bg-sori-surface-panel p-4 shadow-2xl animate-in fade-in-0 zoom-in-95"
      style={floatingFromRect(props.anchor, 288)}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="space-y-4">
        <DeviceSection
          title={t.inputDevice}
          devices={props.micDevices}
          selectedId={props.activeMicId}
          fallback={t.microphone}
          empty={t.selectMicrophone}
          onSelect={props.onSelectMic}
        />
        <RangeSection title={t.inputVolume} value={props.micGain} max={100} onChange={props.onMicGain} accent="primary" />
        <div className="h-px bg-sori-border-strong" />
        <DeviceSection
          title={t.outputDevice}
          devices={props.outputDevices}
          selectedId={props.activeOutputId}
          fallback={t.speaker}
          empty={t.selectSpeaker}
          onSelect={props.onSelectOutput}
        />
        <RangeSection title={t.outputVolume} value={props.outputVolume} max={200} onChange={props.onOutputVolume} accent="secondary" />
      </div>
    </div>
  );
}

function CameraDeviceMenu(props: {
  anchor: ControlMenuAnchor;
  devices: MediaDeviceInfo[];
  activeCameraId: string;
  hideSelfCamera: boolean;
  onSelectCamera: (deviceId: string) => void;
  onToggleHideSelf: (value: boolean) => void;
}) {
  const t = useT();
  if (!props.anchor) return null;

  return (
    <div
      className="fixed z-[120] w-72 rounded-2xl border border-sori-border-subtle bg-sori-surface-panel p-4 shadow-2xl animate-in fade-in-0 zoom-in-95"
      style={floatingFromRect(props.anchor, 288)}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="space-y-4">
        <DeviceSection
          title={t.videoDevice}
          devices={props.devices}
          selectedId={props.activeCameraId}
          fallback={t.camera}
          empty={t.selectCamera}
          onSelect={props.onSelectCamera}
        />
        <div className="h-px bg-sori-border-strong" />
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 transition hover:bg-sori-surface-hover"
          onClick={() => props.onToggleHideSelf(!props.hideSelfCamera)}
        >
          <span className="text-left text-[10px] font-black uppercase tracking-widest text-sori-text-muted">{t.hideMyCamera}</span>
          <span className={cn(
            "relative h-5 w-9 rounded-full border transition",
            props.hideSelfCamera ? "border-sori-border-accent bg-sori-accent-primary" : "border-sori-border-subtle bg-sori-surface-elevated"
          )}>
            <span className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white transition",
              props.hideSelfCamera ? "left-4" : "left-0.5"
            )} />
          </span>
        </button>
      </div>
    </div>
  );
}

function NoiseSuppressionMenu(props: {
  anchor: ControlMenuAnchor;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useT();
  if (!props.anchor) return null;

  return (
    <div
      className="fixed z-[120] w-72 rounded-2xl border border-sori-border-subtle bg-sori-surface-panel p-4 shadow-2xl animate-in fade-in-0 zoom-in-95"
      style={floatingFromRect(props.anchor, 288)}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
          props.enabled ? "border-sori-border-accent bg-sori-surface-accent-subtle text-sori-accent-primary" : "border-sori-border-subtle bg-sori-surface-elevated text-sori-text-muted"
        )}>
          <Waves className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-black uppercase tracking-widest text-sori-text-strong">{t.noiseSuppression}</div>
          <p className="mt-1 text-[11px] leading-relaxed text-sori-text-muted">{t.noiseSuppressionDescription}</p>
        </div>
        <button
          type="button"
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full border transition",
            props.enabled ? "border-sori-border-accent bg-sori-accent-primary" : "border-sori-border-subtle bg-sori-surface-elevated"
          )}
          onClick={() => props.onToggle(!props.enabled)}
        >
          <span className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition",
            props.enabled ? "left-5" : "left-0.5"
          )} />
        </button>
      </div>
    </div>
  );
}

function DeviceSection(props: {
  title: string;
  devices: MediaDeviceInfo[];
  selectedId: string;
  fallback: string;
  empty: string;
  onSelect: (deviceId: string) => void;
}) {
  const options = props.devices.length
    ? props.devices.map((device, index) => ({
      id: device.deviceId || "default",
      key: `${device.deviceId || "default"}-${index}`,
      label: device.label || `${props.fallback} ${index + 1}`
    }))
    : [{ id: "default", key: "default", label: props.empty }];

  return (
    <div className="space-y-3">
      <p className="ml-1 text-[10px] font-black uppercase tracking-widest text-sori-text-muted">{props.title}</p>
      <div className="max-h-[120px] space-y-1 overflow-y-auto no-scrollbar">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            className={cn(
              "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[11px] transition-all",
              props.selectedId === option.id
                ? "bg-sori-surface-accent-subtle font-bold text-sori-accent-primary"
                : "text-sori-text-muted hover:bg-sori-surface-hover hover:text-sori-text-strong"
            )}
            onClick={() => props.onSelect(option.id)}
          >
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RangeSection(props: { title: string; value: number; max: number; accent: "primary" | "secondary"; onChange: (value: number) => void }) {
  return (
    <div className="pt-1">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className={cn("text-[10px] font-black uppercase tracking-widest", props.accent === "primary" ? "text-sori-accent-primary" : "text-sori-accent-secondary")}>{props.title}</p>
        <span className={cn("text-[11px] font-bold", props.accent === "primary" ? "text-sori-accent-primary" : "text-sori-accent-secondary")}>{props.value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={props.max}
        step={1}
        value={props.value}
        className="w-full accent-sori-accent-primary"
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </div>
  );
}

function HeadphoneSlashIcon(props: { active: boolean }) {
  return (
    <span className="relative grid h-5 w-5 place-items-center">
      <Headphones className="h-5 w-5" />
      {props.active && <span className="absolute left-1/2 top-1/2 h-[2px] w-6 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-current" />}
    </span>
  );
}

function controlButtonClass(active: boolean, variant: "primary" | "secondary" | "danger") {
  return cn(
    "grid h-10 w-10 place-items-center rounded-lg transition-all",
    active && variant === "primary" && "bg-sori-accent-primary text-black shadow-lg",
    active && variant === "secondary" && "bg-sori-accent-secondary text-black shadow-lg",
    active && variant === "danger" && "bg-sori-accent-danger text-white shadow-lg",
    !active && "bg-sori-surface-panel text-sori-text-muted hover:bg-sori-surface-hover hover:text-sori-text-strong"
  );
}

function rectAnchor(node: HTMLElement): Exclude<ControlMenuAnchor, null> {
  const rect = node.getBoundingClientRect();
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom
  };
}

function floatingFromRect(rect: Exclude<ControlMenuAnchor, null>, width: number) {
  const margin = 12;
  const gap = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const centerX = (rect.left + rect.right) / 2;
  const centerY = (rect.top + rect.bottom) / 2;
  const openRight = centerX < viewportWidth / 2;
  const openDown = centerY < viewportHeight / 2;
  const horizontal = openRight
    ? { left: clamp(rect.left, margin, viewportWidth - width - margin) }
    : { right: clamp(viewportWidth - rect.right, margin, viewportWidth - width - margin) };

  return openDown
    ? { ...horizontal, top: rect.bottom + gap, maxHeight: viewportHeight - rect.bottom - gap - margin }
    : { ...horizontal, bottom: viewportHeight - rect.top + gap, maxHeight: rect.top - gap - margin };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function gridClass(count: number) {
  if (count <= 1) return "grid-cols-1 max-w-4xl";
  if (count <= 4) return "grid-cols-2 max-w-6xl";
  return "grid-cols-3 max-w-7xl";
}

function useDurationLabel(startedAt: number | null | undefined) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  if (!startedAt) return "00:00";
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mins = Math.floor(total / 60).toString().padStart(2, "0");
  const secs = (total % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}
