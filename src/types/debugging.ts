import { z } from 'zod';

export const LogLevelSchema = z.enum(['debug', 'info', 'warning', 'error', 'critical']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const LogSourceSchema = z.enum([
  'router_syslog',
  'router_wireless',
  'router_dmesg',
  'homeassistant',
  'zigbee',
  'bluetooth',
]);
export type LogSource = z.infer<typeof LogSourceSchema>;

export const ParsedLogEntrySchema = z.object({
  timestamp: z.date(),
  source: LogSourceSchema,
  level: LogLevelSchema,
  message: z.string(),
  category: z.string().optional(),
  deviceMac: z.string().optional(),
  nodeId: z.string().optional(),
  rawLine: z.string(),
});
export type ParsedLogEntry = z.infer<typeof ParsedLogEntrySchema>;

export const IssuePatternSchema = z.object({
  id: z.string(),
  name: z.string(),
  pattern: z.string(),
  regex: z.string(),
  severity: LogLevelSchema,
  category: z.string(),
  description: z.string(),
  recommendation: z.string(),
  autoFixAvailable: z.boolean(),
  autoFixAction: z.string().optional(),
});
export type IssuePattern = z.infer<typeof IssuePatternSchema>;

export const DetectedIssueSchema = z.object({
  id: z.string(),
  patternId: z.string(),
  timestamp: z.date(),
  source: LogSourceSchema,
  severity: LogLevelSchema,
  category: z.string(),
  description: z.string(),
  affectedDevices: z.array(z.string()),
  affectedNodes: z.array(z.string()),
  logEntries: z.array(ParsedLogEntrySchema),
  recommendation: z.string(),
  autoFixAvailable: z.boolean(),
  resolved: z.boolean().default(false),
  resolvedAt: z.date().optional(),
  resolvedBy: z.string().optional(),
});
export type DetectedIssue = z.infer<typeof DetectedIssueSchema>;

export const CorrelatedEventSchema = z.object({
  timestamp: z.date(),
  events: z.array(z.object({
    source: LogSourceSchema,
    message: z.string(),
    deviceMac: z.string().optional(),
  })),
  correlationType: z.enum([
    'interference',
    'device_disconnect',
    'channel_change',
    'node_overload',
    'external_interference',
    'firmware_issue',
  ]),
  confidence: z.number().min(0).max(1),
  analysis: z.string(),
});
export type CorrelatedEvent = z.infer<typeof CorrelatedEventSchema>;

export const DebugSessionSchema = z.object({
  id: z.string(),
  startTime: z.date(),
  endTime: z.date().optional(),
  status: z.enum(['running', 'completed', 'failed']),
  logsAnalyzed: z.number(),
  issuesDetected: z.array(DetectedIssueSchema),
  correlatedEvents: z.array(CorrelatedEventSchema),
  summary: z.object({
    totalLogs: z.number(),
    errorCount: z.number(),
    warningCount: z.number(),
    criticalIssues: z.number(),
    autoFixApplied: z.number(),
  }),
  recommendations: z.array(z.string()),
});
export type DebugSession = z.infer<typeof DebugSessionSchema>;

export const KNOWN_ISSUE_PATTERNS: IssuePattern[] = [
  {
    id: 'deauth_flood',
    name: 'Deauthentication Flood',
    pattern: 'deauth flood detected',
    regex: '(deauth|disassoc).*(flood|attack)',
    severity: 'critical',
    category: 'security',
    description: 'Possible deauthentication attack detected',
    recommendation: 'Enable Protected Management Frames (PMF/802.11w)',
    autoFixAvailable: true,
    autoFixAction: 'nvram set wl0_mfp=2 && nvram set wl1_mfp=2',
  },
  {
    id: 'channel_interference',
    name: 'Channel Interference',
    pattern: 'interference detected',
    regex: '(interference|noise|congestion).*(channel|frequency)',
    severity: 'warning',
    category: 'performance',
    description: 'High interference on current channel',
    recommendation: 'Run channel scan and switch to less congested channel',
    autoFixAvailable: true,
    autoFixAction: 'auto_channel_switch',
  },
  {
    id: 'client_disconnect_loop',
    name: 'Client Disconnect Loop',
    pattern: 'repeated disconnect',
    regex: '(disconnect|deauth|disassoc).*([0-9A-Fa-f:]{17})',
    severity: 'error',
    category: 'connectivity',
    description: 'Client repeatedly disconnecting and reconnecting',
    recommendation: 'Check client driver, adjust roaming threshold, or add mesh node',
    autoFixAvailable: false,
  },
  {
    id: 'radar_dfs',
    name: 'DFS Radar Detection',
    pattern: 'radar detected',
    regex: '(radar|dfs).*(detect|switch|event)',
    severity: 'warning',
    category: 'regulatory',
    description: 'Radar detected on DFS channel, channel switch required',
    recommendation: 'Normal behavior; consider non-DFS channels if frequent',
    autoFixAvailable: false,
  },
  {
    id: 'mesh_backhaul_weak',
    name: 'Weak Mesh Backhaul',
    pattern: 'backhaul signal weak',
    regex: '(backhaul|mesh).*(weak|low|poor)',
    severity: 'warning',
    category: 'mesh',
    description: 'Mesh backhaul connection is weak',
    recommendation: 'Move mesh nodes closer or use wired backhaul',
    autoFixAvailable: false,
  },
  {
    id: 'memory_pressure',
    name: 'Memory Pressure',
    pattern: 'out of memory',
    regex: '(oom|out.of.memory|memory.pressure|low.memory)',
    severity: 'critical',
    category: 'system',
    description: 'Router running low on memory',
    recommendation: 'Reduce connected devices or reboot router',
    autoFixAvailable: true,
    autoFixAction: 'service restart_wireless',
  },
  {
    id: 'zigbee_interference',
    name: 'Zigbee WiFi Interference',
    pattern: 'zigbee interference',
    regex: '(zigbee|zha|z2m).*(interfere|fail|timeout|retry)',
    severity: 'warning',
    category: 'interference',
    description: 'Zigbee experiencing WiFi interference',
    recommendation: 'Change WiFi 2.4GHz or Zigbee channel to non-overlapping',
    autoFixAvailable: true,
    autoFixAction: 'optimize_zigbee_channel',
  },
];
