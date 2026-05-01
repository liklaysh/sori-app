import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ClientBootstrapPayload, SystemVersionPayload } from "../types/sori";
import { discoverServer } from "../lib/bootstrap";

type ServerStatus = "idle" | "checking" | "ready" | "error";

interface ServerState {
  domain: string | null;
  bootstrap: ClientBootstrapPayload | null;
  status: ServerStatus;
  error: string | null;
  serverVersion: SystemVersionPayload | null;
  verifyServer: (domain: string) => Promise<void>;
  fetchServerVersion: () => Promise<void>;
  clearServer: () => void;
}

export const useServerStore = create<ServerState>()(
  persist(
    (set, get) => ({
      domain: null,
      bootstrap: null,
      status: "idle",
      error: null,
      serverVersion: null,

      verifyServer: async (domainInput) => {
        set({ status: "checking", error: null });
        try {
          const { domain, bootstrap } = await discoverServer(domainInput);
          set({ domain, bootstrap, status: "ready", error: null });
          await get().fetchServerVersion();
        } catch (error) {
          set({
            bootstrap: null,
            status: "error",
            error: error instanceof Error ? error.message : "Server is unavailable.",
            serverVersion: null
          });
        }
      },

      fetchServerVersion: async () => {
        const bootstrap = get().bootstrap;
        if (!bootstrap) {
          return;
        }

        try {
          const versionUrl = new URL(`${bootstrap.endpoints.api.replace(/\/+$/, "")}/api/system/version`);
          versionUrl.searchParams.set("_", Date.now().toString());
          const response = await fetch(versionUrl.toString(), {
            method: "GET",
            credentials: "include",
            headers: {
              Accept: "application/json"
            }
          });
          if (!response.ok) {
            throw new Error("Server version is unavailable.");
          }
          const version = await response.json() as SystemVersionPayload;
          set({ serverVersion: version });
        } catch {
          set({ serverVersion: null });
        }
      },

      clearServer: () => set({
        domain: null,
        bootstrap: null,
        status: "idle",
        error: null,
        serverVersion: null
      })
    }),
    {
      name: "sori-app-server",
      partialize: (state) => ({
        domain: state.domain,
        bootstrap: state.bootstrap
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<ServerState>),
        serverVersion: null
      })
    }
  )
);
