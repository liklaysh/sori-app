import { Loader2, Maximize2, Phone, PhoneOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useDirectCallStore } from "../stores/directCallStore";
import { useT } from "../lib/i18n";
import { cn } from "../lib/cn";
import { formatCallDuration } from "../lib/duration";

export function DirectCallOverlay(props: { isMaximized?: boolean; onToggleMaximize?: () => void }) {
  const t = useT();
  const status = useDirectCallStore((state) => state.status);
  const partner = useDirectCallStore((state) => state.partner);
  const startedAt = useDirectCallStore((state) => state.startedAt);
  const acceptCall = useDirectCallStore((state) => state.acceptCall);
  const rejectCall = useDirectCallStore((state) => state.rejectCall);
  const endCall = useDirectCallStore((state) => state.endCall);
  const duration = useDurationLabel(status === "connected" ? startedAt : null);

  if (status === "idle" || !partner) {
    return null;
  }

  if (props.isMaximized && status === "connected") {
    return null;
  }

  if (status === "ringing") {
    return (
      <div className="fixed bottom-8 right-8 z-50 w-80 animate-in slide-in-from-right rounded-[2rem] border border-sori-accent-secondary bg-sori-surface-panel p-5 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <Avatar name={partner.username} src={partner.avatarUrl} pulse />
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-sori-text-strong">{partner.username}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-sori-accent-secondary">{t.incomingCall}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sori-accent-secondary px-4 py-3 text-xs font-black text-black"
            onClick={acceptCall}
          >
            <Phone className="h-4 w-4" />
            {t.acceptCall}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sori-surface-elevated px-4 py-3 text-xs font-black text-sori-text-muted transition hover:text-sori-accent-danger"
            onClick={rejectCall}
          >
            <PhoneOff className="h-4 w-4" />
            {t.rejectCall}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-8 right-8 z-50 flex min-w-80 animate-in slide-in-from-right items-center gap-3 rounded-[2rem] border border-sori-border-subtle bg-sori-surface-panel p-4 shadow-2xl">
      <Avatar name={partner.username} src={partner.avatarUrl} />
      <div className="min-w-0 pr-3">
        <div className="truncate text-sm font-black text-sori-text-strong">{partner.username}</div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-sori-text-muted">
          {status === "calling" && <Loader2 className="h-3 w-3 animate-spin text-sori-accent-primary" />}
          <span>{status === "calling" ? t.calling : t.activeCall}</span>
          {status === "connected" && <span className="font-mono tracking-normal text-sori-accent-primary">{duration}</span>}
        </div>
      </div>
      {status === "connected" && props.onToggleMaximize && (
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-xl bg-sori-surface-base text-sori-text-muted transition hover:bg-sori-surface-hover hover:text-sori-text-strong"
          onClick={props.onToggleMaximize}
          title={t.expandCall}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        className="grid h-10 w-10 place-items-center rounded-xl bg-sori-surface-base text-sori-text-muted transition hover:bg-sori-surface-hover hover:text-sori-accent-danger"
        onClick={status === "calling" ? rejectCall : endCall}
        title={t.endCall}
      >
        {status === "calling" ? <X className="h-4 w-4" /> : <PhoneOff className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Avatar(props: { name: string; src?: string | null; pulse?: boolean }) {
  return (
    <div className={cn(
      "grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-sori-border-subtle bg-sori-surface-elevated text-sm font-black text-sori-accent-secondary",
      props.pulse && "animate-pulse border-sori-accent-secondary"
    )}>
      {props.src ? <img src={props.src} alt="" className="h-full w-full object-cover" /> : props.name[0]?.toUpperCase()}
    </div>
  );
}

function useDurationLabel(startedAt: number | null | undefined) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  if (!startedAt) return "00:00:00";
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  return formatCallDuration(total);
}
