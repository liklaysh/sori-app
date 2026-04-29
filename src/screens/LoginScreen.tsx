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
  const login = useAuthStore((state) => state.login);
  const authStatus = useAuthStore((state) => state.status);
  const domain = useServerStore((state) => state.domain);
  const clearServer = useServerStore((state) => state.clearServer);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await login(identity, password);
      toast.success("Welcome to SORI.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed.");
    }
  };

  return (
    <main className="sori-window grid h-full place-items-center px-6">
      <section className="w-full max-w-md rounded-3xl border border-sori-border bg-sori-panel/90 p-9 shadow-2xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-sori-primary text-white shadow-glow">
            S
          </div>
          <h1 className="text-2xl font-black tracking-tight">SORI</h1>
          <p className="mt-2 text-xs font-black uppercase tracking-[0.2em] text-sori-muted">{t.loginTitle}</p>
          <button
            type="button"
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-sori-border px-3 py-1.5 text-xs font-bold text-sori-muted transition hover:bg-sori-hover hover:text-sori-text"
            onClick={clearServer}
          >
            <Server className="h-3.5 w-3.5" />
            {domain} • {t.changeServer}
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-sori-secondary">
              {t.identity}
            </span>
            <div className="relative">
              <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-sori-muted" />
              <input
                className="w-full rounded-xl border border-sori-border bg-sori-elevated py-4 pl-12 pr-4 font-bold outline-none transition focus:border-sori-primary"
                value={identity}
                onChange={(event) => setIdentity(event.target.value)}
                autoComplete="username"
                required
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-sori-secondary">
              {t.password}
            </span>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-sori-muted" />
              <input
                className="w-full rounded-xl border border-sori-border bg-sori-elevated py-4 pl-12 pr-12 font-bold tracking-widest outline-none transition focus:border-sori-primary"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-sori-muted hover:text-sori-text"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={authStatus === "loading"}
            className="w-full rounded-xl bg-sori-primary py-4 font-black text-white shadow-glow transition active:scale-[0.98] disabled:opacity-60"
          >
            {authStatus === "loading" ? t.loggingIn : t.login}
          </button>
        </form>
      </section>
    </main>
  );
}
