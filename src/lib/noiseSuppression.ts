import { Rnnoise, DenoiseState } from "@shiguredo/rnnoise-wasm";
import type { LocalAudioTrack } from "livekit-client";
import type { NoiseSuppressionMode, WebNoiseSuppressionMode } from "../stores/settingsStore";

export const WEB_NOISE_SUPPRESSION_MODES: WebNoiseSuppressionMode[] = ["webrtc_basic", "rnnoise"];
export const DESKTOP_NOISE_SUPPRESSION_MODES: NoiseSuppressionMode[] = ["webrtc_basic", "rnnoise", "experimental_ai"];

const NOISE_GATE_OPTIONS = {
  thresholdDb: -48,
  attackMs: 110,
  releaseMs: 560,
  hangoverMs: 220,
  floorGain: 0.015,
};

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
    autoGainControl: false,
  };
}

const RNNOISE_WORKLET_SOURCE = `
  class SoriRNNoiseWorklet extends AudioWorkletProcessor {
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

      for (let i = 0; i < output.length; i += 1) {
        this.buffer[this.bufferPtr++] = input[i] || 0;
        if (this.bufferPtr === this.frameSize) {
          this.port.postMessage({ type: 'process', samples: new Float32Array(this.buffer) });
          this.bufferPtr = 0;
        }

        output[i] = this.outputBuffer[this.outputPtr++] || 0;
        if (this.outputPtr === this.frameSize) {
          this.outputPtr = 0;
        }
      }

      return true;
    }
  }

  registerProcessor('sori-rnnoise-worklet', SoriRNNoiseWorklet);
`;

const NOISE_GATE_WORKLET_SOURCE = `
  class SoriNoiseGateWorklet extends AudioWorkletProcessor {
    constructor(options) {
      super();
      const config = options.processorOptions || {};
      this.thresholdDb = Number.isFinite(config.thresholdDb) ? config.thresholdDb : -48;
      this.attackMs = Number.isFinite(config.attackMs) ? config.attackMs : 110;
      this.releaseMs = Number.isFinite(config.releaseMs) ? config.releaseMs : 560;
      this.hangoverSamples = Math.max(0, Math.floor(sampleRate * ((config.hangoverMs || 220) / 1000)));
      this.floorGain = Math.max(0, Math.min(1, Number.isFinite(config.floorGain) ? config.floorGain : 0.015));
      this.gain = 1;
      this.hangoverRemaining = 0;
      this.lastReportTime = 0;
      this.isOpen = true;
    }

    process(inputs, outputs) {
      const inputChannels = inputs[0] || [];
      const outputChannels = outputs[0] || [];
      if (!inputChannels.length || !outputChannels.length) return true;

      const primary = inputChannels[0];
      let sum = 0;
      for (let i = 0; i < primary.length; i += 1) {
        const sample = primary[i] || 0;
        sum += sample * sample;
      }

      const rms = Math.sqrt(sum / Math.max(1, primary.length));
      const rmsDb = 20 * Math.log10(Math.max(rms, 0.000001));
      if (rmsDb >= this.thresholdDb) {
        this.hangoverRemaining = this.hangoverSamples;
      } else {
        this.hangoverRemaining = Math.max(0, this.hangoverRemaining - primary.length);
      }

      const shouldOpen = this.hangoverRemaining > 0;
      const targetGain = shouldOpen ? 1 : this.floorGain;
      const timeConstantMs = shouldOpen ? this.attackMs : this.releaseMs;
      const smoothing = Math.exp(-primary.length / (sampleRate * (timeConstantMs / 1000)));
      this.gain = targetGain + (this.gain - targetGain) * smoothing;
      this.isOpen = shouldOpen;

      for (let channel = 0; channel < outputChannels.length; channel += 1) {
        const input = inputChannels[channel] || primary;
        const output = outputChannels[channel];
        for (let i = 0; i < output.length; i += 1) {
          output[i] = (input[i] || 0) * this.gain;
        }
      }

      const now = currentTime;
      if (now - this.lastReportTime > 1) {
        this.lastReportTime = now;
        this.port.postMessage({
          type: 'diagnostics',
          rmsDb,
          gain: this.gain,
          gateOpen: this.isOpen,
        });
      }

      return true;
    }
  }

  registerProcessor('sori-noise-gate-worklet', SoriNoiseGateWorklet);
`;

class RNNoiseStage {
  private static initPromise: Promise<Rnnoise> | null = null;
  private static workletModuleUrl: string | null = null;
  private static registeredContexts = new WeakSet<AudioContext>();
  private rnnoise: Rnnoise | null = null;
  private denoiseState: DenoiseState | null = null;
  private workletNode: AudioWorkletNode | null = null;

  private static getWorkletModuleUrl() {
    if (!RNNoiseStage.workletModuleUrl) {
      const blob = new Blob([RNNOISE_WORKLET_SOURCE], { type: "application/javascript" });
      RNNoiseStage.workletModuleUrl = URL.createObjectURL(blob);
    }

    return RNNoiseStage.workletModuleUrl;
  }

