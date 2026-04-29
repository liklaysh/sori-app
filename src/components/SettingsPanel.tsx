import { ChangeEvent, useEffect, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { Bell, Camera, Check, Loader2, Mail, Menu, Settings2, Shield, Upload, User, Volume2, Waves, X } from "lucide-react";
import { toast } from "sonner";
import { VersionLine } from "./VersionLine";
import { useAuthStore } from "../stores/authStore";
import { useServerStore } from "../stores/serverStore";
import { useSettingsStore, type AppLanguage, type NotificationSettingKey } from "../stores/settingsStore";
import { apiRequest } from "../lib/api";
import { cn } from "../lib/cn";
import { useT } from "../lib/i18n";
import { uploadAttachment } from "../lib/upload";
import type { SoriUser } from "../types/sori";

type SettingsTab = "profile" | "equipment" | "notifications";

export function SettingsPanel(props: { open: boolean; onClose: () => void }) {
  const t = useT();
  const user = useAuthStore((state) => state.user);
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [navOpen, setNavOpen] = useState(false);

  if (!props.open || !user) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-black/70">
      <div className="flex h-full w-full flex-col overflow-hidden bg-sori-bg md:flex-row">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-sori-border bg-sori-panel px-5 md:hidden">
          <button type="button" className="inline-flex items-center gap-3 text-xs font-black uppercase tracking-widest" onClick={() => setNavOpen(true)}>
            <Menu className="h-5 w-5 text-sori-primary" />
            {tabLabel(activeTab, t)}
          </button>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-xl bg-sori-elevated text-sori-muted" onClick={props.onClose}>
            <X className="h-5 w-5" />
          </button>
        </header>

        <aside className={cn(
          "fixed inset-y-0 left-0 z-20 flex w-72 flex-col border-r border-sori-border bg-sori-panel p-6 transition-transform md:relative md:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="mb-8 flex items-center justify-between md:hidden">
            <h2 className="text-sm font-black uppercase tracking-widest">{t.settings}</h2>
            <button type="button" onClick={() => setNavOpen(false)}>
              <X className="h-5 w-5 text-sori-muted" />
            </button>
          </div>

          <div className="mb-6 ml-3 text-[10px] font-black uppercase tracking-[0.2em] text-sori-muted">
            {t.userSettings}
          </div>
          <nav className="space-y-1">
            <TabButton icon="profile" label={t.profile} active={activeTab === "profile"} onClick={() => { setActiveTab("profile"); setNavOpen(false); }} />
            <TabButton icon="equipment" label={t.equipment} active={activeTab === "equipment"} onClick={() => { setActiveTab("equipment"); setNavOpen(false); }} />
            <TabButton icon="notifications" label={t.notifications} active={activeTab === "notifications"} onClick={() => { setActiveTab("notifications"); setNavOpen(false); }} />
          </nav>

          <div className="mt-auto border-t border-sori-border pt-6">
            <LanguageSelector />
            <div className="mt-5">
              <VersionLine />
            </div>
          </div>
        </aside>

        {navOpen && <button type="button" aria-label="Close settings navigation" className="fixed inset-0 z-10 bg-black/50 md:hidden" onClick={() => setNavOpen(false)} />}

        <main className="relative min-w-0 flex-1 overflow-y-auto px-6 py-8 md:px-12 md:py-14">
          <button
            type="button"
            className="absolute right-8 top-8 hidden h-10 w-10 place-items-center rounded-full border border-sori-border text-sori-muted transition hover:bg-sori-elevated hover:text-sori-text md:grid"
            onClick={props.onClose}
          >
            <X className="h-5 w-5" />
          </button>

          <div className="mx-auto w-full max-w-3xl pb-12">
            {activeTab === "profile" ? <ProfileTab user={user} /> : activeTab === "equipment" ? <EquipmentTab user={user} /> : <NotificationsTab />}
          </div>
        </main>
      </div>
    </div>
  );
}

function tabLabel(tab: SettingsTab, t: ReturnType<typeof useT>) {
  if (tab === "profile") return t.profile;
  if (tab === "equipment") return t.equipment;
  return t.notifications;
}

function TabButton(props: { icon: SettingsTab; label: string; active: boolean; onClick: () => void }) {
  const Icon = props.icon === "profile" ? User : props.icon === "equipment" ? Settings2 : Bell;
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black uppercase tracking-tight transition",
        props.active ? "bg-sori-primary text-white shadow-glow" : "text-sori-muted hover:bg-sori-hover hover:text-sori-text"
      )}
      onClick={props.onClick}
    >
      <Icon className="h-5 w-5" />
      {props.label}
    </button>
  );
}

