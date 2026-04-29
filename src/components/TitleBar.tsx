import { Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "../lib/cn";
import { detectDesktopPlatform, shouldUseNativeWindowControls, type DesktopPlatform } from "../lib/platform";

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
      "flex h-11 select-none items-center justify-between border-b border-sori-border bg-sori-panel/95",
      useNativeControls && "pl-20"
    )}>
      <div data-tauri-drag-region className="flex h-full flex-1 items-center gap-3 px-4">
        <div className="grid h-6 w-6 place-items-center rounded-md bg-sori-primary text-[10px] font-black text-white shadow-glow">
          S
        </div>
        <div className="text-xs font-black uppercase tracking-[0.2em] text-sori-text">
          SORI App
        </div>
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
            className="hover:bg-sori-danger hover:text-white"
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
        "grid h-11 w-12 place-items-center text-sori-muted transition-colors hover:bg-sori-hover hover:text-sori-text",
        props.className
      )}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
