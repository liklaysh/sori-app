export type DesktopPlatform = "macos" | "windows" | "linux" | "unknown";

export function detectDesktopPlatform(): DesktopPlatform {
  const userAgentData = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = `${userAgentData.userAgentData?.platform || navigator.platform || ""}`.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  const value = `${platform} ${userAgent}`;

  if (value.includes("mac")) {
    return "macos";
  }

  if (value.includes("win")) {
    return "windows";
  }

  if (value.includes("linux")) {
    return "linux";
  }

  return "unknown";
}

export function shouldUseNativeWindowControls(platform: DesktopPlatform) {
  return platform === "macos";
}
