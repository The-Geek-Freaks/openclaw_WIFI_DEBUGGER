import { createChildLogger } from '../utils/logger.js';
import { getWifi2gZigbeeOverlap } from '../utils/frequency.js';
import type { MeshNetworkState, ConnectionEvent, ChannelScanResult } from '../types/network.js';
import type { ZigbeeNetworkState } from '../types/zigbee.js';
import type { 
  NetworkProblem, 
  SeverityLevel,
  ConnectionStabilityReport,
  NetworkHealthScore 
} from '../types/analysis.js';

const logger = createChildLogger('problem-detector');

export class ProblemDetector {
  private problems: Map<string, NetworkProblem> = new Map();
  private readonly thresholds = {
    weakSignal: -75,
    criticalSignal: -85,
    highDisconnectRate: 3,
    roamingThreshold: 5,
    channelOverlap: 0.3,
    congestionLevel: 70,
  };

  analyze(
    meshState: MeshNetworkState,
    connectionEvents: ConnectionEvent[],
    channelScan?: ChannelScanResult[],
    zigbeeState?: ZigbeeNetworkState
  ): NetworkProblem[] {
    const newProblems: NetworkProblem[] = [];

    newProblems.push(...this.detectSignalProblems(meshState));
    newProblems.push(...this.detectConnectionProblems(meshState, connectionEvents));
    newProblems.push(...this.detectRoamingProblems(meshState, connectionEvents));
    
    if (channelScan) {
      newProblems.push(...this.detectInterferenceProblems(meshState, channelScan));
    }
    
    if (zigbeeState) {
      newProblems.push(...this.detectFrequencyConflicts(meshState, zigbeeState));
    }

    newProblems.push(...this.detectConfigurationProblems(meshState));
    newProblems.push(...this.detectCapacityProblems(meshState));

    for (const problem of newProblems) {
      this.problems.set(problem.id, problem);
    }

    logger.info({ problemCount: newProblems.length }, 'Problem analysis complete');
    return newProblems;
  }

  private detectSignalProblems(state: MeshNetworkState): NetworkProblem[] {
    const problems: NetworkProblem[] = [];

    for (const device of state.devices) {
      if (device.signalStrength === undefined) continue;

      if (device.signalStrength < this.thresholds.criticalSignal) {
        problems.push({
          id: `signal-critical-${device.macAddress}`,
          category: 'signal_weakness',
          severity: 'critical',
          affectedDevices: [device.macAddress],
          affectedNodes: [device.connectedToNode],
          description: `Device ${device.hostname ?? device.macAddress} has critically weak signal (${device.signalStrength} dBm)`,
          rootCause: 'Device is too far from any mesh node or has obstructions',
          recommendation: 'Move the device closer to a mesh node or add a new mesh node in this area',
          autoFixAvailable: false,
          detectedAt: new Date(),
        });
      } else if (device.signalStrength < this.thresholds.weakSignal) {
        problems.push({
          id: `signal-weak-${device.macAddress}`,
          category: 'signal_weakness',
          severity: 'warning',
          affectedDevices: [device.macAddress],
          affectedNodes: [device.connectedToNode],
          description: `Device ${device.hostname ?? device.macAddress} has weak signal (${device.signalStrength} dBm)`,
          rootCause: 'Device is at the edge of WiFi coverage',
          recommendation: 'Consider repositioning device or mesh node',
          autoFixAvailable: false,
          detectedAt: new Date(),
        });
      }
    }

    return problems;
  }

