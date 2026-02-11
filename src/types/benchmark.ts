import { z } from 'zod';

export const BenchmarkTestTypeSchema = z.enum([
  'throughput',
  'latency',
  'jitter',
  'packet_loss',
  'handoff',
  'roaming',
]);
export type BenchmarkTestType = z.infer<typeof BenchmarkTestTypeSchema>;

export const IperfResultSchema = z.object({
  timestamp: z.date(),
  sourceNode: z.string(),
  targetNode: z.string(),
  protocol: z.enum(['tcp', 'udp']),
  direction: z.enum(['upload', 'download', 'bidirectional']),
  duration: z.number(),
  bandwidthMbps: z.number(),
  transferMB: z.number(),
  retransmits: z.number().optional(),
  jitterMs: z.number().optional(),
  packetLossPercent: z.number().optional(),
});
export type IperfResult = z.infer<typeof IperfResultSchema>;

export const LatencyTestResultSchema = z.object({
  timestamp: z.date(),
  target: z.string(),
  minMs: z.number(),
  avgMs: z.number(),
  maxMs: z.number(),
  jitterMs: z.number(),
  packetsSent: z.number(),
  packetsReceived: z.number(),
  packetLossPercent: z.number(),
});
export type LatencyTestResult = z.infer<typeof LatencyTestResultSchema>;

export const HandoffTestResultSchema = z.object({
  timestamp: z.date(),
  deviceMac: z.string(),
  fromNode: z.string(),
  toNode: z.string(),
  handoffTimeMs: z.number(),
  packetLossDuringHandoff: z.number(),
  signalBeforeDbm: z.number(),
  signalAfterDbm: z.number(),
  success: z.boolean(),
});
export type HandoffTestResult = z.infer<typeof HandoffTestResultSchema>;

export const BenchmarkSuiteResultSchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  duration: z.number(),
  tests: z.object({
    throughput: z.array(IperfResultSchema).optional(),
    latency: z.array(LatencyTestResultSchema).optional(),
    handoff: z.array(HandoffTestResultSchema).optional(),
  }),
  scores: z.object({
    overall: z.number().min(0).max(100),
    throughput: z.number().min(0).max(100),
    latency: z.number().min(0).max(100),
    stability: z.number().min(0).max(100),
    coverage: z.number().min(0).max(100),
  }),
  comparison: z.object({
    previousScore: z.number().optional(),
    improvement: z.number().optional(),
    trend: z.enum(['improving', 'stable', 'degrading']),
  }).optional(),
});
export type BenchmarkSuiteResult = z.infer<typeof BenchmarkSuiteResultSchema>;

export const ChannelTestResultSchema = z.object({
  channel: z.number(),
  band: z.enum(['2.4GHz', '5GHz', '6GHz']),
  testDuration: z.number(),
  metrics: z.object({
    noiseFloorDbm: z.number(),
    avgUtilization: z.number(),
    peakUtilization: z.number(),
    interferingAPs: z.number(),
    coChannelInterference: z.number(),
    adjacentChannelInterference: z.number(),
    dfsEvents: z.number().optional(),
    radarDetected: z.boolean().optional(),
  }),
  score: z.number().min(0).max(100),
  recommendation: z.enum(['excellent', 'good', 'acceptable', 'avoid']),
});
export type ChannelTestResult = z.infer<typeof ChannelTestResultSchema>;

export const SpectrumScanResultSchema = z.object({
  timestamp: z.date(),
  band: z.enum(['2.4GHz', '5GHz', '6GHz']),
  scanDuration: z.number(),
  channels: z.array(ChannelTestResultSchema),
  bestChannel: z.number(),
  currentChannel: z.number(),
  recommendedAction: z.string().optional(),
  zigbeeConflicts: z.array(z.object({
    wifiChannel: z.number(),
    zigbeeChannel: z.number(),
    overlapPercent: z.number(),
  })).optional(),
});
export type SpectrumScanResult = z.infer<typeof SpectrumScanResultSchema>;
