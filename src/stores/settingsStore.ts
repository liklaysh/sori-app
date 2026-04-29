import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppLanguage = "en" | "ru";

function detectLanguage(): AppLanguage {
  const language = navigator.language.toLowerCase();
  return language.startsWith("ru") ? "ru" : "en";
}

interface SettingsState {
  language: AppLanguage;
  micGain: number;
  outputVolume: number;
  noiseSuppression: boolean;
  activeMicId: string;
  activeOutputId: string;
  channelMessagePopups: boolean;
  directMessagePopups: boolean;
  voiceJoinSound: boolean;
  voiceLeaveSound: boolean;
  newMessageSound: boolean;
  directCallSound: boolean;
  setLanguage: (language: AppLanguage) => void;
  setNotificationSetting: (key: NotificationSettingKey, enabled: boolean) => void;
  setNotificationSettings: (settings: Partial<NotificationSettings>) => void;
  setMediaSettings: (settings: Partial<MediaSettings>) => void;
}

export interface NotificationSettings {
  channelMessagePopups: boolean;
  directMessagePopups: boolean;
  voiceJoinSound: boolean;
  voiceLeaveSound: boolean;
  newMessageSound: boolean;
  directCallSound: boolean;
}

export type NotificationSettingKey = keyof NotificationSettings;

export interface MediaSettings {
  micGain: number;
  outputVolume: number;
  noiseSuppression: boolean;
  activeMicId: string;
  activeOutputId: string;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: detectLanguage(),
      micGain: 100,
      outputVolume: 100,
      noiseSuppression: false,
      activeMicId: "default",
      activeOutputId: "default",
      channelMessagePopups: true,
      directMessagePopups: true,
      voiceJoinSound: true,
      voiceLeaveSound: true,
      newMessageSound: true,
      directCallSound: true,
      setLanguage: (language) => set({ language }),
      setNotificationSetting: (key, enabled) => set({ [key]: enabled }),
      setNotificationSettings: (settings) => set(settings),
      setMediaSettings: (settings) => set(settings)
    }),
    { name: "sori-app-settings" }
  )
);