  private detectConnectionProblems(
    state: MeshNetworkState,
    events: ConnectionEvent[]
  ): NetworkProblem[] {
    const problems: NetworkProblem[] = [];
    const recentEvents = events.filter(
      e => Date.now() - e.timestamp.getTime() < 24 * 60 * 60 * 1000
    );

    const disconnectCounts = new Map<string, number>();
    for (const event of recentEvents) {
      if (event.eventType === 'disconnect') {
        const count = disconnectCounts.get(event.deviceMac) ?? 0;
        disconnectCounts.set(event.deviceMac, count + 1);
      }
    }

    for (const [mac, count] of disconnectCounts) {
      if (count >= this.thresholds.highDisconnectRate) {
        const device = state.devices.find(d => d.macAddress === mac);
        problems.push({
          id: `disconnect-frequent-${mac}`,
          category: 'roaming_issue',
          severity: count >= 10 ? 'error' : 'warning',
          affectedDevices: [mac],
          affectedNodes: device ? [device.connectedToNode] : [],
          description: `Device ${device?.hostname ?? mac} has disconnected ${count} times in 24 hours`,
          rootCause: 'Possible causes: signal instability, interference, or device driver issues',
          recommendation: 'Check for interference, update device drivers, or adjust roaming settings',
          autoFixAvailable: true,
          detectedAt: new Date(),
        });
      }
    }

    return problems;
  }

  private detectRoamingProblems(
    state: MeshNetworkState,
    events: ConnectionEvent[]
  ): NetworkProblem[] {
    const problems: NetworkProblem[] = [];
    const recentEvents = events.filter(
      e => e.eventType === 'roam' && Date.now() - e.timestamp.getTime() < 60 * 60 * 1000
    );

    const roamCounts = new Map<string, number>();
    for (const event of recentEvents) {
      const count = roamCounts.get(event.deviceMac) ?? 0;
      roamCounts.set(event.deviceMac, count + 1);
    }

    for (const [mac, count] of roamCounts) {
      if (count >= this.thresholds.roamingThreshold) {
        const device = state.devices.find(d => d.macAddress === mac);
        problems.push({
          id: `roaming-excessive-${mac}`,
          category: 'roaming_issue',
          severity: 'warning',
          affectedDevices: [mac],
          affectedNodes: [],
          description: `Device ${device?.hostname ?? mac} is roaming excessively (${count} times/hour)`,
          rootCause: 'Device is in a zone where multiple mesh nodes have similar signal strength',
          recommendation: 'Adjust roaming threshold or reposition mesh nodes',
          autoFixAvailable: true,
          detectedAt: new Date(),
        });
      }
    }

    return problems;
  }

  private detectInterferenceProblems(
    _state: MeshNetworkState,
    channelScan: ChannelScanResult[]
  ): NetworkProblem[] {
    const problems: NetworkProblem[] = [];

    for (const result of channelScan) {
      if (result.utilization > this.thresholds.congestionLevel) {
        problems.push({
          id: `congestion-${result.band}-${result.channel}`,
          category: 'congestion',
          severity: result.utilization > 90 ? 'error' : 'warning',
          affectedDevices: [],
          affectedNodes: [],
          description: `Channel ${result.channel} (${result.band}) has ${result.utilization}% utilization`,
          rootCause: 'Too many devices or neighboring networks on this channel',
          recommendation: `Switch to a less congested channel`,
          autoFixAvailable: true,
          detectedAt: new Date(),
        });
      }

      for (const network of result.interferingNetworks) {
        if (network.overlap > this.thresholds.channelOverlap && network.signalStrength > -70) {
          problems.push({
            id: `interference-${result.channel}-${network.bssid}`,
            category: 'interference',
            severity: 'warning',
            affectedDevices: [],
            affectedNodes: [],
            description: `Strong interference from "${network.ssid}" on channel ${network.channel}`,
            rootCause: 'Neighboring network overlaps with your channel',
            recommendation: 'Change to a non-overlapping channel',
            autoFixAvailable: true,
            detectedAt: new Date(),
          });
        }
      }
    }

    return problems;
  }

