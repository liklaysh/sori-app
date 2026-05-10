export async function ensureMicrophoneAccess(deviceId = "default") {
  if (!window.isSecureContext) {
    throw new Error("Microphone access requires a secure app context.");
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access is not available in this desktop webview.");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId && deviceId !== "default" ? { deviceId: { exact: deviceId } } : true,
      video: false
    });
  } catch (error) {
    if (!deviceId || deviceId === "default") {
      throw error;
    }

    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });
  }

  stream.getTracks().forEach((track) => track.stop());
}

export async function ensureCameraAccess() {
  if (!window.isSecureContext) {
    throw new Error("Camera access requires a secure app context.");
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera access is not available in this desktop webview.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true
  });

  stream.getTracks().forEach((track) => track.stop());
}
