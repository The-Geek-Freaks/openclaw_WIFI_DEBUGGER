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

    problems.push(...this.detectZigbeeDeviceProblems(zigbeeState));
    problems.push(...this.detectZigbeeNetworkProblems(zigbeeState));

    return problems;
  }

  private detectZigbeeDeviceProblems(zigbeeState: ZigbeeNetworkState): NetworkProblem[] {
    const problems: NetworkProblem[] = [];

    for (const device of zigbeeState.devices) {
      if (device.type === 'coordinator') continue;

      if (!device.available) {
        problems.push({
          id: `zigbee-unavailable-${device.ieeeAddress}`,
          category: 'signal_weakness',
          severity: 'error',
          affectedDevices: [device.ieeeAddress],
          affectedNodes: [],
          description: `Zigbee device "${device.friendlyName ?? device.ieeeAddress}" is unavailable`,
          rootCause: 'Device may be offline, out of range, or have depleted battery',
          recommendation: 'Check device power, move closer to a router, or add a Zigbee router nearby',
          autoFixAvailable: false,
          detectedAt: new Date(),
        });
      }

      if (device.lqi < 50 && device.lqi > 0) {
        problems.push({
          id: `zigbee-weak-lqi-${device.ieeeAddress}`,
          category: 'signal_weakness',
          severity: device.lqi < 25 ? 'error' : 'warning',
          affectedDevices: [device.ieeeAddress],
          affectedNodes: [],
          description: `Zigbee device "${device.friendlyName ?? device.ieeeAddress}" has weak link quality (LQI: ${device.lqi})`,
          rootCause: 'Device is too far from coordinator or nearest router',
          recommendation: 'Add a Zigbee router (smart plug, bulb) between this device and coordinator',
          autoFixAvailable: false,
          detectedAt: new Date(),
        });
      }

      if (device.lastSeen) {
        const hoursSinceLastSeen = (Date.now() - device.lastSeen.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastSeen > 24 && device.available) {
          problems.push({
            id: `zigbee-stale-${device.ieeeAddress}`,
            category: 'roaming_issue',
            severity: 'warning',
            affectedDevices: [device.ieeeAddress],
            affectedNodes: [],
            description: `Zigbee device "${device.friendlyName ?? device.ieeeAddress}" not seen for ${Math.round(hoursSinceLastSeen)} hours`,
            rootCause: 'Device may be sleeping, disconnected, or have communication issues',
            recommendation: 'Trigger the device manually or check its battery/power',
            autoFixAvailable: false,
            detectedAt: new Date(),
          });
        }
      }
    }

    return problems;
  }

  private detectZigbeeNetworkProblems(zigbeeState: ZigbeeNetworkState): NetworkProblem[] {
    const problems: NetworkProblem[] = [];

    const routers = zigbeeState.devices.filter(d => d.type === 'router');
    const endDevices = zigbeeState.devices.filter(d => d.type === 'end_device');
    const unavailableCount = zigbeeState.devices.filter(d => !d.available && d.type !== 'coordinator').length;

    if (routers.length === 0 && endDevices.length > 5) {
      problems.push({
        id: 'zigbee-no-routers',
        category: 'configuration_error',
        severity: 'warning',
        affectedDevices: [],
        affectedNodes: [],
        description: `Zigbee network has ${endDevices.length} end devices but no routers`,
        rootCause: 'All devices connect directly to coordinator, limiting range and reliability',
        recommendation: 'Add Zigbee routers (mains-powered devices like smart plugs or bulbs) to extend network',
        autoFixAvailable: false,
        detectedAt: new Date(),
      });
    }

    if (unavailableCount > zigbeeState.devices.length * 0.3 && zigbeeState.devices.length > 5) {
      problems.push({
        id: 'zigbee-high-unavailability',
        category: 'capacity_exceeded',
        severity: 'error',
        affectedDevices: zigbeeState.devices.filter(d => !d.available).map(d => d.ieeeAddress),
        affectedNodes: [],
        description: `${unavailableCount} of ${zigbeeState.devices.length} Zigbee devices are unavailable (${Math.round(unavailableCount / zigbeeState.devices.length * 100)}%)`,
        rootCause: 'Network may be overloaded, have interference, or coordinator issues',
        recommendation: 'Check coordinator health, add routers, or investigate WiFi interference',
        autoFixAvailable: false,
        detectedAt: new Date(),
      });
    }

    const avgLqi = zigbeeState.devices.length > 0 
      ? zigbeeState.devices.reduce((sum, d) => sum + d.lqi, 0) / zigbeeState.devices.length 
      : 0;
    
    if (avgLqi < 100 && avgLqi > 0 && zigbeeState.devices.length > 3) {
      problems.push({
        id: 'zigbee-low-avg-lqi',
        category: 'signal_weakness',
        severity: avgLqi < 50 ? 'error' : 'warning',
        affectedDevices: [],
        affectedNodes: [],
        description: `Zigbee network has low average link quality (LQI: ${Math.round(avgLqi)})`,
        rootCause: 'Devices are generally far from routers or experiencing interference',
        recommendation: 'Add more Zigbee routers and check for WiFi/Zigbee channel conflicts',
        autoFixAvailable: false,
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
          id: `config-2g-channel-${settings.channel}`,
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
          recommendation: 'Enable beamforming via nvram set wl0_txbf=1 / wl1_txbf=1',
          autoFixAvailable: true,
          detectedAt: new Date(),
        });
      }

      if (!settings.muMimo) {
        problems.push({
          id: `config-mumimo-${settings.band}`,
          category: 'configuration_error',
          severity: 'info',
          affectedDevices: [],
          affectedNodes: [],
          description: `MU-MIMO is disabled on ${settings.band}`,
          rootCause: 'MU-MIMO enables simultaneous communication with multiple devices',
          recommendation: 'Enable MU-MIMO via nvram set wl0_mumimo=1 / wl1_mumimo=1',
          autoFixAvailable: true,
          detectedAt: new Date(),
        });
      }

      if (settings.ofdma === false) {
        problems.push({
          id: `config-ofdma-${settings.band}`,
          category: 'configuration_error',
          severity: 'info',
          affectedDevices: [],
          affectedNodes: [],
          description: `OFDMA is disabled on ${settings.band}`,
          rootCause: 'OFDMA improves efficiency with many devices (WiFi 6 feature)',
          recommendation: 'Enable OFDMA via nvram set wl0_ofdma=1 / wl1_ofdma=1',
          autoFixAvailable: true,
          detectedAt: new Date(),
        });
      }

      if (settings.band === '5GHz' && settings.channelWidth < 80) {
        problems.push({
          id: `config-5g-width-${settings.channelWidth}`,
          category: 'configuration_error',
          severity: 'warning',
          affectedDevices: [],
          affectedNodes: [],
          description: `5GHz uses narrow ${settings.channelWidth}MHz channel width`,
          rootCause: 'Narrow channel width limits maximum throughput',
          recommendation: 'Use 80MHz or 160MHz channel width for 5GHz',
          autoFixAvailable: true,
          detectedAt: new Date(),
        });
      }

      if (settings.security === 'WPA' || settings.security === 'Open' || settings.security === 'Unknown') {
        problems.push({
          id: `config-security-${settings.band}`,
          category: 'configuration_error',
          severity: settings.security === 'Open' ? 'critical' : 'error',
          affectedDevices: [],
          affectedNodes: [],
          description: `${settings.band} uses weak security: ${settings.security}`,
          rootCause: 'Weak or no encryption exposes network to attacks',
          recommendation: 'Upgrade to WPA2 or WPA3 for better security',
          autoFixAvailable: true,
          detectedAt: new Date(),
        });
      }

      if (!settings.roamingAssistant && state.nodes.length > 1) {
        problems.push({
          id: `config-roaming-${settings.band}`,
          category: 'configuration_error',
          severity: 'warning',
          affectedDevices: [],
          affectedNodes: [],
          description: `Roaming Assistant is disabled on ${settings.band}`,
          rootCause: 'Without roaming assistant, devices may stick to weak signals',
          recommendation: 'Enable Roaming Assistant for better mesh handoff',
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

      if (node.cpuUsage > 95) {
        problems.push({
          id: `capacity-cpu-${node.id}`,
          category: 'capacity_exceeded',
          severity: 'warning',
          affectedDevices: [],
          affectedNodes: [node.id],
          description: `Node ${node.name} has sustained high CPU usage (${node.cpuUsage}%)`,
          rootCause: 'Router may be overloaded (note: CPU spikes during scans are normal)',
          recommendation: 'If this persists outside of scans, reduce traffic or disable unused services',
          autoFixAvailable: false,
          detectedAt: new Date(),
        });
      }

      if (node.memoryUsage > 85) {
        problems.push({
          id: `capacity-memory-${node.id}`,
          category: 'capacity_exceeded',
          severity: node.memoryUsage > 95 ? 'critical' : 'warning',
          affectedDevices: [],
          affectedNodes: [node.id],
          description: `Node ${node.name} has high memory usage (${node.memoryUsage}%)`,
          rootCause: 'Router memory is nearly exhausted',
          recommendation: 'Reboot router or reduce connected clients',
          autoFixAvailable: false,
          detectedAt: new Date(),
        });
      }

      if (node.uptime > 30 * 24 * 60 * 60) {
        problems.push({
          id: `uptime-extended-${node.id}`,
          category: 'configuration_error',
          severity: 'info',
          affectedDevices: [],
          affectedNodes: [node.id],
          description: `Node ${node.name} has been running for ${Math.floor(node.uptime / 86400)} days`,
          rootCause: 'Extended uptime may cause memory leaks or performance degradation',
          recommendation: 'Consider scheduling periodic reboots',
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

    let _totalConnections = 0;
    let totalDisconnections = 0;
    const connectionDurations: number[] = [];
    const disconnectReasons: Map<string, number> = new Map();
    let lastConnectTime: number | null = null;

    for (const event of deviceEvents) {
      if (event.eventType === 'connect') {
        _totalConnections++;
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
