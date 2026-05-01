import { FormEvent, useState } from "react";
import { Eye, EyeOff, Lock, Server, User } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "../stores/authStore";
import { useServerStore } from "../stores/serverStore";
import { useT } from "../lib/i18n";

export function LoginScreen() {
  const t = useT();
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const login = useAuthStore((state) => state.login);
  const authStatus = useAuthStore((state) => state.status);
  const domain = useServerStore((state) => state.domain);
  const clearServer = useServerStore((state) => state.clearServer);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await login(identity, password);
      toast.success(t.welcomeBack);
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : t.loginFailed;
      setError(message);
      toast.error(message);
    }
  };

  return (
    <main className="grid h-full place-items-center bg-sori-surface-base p-6 text-sori-text-primary">
      <section className="relative z-10 w-full max-w-md">
        <div className="rounded-[2rem] border border-sori-border-subtle bg-sori-surface-main p-10 shadow-2xl shadow-black">
          <div className="mb-10 flex flex-col items-center">
            <div className="mb-4 grid h-20 w-20 place-items-center rounded-[1.5rem] border border-sori-border-accent bg-sori-surface-accent-subtle text-3xl font-black text-sori-accent-primary shadow-2xl">
              S
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-sori-text-strong">SORI</h1>
            <p className="mt-2 text-sm font-bold uppercase tracking-widest text-sori-text-muted">{t.loginTitle}</p>
            <button
              type="button"
              className="mt-5 inline-flex max-w-full items-center gap-2 rounded-xl border border-sori-border-subtle bg-sori-surface-panel px-3 py-2 text-xs font-bold text-sori-text-muted transition hover:bg-sori-surface-hover hover:text-sori-text-strong"
              onClick={clearServer}
            >
              <Server className="h-3.5 w-3.5 shrink-0 text-sori-accent-primary" />
              <span className="min-w-0 truncate">{domain}</span>
              <span className="shrink-0 text-sori-text-dim">·</span>
              <span className="shrink-0">{t.changeServer}</span>
            </button>
          </div>

          <form onSubmit={submit} className="space-y-6">
            {error && (
              <div className="rounded-xl border border-sori-accent-danger bg-sori-surface-danger-subtle p-4 text-center text-xs font-bold text-sori-accent-danger">
                {error}
              </div>
            )}

            <label className="block space-y-2">
              <span className="ml-2 block text-xs font-black uppercase tracking-widest text-sori-accent-secondary">
                {t.identity}
              </span>
              <div className="group relative">
                <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-sori-text-muted transition-colors group-focus-within:text-sori-accent-primary" />
                <input
                  className="w-full rounded-xl border border-sori-border-subtle bg-sori-surface-panel py-4 pl-12 pr-4 font-bold text-sori-text-strong outline-none transition focus:border-sori-accent-primary focus:ring-1 focus:ring-sori-accent-primary"
                  value={identity}
                  onChange={(event) => setIdentity(event.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </label>

            <label className="block space-y-2">
              <span className="ml-2 block text-xs font-black uppercase tracking-widest text-sori-accent-secondary">
                {t.password}
              </span>
              <div className="group relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-sori-text-muted transition-colors group-focus-within:text-sori-accent-secondary" />
                <input
                  className="w-full rounded-xl border border-sori-border-subtle bg-sori-surface-panel py-4 pl-12 pr-12 font-bold tracking-widest text-sori-text-strong outline-none transition focus:border-sori-accent-secondary focus:ring-1 focus:ring-sori-accent-secondary"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-sori-text-muted transition hover:text-sori-text-strong"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={authStatus === "loading"}
              className="w-full rounded-xl bg-sori-accent-primary py-4 font-black text-black shadow-lg transition active:scale-[0.98] disabled:bg-sori-surface-active disabled:text-sori-text-muted"
            >
              {authStatus === "loading" ? t.loggingIn : t.login}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
