import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";
import { isTauriRuntime } from "./desktopHttp";

export interface AppUpdaterLabels {
  appUpdateUnavailable: string;
  appUpdateAvailable: string;
  appUpdateNow: string;
  appUpdateLater: string;
  appUpdateNone: string;
  appUpdateFailed: string;
}

interface CheckForAppUpdateOptions {
  manual?: boolean;
}

let checkInFlight = false;
let installInFlight = false;

function formatUpdateMessage(template: string, update: Update) {
  return template.replace("{version}", update.version);
}

function getErrorReason(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "unknown";
}

function formatErrorMessage(template: string, error: unknown) {
  return template.replace("{reason}", getErrorReason(error));
}

async function installUpdate(update: Update, labels: AppUpdaterLabels) {
  if (installInFlight) {
    return;
  }

  installInFlight = true;

  try {
    await update.downloadAndInstall();
    await relaunch();
  } catch (error) {
    toast.error(formatErrorMessage(labels.appUpdateFailed, error));
  } finally {
    installInFlight = false;
  }
}

export async function checkForAppUpdate(labels: AppUpdaterLabels, options: CheckForAppUpdateOptions = {}) {
  if (!isTauriRuntime()) {
    if (options.manual) {
      toast.message(labels.appUpdateUnavailable);
    }
    return;
  }

  if (checkInFlight) {
    return;
  }

  checkInFlight = true;

  try {
    const update = await check();

    if (!update) {
      if (options.manual) {
        toast.success(labels.appUpdateNone);
      }
      return;
    }

    toast(formatUpdateMessage(labels.appUpdateAvailable, update), {
      action: {
        label: labels.appUpdateNow,
        onClick: () => {
          void installUpdate(update, labels);
        }
      },
      cancel: {
        label: labels.appUpdateLater,
        onClick: () => undefined
      }
    });
  } catch (error) {
    if (options.manual) {
      toast.error(formatErrorMessage(labels.appUpdateFailed, error));
    }
  } finally {
    checkInFlight = false;
  }
}
