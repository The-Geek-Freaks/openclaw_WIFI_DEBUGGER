import { createChildLogger } from '../utils/logger.js';
import type { MeshNodePool, MeshNodeInfo } from '../infra/mesh-node-pool.js';
import {
  type RouterModelInfo,
  type RouterGeneration,
  type RouterCapability,
  type MixedMeshRecommendation,
  ROUTER_DATABASE,
  getRouterInfo,
  getLowestCommonGeneration,
  getSharedCapabilities,
} from '../types/router-models.js';

const logger = createChildLogger('multi-gen-coordinator');

export interface MeshGenerationAnalysis {
  nodes: Array<{
    nodeId: string;
    nodeName: string;
    model: string;
    generation: RouterGeneration;
    capabilities: RouterCapability[];
    interfaces: { wl0: string; wl1: string; wl2?: string | undefined; wl3?: string | undefined };
  }>;
  lowestGeneration: RouterGeneration;
  sharedCapabilities: RouterCapability[];
  recommendations: MixedMeshRecommendation[];
  compatibilityScore: number;
}

export interface GenerationOptimizedSettings {
  nodeId: string;
  model: string;
  settings: {
    wifi2g: Record<string, string | number>;
    wifi5g: Record<string, string | number>;
    wifi5g2?: Record<string, string | number>;
    wifi6g?: Record<string, string | number>;
  };
}

export class MultiGenerationCoordinator {
  private readonly nodePool: MeshNodePool;
  private nodeModels: Map<string, RouterModelInfo> = new Map();

  constructor(nodePool: MeshNodePool) {
    this.nodePool = nodePool;
  }

  async detectNodeModels(): Promise<Map<string, RouterModelInfo>> {
    logger.info('Detecting router models for all nodes');
    this.nodeModels.clear();

    const nodes = this.nodePool.getDiscoveredNodes();

    for (const node of nodes) {
      try {
        let modelInfo = getRouterInfo(node.model);

        if (!modelInfo) {
          const detectedModel = await this.detectModelViaSsh(node);
          modelInfo = getRouterInfo(detectedModel);
        }

        if (modelInfo) {
          this.nodeModels.set(node.id, modelInfo);
          logger.info({ nodeId: node.id, model: modelInfo.model, gen: modelInfo.generation }, 'Model detected');
        } else {
          logger.warn({ nodeId: node.id, model: node.model }, 'Unknown router model, using defaults');
          this.nodeModels.set(node.id, this.createDefaultModelInfo(node));
        }
      } catch (err) {
        logger.error({ err, nodeId: node.id }, 'Failed to detect model');
      }
    }

    return this.nodeModels;
  }

  private async detectModelViaSsh(node: MeshNodeInfo): Promise<string> {
    try {
      const result = await this.nodePool.executeOnNode(node.id, 'nvram get productid');
      return result.trim();
    } catch {
      return node.model;
    }
  }

  private createDefaultModelInfo(node: MeshNodeInfo): RouterModelInfo {
    return {
      model: node.model || 'Unknown',
      generation: 'wifi6',
      wifiBands: ['2.4GHz', '5GHz'],
      maxSpeed: 3000,
      capabilities: ['aimesh', 'smart_connect'],
      sshInterface: { wl0: 'eth6', wl1: 'eth7' },
      nvramPrefix: { wifi2g: 'wl0', wifi5g: 'wl1' },
      aimeshRole: 'both',
    };
  }

  async analyzeMultiGenerationMesh(): Promise<MeshGenerationAnalysis> {
    await this.detectNodeModels();

    const nodes: MeshGenerationAnalysis['nodes'] = [];
    const generations: RouterGeneration[] = [];
    const allModelInfos: RouterModelInfo[] = [];

    for (const [nodeId, modelInfo] of this.nodeModels) {
      const node = this.nodePool.getNodeById(nodeId);
      nodes.push({
        nodeId,
        nodeName: node?.name ?? nodeId,
        model: modelInfo.model,
        generation: modelInfo.generation,
        capabilities: modelInfo.capabilities,
        interfaces: modelInfo.sshInterface,
      });
      generations.push(modelInfo.generation);
      allModelInfos.push(modelInfo);
    }

    const lowestGeneration = getLowestCommonGeneration(generations);
    const sharedCapabilities = getSharedCapabilities(allModelInfos);
    const recommendations = this.generateMixedMeshRecommendations(nodes, lowestGeneration);
    const compatibilityScore = this.calculateCompatibilityScore(nodes, sharedCapabilities);

    return {
      nodes,
      lowestGeneration,
      sharedCapabilities,
      recommendations,
      compatibilityScore,
    };
  }

