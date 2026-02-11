import { createChildLogger } from '../utils/logger.js';
import { wifiChannelToFrequency, getWifi2gZigbeeOverlap } from '../utils/frequency.js';
import type { MeshNodePool, MeshNodeInfo } from '../infra/mesh-node-pool.js';
import type { WifiSettings } from '../types/network.js';

const logger = createChildLogger('multi-node-coordinator');

export interface NodeChannelConfig {
  nodeId: string;
  nodeName: string;
  channel2g: number;
  channel5g: number;
  txPower2g: number;
  txPower5g: number;
  bandwidth2g: number;
  bandwidth5g: number;
}

export interface ChannelConflict {
  nodeA: string;
  nodeB: string;
  band: '2.4GHz' | '5GHz';
  channelA: number;
  channelB: number;
  issue: 'same_channel' | 'adjacent_channel' | 'co_channel';
  severity: 'low' | 'medium' | 'high';
  recommendation: string;
}

export interface CoordinatedConfig {
  nodes: NodeChannelConfig[];
  conflicts: ChannelConflict[];
  recommendations: string[];
  overallScore: number;
}

export interface OptimizedSettings {
  nodeId: string;
  channel2g: number;
  channel5g: number;
  txPower2g?: number;
  txPower5g?: number;
}

export class MultiNodeCoordinator {
  private readonly nodePool: MeshNodePool;
  private currentConfigs: Map<string, NodeChannelConfig> = new Map();

  constructor(nodePool: MeshNodePool) {
    this.nodePool = nodePool;
  }

  async scanAllNodeConfigs(): Promise<CoordinatedConfig> {
    logger.info('Scanning all node configurations');

    const nodes = this.nodePool.getDiscoveredNodes();
    const configs: NodeChannelConfig[] = [];

    const settingsMap = await this.nodePool.getWifiSettingsFromAllNodes();

    for (const node of nodes) {
      const settings = settingsMap.get(node.id);
      if (settings) {
        const config: NodeChannelConfig = {
          nodeId: node.id,
          nodeName: node.name,
          channel2g: settings.channel2g,
          channel5g: settings.channel5g,
          txPower2g: settings.txpower2g,
          txPower5g: settings.txpower5g,
          bandwidth2g: settings.bandwidth2g,
          bandwidth5g: settings.bandwidth5g,
        };
        configs.push(config);
        this.currentConfigs.set(node.id, config);
      }
    }

    const conflicts = this.detectConflicts(configs);
    const recommendations = this.generateRecommendations(configs, conflicts);
    const overallScore = this.calculateCoordinationScore(configs, conflicts);

    logger.info({ 
      nodeCount: configs.length, 
      conflictCount: conflicts.length,
      score: overallScore 
    }, 'Configuration scan complete');

    return {
      nodes: configs,
      conflicts,
      recommendations,
      overallScore,
    };
  }

  private detectConflicts(configs: NodeChannelConfig[]): ChannelConflict[] {
    const conflicts: ChannelConflict[] = [];

    for (let i = 0; i < configs.length; i++) {
      for (let j = i + 1; j < configs.length; j++) {
        const nodeA = configs[i]!;
        const nodeB = configs[j]!;

        const conflict2g = this.checkChannelConflict(
          nodeA.nodeId, nodeB.nodeId,
          nodeA.channel2g, nodeB.channel2g,
          '2.4GHz'
        );
        if (conflict2g) conflicts.push(conflict2g);

        const conflict5g = this.checkChannelConflict(
          nodeA.nodeId, nodeB.nodeId,
          nodeA.channel5g, nodeB.channel5g,
          '5GHz'
        );
        if (conflict5g) conflicts.push(conflict5g);
      }
    }

    return conflicts;
  }

