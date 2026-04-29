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
    <main className="sori-window grid h-full place-items-center px-6">
      <section className="w-full max-w-lg rounded-3xl border border-sori-border bg-sori-panel/90 p-9 shadow-2xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-sori-primary text-white shadow-glow">
            <Server className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">{t.connectTitle}</h1>
          <p className="mt-3 text-sm leading-6 text-sori-muted">{t.connectSubtitle}</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="relative">
            <input
              className="w-full rounded-2xl border border-sori-border bg-sori-elevated px-5 py-4 pr-14 text-lg font-bold outline-none transition focus:border-sori-primary"
              placeholder={t.domainPlaceholder}
              value={domainInput}
              onChange={(event) => setDomainInput(event.target.value)}
              autoFocus
            />
            <div className="absolute right-5 top-1/2 -translate-y-1/2">
              {status === "checking" && <Loader2 className="h-5 w-5 animate-spin text-sori-primary" />}
              {status === "ready" && <CheckCircle2 className="h-5 w-5 text-sori-secondary" />}
              {status === "error" && <TriangleAlert className="h-5 w-5 text-sori-warning" />}
            </div>
          </div>

          <p className="text-xs text-sori-dim">https://{normalizedDomain || t.domainPlaceholder}</p>

          {status === "error" && (
            <div className="rounded-xl border border-sori-warning/40 bg-sori-warning/10 p-3 text-sm text-sori-warning">
              {error || t.serverUnavailable}
            </div>
          )}
        </form>
      </section>
    </main>
  );
}
