import { ConnectionQuality, Track } from "livekit-client";

export interface CallTelemetrySnapshot {
  bitrate: number | null;
  packetLoss: number | null;
  jitterMs: number | null;
  rttMs: number | null;
  connectionQuality: ConnectionQuality;
  qualityScore: number | null;
  participantCount: number;
  reconnectCount: number;
}

type MetricAccumulator = {
  bitrate: number[];
  packetLoss: number[];
  jitterMs: number[];
  rttMs: number[];
};

type Baseline = {
  bytes: number;
  timestamp: number;
};

export type StatsBaselineMap = Map<string, Baseline>;

const QUALITY_PRIORITY: Record<ConnectionQuality, number> = {
  [ConnectionQuality.Lost]: 0,
  [ConnectionQuality.Poor]: 1,
  [ConnectionQuality.Good]: 2,
  [ConnectionQuality.Excellent]: 3,
  [ConnectionQuality.Unknown]: 4,
};

const QUALITY_SCORE_MAP: Record<ConnectionQuality, number | null> = {
  [ConnectionQuality.Excellent]: 4.5,
  [ConnectionQuality.Good]: 3.8,
  [ConnectionQuality.Poor]: 2.6,
  [ConnectionQuality.Lost]: 1.5,
  [ConnectionQuality.Unknown]: null,
};

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value: number | null, digits = 1): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function pushMetric(bucket: number[], value: unknown, transform?: (numericValue: number) => number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return;
  }

  const normalized = transform ? transform(value) : value;
  if (Number.isFinite(normalized)) {
    bucket.push(normalized);
  }
}

function isAudioStatsEntry(stats: any) {
  return stats.kind === "audio" || stats.mediaType === "audio";
}

function trackBitrate(
  baselineKey: string,
  bytes: unknown,
  timestamp: unknown,
  baselines: StatsBaselineMap,
): number | null {
  if (typeof bytes !== "number" || typeof timestamp !== "number") {
    return null;
  }

  const previous = baselines.get(baselineKey);
  baselines.set(baselineKey, { bytes, timestamp });

  if (!previous || timestamp <= previous.timestamp || bytes < previous.bytes) {
    return null;
  }

  const elapsedSeconds = (timestamp - previous.timestamp) / 1000;
  if (elapsedSeconds <= 0) {
    return null;
  }

  return ((bytes - previous.bytes) * 8) / elapsedSeconds;
}

export function collectReportMetrics(
  report: RTCStatsReport | undefined,
  reportKey: string,
  baselines: StatsBaselineMap,
): Partial<CallTelemetrySnapshot> {
  if (!report) {
    return {};
  }

  const metrics: MetricAccumulator = {
    bitrate: [],
    packetLoss: [],
    jitterMs: [],
    rttMs: [],
  };

  report.forEach((stats: any) => {
    if (!isAudioStatsEntry(stats)) {
      return;
    }

    if (stats.type === "outbound-rtp") {
      const bitrate = trackBitrate(`${reportKey}:${stats.id}:outbound`, stats.bytesSent, stats.timestamp, baselines);
      if (bitrate !== null) {
        metrics.bitrate.push(bitrate);
      }
      return;
    }

    if (stats.type === "inbound-rtp") {
      const bitrate = trackBitrate(`${reportKey}:${stats.id}:inbound`, stats.bytesReceived, stats.timestamp, baselines);
      if (bitrate !== null) {
        metrics.bitrate.push(bitrate);
      }

      if (typeof stats.packetsLost === "number" && typeof stats.packetsReceived === "number") {
        const totalPackets = stats.packetsLost + stats.packetsReceived;
        if (totalPackets > 0) {
          metrics.packetLoss.push((stats.packetsLost / totalPackets) * 100);
        }
      }

      pushMetric(metrics.jitterMs, stats.jitter, (value) => value * 1000);
      return;
    }

    if (stats.type === "remote-inbound-rtp") {
      if (typeof stats.fractionLost === "number") {
        metrics.packetLoss.push(stats.fractionLost * 100);
      } else if (typeof stats.packetsLost === "number" && typeof stats.packetsSent === "number") {
        const totalPackets = stats.packetsLost + stats.packetsSent;
        if (totalPackets > 0) {
          metrics.packetLoss.push((stats.packetsLost / totalPackets) * 100);
        }
      }

      pushMetric(metrics.rttMs, stats.roundTripTime, (value) => value * 1000);
      pushMetric(metrics.jitterMs, stats.jitter, (value) => value * 1000);
    }
  });

  return {
    bitrate: roundMetric(average(metrics.bitrate), 0),
    packetLoss: roundMetric(average(metrics.packetLoss), 1),
    jitterMs: roundMetric(average(metrics.jitterMs), 0),
    rttMs: roundMetric(average(metrics.rttMs), 0),
  };
}

export function getWorstConnectionQuality(
  qualities: Array<ConnectionQuality | null | undefined>,
): ConnectionQuality {
  const normalized = qualities.filter((quality): quality is ConnectionQuality => Boolean(quality));
  if (normalized.length === 0) {
    return ConnectionQuality.Unknown;
  }

  return normalized.reduce((worst, quality) => {
    if (QUALITY_PRIORITY[quality] < QUALITY_PRIORITY[worst]) {
      return quality;
    }

    return worst;
  }, ConnectionQuality.Unknown);
}

export function buildTelemetrySnapshot(args: {
  metrics: Array<Partial<CallTelemetrySnapshot>>;
  quality: ConnectionQuality;
  participantCount: number;
  reconnectCount: number;
}): CallTelemetrySnapshot {
  const bitrate: number[] = [];
  const packetLoss: number[] = [];
  const jitterMs: number[] = [];
  const rttMs: number[] = [];

  args.metrics.forEach((metric) => {
    pushMetric(bitrate, metric.bitrate);
    pushMetric(packetLoss, metric.packetLoss);
    pushMetric(jitterMs, metric.jitterMs);
    pushMetric(rttMs, metric.rttMs);
  });

  return {
    bitrate: roundMetric(average(bitrate), 0),
    packetLoss: roundMetric(average(packetLoss), 1),
    jitterMs: roundMetric(average(jitterMs), 0),
    rttMs: roundMetric(average(rttMs), 0),
    connectionQuality: args.quality,
    qualityScore: QUALITY_SCORE_MAP[args.quality],
    participantCount: args.participantCount,
    reconnectCount: args.reconnectCount,
  };
}

export async function getParticipantAudioReport(participant: {
  getTrackPublication: (source: Track.Source) => { audioTrack?: { getRTCStatsReport?: () => Promise<RTCStatsReport | undefined> }; track?: { getRTCStatsReport?: () => Promise<RTCStatsReport | undefined> } } | undefined;
}) {
  const publication = participant.getTrackPublication(Track.Source.Microphone);
  const track = publication?.audioTrack || publication?.track;
  if (!track || typeof track.getRTCStatsReport !== "function") {
    return undefined;
  }

  return track.getRTCStatsReport();
}