  async init(audioContext: AudioContext) {
    if (!RNNoiseStage.initPromise) {
      RNNoiseStage.initPromise = Rnnoise.load();
    }

    this.rnnoise = await RNNoiseStage.initPromise;
    this.denoiseState = this.rnnoise.createDenoiseState();

    if (!RNNoiseStage.registeredContexts.has(audioContext)) {
      await audioContext.audioWorklet.addModule(RNNoiseStage.getWorkletModuleUrl());
      RNNoiseStage.registeredContexts.add(audioContext);
    }

    this.workletNode = new AudioWorkletNode(audioContext, "sori-rnnoise-worklet");
    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === "process" && this.denoiseState) {
        const samples = event.data.samples as Float32Array;
        this.denoiseState.processFrame(samples);
        this.workletNode?.port.postMessage({ type: "processed", samples });
      }
    };
  }

  connect(input: AudioNode) {
    if (!this.workletNode) {
      throw new Error("RNNoise stage is not initialized");
    }
    input.connect(this.workletNode);
    return this.workletNode;
  }

  async destroy() {
    this.denoiseState?.destroy();
    this.denoiseState = null;
    this.workletNode?.disconnect();
    this.workletNode = null;
    this.rnnoise = null;
  }
}

class NoiseGateStage {
  private static workletModuleUrl: string | null = null;
  private static registeredContexts = new WeakSet<AudioContext>();
  private workletNode: AudioWorkletNode | null = null;
  private diagnostics = {
    rmsDb: -120,
    gain: 1,
    gateOpen: true,
  };

  private static getWorkletModuleUrl() {
    if (!NoiseGateStage.workletModuleUrl) {
      const blob = new Blob([NOISE_GATE_WORKLET_SOURCE], { type: "application/javascript" });
      NoiseGateStage.workletModuleUrl = URL.createObjectURL(blob);
    }

    return NoiseGateStage.workletModuleUrl;
  }

  async init(audioContext: AudioContext) {
    if (!NoiseGateStage.registeredContexts.has(audioContext)) {
      await audioContext.audioWorklet.addModule(NoiseGateStage.getWorkletModuleUrl());
      NoiseGateStage.registeredContexts.add(audioContext);
    }

    this.workletNode = new AudioWorkletNode(audioContext, "sori-noise-gate-worklet", {
      processorOptions: NOISE_GATE_OPTIONS,
    });
    this.workletNode.port.onmessage = (event) => {
      if (event.data?.type === "diagnostics") {
        this.diagnostics = {
          rmsDb: Number(event.data.rmsDb),
          gain: Number(event.data.gain),
          gateOpen: Boolean(event.data.gateOpen),
        };
      }
    };
  }

  connect(input: AudioNode) {
    if (!this.workletNode) {
      throw new Error("Noise gate stage is not initialized");
    }
    input.connect(this.workletNode);
    return this.workletNode;
  }

  getDiagnostics() {
    return this.diagnostics;
  }

  async destroy() {
    this.workletNode?.disconnect();
    this.workletNode = null;
  }
}

class SoriAudioProcessor {
  name = "sori-audio-processor";
  processedTrack?: MediaStreamTrack;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private rnnoiseStage: RNNoiseStage | null = null;
  private gateStage: NoiseGateStage | null = null;
  private sourceStream: MediaStream | null = null;

  constructor(private readonly mode: NoiseSuppressionMode) {}

  async init(opts: { audioContext: AudioContext; track: MediaStreamTrack }) {
    this.audioContext = opts.audioContext;
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume().catch(() => {});
    }

    this.sourceStream = new MediaStream([opts.track]);
    this.sourceNode = this.audioContext.createMediaStreamSource(this.sourceStream);
    this.destinationNode = this.audioContext.createMediaStreamDestination();

    let currentNode: AudioNode = this.sourceNode;
    if (this.mode === "rnnoise") {
      this.rnnoiseStage = new RNNoiseStage();
      await this.rnnoiseStage.init(this.audioContext);
      currentNode = this.rnnoiseStage.connect(currentNode);
    }

    this.gateStage = new NoiseGateStage();
    await this.gateStage.init(this.audioContext);
    currentNode = this.gateStage.connect(currentNode);
    currentNode.connect(this.destinationNode);

    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
    this.processedTrack.enabled = opts.track.enabled;
  }

  async restart(opts: { audioContext: AudioContext; track: MediaStreamTrack }) {
    await this.destroy();
    await this.init(opts);
  }

  async destroy() {
    this.sourceNode?.disconnect();
    this.destinationNode?.disconnect();
    await this.rnnoiseStage?.destroy();
    await this.gateStage?.destroy();
    this.processedTrack?.stop();
    this.sourceStream = null;
    this.sourceNode = null;
    this.destinationNode = null;
    this.rnnoiseStage = null;
    this.gateStage = null;
    this.processedTrack = undefined;
    this.audioContext = null;
  }

  getDiagnostics() {
    return {
      mode: this.mode,
      gateEnabled: true,
      gate: {
        ...NOISE_GATE_OPTIONS,
        ...this.gateStage?.getDiagnostics(),
      },
      hasProcessedTrack: Boolean(this.processedTrack),
      experimentalAiUnavailable: this.mode === "experimental_ai",
    };
  }
}

export async function applyNoiseSuppressionMode(track: LocalAudioTrack, mode: NoiseSuppressionMode) {
  await track.stopProcessor();

  if (track.mediaStreamTrack.readyState === "ended") {
    return {
      mode,
      gateEnabled: false,
      hasProcessedTrack: false,
      experimentalAiUnavailable: mode === "experimental_ai",
      reason: "source_track_ended",
    };
  }

  const processor = new SoriAudioProcessor(mode);
  await track.setProcessor(processor as any);

  return processor.getDiagnostics();
}