  private generateMixedMeshRecommendations(
    nodes: MeshGenerationAnalysis['nodes'],
    _lowestGen: RouterGeneration
  ): MixedMeshRecommendation[] {
    const recommendations: MixedMeshRecommendation[] = [];

    const wifi5Nodes = nodes.filter(n => n.generation === 'wifi5');
    const wifi6Nodes = nodes.filter(n => n.generation === 'wifi6');
    const wifi6eNodes = nodes.filter(n => n.generation === 'wifi6e');
    const wifi7Nodes = nodes.filter(n => n.generation === 'wifi7');

    if (wifi5Nodes.length > 0 && (wifi6Nodes.length > 0 || wifi6eNodes.length > 0)) {
      recommendations.push({
        issue: 'WiFi 5 (AC) Nodes im Mesh',
        severity: 'warning',
        recommendation: 'WiFi 5 Nodes limitieren das Mesh auf ältere Standards. 160MHz, OFDMA und WPA3 werden möglicherweise nicht überall unterstützt.',
        affectedNodes: wifi5Nodes.map(n => n.nodeId),
      });
    }

    if (wifi6eNodes.length > 0 && wifi6Nodes.length > 0) {
      recommendations.push({
        issue: '6GHz Band nicht überall verfügbar',
        severity: 'info',
        recommendation: '6GHz nur auf WiFi 6E Nodes verfügbar. Clients die 6GHz benötigen sollten in Reichweite dieser Nodes sein.',
        affectedNodes: wifi6eNodes.map(n => n.nodeId),
      });
    }

    if (wifi7Nodes.length > 0 && wifi7Nodes.length < nodes.length) {
      recommendations.push({
        issue: 'WiFi 7 Features nicht durchgehend',
        severity: 'info',
        recommendation: 'MLO (Multi-Link Operation) und 320MHz Kanäle nur auf WiFi 7 Nodes. Für maximale Performance WiFi 7 Clients in deren Reichweite platzieren.',
        affectedNodes: wifi7Nodes.map(n => n.nodeId),
      });
    }

    const triband = nodes.filter(n => n.capabilities.length >= 3);
    const dualband = nodes.filter(n => n.capabilities.length < 3);
    if (triband.length > 0 && dualband.length > 0) {
      recommendations.push({
        issue: 'Gemischte Band-Konfiguration',
        severity: 'info',
        recommendation: 'Tri-Band und Dual-Band Router gemischt. Nutze dediziertes Backhaul-Band auf Tri-Band Nodes.',
        affectedNodes: [...triband.map(n => n.nodeId), ...dualband.map(n => n.nodeId)],
      });
    }

    const noAimesh2 = nodes.filter(n => !n.capabilities.includes('aimesh_2'));
    if (noAimesh2.length > 0 && noAimesh2.length < nodes.length) {
      recommendations.push({
        issue: 'AiMesh 2.0 nicht durchgehend',
        severity: 'warning',
        recommendation: 'Ältere Nodes ohne AiMesh 2.0 können weniger nahtloses Roaming bieten.',
        affectedNodes: noAimesh2.map(n => n.nodeId),
      });
    }

    return recommendations;
  }

  private calculateCompatibilityScore(
    nodes: MeshGenerationAnalysis['nodes'],
    sharedCaps: RouterCapability[]
  ): number {
    let score = 100;

    const generations = new Set(nodes.map(n => n.generation));
    score -= (generations.size - 1) * 10;

    if (!sharedCaps.includes('aimesh_2')) {
      score -= 5;
    }

    if (!sharedCaps.includes('ofdma')) {
      score -= 5;
    }

    if (!sharedCaps.includes('160mhz')) {
      score -= 5;
    }

    const hasWifi5 = nodes.some(n => n.generation === 'wifi5');
    if (hasWifi5) {
      score -= 15;
    }

    return Math.max(0, Math.min(100, score));
  }