  private checkChannelConflict(
    nodeA: string,
    nodeB: string,
    channelA: number,
    channelB: number,
    band: '2.4GHz' | '5GHz'
  ): ChannelConflict | null {
    if (channelA === 0 || channelB === 0) return null;

    const diff = Math.abs(channelA - channelB);

    if (band === '2.4GHz') {
      if (diff === 0) {
        return {
          nodeA, nodeB, band, channelA, channelB,
          issue: 'same_channel',
          severity: 'high',
          recommendation: `Mesh-Nodes auf gleichem 2.4GHz Kanal ${channelA}. Bei AiMesh normal, aber prüfen ob Bandsteering aktiv.`,
        };
      }
      if (diff > 0 && diff < 5) {
        return {
          nodeA, nodeB, band, channelA, channelB,
          issue: 'adjacent_channel',
          severity: 'medium',
          recommendation: `2.4GHz Kanäle ${channelA} und ${channelB} überlappen. Wechsel zu 1, 6 oder 11.`,
        };
      }
    } else {
      if (diff === 0) {
        return {
          nodeA, nodeB, band, channelA, channelB,
          issue: 'same_channel',
          severity: 'low',
          recommendation: `Gleicher 5GHz Kanal ${channelA}. Bei Mesh normal für nahtloses Roaming.`,
        };
      }
      if (diff > 0 && diff < 8) {
        return {
          nodeA, nodeB, band, channelA, channelB,
          issue: 'adjacent_channel',
          severity: 'medium',
          recommendation: `5GHz Kanäle ${channelA}/${channelB} sind benachbart. Für bessere Trennung mind. 8 Kanäle Abstand.`,
        };
      }
    }

    return null;
  }

  private generateRecommendations(
    configs: NodeChannelConfig[],
    conflicts: ChannelConflict[]
  ): string[] {
    const recommendations: string[] = [];

    const highSeverityConflicts = conflicts.filter(c => c.severity === 'high');
    if (highSeverityConflicts.length > 0) {
      recommendations.push(
        `${highSeverityConflicts.length} kritische Kanal-Konflikte erkannt. Überprüfe AiMesh-Konfiguration.`
      );
    }

    const channels2g = new Set(configs.map(c => c.channel2g).filter(c => c > 0));
    if (channels2g.size > 1) {
      const nonOptimal = Array.from(channels2g).filter(c => ![1, 6, 11].includes(c));
      if (nonOptimal.length > 0) {
        recommendations.push(
          `2.4GHz Kanäle ${nonOptimal.join(', ')} sind nicht optimal. Verwende 1, 6 oder 11.`
        );
      }
    }

    const txPowers = configs.map(c => c.txPower2g).filter(p => p > 0);
    if (txPowers.length > 1) {
      const maxPower = Math.max(...txPowers);
      const minPower = Math.min(...txPowers);
      if (maxPower - minPower > 20) {
        recommendations.push(
          'Große Unterschiede in der Sendeleistung zwischen Nodes. Kann Roaming-Probleme verursachen.'
        );
      }
    }

    const bandwidths = configs.map(c => c.bandwidth5g).filter(b => b > 0);
    const uniqueBandwidths = new Set(bandwidths);
    if (uniqueBandwidths.size > 1) {
      recommendations.push(
        'Unterschiedliche 5GHz Bandbreiten zwischen Nodes. Für konsistente Performance angleichen.'
      );
    }

    if (configs.length > 1) {
      recommendations.push(
        'Bei AiMesh sollten alle Nodes identische Kanäle für nahtloses Roaming verwenden.'
      );
    }

    return recommendations;
  }

