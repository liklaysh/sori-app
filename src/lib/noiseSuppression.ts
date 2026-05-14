import { Rnnoise, DenoiseState } from "@shiguredo/rnnoise-wasm";
import type { LocalAudioTrack } from "livekit-client";
import type { NoiseSuppressionMode, WebNoiseSuppressionMode } from "../stores/settingsStore";

export const WEB_NOISE_SUPPRESSION_MODES: WebNoiseSuppressionMode[] = ["webrtc_basic", "rnnoise"];
export const DESKTOP_NOISE_SUPPRESSION_MODES: NoiseSuppressionMode[] = ["webrtc_basic", "rnnoise", "experimental_ai"];

export function isNoiseSuppressionMode(value: unknown): value is NoiseSuppressionMode {
  return value === "webrtc_basic" || value === "rnnoise" || value === "experimental_ai";
}

export function isWebNoiseSuppressionMode(value: unknown): value is WebNoiseSuppressionMode {
  return value === "webrtc_basic" || value === "rnnoise";
}

export function getAudioCaptureOptions(mode: NoiseSuppressionMode, deviceId?: string) {
  return {
    deviceId: deviceId && deviceId !== "default" ? deviceId : undefined,
    echoCancellation: true,
    noiseSuppression: mode === "webrtc_basic",
    autoGainControl: true,
  };
}

const RNNOISE_WORKLET_SOURCE = `
  class RNNoiseWorklet extends AudioWorkletProcessor {
    constructor() {
      super();
      this.frameSize = 480;
      this.buffer = new Float32Array(this.frameSize);
      this.bufferPtr = 0;
      this.outputBuffer = new Float32Array(this.frameSize);
      this.outputPtr = 0;
      this.port.onmessage = (event) => {
        if (event.data.type === 'processed') {
          this.outputBuffer.set(event.data.samples);
        }
      };
    }
    process(inputs, outputs) {
      const input = inputs[0]?.[0];
      const output = outputs[0]?.[0];
      if (!input || !output) return true;
      for (let i = 0; i < input.length; i++) {
        this.buffer[this.bufferPtr++] = input[i];
        if (this.bufferPtr === 480) {
          this.port.postMessage({ type: 'process', samples: new Float32Array(this.buffer) });
          this.bufferPtr = 0;
        }
        output[i] = this.outputBuffer[this.outputPtr++];
        if (this.outputPtr === 480) this.outputPtr = 0;
      }
      return true;
    }
  }
  registerProcessor('rnnoise-worklet', RNNoiseWorklet);
`;

class RNNoiseProcessor {
  private static initPromise: Promise<Rnnoise> | null = null;
  private static workletModuleUrl: string | null = null;
  private static registeredContexts = new WeakSet<AudioContext>();
  private rnnoise: Rnnoise | null = null;
  private denoiseState: DenoiseState | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;

  private static getWorkletModuleUrl() {
    if (!RNNoiseProcessor.workletModuleUrl) {
      const blob = new Blob([RNNOISE_WORKLET_SOURCE], { type: "application/javascript" });
      RNNoiseProcessor.workletModuleUrl = URL.createObjectURL(blob);
    }

    return RNNoiseProcessor.workletModuleUrl;
  }

  async init(opts: { audioContext: AudioContext }): Promise<void> {
    this.audioContext = opts.audioContext;
    if (!RNNoiseProcessor.initPromise) {
      RNNoiseProcessor.initPromise = Rnnoise.load();
    }

    this.rnnoise = await RNNoiseProcessor.initPromise;
    this.denoiseState = this.rnnoise.createDenoiseState();

    if (!RNNoiseProcessor.registeredContexts.has(this.audioContext)) {
      await this.audioContext.audioWorklet.addModule(RNNoiseProcessor.getWorkletModuleUrl());
      RNNoiseProcessor.registeredContexts.add(this.audioContext);
    }

    this.workletNode = new AudioWorkletNode(this.audioContext, "rnnoise-worklet");
    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === "process" && this.denoiseState) {
        const samples = event.data.samples;
        this.denoiseState.processFrame(samples);
        this.workletNode?.port.postMessage({ type: "processed", samples });
      }
    };
  }

  async process(input: AudioWorkletNode): Promise<AudioWorkletNode> {
    if (!this.workletNode) throw new Error("RNNoise worklet not initialized");
    input.connect(this.workletNode);
    return this.workletNode;
  }

  async destroy(): Promise<void> {
    this.denoiseState?.destroy();
    this.denoiseState = null;
    this.workletNode?.disconnect();
    this.workletNode = null;
    this.rnnoise = null;
    this.audioContext = null;
  }
}

export async function applyNoiseSuppressionMode(track: LocalAudioTrack, mode: NoiseSuppressionMode) {
  await track.stopProcessor();

  if (mode === "rnnoise") {
    if (track.mediaStreamTrack.readyState === "ended") return "rnnoise";
    await track.setProcessor(new RNNoiseProcessor() as any);
    return "rnnoise";
  }

  if (mode === "experimental_ai") {
    // Placeholder for the native dtln-rs provider. Keep the mode selectable and
    // fail soft until the Rust audio bridge is available.
    return "experimental_ai_unavailable";
  }

  return "webrtc_basic";
}
