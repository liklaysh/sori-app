import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { toast } from "sonner";
import { useDirectCallStore } from "../stores/directCallStore";
import { useServerStore } from "../stores/serverStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useVoiceStore } from "../stores/voiceStore";

export function VoiceSession() {
  const bootstrap = useServerStore((state) => state.bootstrap);
  const voiceToken = useVoiceStore((state) => state.livekitToken);
  const connectedChannelId = useVoiceStore((state) => state.connectedChannelId);
  const leaveChannel = useVoiceStore((state) => state.leaveChannel);
  const callToken = useDirectCallStore((state) => state.livekitToken);
  const callStatus = useDirectCallStore((state) => state.status);
  const endCall = useDirectCallStore((state) => state.endCall);
  const outputVolume = useSettingsStore((state) => state.outputVolume);
  const token = callStatus === "connected" && callToken ? callToken : voiceToken;
  const isDirectCall = callStatus === "connected" && Boolean(callToken);

  if (!bootstrap || !token || (!connectedChannelId && !isDirectCall)) {
    return null;
  }

  return (
    <LiveKitRoom
      audio
      video={false}
      token={token}
      serverUrl={bootstrap.endpoints.livekit}
      connect
      options={{ webAudioMix: true }}
      onDisconnected={isDirectCall ? endCall : () => leaveChannel({ silent: true })}
      onMediaDeviceFailure={(failure) => {
        toast.error(`Media device access failed: ${String(failure)}`);
      }}
      className="sr-only"
    >
      <RoomAudioRenderer volume={outputVolume / 100} />
    </LiveKitRoom>
  );
}