  private detectFrequencyConflicts(
    meshState: MeshNetworkState,
    zigbeeState: ZigbeeNetworkState
  ): NetworkProblem[] {
    const problems: NetworkProblem[] = [];

    const wifi2gSettings = meshState.wifiSettings.find(s => s.band === '2.4GHz');
    if (!wifi2gSettings) return problems;

    const overlap = getWifi2gZigbeeOverlap(wifi2gSettings.channel, zigbeeState.channel);
    
    if (overlap > 0.5) {
      problems.push({
        id: `zigbee-wifi-overlap`,
        category: 'frequency_overlap',
        severity: overlap > 0.8 ? 'error' : 'warning',
        affectedDevices: zigbeeState.devices.map(d => d.ieeeAddress),
        affectedNodes: [],
        description: `Zigbee channel ${zigbeeState.channel} overlaps ${(overlap * 100).toFixed(0)}% with WiFi channel ${wifi2gSettings.channel}`,
        rootCause: 'Zigbee and 2.4GHz WiFi share the same frequency spectrum',
        recommendation: 'Change WiFi channel to 1 and Zigbee to 25, or WiFi to 11 and Zigbee to 15',
        autoFixAvailable: true,
        detectedAt: new Date(),
      });
    }

    return problems;
  }

  private detectConfigurationProblems(state: MeshNetworkState): NetworkProblem[] {
    const problems: NetworkProblem[] = [];

    for (const settings of state.wifiSettings) {
      if (settings.band === '2.4GHz' && ![1, 6, 11].includes(settings.channel)) {
        problems.push({
          id: `config-2g-channel`,
          category: 'configuration_error',
          severity: 'warning',
          affectedDevices: [],
          affectedNodes: [],
          description: `2.4GHz uses non-standard channel ${settings.channel}`,
          rootCause: 'Using overlapping channel can cause interference',
          recommendation: 'Use channel 1, 6, or 11 for 2.4GHz',
          autoFixAvailable: true,
          detectedAt: new Date(),
        });
      }

      if (!settings.beamforming) {
        problems.push({
          id: `config-beamforming-${settings.band}`,
          category: 'configuration_error',
          severity: 'info',
          affectedDevices: [],
          affectedNodes: [],
          description: `Beamforming is disabled on ${settings.band}`,
          rootCause: 'Beamforming improves signal quality for compatible devices',
          recommendation: 'Enable beamforming for better performance',
          autoFixAvailable: true,
          detectedAt: new Date(),
        });
      }
    }

    return problems;
  }

  private detectCapacityProblems(state: MeshNetworkState): NetworkProblem[] {
    const problems: NetworkProblem[] = [];

    for (const node of state.nodes) {
      if (node.connectedClients > 30) {
        problems.push({
          id: `capacity-clients-${node.id}`,
          category: 'capacity_exceeded',
          severity: node.connectedClients > 50 ? 'error' : 'warning',
          affectedDevices: [],
          affectedNodes: [node.id],
          description: `Node ${node.name} has ${node.connectedClients} connected clients`,
          rootCause: 'Too many devices connected to a single mesh node',
          recommendation: 'Add another mesh node to distribute the load',
          autoFixAvailable: false,
          detectedAt: new Date(),
        });
      }

      if (node.cpuUsage > 80) {
        problems.push({
          id: `capacity-cpu-${node.id}`,
          category: 'capacity_exceeded',
          severity: node.cpuUsage > 95 ? 'critical' : 'warning',
          affectedDevices: [],
          affectedNodes: [node.id],
          description: `Node ${node.name} has high CPU usage (${node.cpuUsage}%)`,
          rootCause: 'Router is overloaded',
          recommendation: 'Reduce traffic or upgrade hardware',
          autoFixAvailable: false,
          detectedAt: new Date(),
        });
      }
    }

    return problems;
  }