  async generateOptimizedSettings(): Promise<GenerationOptimizedSettings[]> {
    const analysis = await this.analyzeMultiGenerationMesh();
    const settings: GenerationOptimizedSettings[] = [];

    const baseChannel2g = 1;
    const baseChannel5g = 36;
    const baseChannel5g2 = 149;
    const baseChannel6g = 5;

    for (const node of analysis.nodes) {
      const modelInfo = this.nodeModels.get(node.nodeId);
      if (!modelInfo) continue;

      const nodeSettings: GenerationOptimizedSettings = {
        nodeId: node.nodeId,
        model: node.model,
        settings: {
          wifi2g: {
            [`${modelInfo.nvramPrefix.wifi2g}_channel`]: baseChannel2g,
            [`${modelInfo.nvramPrefix.wifi2g}_bw`]: 0,
            [`${modelInfo.nvramPrefix.wifi2g}_chanspec`]: `${baseChannel2g}`,
          },
          wifi5g: {
            [`${modelInfo.nvramPrefix.wifi5g}_channel`]: baseChannel5g,
            [`${modelInfo.nvramPrefix.wifi5g}_bw`]: analysis.sharedCapabilities.includes('160mhz') ? 3 : 2,
            [`${modelInfo.nvramPrefix.wifi5g}_chanspec`]: analysis.sharedCapabilities.includes('160mhz') ? `${baseChannel5g}/160` : `${baseChannel5g}/80`,
          },
        },
      };

      if (modelInfo.nvramPrefix.wifi5g2) {
        nodeSettings.settings.wifi5g2 = {
          [`${modelInfo.nvramPrefix.wifi5g2}_channel`]: baseChannel5g2,
          [`${modelInfo.nvramPrefix.wifi5g2}_bw`]: analysis.sharedCapabilities.includes('160mhz') ? 3 : 2,
        };
      }

      if (modelInfo.nvramPrefix.wifi6g) {
        nodeSettings.settings.wifi6g = {
          [`${modelInfo.nvramPrefix.wifi6g}_channel`]: baseChannel6g,
          [`${modelInfo.nvramPrefix.wifi6g}_bw`]: node.generation === 'wifi7' ? 4 : 3,
        };
      }

      settings.push(nodeSettings);
    }

    return settings;
  }

  async applyOptimizedSettings(settings: GenerationOptimizedSettings[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const nodeSetting of settings) {
      try {
        const commands: string[] = [];

        for (const [key, value] of Object.entries(nodeSetting.settings.wifi2g)) {
          commands.push(`nvram set ${key}=${value}`);
        }
        for (const [key, value] of Object.entries(nodeSetting.settings.wifi5g)) {
          commands.push(`nvram set ${key}=${value}`);
        }
        if (nodeSetting.settings.wifi5g2) {
          for (const [key, value] of Object.entries(nodeSetting.settings.wifi5g2)) {
            commands.push(`nvram set ${key}=${value}`);
          }
        }
        if (nodeSetting.settings.wifi6g) {
          for (const [key, value] of Object.entries(nodeSetting.settings.wifi6g)) {
            commands.push(`nvram set ${key}=${value}`);
          }
        }

        commands.push('nvram commit');

        await this.nodePool.executeOnNode(nodeSetting.nodeId, commands.join(' && '));
        results.set(nodeSetting.nodeId, true);

        logger.info({ nodeId: nodeSetting.nodeId, model: nodeSetting.model }, 'Settings applied');
      } catch (err) {
        logger.error({ err, nodeId: nodeSetting.nodeId }, 'Failed to apply settings');
        results.set(nodeSetting.nodeId, false);
      }
    }

    return results;
  }

  getInterfaceForNode(nodeId: string, band: '2.4GHz' | '5GHz' | '5GHz-2' | '6GHz'): string | undefined {
    const modelInfo = this.nodeModels.get(nodeId);
    if (!modelInfo) return undefined;

    switch (band) {
      case '2.4GHz': return modelInfo.sshInterface.wl0;
      case '5GHz': return modelInfo.sshInterface.wl1;
      case '5GHz-2': return modelInfo.sshInterface.wl2;
      case '6GHz': return modelInfo.sshInterface.wl2 || modelInfo.sshInterface.wl3;
      default: return undefined;
    }
  }

  getNvramPrefixForNode(nodeId: string, band: '2.4GHz' | '5GHz' | '5GHz-2' | '6GHz'): string | undefined {
    const modelInfo = this.nodeModels.get(nodeId);
    if (!modelInfo) return undefined;

    switch (band) {
      case '2.4GHz': return modelInfo.nvramPrefix.wifi2g;
      case '5GHz': return modelInfo.nvramPrefix.wifi5g;
      case '5GHz-2': return modelInfo.nvramPrefix.wifi5g2;
      case '6GHz': return modelInfo.nvramPrefix.wifi6g;
      default: return undefined;
    }
  }

  getNodeModel(nodeId: string): RouterModelInfo | undefined {
    return this.nodeModels.get(nodeId);
  }

  getSupportedModels(): string[] {
    return Object.keys(ROUTER_DATABASE);
  }
}
