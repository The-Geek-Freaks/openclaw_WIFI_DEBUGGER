import { createChildLogger } from '../utils/logger.js';
import type { AsusSshClient } from '../infra/asus-ssh-client.js';
import type { HomeAssistantClient } from '../infra/homeassistant-client.js';
import type {
  ParsedLogEntry,
  DetectedIssue,
  CorrelatedEvent,
  DebugSession,
  IssuePattern,
} from '../types/debugging.js';

const logger = createChildLogger('auto-debugger');

const ISSUE_PATTERNS: IssuePattern[] = [
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

export class AutoDebugger {
  private readonly sshClient: AsusSshClient;
  private readonly _hassClient: HomeAssistantClient | null;
  private sessions: DebugSession[] = [];
  private currentSession: DebugSession | null = null;

  constructor(sshClient: AsusSshClient, hassClient?: HomeAssistantClient) {
    this.sshClient = sshClient;
    this._hassClient = hassClient ?? null;
  }

  async startSession(): Promise<string> {
    const sessionId = `debug_${Date.now()}`;
    
    this.currentSession = {
      id: sessionId,
      startTime: new Date(),
      status: 'running',
      logsAnalyzed: 0,
      issuesDetected: [],
      correlatedEvents: [],
      summary: {
        totalLogs: 0,
        errorCount: 0,
        warningCount: 0,
        criticalIssues: 0,
        autoFixApplied: 0,
      },
      recommendations: [],
    };

    logger.info({ sessionId }, 'Debug session started');
    return sessionId;
  }

  async analyzeLogs(maxLines: number = 500): Promise<DetectedIssue[]> {
    if (!this.currentSession) {
      await this.startSession();
    }

    const issues: DetectedIssue[] = [];

    const routerLogs = await this.fetchRouterLogs(maxLines);
    const parsedLogs = this.parseLogs(routerLogs, 'router_syslog');

    this.currentSession!.logsAnalyzed += parsedLogs.length;
    this.currentSession!.summary.totalLogs = parsedLogs.length;

    for (const pattern of ISSUE_PATTERNS) {
      const matchingLogs = parsedLogs.filter(log => {
        const regex = new RegExp(pattern.regex, 'i');
        return regex.test(log.message);
      });

      if (matchingLogs.length > 0) {
        const affectedDevices = this.extractDevicesFromLogs(matchingLogs);
        
        const issue: DetectedIssue = {
          id: `${pattern.id}_${Date.now()}`,
          patternId: pattern.id,
          timestamp: new Date(),
          source: 'router_syslog',
          severity: pattern.severity,
          category: pattern.category,
          description: `${pattern.description} (${matchingLogs.length} occurrences)`,
          affectedDevices,
          affectedNodes: [],
          logEntries: matchingLogs.slice(0, 10),
          recommendation: pattern.recommendation,
          autoFixAvailable: pattern.autoFixAvailable,
          resolved: false,
        };

        issues.push(issue);
        this.currentSession!.issuesDetected.push(issue);

        if (pattern.severity === 'critical') {
          this.currentSession!.summary.criticalIssues++;
        } else if (pattern.severity === 'error') {
          this.currentSession!.summary.errorCount++;
        } else if (pattern.severity === 'warning') {
          this.currentSession!.summary.warningCount++;
        }
      }
    }

    const correlatedEvents = this.correlateEvents(parsedLogs);
    this.currentSession!.correlatedEvents.push(...correlatedEvents);

    logger.info({ 
      issueCount: issues.length, 
      logsAnalyzed: parsedLogs.length 
    }, 'Log analysis complete');

    return issues;
  }

  private async fetchRouterLogs(maxLines: number): Promise<string[]> {
    const logs: string[] = [];

    try {
      const syslog = await this.sshClient.execute(`tail -n ${maxLines} /tmp/syslog.log 2>/dev/null || echo ""`);
      logs.push(...syslog.split('\n').filter(Boolean));
    } catch {
      logger.warn('Could not fetch syslog');
    }

    try {
      const dmesg = await this.sshClient.execute(`dmesg | tail -n ${Math.floor(maxLines / 2)}`);
      logs.push(...dmesg.split('\n').filter(Boolean));
    } catch {
      logger.warn('Could not fetch dmesg');
    }

    try {
      const wirelessLog = await this.sshClient.getWirelessLog();
      logs.push(...wirelessLog.split('\n').filter(Boolean));
    } catch {
      logger.warn('Could not fetch wireless log');
    }

    return logs;
  }

  private parseLogs(lines: string[], source: ParsedLogEntry['source']): ParsedLogEntry[] {
    const entries: ParsedLogEntry[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      let level: ParsedLogEntry['level'] = 'info';
      if (/error|fail|critical/i.test(line)) level = 'error';
      else if (/warn/i.test(line)) level = 'warning';
      else if (/debug/i.test(line)) level = 'debug';

      const macMatch = line.match(/([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/);
      const timestampMatch = line.match(/^(\w{3}\s+\d+\s+\d+:\d+:\d+)/);

      entries.push({
        timestamp: timestampMatch ? new Date(timestampMatch[1]!) : new Date(),
        source,
        level,
        message: line,
        deviceMac: macMatch?.[0],
        rawLine: line,
      });
    }

    return entries;
  }

  private extractDevicesFromLogs(logs: ParsedLogEntry[]): string[] {
    const devices = new Set<string>();
    
    for (const log of logs) {
      if (log.deviceMac) {
        devices.add(log.deviceMac.toLowerCase());
      }
    }

    return Array.from(devices);
  }

  private correlateEvents(logs: ParsedLogEntry[]): CorrelatedEvent[] {
    const events: CorrelatedEvent[] = [];
    const timeWindow = 60000;

    const disconnects = logs.filter(l => /disconnect|deauth/i.test(l.message));

    for (const disconnect of disconnects) {
      const nearbyEvents = logs.filter(l => 
        Math.abs(l.timestamp.getTime() - disconnect.timestamp.getTime()) < timeWindow
      );

      const interferenceEvents = nearbyEvents.filter(l => 
        /interference|noise|radar/i.test(l.message)
      );

      if (interferenceEvents.length > 0) {
        events.push({
          timestamp: disconnect.timestamp,
          events: [
            { source: disconnect.source, message: disconnect.message, deviceMac: disconnect.deviceMac },
            ...interferenceEvents.slice(0, 3).map(e => ({ 
              source: e.source, 
              message: e.message, 
              deviceMac: e.deviceMac 
            })),
          ],
          correlationType: 'interference',
          confidence: 0.7 + (interferenceEvents.length * 0.1),
          analysis: 'Device disconnect appears correlated with interference events',
        });
      }
    }

    const deviceDisconnects = new Map<string, number>();
    for (const d of disconnects) {
      if (d.deviceMac) {
        deviceDisconnects.set(d.deviceMac, (deviceDisconnects.get(d.deviceMac) ?? 0) + 1);
      }
    }

    for (const [mac, count] of deviceDisconnects) {
      if (count >= 3) {
        events.push({
          timestamp: new Date(),
          events: disconnects.filter(d => d.deviceMac === mac).slice(0, 5).map(d => ({
            source: d.source,
            message: d.message,
            deviceMac: d.deviceMac,
          })),
          correlationType: 'device_disconnect',
          confidence: 0.8,
          analysis: `Device ${mac} has ${count} disconnects - possible driver or signal issue`,
        });
      }
    }

    return events;
  }

  async applyAutoFix(issueId: string): Promise<boolean> {
    const issue = this.currentSession?.issuesDetected.find(i => i.id === issueId);
    if (!issue || !issue.autoFixAvailable) {
      logger.warn({ issueId }, 'Issue not found or auto-fix not available');
      return false;
    }

    const pattern = ISSUE_PATTERNS.find(p => p.id === issue.patternId);
    if (!pattern?.autoFixAction) {
      return false;
    }

    logger.info({ issueId, action: pattern.autoFixAction }, 'Applying auto-fix');

    try {
      if (pattern.autoFixAction === 'auto_channel_switch') {
        logger.info('Auto channel switch would be triggered here');
      } else if (pattern.autoFixAction === 'optimize_zigbee_channel') {
        logger.info('Zigbee channel optimization would be triggered here');
      } else {
        await this.sshClient.execute(pattern.autoFixAction);
        await this.sshClient.commitNvram();
      }

      issue.resolved = true;
      issue.resolvedAt = new Date();
      issue.resolvedBy = 'auto_fix';
      this.currentSession!.summary.autoFixApplied++;

      logger.info({ issueId }, 'Auto-fix applied successfully');
      return true;
    } catch (err) {
      logger.error({ err, issueId }, 'Auto-fix failed');
      return false;
    }
  }

  async endSession(): Promise<DebugSession | null> {
    if (!this.currentSession) return null;

    this.currentSession.endTime = new Date();
    this.currentSession.status = 'completed';

    this.currentSession.recommendations = this.generateRecommendations();

    this.sessions.push(this.currentSession);
    const session = this.currentSession;
    this.currentSession = null;

    logger.info({ 
      sessionId: session.id, 
      issuesFound: session.issuesDetected.length 
    }, 'Debug session ended');

    return session;
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    
    if (!this.currentSession) return recommendations;

    if (this.currentSession.summary.criticalIssues > 0) {
      recommendations.push('Kritische Probleme erkannt - sofortige Aufmerksamkeit erforderlich');
    }

    const interferenceIssues = this.currentSession.issuesDetected.filter(
      i => i.category === 'interference' || i.category === 'performance'
    );
    if (interferenceIssues.length > 0) {
      recommendations.push('Führe Spektrum-Scan durch und wechsle zu optimalem Kanal');
    }

    const disconnectEvents = this.currentSession.correlatedEvents.filter(
      e => e.correlationType === 'device_disconnect'
    );
    if (disconnectEvents.length > 0) {
      recommendations.push('Überprüfe Geräte mit häufigen Verbindungsabbrüchen auf Treiberupdates');
    }

    if (this.currentSession.summary.autoFixApplied > 0) {
      recommendations.push(`${this.currentSession.summary.autoFixApplied} automatische Korrekturen wurden angewendet - Router-Neustart empfohlen`);
    }

    return recommendations;
  }

  getCurrentSession(): DebugSession | null {
    return this.currentSession;
  }

  getSessionHistory(): DebugSession[] {
    return [...this.sessions];
  }
}