  generateStabilityReport(
    deviceMac: string,
    events: ConnectionEvent[],
    periodHours: number = 24
  ): ConnectionStabilityReport {
    const cutoff = Date.now() - periodHours * 60 * 60 * 1000;
    const deviceEvents = events.filter(
      e => e.deviceMac === deviceMac && e.timestamp.getTime() > cutoff
    ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    let totalConnections = 0;
    let totalDisconnections = 0;
    let connectionDurations: number[] = [];
    let disconnectReasons: Map<string, number> = new Map();
    let lastConnectTime: number | null = null;

    for (const event of deviceEvents) {
      if (event.eventType === 'connect') {
        totalConnections++;
        lastConnectTime = event.timestamp.getTime();
      } else if (event.eventType === 'disconnect') {
        totalDisconnections++;
        if (lastConnectTime) {
          connectionDurations.push(event.timestamp.getTime() - lastConnectTime);
          lastConnectTime = null;
        }
        const reason = (event.details?.['reason'] as string) ?? 'unknown';
        disconnectReasons.set(reason, (disconnectReasons.get(reason) ?? 0) + 1);
      }
    }

    const avgDuration = connectionDurations.length > 0
      ? connectionDurations.reduce((a, b) => a + b, 0) / connectionDurations.length
      : periodHours * 60 * 60 * 1000;

    const stabilityScore = Math.max(0, Math.min(100,
      100 - (totalDisconnections * 10) - (totalDisconnections > 0 ? 20 : 0)
    ));

    return {
      deviceMac,
      period: {
        start: new Date(cutoff),
        end: new Date(),
      },
      totalConnectionTime: connectionDurations.reduce((a, b) => a + b, 0),
      totalDisconnections,
      avgConnectionDuration: avgDuration,
      longestConnection: connectionDurations.length > 0 ? Math.max(...connectionDurations) : 0,
      shortestConnection: connectionDurations.length > 0 ? Math.min(...connectionDurations) : 0,
      disconnectionReasons: Array.from(disconnectReasons.entries()).map(([reason, count]) => ({
        reason,
        count,
      })),
      stabilityScore,
    };
  }

  calculateHealthScore(
    _state: MeshNetworkState,
    problems: NetworkProblem[]
  ): NetworkHealthScore {
    let signalQuality = 100;
    let channelOptimization = 100;
    let deviceStability = 100;
    let meshBackhaul = 100;
    let zigbeeHealth = 100;
    let interferenceLevel = 100;

    for (const problem of problems) {
      const penalty = this.getSeverityPenalty(problem.severity);
      
      switch (problem.category) {
        case 'signal_weakness':
          signalQuality -= penalty;
          break;
        case 'congestion':
        case 'interference':
          channelOptimization -= penalty;
          interferenceLevel -= penalty;
          break;
        case 'roaming_issue':
          deviceStability -= penalty;
          break;
        case 'frequency_overlap':
          zigbeeHealth -= penalty;
          break;
        case 'configuration_error':
          channelOptimization -= penalty / 2;
          break;
        case 'capacity_exceeded':
          meshBackhaul -= penalty;
          break;
      }
    }

    const categories = {
      signalQuality: Math.max(0, signalQuality),
      channelOptimization: Math.max(0, channelOptimization),
      deviceStability: Math.max(0, deviceStability),
      meshBackhaul: Math.max(0, meshBackhaul),
      zigbeeHealth: Math.max(0, zigbeeHealth),
      interferenceLevel: Math.max(0, interferenceLevel),
    };

    const overall = Math.round(
      (categories.signalQuality +
        categories.channelOptimization +
        categories.deviceStability +
        categories.meshBackhaul +
        categories.zigbeeHealth +
        categories.interferenceLevel) / 6
    );

    return {
      timestamp: new Date(),
      overall,
      categories,
      trend: 'stable',
    };
  }

  private getSeverityPenalty(severity: SeverityLevel): number {
    switch (severity) {
      case 'critical': return 30;
      case 'error': return 20;
      case 'warning': return 10;
      case 'info': return 5;
    }
  }

  getActiveProblems(): NetworkProblem[] {
    return Array.from(this.problems.values()).filter(p => !p.resolvedAt);
  }

  resolveProblem(problemId: string): void {
    const problem = this.problems.get(problemId);
    if (problem) {
      problem.resolvedAt = new Date();
      logger.info({ problemId }, 'Problem marked as resolved');
    }
  }
}
