import { Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "../lib/cn";
import { detectDesktopPlatform, shouldUseNativeWindowControls, type DesktopPlatform } from "../lib/platform";
import { useServerStore } from "../stores/serverStore";

async function runWindowAction(action: "minimize" | "maximize" | "close") {
  try {
    const window = getCurrentWindow();
    if (action === "minimize") {
      await window.minimize();
    } else if (action === "maximize") {
      await window.toggleMaximize();
    } else {
      await window.close();
    }
  } catch {
    // Browser preview does not expose Tauri window APIs.
  }
}

export function TitleBar() {
  const [platform, setPlatform] = useState<DesktopPlatform>("unknown");
  const serverName = useServerStore((state) => state.bootstrap?.server.name);
  const useNativeControls = shouldUseNativeWindowControls(platform);

  useEffect(() => {
    const detectedPlatform = detectDesktopPlatform();
    const nativeControls = shouldUseNativeWindowControls(detectedPlatform);
    setPlatform(detectedPlatform);

    const configureWindow = async () => {
      try {
        await getCurrentWindow().setDecorations(nativeControls);
      } catch {
        // Browser preview and restricted Tauri contexts keep the configured default.
      }
    };

    configureWindow();
  }, []);

  return (
    <header className={cn(
      "relative flex h-10 select-none items-center justify-between border-b border-sori-border-subtle bg-sori-surface-panel",
      useNativeControls && "pl-20"
    )}>
      <div data-tauri-drag-region className="h-full flex-1" />
      <div data-tauri-drag-region className="pointer-events-none absolute left-1/2 top-1/2 max-w-[50vw] -translate-x-1/2 -translate-y-1/2 truncate text-center text-xs font-black uppercase tracking-[0.2em] text-sori-text-strong">
        {serverName || "SORI App"}
      </div>

      {!useNativeControls && (
        <div className="flex h-full items-center">
          <TitleBarButton label="Minimize" onClick={() => runWindowAction("minimize")}>
            <Minus className="h-4 w-4" />
          </TitleBarButton>
          <TitleBarButton label="Maximize" onClick={() => runWindowAction("maximize")}>
            <Square className="h-3.5 w-3.5" />
          </TitleBarButton>
          <TitleBarButton
            label="Close"
            className="hover:bg-sori-accent-danger hover:text-white"
            onClick={() => runWindowAction("close")}
          >
            <X className="h-4 w-4" />
          </TitleBarButton>
        </div>
      )}
    </header>
  );
}

function TitleBarButton(props: {
  label: string;
  children: ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      className={cn(
        "grid h-10 w-12 place-items-center text-sori-text-muted transition-colors hover:bg-sori-surface-hover hover:text-sori-text-strong",
        props.className
      )}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
