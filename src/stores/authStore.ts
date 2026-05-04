import { create } from "zustand";
import { toast } from "sonner";
import type { SoriUser } from "../types/sori";
import { apiRequest, authPaths, clearCsrfToken, rememberCsrfToken } from "../lib/api";

type AuthStatus = "idle" | "checking" | "authenticated" | "anonymous" | "loading";

interface AuthState {
  user: SoriUser | null;
  status: AuthStatus;
  login: (identity: string, password: string) => Promise<void>;
  fetchMe: () => Promise<void>;
  logout: () => Promise<void>;
  resetSession: () => void;
  setUser: (user: SoriUser | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "idle",

  login: async (identity, password) => {
    set({ status: "loading" });
    try {
      const response = await apiRequest<{ csrfToken?: string; user: SoriUser }>(authPaths.login(), {
        method: "POST",
        body: JSON.stringify({
          email: identity.trim(),
          password
        })
      });

      rememberCsrfToken(response);
      if (response.user.role === "adminpanel") {
        await apiRequest(authPaths.logout(), { method: "POST" }).catch(() => undefined);
        clearCsrfToken();
        set({ user: null, status: "anonymous" });
        throw new Error("SORI App is for users. Admin panel is available only in the web interface.");
      }

      const session = await apiRequest<{ csrfToken?: string; user: SoriUser | null }>(authPaths.me());
      rememberCsrfToken(session);
      if (!session.user) {
        clearCsrfToken();
        set({ user: null, status: "anonymous" });
        throw new Error("Login succeeded, but the session cookie was not accepted by this client.");
      }

      set({ user: session.user, status: "authenticated" });
    } catch (error) {
      clearCsrfToken();
      set({ user: null, status: "anonymous" });
      throw error;
    }
  },

  fetchMe: async () => {
    set({ status: "checking" });
    try {
      const response = await apiRequest<{ csrfToken?: string; user: SoriUser | null }>(authPaths.me());
      rememberCsrfToken(response);
      if (response.user?.role === "adminpanel") {
        await apiRequest(authPaths.logout(), { method: "POST" }).catch(() => undefined);
        clearCsrfToken();
        set({ user: null, status: "anonymous" });
        return;
      }
      if (!response.user) {
        clearCsrfToken();
      }
      set({
        user: response.user,
        status: response.user ? "authenticated" : "anonymous"
      });
    } catch {
      clearCsrfToken();
      set({ user: null, status: "anonymous" });
    }
  },

  logout: async () => {
    try {
      await apiRequest(authPaths.logout(), { method: "POST" });
    } catch {
      toast.error("Logout failed on the server. Local session was cleared.");
    } finally {
      clearCsrfToken();
      set({ user: null, status: "anonymous" });
    }
  },

  resetSession: () => {
    clearCsrfToken();
    set({ user: null, status: "anonymous" });
  },

  setUser: (user) => {
    set({ user, status: user ? "authenticated" : "anonymous" });
  }
}));
