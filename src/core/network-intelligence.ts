import { EventEmitter } from 'eventemitter3';
import { createChildLogger } from '../utils/logger.js';
import { getWifi2gZigbeeOverlap, WIFI_2G_CHANNELS, WIFI_5G_CHANNELS, DEFAULT_NOISE_FLOOR_DBM } from '../utils/frequency.js';
import type { AsusSshClient } from '../infra/asus-ssh-client.js';
import type { HomeAssistantClient } from '../infra/homeassistant-client.js';
import type { SnmpClient } from '../infra/snmp-client.js';
import type { MeshAnalyzer } from './mesh-analyzer.js';
import type { ZigbeeAnalyzer } from './zigbee-analyzer.js';
import type { FrequencyOptimizer } from './frequency-optimizer.js';
import type { NetworkTopologyAnalyzer } from './network-topology-analyzer.js';
import type { 
  NetworkContext, 
  SpectrumMap, 
  FrequencyOccupant,
  DataSourceStatus,
  IntelligentRecommendation,
  ScanPhase,
  FullScanResult,
  OptimizationTarget,
} from '../types/intelligence.js';
import type { MeshNetworkState } from '../types/network.js';
import type { ZigbeeNetworkState } from '../types/zigbee.js';

const logger = createChildLogger('network-intelligence');

export interface NetworkIntelligenceEvents {
  phaseChanged: (phase: ScanPhase) => void;
  progressUpdate: (phase: ScanPhase, progress: number, message: string) => void;
  scanComplete: (result: FullScanResult) => void;
  error: (error: Error) => void;
}

interface ChannelScore {
  channel: number;
  score: number;
  reasons: string[];
}

export class NetworkIntelligence extends EventEmitter<NetworkIntelligenceEvents> {
  private readonly sshClient: AsusSshClient;
  private readonly hassClient: HomeAssistantClient;
  private readonly snmpClient: SnmpClient;
  private readonly meshAnalyzer: MeshAnalyzer;
  private readonly zigbeeAnalyzer: ZigbeeAnalyzer;
  private readonly frequencyOptimizer: FrequencyOptimizer;
  private readonly topologyAnalyzer: NetworkTopologyAnalyzer;

  private currentPhase: ScanPhase = 'idle';
  private lastContext: NetworkContext | null = null;
  private lastScanResult: FullScanResult | null = null;

  constructor(
    sshClient: AsusSshClient,
    hassClient: HomeAssistantClient,
    snmpClient: SnmpClient,
    meshAnalyzer: MeshAnalyzer,
    zigbeeAnalyzer: ZigbeeAnalyzer,
    frequencyOptimizer: FrequencyOptimizer,
    topologyAnalyzer: NetworkTopologyAnalyzer
  ) {
    super();
    this.sshClient = sshClient;
    this.hassClient = hassClient;
    this.snmpClient = snmpClient;
    this.meshAnalyzer = meshAnalyzer;
    this.zigbeeAnalyzer = zigbeeAnalyzer;
    this.frequencyOptimizer = frequencyOptimizer;
    this.topologyAnalyzer = topologyAnalyzer;
  }

  private setPhase(phase: ScanPhase): void {
    this.currentPhase = phase;
    this.emit('phaseChanged', phase);
    logger.info({ phase }, 'Scan phase changed');
  }

  private progress(progress: number, message: string): void {
    this.emit('progressUpdate', this.currentPhase, progress, message);
    logger.debug({ phase: this.currentPhase, progress, message }, 'Progress update');
  }