function LanguageSelector() {
  const t = useT();
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  return (
    <div>
      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-sori-muted">
        {t.language}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["en", "ru"] as AppLanguage[]).map((item) => (
          <button
            key={item}
            type="button"
            className={cn(
              "rounded-lg border px-4 py-3 text-sm font-black uppercase transition",
              language === item
                ? "border-sori-primary bg-sori-primary text-white"
                : "border-sori-border bg-sori-elevated text-sori-muted hover:text-sori-text"
            )}
            onClick={() => setLanguage(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProfileTab(props: { user: SoriUser }) {
  const t = useT();
  const setUser = useAuthStore((state) => state.setUser);
  const bootstrap = useServerStore((state) => state.bootstrap);
  const [username, setUsername] = useState(props.user.username);
  const [email, setEmail] = useState(props.user.email || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUsername(props.user.username);
    setEmail(props.user.email || "");
  }, [props.user.email, props.user.username]);

  const updateUser = async (patch: Partial<SoriUser>, successMessage: string) => {
    setSaving(true);
    try {
      const updated = await apiRequest<SoriUser>("/users/me", {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      setUser(updated);
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.updateFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    const maxUploadSizeMb = bootstrap?.upload.maxUploadSizeMb || 25;
    if (file.size > maxUploadSizeMb * 1024 * 1024) {
      toast.error(t.fileTooLarge.replace("{size}", String(maxUploadSizeMb)));
      return;
    }

    setUploading(true);
    try {
      const attachment = await uploadAttachment(file);
      const updated = await apiRequest<SoriUser>("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ avatarUrl: attachment.fileUrl })
      });
      setUser(updated);
      toast.success(t.avatarUpdated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.avatarFailed);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <SectionHeader title={t.myAccount} description={t.manageIdentity} />

      <section className="relative overflow-hidden rounded-[2rem] border border-sori-border bg-sori-panel p-6 md:p-8">
        <User className="absolute right-6 top-6 h-36 w-36 text-white opacity-[0.03]" />
        <div className="relative z-10 flex flex-col gap-8 sm:flex-row sm:items-center">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
          <button
            type="button"
            className="group relative h-32 w-32 shrink-0 overflow-hidden rounded-[2rem] border border-sori-border bg-sori-elevated text-5xl font-black text-sori-secondary transition active:scale-95"
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mx-auto h-10 w-10 animate-spin" />
            ) : props.user.avatarUrl ? (
              <img src={props.user.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              props.user.username[0]?.toUpperCase()
            )}
            <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition group-hover:opacity-100">
              <Upload className="h-7 w-7 text-white" />
            </span>
          </button>

          <div className="min-w-0 flex-1 space-y-6">
            <div className="grid gap-5 md:grid-cols-2">
              <IdentityField icon="shield" label={t.username} value={props.user.username} />
              <IdentityField icon="mail" label={t.email} value={props.user.email || t.notSpecified} />
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <input className="rounded-xl border border-sori-border bg-sori-bg px-4 py-3 text-sm font-bold outline-none focus:border-sori-primary" value={username} onChange={(event) => setUsername(event.target.value)} placeholder={t.newUsername} />
              <input className="rounded-xl border border-sori-border bg-sori-bg px-4 py-3 text-sm font-bold outline-none focus:border-sori-secondary" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t.emailAddress} />
              <button
                type="button"
                disabled={saving || (!username.trim() && !email.trim())}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sori-primary px-5 py-3 text-xs font-black text-white shadow-glow transition disabled:opacity-50"
                onClick={() => updateUser({ username: username.trim(), email: email.trim() }, t.profileUpdated)}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {t.saveChanges}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function IdentityField(props: { icon: "shield" | "mail"; label: string; value: string }) {
  const Icon = props.icon === "shield" ? Shield : Mail;
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-sori-muted">
        <Icon className="h-3.5 w-3.5 text-sori-secondary" />
        {props.label}
      </div>
      <div className="truncate text-lg font-black text-sori-text">{props.value}</div>
    </div>
  );
}

function EquipmentTab(props: { user: SoriUser }) {
  const t = useT();
  const setUser = useAuthStore((state) => state.setUser);
  const micGain = useSettingsStore((state) => state.micGain);
  const outputVolume = useSettingsStore((state) => state.outputVolume);
  const noiseSuppression = useSettingsStore((state) => state.noiseSuppression);
  const activeMicId = useSettingsStore((state) => state.activeMicId);
  const activeOutputId = useSettingsStore((state) => state.activeOutputId);
  const setMediaSettings = useSettingsStore((state) => state.setMediaSettings);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [testing, setTesting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setMediaSettings({
      micGain: props.user.micGain ?? micGain,
      outputVolume: props.user.outputVolume ?? outputVolume,
      noiseSuppression: !!props.user.noiseSuppression
    });
  }, [props.user.id]);

  useEffect(() => {
    void navigator.mediaDevices?.enumerateDevices().then((devices) => {
      setMicDevices(devices.filter((device) => device.kind === "audioinput"));
      setOutputDevices(devices.filter((device) => device.kind === "audiooutput"));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(async () => {
      try {
        const updated = await apiRequest<SoriUser>("/users/me", {
          method: "PATCH",
          body: JSON.stringify({ micGain, outputVolume, noiseSuppression })
        });
        setUser(updated);
      } catch {
        toast.error(t.mediaSyncFailed);
      }
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [micGain, noiseSuppression, outputVolume, setUser, t.mediaSyncFailed]);

  useEffect(() => () => stopHardwareTest(streamRef, setTesting), []);

  const startHardwareTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: activeMicId ? { deviceId: activeMicId === "default" ? undefined : activeMicId } : true,
        video: true
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setTesting(true);
      monitorAudioLevel(stream, setAudioLevel);
    } catch {
      toast.error(t.hardwareAccessFailed);
    }
  };

  return (
    <div className="space-y-8">
      <SectionHeader title={t.voiceVideo} description={t.configureHardware} />

      <div className="grid gap-5 md:grid-cols-2">
        <DeviceSelect label={t.inputDevice} value={activeMicId} devices={micDevices} fallback={t.microphone} onChange={(value) => setMediaSettings({ activeMicId: value })} />
        <DeviceSelect label={t.outputDevice} value={activeOutputId} devices={outputDevices} fallback={t.speaker} onChange={(value) => setMediaSettings({ activeOutputId: value })} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <SliderCard label={t.inputVolume} value={micGain} max={100} onChange={(value) => setMediaSettings({ micGain: value })} />
        <SliderCard label={t.outputVolume} value={outputVolume} max={200} onChange={(value) => setMediaSettings({ outputVolume: value })} />
      </div>

      <section className="flex items-center justify-between gap-5 rounded-[2rem] border border-sori-border bg-sori-panel p-6">
        <div className="flex items-center gap-4">
          <div className={cn("grid h-12 w-12 place-items-center rounded-2xl border border-sori-border", noiseSuppression ? "bg-sori-elevated text-sori-secondary" : "bg-sori-bg text-sori-muted")}>
            <Waves className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-black">{t.noiseSuppression}</h3>
            <p className="mt-1 text-xs text-sori-muted">{t.noiseSuppressionDescription}</p>
          </div>
        </div>
        <Switch checked={noiseSuppression} onChange={(checked) => setMediaSettings({ noiseSuppression: checked })} label={t.noiseSuppression} />
      </section>

      <section className="rounded-[2rem] border border-sori-border bg-sori-panel p-6">
        <div className="mb-6 flex items-center justify-between gap-5">
          <div>
            <h3 className="text-lg font-black">{t.hardwareTest}</h3>
            <p className="mt-1 text-xs text-sori-muted">{t.verifyHardware}</p>
          </div>
          <button
            type="button"
            className="rounded-xl bg-sori-primary px-5 py-3 text-xs font-black text-white shadow-glow"
            onClick={testing ? () => stopHardwareTest(streamRef, setTesting, setAudioLevel) : startHardwareTest}
          >
            {testing ? t.stopTest : t.startTest}
          </button>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-sori-muted">{t.cameraPreview}</div>
            <div className="grid aspect-video place-items-center overflow-hidden rounded-2xl border border-sori-border bg-sori-bg">
              {testing ? <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" /> : <Camera className="h-10 w-10 text-sori-dim" />}
            </div>
          </div>
          <div>
            <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-sori-muted">{t.micLevel}</div>
            <div className="flex h-[calc(100%-1.5rem)] flex-col justify-center gap-5">
              <div className="h-3 overflow-hidden rounded-full border border-sori-border bg-sori-bg">
                <div className="h-full bg-sori-secondary transition-all" style={{ width: `${audioLevel}%` }} />
              </div>
              <p className="text-xs text-sori-muted">{t.permissionsHint}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function DeviceSelect(props: { label: string; value: string; devices: MediaDeviceInfo[]; fallback: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-3 block text-[10px] font-black uppercase tracking-widest text-sori-secondary">{props.label}</span>
      <select
        value={props.value}
        className="w-full rounded-xl border border-sori-border bg-sori-panel px-4 py-3 text-sm font-bold outline-none focus:border-sori-primary"
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="default">Default</option>
        {props.devices.map((device) => (
          <option key={device.deviceId || "default"} value={device.deviceId || "default"}>
            {device.label || props.fallback}
          </option>
        ))}
      </select>
    </label>
  );
}

function SliderCard(props: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  return (
    <section className="rounded-[2rem] border border-sori-border bg-sori-panel p-6">
      <div className="mb-5 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-sori-muted">{props.label}</span>
        <span className="text-xs font-black">{props.value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={props.max}
        step={1}
        value={props.value}
        className="w-full accent-sori-primary"
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </section>
  );
}

function NotificationsTab() {
  const t = useT();
  const settings = useSettingsStore();
  const setNotificationSettings = useSettingsStore((state) => state.setNotificationSettings);

  const regularEnabled = settings.channelMessagePopups && settings.directMessagePopups;
  const soundEnabled = settings.voiceJoinSound && settings.voiceLeaveSound && settings.newMessageSound && settings.directCallSound;

  return (
    <div className="space-y-8">
      <SectionHeader title={t.notifications} description={t.notificationsDescription} />
      <div className="space-y-6">
        <NotificationGroup
          icon="bell"
          title={t.regularNotifications}
          checked={regularEnabled}
          onChange={(checked) => setNotificationSettings({ channelMessagePopups: checked, directMessagePopups: checked })}
        >
          <NotificationRow title={t.channelMessagePopups} description={t.channelMessagePopupsDescription} settingKey="channelMessagePopups" />
          <NotificationRow title={t.directMessagePopups} description={t.directMessagePopupsDescription} settingKey="directMessagePopups" />
        </NotificationGroup>

        <NotificationGroup
          icon="volume"
          title={t.soundNotifications}
          checked={soundEnabled}
          onChange={(checked) => setNotificationSettings({ voiceJoinSound: checked, voiceLeaveSound: checked, newMessageSound: checked, directCallSound: checked })}
        >
          <NotificationRow title={t.voiceJoinSound} description={t.voiceJoinSoundDescription} settingKey="voiceJoinSound" />
          <NotificationRow title={t.voiceLeaveSound} description={t.voiceLeaveSoundDescription} settingKey="voiceLeaveSound" />
          <NotificationRow title={t.newMessageSound} description={t.newMessageSoundDescription} settingKey="newMessageSound" />
          <NotificationRow title={t.directCallSound} description={t.directCallSoundDescription} settingKey="directCallSound" />
        </NotificationGroup>
      </div>
    </div>
  );
}

function NotificationGroup(props: { icon: "bell" | "volume"; title: string; checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  const Icon = props.icon === "bell" ? Bell : Volume2;
  return (
    <section className="space-y-4 rounded-[2rem] border border-sori-border bg-sori-panel p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-sori-border bg-sori-elevated text-sori-secondary">
            <Icon className="h-5 w-5" />
          </div>
          <h2 className="truncate text-[11px] font-black uppercase tracking-widest text-sori-muted">{props.title}</h2>
        </div>
        <Switch checked={props.checked} onChange={props.onChange} label={props.title} />
      </div>
      <div className="space-y-3">{props.children}</div>
    </section>
  );
}

function NotificationRow(props: { title: string; description: string; settingKey: NotificationSettingKey }) {
  const checked = useSettingsStore((state) => state[props.settingKey]);
  const setNotificationSetting = useSettingsStore((state) => state.setNotificationSetting);
  return (
    <div className="flex items-center justify-between gap-5 rounded-2xl border border-sori-border bg-sori-bg px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-sm font-black">{props.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-sori-muted">{props.description}</p>
      </div>
      <Switch checked={checked} onChange={(value) => setNotificationSetting(props.settingKey, value)} label={props.title} />
    </div>
  );
}

function Switch(props: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={props.label}
      aria-checked={props.checked}
      className={cn("relative h-8 w-14 shrink-0 rounded-full transition", props.checked ? "bg-sori-primary" : "bg-sori-hover")}
      onClick={() => props.onChange(!props.checked)}
    >
      <span className={cn("absolute top-1 h-6 w-6 rounded-full bg-white transition", props.checked ? "left-7" : "left-1")} />
    </button>
  );
}

function SectionHeader(props: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-2xl font-black text-sori-text md:text-3xl">{props.title}</h1>
      <p className="mt-2 text-sm text-sori-muted">{props.description}</p>
    </div>
  );
}

function stopHardwareTest(streamRef: MutableRefObject<MediaStream | null>, setTesting: (value: boolean) => void, setAudioLevel?: (value: number) => void) {
  streamRef.current?.getTracks().forEach((track) => track.stop());
  streamRef.current = null;
  setTesting(false);
  setAudioLevel?.(0);
}

function monitorAudioLevel(stream: MediaStream, setAudioLevel: (value: number) => void) {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  const data = new Uint8Array(analyser.frequencyBinCount);

  source.connect(analyser);

  const tick = () => {
    if (!stream.active) {
      void audioContext.close().catch(() => undefined);
      return;
    }
    analyser.getByteFrequencyData(data);
    const average = data.reduce((sum, value) => sum + value, 0) / data.length;
    setAudioLevel(Math.min(100, Math.round((average / 128) * 100)));
    window.requestAnimationFrame(tick);
  };

  tick();
}