  private calculateCoordinationScore(
    configs: NodeChannelConfig[],
    conflicts: ChannelConflict[]
  ): number {
    let score = 100;

    for (const conflict of conflicts) {
      if (conflict.severity === 'high') score -= 15;
      else if (conflict.severity === 'medium') score -= 10;
      else score -= 5;
    }

    const channels2g = configs.map(c => c.channel2g).filter(c => c > 0);
    const uniqueChannels2g = new Set(channels2g);
    if (uniqueChannels2g.size === 1 && channels2g.length > 1) {
      score += 10;
    }

    const channels5g = configs.map(c => c.channel5g).filter(c => c > 0);
    const uniqueChannels5g = new Set(channels5g);
    if (uniqueChannels5g.size === 1 && channels5g.length > 1) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  async optimizeChannelAllocation(
    zigbeeChannel?: number
  ): Promise<OptimizedSettings[]> {
    logger.info({ zigbeeChannel }, 'Calculating optimal channel allocation');

    const currentConfig = await this.scanAllNodeConfigs();
    const optimized: OptimizedSettings[] = [];

    let best2gChannel = 1;
    let best5gChannel = 36;

    if (zigbeeChannel) {
      const overlap1 = getWifi2gZigbeeOverlap(1, zigbeeChannel);
      const overlap6 = getWifi2gZigbeeOverlap(6, zigbeeChannel);
      const overlap11 = getWifi2gZigbeeOverlap(11, zigbeeChannel);

      if (overlap1 <= overlap6 && overlap1 <= overlap11) {
        best2gChannel = 1;
      } else if (overlap11 <= overlap1 && overlap11 <= overlap6) {
        best2gChannel = 11;
      } else {
        best2gChannel = 6;
      }

      logger.info({ zigbeeChannel, best2gChannel }, 'Optimized for Zigbee coexistence');
    }

    for (const nodeConfig of currentConfig.nodes) {
      optimized.push({
        nodeId: nodeConfig.nodeId,
        channel2g: best2gChannel,
        channel5g: best5gChannel,
      });
    }

    return optimized;
  }

  async applyOptimizedSettings(settings: OptimizedSettings[]): Promise<Map<string, boolean>> {
    logger.info({ nodeCount: settings.length }, 'Applying optimized settings to all nodes');

    const results = new Map<string, boolean>();

    if (settings.length === 0) {
      return results;
    }

    const firstSetting = settings[0]!;
    const syncSettings: { channel2g?: number; channel5g?: number; txpower2g?: number; txpower5g?: number } = {
      channel2g: firstSetting.channel2g,
      channel5g: firstSetting.channel5g,
    };
    if (firstSetting.txPower2g !== undefined) syncSettings.txpower2g = firstSetting.txPower2g;
    if (firstSetting.txPower5g !== undefined) syncSettings.txpower5g = firstSetting.txPower5g;
    const syncResult = await this.nodePool.syncSettingsAcrossNodes(syncSettings);

    for (const [nodeId, result] of syncResult) {
      results.set(nodeId, result.success);
    }

    return results;
  }

  async applyUniformSettings(settings: {
    channel2g?: number;
    channel5g?: number;
    txPower2g?: number;
    txPower5g?: number;
  }): Promise<{
    success: boolean;
    appliedTo: string[];
    failed: string[];
  }> {
    logger.info(settings, 'Applying uniform settings to all nodes');

    const uniformSettings: { channel2g?: number; channel5g?: number; txpower2g?: number; txpower5g?: number } = {};
    if (settings.channel2g !== undefined) uniformSettings.channel2g = settings.channel2g;
    if (settings.channel5g !== undefined) uniformSettings.channel5g = settings.channel5g;
    if (settings.txPower2g !== undefined) uniformSettings.txpower2g = settings.txPower2g;
    if (settings.txPower5g !== undefined) uniformSettings.txpower5g = settings.txPower5g;
    const result = await this.nodePool.syncSettingsAcrossNodes(uniformSettings);

    const appliedTo: string[] = [];
    const failed: string[] = [];

    for (const [nodeId, status] of result) {
      if (status.success) {
        appliedTo.push(nodeId);
      } else {
        failed.push(nodeId);
      }
    }

    return {
      success: failed.length === 0,
      appliedTo,
      failed,
    };
  }

  async verifyConfigConsistency(): Promise<{
    consistent: boolean;
    differences: Array<{
      setting: string;
      values: Map<string, number | string>;
    }>;
  }> {
    const config = await this.scanAllNodeConfigs();
    const differences: Array<{
      setting: string;
      values: Map<string, number | string>;
    }> = [];

    const check = (setting: string, getter: (c: NodeChannelConfig) => number) => {
      const values = new Map<string, number>();
      for (const node of config.nodes) {
        values.set(node.nodeId, getter(node));
      }
      
      const uniqueValues = new Set(values.values());
      if (uniqueValues.size > 1) {
        differences.push({ setting, values: values as Map<string, number | string> });
      }
    };

    check('channel2g', c => c.channel2g);
    check('channel5g', c => c.channel5g);
    check('txPower2g', c => c.txPower2g);
    check('txPower5g', c => c.txPower5g);
    check('bandwidth2g', c => c.bandwidth2g);
    check('bandwidth5g', c => c.bandwidth5g);

    return {
      consistent: differences.length === 0,
      differences,
    };
  }

  getCurrentConfigs(): NodeChannelConfig[] {
    return Array.from(this.currentConfigs.values());
  }

  getNodeConfig(nodeId: string): NodeChannelConfig | undefined {
    return this.currentConfigs.get(nodeId);
  }
}
