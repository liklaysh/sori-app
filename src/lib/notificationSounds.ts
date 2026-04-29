import { useSettingsStore, type NotificationSettingKey } from "../stores/settingsStore";

export type NotificationSoundEvent = "voiceJoin" | "voiceLeave" | "newMessage" | "directCall";

const SOUND_PATHS: Record<NotificationSoundEvent, string> = {
  voiceJoin: "/sounds/notifications/voice-join.mp3",
  voiceLeave: "/sounds/notifications/voice-leave.mp3",
  newMessage: "/sounds/notifications/message-new.mp3",
  directCall: "/sounds/notifications/call-direct.mp3"
};

const SETTING_BY_EVENT: Record<NotificationSoundEvent, NotificationSettingKey> = {
  voiceJoin: "voiceJoinSound",
  voiceLeave: "voiceLeaveSound",
  newMessage: "newMessageSound",
  directCall: "directCallSound"
};

const audioCache = new Map<NotificationSoundEvent, HTMLAudioElement>();
const loopingEvents = new Set<NotificationSoundEvent>();

function getAudio(event: NotificationSoundEvent) {
  if (typeof Audio === "undefined") {
    return null;
  }

  const cached = audioCache.get(event);
  if (cached) {
    return cached;
  }

  const audio = new Audio(SOUND_PATHS[event]);
  audio.preload = "auto";
  audio.volume = event === "directCall" ? 0.9 : 0.85;
  audioCache.set(event, audio);
  return audio;
}

function isEnabled(event: NotificationSoundEvent) {
  return Boolean(useSettingsStore.getState()[SETTING_BY_EVENT[event]]);
}

export function preloadNotificationSounds() {
  (Object.keys(SOUND_PATHS) as NotificationSoundEvent[]).forEach((event) => {
    getAudio(event)?.load();
  });
}

export function playNotificationSound(event: NotificationSoundEvent) {
  if (!isEnabled(event)) {
    return;
  }

  const audio = getAudio(event);
  if (!audio) {
    return;
  }

  audio.loop = false;
  audio.currentTime = 0;
  void audio.play().catch(() => {
    // Optional browser/WebView audio can be blocked until a user gesture.
  });
}

export function startNotificationSoundLoop(event: NotificationSoundEvent) {
  if (!isEnabled(event)) {
    return;
  }

  const audio = getAudio(event);
  if (!audio) {
    return;
  }

  loopingEvents.add(event);
  audio.loop = true;
  audio.currentTime = 0;
  void audio.play().catch(() => {
    loopingEvents.delete(event);
  });
}

export function stopNotificationSoundLoop(event: NotificationSoundEvent) {
  loopingEvents.delete(event);

  const audio = getAudio(event);
  if (!audio) {
    return;
  }

  audio.loop = false;
  audio.pause();
  audio.currentTime = 0;
}

export function stopAllNotificationSoundLoops() {
  loopingEvents.forEach((event) => stopNotificationSoundLoop(event));
}