  async performFullScan(targets: OptimizationTarget[] = ['minimize_interference']): Promise<FullScanResult> {
    const startTime = new Date();
    const errors: string[] = [];
    const warnings: string[] = [];
    const dataSources: DataSourceStatus[] = [];

    logger.info({ targets }, 'Starting full network intelligence scan');

    let meshState: MeshNetworkState | null = null;
    let zigbeeState: ZigbeeNetworkState | null = null;
    const neighborNetworks: Array<{ ssid: string; bssid: string; channel: number; signalStrength: number; isHidden: boolean }> = [];

    this.setPhase('collecting_router_data');
    this.progress(0, 'Collecting router data via SSH...');
    
    try {
      meshState = await this.meshAnalyzer.scan();
      dataSources.push({
        source: 'router_ssh',
        available: true,
        lastSuccess: new Date(),
        dataFreshness: 'fresh',
      });
      this.progress(25, `Found ${meshState.nodes.length} mesh nodes, ${meshState.devices.length} devices`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Router SSH: ${errorMsg}`);
      dataSources.push({
        source: 'router_ssh',
        available: false,
        lastError: errorMsg,
        dataFreshness: 'unavailable',
      });
    }

    this.setPhase('scanning_neighbors');
    this.progress(30, 'Scanning neighbor WiFi networks...');
    
    try {
      const [scan2g, scan5g] = await Promise.all([
        this.frequencyOptimizer.scanChannels('2g'),
        this.frequencyOptimizer.scanChannels('5g'),
      ]);
      
      for (const scanResult of [...scan2g, ...scan5g]) {
        for (const network of scanResult.interferingNetworks) {
          neighborNetworks.push({
            ssid: network.ssid,
            bssid: network.bssid,
            channel: network.channel,
            signalStrength: network.signalStrength,
            isHidden: !network.ssid,
          });
        }
      }
      
      dataSources.push({
        source: 'neighbor_scan',
        available: true,
        lastSuccess: new Date(),
        dataFreshness: 'fresh',
      });
      this.progress(50, `Found ${neighborNetworks.length} neighbor networks`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      warnings.push(`Neighbor scan: ${errorMsg}`);
      dataSources.push({
        source: 'neighbor_scan',
        available: false,
        lastError: errorMsg,
        dataFreshness: 'unavailable',
      });
    }

    this.setPhase('collecting_zigbee_data');
    this.progress(55, 'Collecting Zigbee data from Home Assistant...');
    
    try {
      zigbeeState = await this.zigbeeAnalyzer.scan();
      dataSources.push({
        source: 'zigbee',
        available: true,
        lastSuccess: new Date(),
        dataFreshness: 'fresh',
      });
      dataSources.push({
        source: 'home_assistant',
        available: true,
        lastSuccess: new Date(),
        dataFreshness: 'fresh',
      });
      this.progress(70, `Found ${zigbeeState.devices.length} Zigbee devices on channel ${zigbeeState.channel}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      warnings.push(`Zigbee/Home Assistant: ${errorMsg}`);
      dataSources.push({
        source: 'zigbee',
        available: false,
        lastError: errorMsg,
        dataFreshness: 'unavailable',
      });
      dataSources.push({
        source: 'home_assistant',
        available: false,
        lastError: errorMsg,
        dataFreshness: 'unavailable',
      });
    }

    this.setPhase('collecting_snmp_data');
    this.progress(75, 'Collecting SNMP topology data...');
    
    try {
      if (this.snmpClient.isConfigured()) {
        await this.topologyAnalyzer.discoverTopology();
        dataSources.push({
          source: 'snmp',
          available: true,
          lastSuccess: new Date(),
          dataFreshness: 'fresh',
        });
      } else {
        dataSources.push({
          source: 'snmp',
          available: false,
          lastError: 'SNMP not configured',
          dataFreshness: 'unavailable',
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      warnings.push(`SNMP: ${errorMsg}`);
      dataSources.push({
        source: 'snmp',
        available: false,
        lastError: errorMsg,
        dataFreshness: 'unavailable',
      });
    }

    this.setPhase('analyzing');
    this.progress(80, 'Building network context...');

    const spectrumMaps = this.buildSpectrumMaps(meshState, zigbeeState, neighborNetworks);
    const context = this.buildNetworkContext(dataSources, spectrumMaps, meshState, zigbeeState, neighborNetworks);
    this.lastContext = context;

    this.setPhase('generating_recommendations');
    this.progress(90, 'Generating intelligent recommendations...');

    const recommendations = this.generateIntelligentRecommendations(context, targets);

    this.setPhase('complete');
    const endTime = new Date();

    const result: FullScanResult = {
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      context,
      recommendations,
      warnings,
      errors,
    };

    this.lastScanResult = result;
    this.emit('scanComplete', result);
    
    logger.info({ 
      duration: result.duration, 
      recommendationCount: recommendations.length,
      errorCount: errors.length,
      warningCount: warnings.length,
    }, 'Full scan complete');

    return result;
  }

  private buildSpectrumMaps(
    meshState: MeshNetworkState | null,
    zigbeeState: ZigbeeNetworkState | null,
    neighborNetworks: Array<{ ssid: string; bssid: string; channel: number; signalStrength: number }>
  ): SpectrumMap[] {
    const maps: SpectrumMap[] = [];

    const occupants2g: FrequencyOccupant[] = [];
    const occupants5g: FrequencyOccupant[] = [];

    if (meshState) {
      for (const settings of meshState.wifiSettings) {
        const occupant: FrequencyOccupant = {
          id: `own_${settings.band}`,
          type: 'wifi_own',
          band: settings.band === '2.4GHz' ? '2.4GHz' : '5GHz',
          channel: settings.channel,
          channelWidth: settings.channelWidth,
          signalStrength: -30,
          ssidOrName: settings.ssid,
          isControllable: true,
          lastSeen: new Date(),
        };
        
        if (settings.band === '2.4GHz') {
          occupants2g.push(occupant);
        } else {
          occupants5g.push(occupant);
        }
      }
    }

    for (const neighbor of neighborNetworks) {
      const is5g = neighbor.channel > 14;
      const occupant: FrequencyOccupant = {
        id: `neighbor_${neighbor.bssid}`,
        type: 'wifi_neighbor',
        band: is5g ? '5GHz' : '2.4GHz',
        channel: neighbor.channel,
        signalStrength: neighbor.signalStrength,
        ssidOrName: neighbor.ssid || 'Hidden',
        isControllable: false,
        lastSeen: new Date(),
      };
      
      if (is5g) {
        occupants5g.push(occupant);
      } else {
        occupants2g.push(occupant);
      }
    }

    const calc2gCongestion = this.calculateCongestionScore(occupants2g);
    const calc5gCongestion = this.calculateCongestionScore(occupants5g);

    maps.push({
      band: '2.4GHz',
      occupants: occupants2g,
      noiseFloor: DEFAULT_NOISE_FLOOR_DBM,
      congestionScore: calc2gCongestion,
      recommendedChannels: this.findBestChannels(occupants2g, WIFI_2G_CHANNELS as unknown as number[]),
    });

    maps.push({
      band: '5GHz',
      occupants: occupants5g,
      noiseFloor: DEFAULT_NOISE_FLOOR_DBM,
      congestionScore: calc5gCongestion,
      recommendedChannels: this.findBestChannels(occupants5g, WIFI_5G_CHANNELS as unknown as number[]),
    });

    if (zigbeeState) {
      const zigbeeOccupants: FrequencyOccupant[] = [{
        id: 'zigbee_coordinator',
        type: 'zigbee',
        band: 'zigbee',
        channel: zigbeeState.channel,
        signalStrength: 0,
        ssidOrName: 'Zigbee Network',
        isControllable: true,
        lastSeen: new Date(),
      }];

      maps.push({
        band: 'zigbee',
        occupants: zigbeeOccupants,
        noiseFloor: -100,
        congestionScore: 0,
        recommendedChannels: [15, 20, 25],
      });
    }

    return maps;
  }

  private calculateCongestionScore(occupants: FrequencyOccupant[]): number {
    if (occupants.length === 0) return 0;
    
    let score = 0;
    const neighborCount = occupants.filter(o => o.type === 'wifi_neighbor').length;
    
    score += Math.min(50, neighborCount * 5);
    
    const strongNeighbors = occupants.filter(o => o.type === 'wifi_neighbor' && o.signalStrength > -60);
    score += strongNeighbors.length * 10;
    
    const channelCounts = new Map<number, number>();
    for (const o of occupants) {
      channelCounts.set(o.channel, (channelCounts.get(o.channel) ?? 0) + 1);
    }
    const maxOverlap = Math.max(...channelCounts.values());
    if (maxOverlap > 3) {
      score += (maxOverlap - 3) * 5;
    }
    
    return Math.min(100, score);
  }

  private findBestChannels(occupants: FrequencyOccupant[], availableChannels: number[]): number[] {
    const scores: ChannelScore[] = [];

    for (const channel of availableChannels) {
      let score = 100;
      const reasons: string[] = [];

      const onChannel = occupants.filter(o => o.channel === channel && o.type === 'wifi_neighbor');
      score -= onChannel.length * 15;
      if (onChannel.length > 0) {
        reasons.push(`${onChannel.length} networks on same channel`);
      }

      for (const o of onChannel) {
        if (o.signalStrength > -50) {
          score -= 20;
          reasons.push(`Strong signal from ${o.ssidOrName}`);
        } else if (o.signalStrength > -65) {
          score -= 10;
        }
      }

      if ([1, 6, 11].includes(channel)) {
        score += 5;
      }

      scores.push({ channel, score: Math.max(0, score), reasons });
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, 3).map(s => s.channel);
  }

  private buildNetworkContext(
    dataSources: DataSourceStatus[],
    spectrumMaps: SpectrumMap[],
    meshState: MeshNetworkState | null,
    zigbeeState: ZigbeeNetworkState | null,
    neighborNetworks: Array<{ ssid: string; bssid: string; channel: number; signalStrength: number; isHidden: boolean }>
  ): NetworkContext {
    const ownNetworks = meshState?.wifiSettings.map(s => ({
      ssid: s.ssid,
      band: s.band,
      channel: s.channel,
      channelWidth: s.channelWidth,
      clientCount: meshState.devices.filter(d => 
        (s.band === '2.4GHz' && d.connectionType === 'wireless_2g') ||
        (s.band === '5GHz' && d.connectionType === 'wireless_5g')
      ).length,
      avgSignalStrength: -50,
    })) ?? [];

    let hasZigbeeConflict = false;
    if (zigbeeState && meshState) {
      const wifi2g = meshState.wifiSettings.find(s => s.band === '2.4GHz');
      if (wifi2g) {
        const overlap = getWifi2gZigbeeOverlap(wifi2g.channel, zigbeeState.channel);
        hasZigbeeConflict = overlap > 0.3;
      }
    }

    const spectrumCongestion = Math.round(
      spectrumMaps.reduce((sum, m) => sum + m.congestionScore, 0) / Math.max(1, spectrumMaps.length)
    );

    const crossProtocolHarmony = hasZigbeeConflict ? 40 : 90;
    const wifiHealth = meshState ? Math.max(20, 100 - spectrumCongestion) : 0;
    const stabilityIndex = meshState ? 80 : 0;

    return {
      timestamp: new Date(),
      dataSources,
      spectrumMaps,
      
      wifiState: {
        ownNetworks,
        neighborNetworks,
      },
      
      zigbeeState: zigbeeState ? {
        channel: zigbeeState.channel,
        deviceCount: zigbeeState.devices.length,
        routerCount: zigbeeState.devices.filter(d => d.type === 'router').length,
        avgLqi: zigbeeState.devices.reduce((sum, d) => sum + d.lqi, 0) / Math.max(1, zigbeeState.devices.length),
        hasConflictWithWifi: hasZigbeeConflict,
      } : undefined,
      
      topologyState: meshState ? {
        meshNodeCount: meshState.nodes.length,
        totalDevices: meshState.devices.length,
        wiredBackhaul: meshState.nodes.some(n => n.backhaulType === 'wired'),
        bottleneckNodes: [],
      } : undefined,
      
      environmentScore: {
        overall: Math.round((wifiHealth + crossProtocolHarmony + stabilityIndex + (100 - spectrumCongestion)) / 4),
        wifiHealth,
        spectrumCongestion: 100 - spectrumCongestion,
        crossProtocolHarmony,
        stabilityIndex,
      },
    };
  }

  private generateIntelligentRecommendations(
    context: NetworkContext,
    targets: OptimizationTarget[]
  ): IntelligentRecommendation[] {
    const recommendations: IntelligentRecommendation[] = [];

    for (const target of targets) {
      switch (target) {
        case 'minimize_interference':
          recommendations.push(...this.generateInterferenceRecommendations(context));
          break;
        case 'protect_zigbee':
          recommendations.push(...this.generateZigbeeProtectionRecommendations(context));
          break;
        case 'reduce_neighbor_overlap':
          recommendations.push(...this.generateNeighborRecommendations(context));
          break;
        case 'maximize_throughput':
          recommendations.push(...this.generateThroughputRecommendations(context));
          break;
        default:
          break;
      }
    }

    recommendations.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.confidence - a.confidence;
    });

    const seen = new Set<string>();
    return recommendations.filter(r => {
      const key = `${r.action.type}_${JSON.stringify(r.action.parameters)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private generateInterferenceRecommendations(context: NetworkContext): IntelligentRecommendation[] {
    const recs: IntelligentRecommendation[] = [];

    for (const map of context.spectrumMaps) {
      if (map.band !== '2.4GHz' && map.band !== '5GHz') continue;
      if (map.congestionScore < 30) continue;

      const ownNetwork = map.occupants.find(o => o.type === 'wifi_own');
      if (!ownNetwork) continue;

      const bestChannel = map.recommendedChannels[0];
      if (bestChannel && bestChannel !== ownNetwork.channel) {
        const reasons = [
          `Current channel ${ownNetwork.channel} has high congestion (${map.congestionScore}%)`,
          `Channel ${bestChannel} has less interference from neighbor networks`,
        ];

        if (map.band === '2.4GHz' && [1, 6, 11].includes(bestChannel)) {
          reasons.push(`Channel ${bestChannel} is a non-overlapping channel`);
        }

        recs.push({
          id: `interference_${map.band}_channel`,
          priority: map.congestionScore > 70 ? 9 : 7,
          target: 'minimize_interference',
          action: {
            type: 'change_channel',
            parameters: {
              band: map.band,
              fromChannel: ownNetwork.channel,
              toChannel: bestChannel,
            },
          },
          reasoning: reasons,
          expectedImpact: {
            wifiImprovement: Math.min(40, map.congestionScore * 0.5),
            zigbeeImpact: 0,
            neighborImpact: 0,
          },
          confidence: 0.85,
          requiresRestart: true,
          estimatedDowntime: 10,
        });
      }
    }

    return recs;
  }

  private generateZigbeeProtectionRecommendations(context: NetworkContext): IntelligentRecommendation[] {
    const recs: IntelligentRecommendation[] = [];

    if (!context.zigbeeState?.hasConflictWithWifi) return recs;

    const wifi2gMap = context.spectrumMaps.find(m => m.band === '2.4GHz');
    if (!wifi2gMap) return recs;

    const ownWifi = wifi2gMap.occupants.find(o => o.type === 'wifi_own');
    if (!ownWifi) return recs;

    const zigbeeChannel = context.zigbeeState.channel;
    
    let bestWifiChannel = ownWifi.channel;
    let minOverlap = 1;
    
    for (const ch of [1, 6, 11]) {
      const overlap = getWifi2gZigbeeOverlap(ch, zigbeeChannel);
      if (overlap < minOverlap) {
        minOverlap = overlap;
        bestWifiChannel = ch;
      }
    }

    if (bestWifiChannel !== ownWifi.channel && minOverlap < 0.3) {
      recs.push({
        id: 'zigbee_protect_wifi_channel',
        priority: 9,
        target: 'protect_zigbee',
        action: {
          type: 'change_channel',
          parameters: {
            band: '2.4GHz',
            fromChannel: ownWifi.channel,
            toChannel: bestWifiChannel,
            reason: 'zigbee_protection',
          },
        },
        reasoning: [
          `WiFi channel ${ownWifi.channel} overlaps with Zigbee channel ${zigbeeChannel}`,
          `Moving to channel ${bestWifiChannel} reduces overlap significantly`,
          `${context.zigbeeState.deviceCount} Zigbee devices will benefit from reduced interference`,
        ],
        expectedImpact: {
          wifiImprovement: 5,
          zigbeeImpact: 30,
          neighborImpact: 0,
        },
        confidence: 0.9,
        requiresRestart: true,
        estimatedDowntime: 10,
      });
    }

    return recs;
  }

  private generateNeighborRecommendations(context: NetworkContext): IntelligentRecommendation[] {
    const recs: IntelligentRecommendation[] = [];

    const strongNeighbors = context.wifiState.neighborNetworks.filter(n => n.signalStrength > -55);
    
    if (strongNeighbors.length > 0) {
      for (const map of context.spectrumMaps) {
        if (map.band !== '2.4GHz' && map.band !== '5GHz') continue;

        const ownNetwork = map.occupants.find(o => o.type === 'wifi_own');
        if (!ownNetwork) continue;

        const sameChannelNeighbors = strongNeighbors.filter(n => n.channel === ownNetwork.channel);
        if (sameChannelNeighbors.length > 0) {
          const bestChannel = map.recommendedChannels.find(ch => 
            !strongNeighbors.some(n => n.channel === ch)
          ) ?? map.recommendedChannels[0];

          if (bestChannel && bestChannel !== ownNetwork.channel) {
            recs.push({
              id: `neighbor_avoid_${map.band}`,
              priority: 8,
              target: 'reduce_neighbor_overlap',
              action: {
                type: 'change_channel',
                parameters: {
                  band: map.band,
                  fromChannel: ownNetwork.channel,
                  toChannel: bestChannel,
                },
              },
              reasoning: [
                `${sameChannelNeighbors.length} strong neighbor network(s) on same channel`,
                `Neighbor signals: ${sameChannelNeighbors.map(n => `${n.ssid} (${n.signalStrength}dBm)`).join(', ')}`,
                `Channel ${bestChannel} has no strong neighbors`,
              ],
              expectedImpact: {
                wifiImprovement: 25,
                zigbeeImpact: 0,
                neighborImpact: 0,
              },
              confidence: 0.8,
              requiresRestart: true,
              estimatedDowntime: 10,
            });
          }
        }
      }
    }

    return recs;
  }

  private generateThroughputRecommendations(context: NetworkContext): IntelligentRecommendation[] {
    const recs: IntelligentRecommendation[] = [];

    for (const network of context.wifiState.ownNetworks) {
      if (network.band === '5GHz' && network.channelWidth < 80) {
        recs.push({
          id: 'throughput_5g_width',
          priority: 6,
          target: 'maximize_throughput',
          action: {
            type: 'enable_feature',
            parameters: {
              feature: 'channel_width_80',
              band: '5GHz',
              currentWidth: network.channelWidth,
              targetWidth: 80,
            },
          },
          reasoning: [
            `5GHz is using ${network.channelWidth}MHz width`,
            '80MHz provides significantly higher throughput',
            'Recommended for modern WiFi 6 devices',
          ],
          expectedImpact: {
            wifiImprovement: 30,
            zigbeeImpact: 0,
            neighborImpact: -5,
          },
          confidence: 0.7,
          requiresRestart: true,
          estimatedDowntime: 10,
        });
      }
    }

    return recs;
  }

  getLastContext(): NetworkContext | null {
    return this.lastContext;
  }

  getLastScanResult(): FullScanResult | null {
    return this.lastScanResult;
  }

  getCurrentPhase(): ScanPhase {
    return this.currentPhase;
  }

  getEnvironmentSummary(): string {
    if (!this.lastContext) {
      return 'No scan performed yet. Run a full scan to analyze the network environment.';
    }

    const ctx = this.lastContext;
    const lines: string[] = [];

    lines.push(`## Network Environment Score: ${ctx.environmentScore.overall}/100`);
    lines.push('');
    lines.push('### Component Scores:');
    lines.push(`- WiFi Health: ${ctx.environmentScore.wifiHealth}/100`);
    lines.push(`- Spectrum Clarity: ${ctx.environmentScore.spectrumCongestion}/100`);
    lines.push(`- Cross-Protocol Harmony: ${ctx.environmentScore.crossProtocolHarmony}/100`);
    lines.push(`- Stability Index: ${ctx.environmentScore.stabilityIndex}/100`);
    lines.push('');
    
    lines.push('### Data Sources:');
    for (const ds of ctx.dataSources) {
      const status = ds.available ? '✅' : '❌';
      lines.push(`- ${status} ${ds.source}: ${ds.dataFreshness}`);
    }
    lines.push('');

    lines.push('### Spectrum Overview:');
    for (const map of ctx.spectrumMaps) {
      const neighbors = map.occupants.filter(o => o.type === 'wifi_neighbor').length;
      lines.push(`- ${map.band}: ${neighbors} neighbors, ${map.congestionScore}% congestion`);
    }

    if (ctx.zigbeeState) {
      lines.push('');
      lines.push('### Zigbee:');
      lines.push(`- Channel: ${ctx.zigbeeState.channel}`);
      lines.push(`- Devices: ${ctx.zigbeeState.deviceCount}`);
      lines.push(`- WiFi Conflict: ${ctx.zigbeeState.hasConflictWithWifi ? '⚠️ Yes' : '✅ No'}`);
    }

    return lines.join('\n');
  }
}
