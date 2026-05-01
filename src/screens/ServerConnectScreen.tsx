import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Server, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { normalizeServerDomain } from "../lib/bootstrap";
import { useT } from "../lib/i18n";
import { useServerStore } from "../stores/serverStore";

export function ServerConnectScreen() {
  const t = useT();
  const [domainInput, setDomainInput] = useState("");
  const status = useServerStore((state) => state.status);
  const error = useServerStore((state) => state.error);
  const verifyServer = useServerStore((state) => state.verifyServer);
  const normalizedDomain = useMemo(() => normalizeServerDomain(domainInput), [domainInput]);

  useEffect(() => {
    if (!normalizedDomain || normalizedDomain.length < 4 || !normalizedDomain.includes(".")) {
      return;
    }

    const timer = window.setTimeout(() => {
      verifyServer(normalizedDomain);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [normalizedDomain, verifyServer]);

  useEffect(() => {
    if (status === "ready") {
      toast.success(t.connected);
    }
  }, [status, t.connected]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    verifyServer(normalizedDomain);
  };

  return (
    <main className="grid h-full place-items-center bg-sori-surface-base px-6 text-sori-text-primary">
      <section className="w-full max-w-lg rounded-[2rem] border border-sori-border-subtle bg-sori-surface-main p-9 shadow-2xl shadow-black/40">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-sori-border-accent bg-sori-surface-accent-subtle text-sori-accent-primary shadow-glow">
            <Server className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-sori-text-strong">{t.connectTitle}</h1>
          <p className="mt-3 text-sm leading-6 text-sori-text-muted">{t.connectSubtitle}</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="relative">
            <input
              className="w-full rounded-2xl border border-sori-border-subtle bg-sori-surface-panel px-5 py-4 pr-14 text-lg font-bold text-sori-text-strong outline-none transition placeholder:text-sori-text-dim focus:border-sori-accent-primary focus:ring-1 focus:ring-sori-accent-primary"
              placeholder={t.domainPlaceholder}
              value={domainInput}
              onChange={(event) => setDomainInput(event.target.value)}
              autoFocus
            />
            <div className="absolute right-5 top-1/2 -translate-y-1/2">
              {status === "checking" && <Loader2 className="h-5 w-5 animate-spin text-sori-accent-primary" />}
              {status === "ready" && <CheckCircle2 className="h-5 w-5 text-sori-accent-secondary" />}
              {status === "error" && <TriangleAlert className="h-5 w-5 text-sori-accent-warning" />}
            </div>
          </div>

          <p className="text-xs font-semibold text-sori-text-dim">https://{normalizedDomain || t.domainPlaceholder}</p>

          {status === "error" && (
            <div className="rounded-xl border border-sori-border-danger bg-sori-surface-danger-subtle p-3 text-sm font-bold text-sori-accent-danger">
              {error || t.serverUnavailable}
            </div>
          )}
        </form>
      </section>
    </main>
  );
}
