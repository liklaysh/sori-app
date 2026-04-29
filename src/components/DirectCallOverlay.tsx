import { Phone, PhoneOff } from "lucide-react";
import { useDirectCallStore } from "../stores/directCallStore";
import { useT } from "../lib/i18n";

export function DirectCallOverlay() {
  const t = useT();
  const status = useDirectCallStore((state) => state.status);
  const partner = useDirectCallStore((state) => state.partner);
  const acceptCall = useDirectCallStore((state) => state.acceptCall);
  const rejectCall = useDirectCallStore((state) => state.rejectCall);
  const endCall = useDirectCallStore((state) => state.endCall);

  if (status === "idle" || !partner) {
    return null;
  }

  if (status === "ringing") {
    return (
      <div className="fixed right-6 top-20 z-50 w-80 rounded-3xl border border-sori-border bg-sori-panel p-5 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <Avatar name={partner.username} src={partner.avatarUrl} />
          <div className="min-w-0">
            <div className="truncate text-sm font-black">{partner.username}</div>
            <div className="text-xs text-sori-muted">{t.incomingCall}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sori-secondary px-4 py-3 text-xs font-black text-black"
            onClick={acceptCall}
          >
            <Phone className="h-4 w-4" />
            {t.acceptCall}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sori-danger px-4 py-3 text-xs font-black text-white"
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
    <div className="fixed right-6 top-20 z-50 flex items-center gap-3 rounded-3xl border border-sori-border bg-sori-panel p-4 shadow-2xl">
      <Avatar name={partner.username} src={partner.avatarUrl} />
      <div className="min-w-0 pr-3">
        <div className="truncate text-sm font-black">{partner.username}</div>
        <div className="text-xs text-sori-muted">
          {status === "calling" ? t.calling : t.activeCall}
        </div>
      </div>
      <button
        type="button"
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-sori-danger px-4 py-3 text-xs font-black text-white"
        onClick={status === "calling" ? rejectCall : endCall}
      >
        <PhoneOff className="h-4 w-4" />
        {t.endCall}
      </button>
    </div>
  );
}

function Avatar(props: { name: string; src?: string | null }) {
  return (
    <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-sori-elevated text-sm font-black text-sori-secondary">
      {props.src ? <img src={props.src} alt="" className="h-full w-full object-cover" /> : props.name[0]?.toUpperCase()}
    </div>
  );
}
