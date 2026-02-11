import { createChildLogger } from '../utils/logger.js';
import { wifiChannelToFrequency } from '../utils/frequency.js';
import type { AsusSshClient } from '../infra/asus-ssh-client.js';
import type { WifiSettings } from '../types/network.js';

const logger = createChildLogger('neighbor-monitor');

export interface NeighborNetwork {
  ssid: string;
  bssid: string;
  channel: number;
  band: '2.4GHz' | '5GHz' | '6GHz';
  signalStrength: number;
  security: string;
  channelWidth: number;
  lastSeen: Date;
  frequency: number;
  isHidden: boolean;
}

export interface NeighborAnalysis {
  timestamp: Date;
  networks: NeighborNetwork[];
  channelCongestion: Map<number, number>;
  recommendations: string[];
  conflictsWith: {
    network: NeighborNetwork;
    overlapPercent: number;
    impact: 'low' | 'medium' | 'high';
  }[];
  bestChannels: {
    band: '2.4GHz' | '5GHz';
    channel: number;
    score: number;
    reason: string;
  }[];
}

export class NeighborMonitor {
  private readonly sshClient: AsusSshClient;
  private neighborHistory: NeighborNetwork[] = [];
  private readonly maxHistoryAge: number = 24 * 60 * 60 * 1000;

  constructor(sshClient: AsusSshClient) {
    this.sshClient = sshClient;
  }

  async scanNeighbors(): Promise<NeighborNetwork[]> {
    logger.info('Scanning for neighbor networks');
    const networks: NeighborNetwork[] = [];

    try {
      const scan2g = await this.scanBand('2g');
      const scan5g = await this.scanBand('5g');
      networks.push(...scan2g, ...scan5g);
    } catch (err) {
      logger.error({ err }, 'Failed to scan neighbors');
    }

    this.updateHistory(networks);
    logger.info({ count: networks.length }, 'Neighbor scan complete');
    return networks;
  }

  private async scanBand(band: '2g' | '5g'): Promise<NeighborNetwork[]> {
    const networks: NeighborNetwork[] = [];

    try {
      const output = await this.sshClient.getSiteSurvey(band);
      const lines = output.split('\n');

      let currentNetwork: Partial<NeighborNetwork> = {};

      for (const line of lines) {
        if (line.includes('SSID:')) {
          if (currentNetwork.bssid) {
            networks.push(this.finalizeNetwork(currentNetwork, band));
          }
          currentNetwork = { lastSeen: new Date() };
          
          const ssidMatch = line.match(/SSID:\s*"?([^"]*)"?/);
          currentNetwork.ssid = ssidMatch?.[1]?.trim() ?? '';
          currentNetwork.isHidden = currentNetwork.ssid === '';
        }

        if (line.includes('BSSID:')) {
          const bssidMatch = line.match(/BSSID:\s*([0-9A-Fa-f:]+)/);
          currentNetwork.bssid = bssidMatch?.[1] ?? '';
        }

        if (line.includes('Channel:')) {
          const channelMatch = line.match(/Channel:\s*(\d+)/);
          currentNetwork.channel = parseInt(channelMatch?.[1] ?? '0', 10);
        }

        if (line.includes('RSSI:')) {
          const rssiMatch = line.match(/RSSI:\s*(-?\d+)/);
          currentNetwork.signalStrength = parseInt(rssiMatch?.[1] ?? '-100', 10);
        }

        if (line.includes('Capability:')) {
          currentNetwork.security = line.includes('WPA3') ? 'WPA3'
            : line.includes('WPA2') ? 'WPA2'
            : line.includes('WPA') ? 'WPA'
            : line.includes('WEP') ? 'WEP'
            : 'Open';
        }

        if (line.includes('Chanspec:')) {
          const widthMatch = line.match(/(\d+)MHz/);
          currentNetwork.channelWidth = parseInt(widthMatch?.[1] ?? '20', 10);
        }
      }

      if (currentNetwork.bssid) {
        networks.push(this.finalizeNetwork(currentNetwork, band));
      }
    } catch (err) {
      logger.warn({ err, band }, 'Failed to scan band');
    }

    return networks;
  }

  private finalizeNetwork(partial: Partial<NeighborNetwork>, band: '2g' | '5g'): NeighborNetwork {
    const channel = partial.channel ?? 1;
    const bandType = band === '2g' ? '2.4GHz' : '5GHz';
    
    return {
      ssid: partial.ssid ?? '',
      bssid: partial.bssid ?? '',
      channel,
      band: bandType,
      signalStrength: partial.signalStrength ?? -90,
      security: partial.security ?? 'Unknown',
      channelWidth: partial.channelWidth ?? 20,
      lastSeen: partial.lastSeen ?? new Date(),
      frequency: wifiChannelToFrequency(channel, bandType),
      isHidden: partial.isHidden ?? false,
    };
  }

  private updateHistory(networks: NeighborNetwork[]): void {
    const now = Date.now();
    
    this.neighborHistory = this.neighborHistory.filter(
      n => now - n.lastSeen.getTime() < this.maxHistoryAge
    );

    for (const network of networks) {
      const existing = this.neighborHistory.find(n => n.bssid === network.bssid);
      if (existing) {
        Object.assign(existing, network);
      } else {
        this.neighborHistory.push(network);
      }
    }
  }

  async analyzeNeighbors(currentSettings: WifiSettings[]): Promise<NeighborAnalysis> {
    const networks = await this.scanNeighbors();
    
    const channelCongestion = this.calculateChannelCongestion(networks);
    const conflictsWith = this.findConflicts(networks, currentSettings);
    const bestChannels = this.findBestChannels(networks, channelCongestion);
    const recommendations = this.generateRecommendations(
      networks, 
      currentSettings, 
      channelCongestion, 
      conflictsWith
    );

    return {
      timestamp: new Date(),
      networks,
      channelCongestion,
      recommendations,
      conflictsWith,
      bestChannels,
    };
  }

  private calculateChannelCongestion(networks: NeighborNetwork[]): Map<number, number> {
    const congestion = new Map<number, number>();

    for (const network of networks) {
      const halfWidth = Math.floor(network.channelWidth / 5);
      
      for (let offset = -halfWidth; offset <= halfWidth; offset++) {
        const affectedChannel = network.channel + offset;
        const current = congestion.get(affectedChannel) ?? 0;
        
        const weight = network.signalStrength > -50 ? 3
          : network.signalStrength > -65 ? 2
          : network.signalStrength > -80 ? 1
          : 0.5;
        
        congestion.set(affectedChannel, current + weight);
      }
    }

    return congestion;
  }

  private findConflicts(
    networks: NeighborNetwork[],
    currentSettings: WifiSettings[]
  ): NeighborAnalysis['conflictsWith'] {
    const conflicts: NeighborAnalysis['conflictsWith'] = [];

    for (const settings of currentSettings) {
      for (const network of networks) {
        if (network.band !== settings.band) continue;

        const channelDiff = Math.abs(network.channel - settings.channel);
        let overlapPercent = 0;

        if (settings.band === '2.4GHz') {
          if (channelDiff === 0) overlapPercent = 100;
          else if (channelDiff <= 2) overlapPercent = 75;
          else if (channelDiff <= 4) overlapPercent = 25;
        } else {
          if (channelDiff === 0) overlapPercent = 100;
          else if (channelDiff <= 4) overlapPercent = 50;
        }

        if (overlapPercent > 0 && network.signalStrength > -75) {
          let impact: 'low' | 'medium' | 'high';
          if (network.signalStrength > -50 && overlapPercent > 50) impact = 'high';
          else if (network.signalStrength > -65 && overlapPercent > 25) impact = 'medium';
          else impact = 'low';

          conflicts.push({ network, overlapPercent, impact });
        }
      }
    }

    return conflicts.sort((a, b) => {
      const impactOrder = { high: 3, medium: 2, low: 1 };
      return impactOrder[b.impact] - impactOrder[a.impact];
    });
  }

  private findBestChannels(
    networks: NeighborNetwork[],
    congestion: Map<number, number>
  ): NeighborAnalysis['bestChannels'] {
    const results: NeighborAnalysis['bestChannels'] = [];

    const channels2g = [1, 6, 11];
    for (const channel of channels2g) {
      const score = 100 - (congestion.get(channel) ?? 0) * 10;
      const networkCount = networks.filter(
        n => n.band === '2.4GHz' && Math.abs(n.channel - channel) <= 2
      ).length;

      results.push({
        band: '2.4GHz',
        channel,
        score: Math.max(0, score),
        reason: networkCount === 0 
          ? 'Keine überlappenden Netzwerke' 
          : `${networkCount} Netzwerke in der Nähe`,
      });
    }

    const channels5g = [36, 44, 149, 157];
    for (const channel of channels5g) {
      const score = 100 - (congestion.get(channel) ?? 0) * 15;
      const networkCount = networks.filter(
        n => n.band === '5GHz' && Math.abs(n.channel - channel) <= 4
      ).length;

      results.push({
        band: '5GHz',
        channel,
        score: Math.max(0, score),
        reason: networkCount === 0 
          ? 'Keine überlappenden Netzwerke' 
          : `${networkCount} Netzwerke in der Nähe`,
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  private generateRecommendations(
    networks: NeighborNetwork[],
    currentSettings: WifiSettings[],
    _congestion: Map<number, number>,
    conflicts: NeighborAnalysis['conflictsWith']
  ): string[] {
    const recommendations: string[] = [];

    const highImpactConflicts = conflicts.filter(c => c.impact === 'high');
    if (highImpactConflicts.length > 0) {
      recommendations.push(
        `${highImpactConflicts.length} starke Interferenzen erkannt. Kanalwechsel dringend empfohlen.`
      );
    }

    for (const settings of currentSettings) {
      if (settings.band === '2.4GHz' && ![1, 6, 11].includes(settings.channel)) {
        recommendations.push(
          `2.4GHz Kanal ${settings.channel} ist nicht optimal. Wechsel zu 1, 6 oder 11.`
        );
      }
    }

    const network2gCount = networks.filter(n => n.band === '2.4GHz').length;

    if (network2gCount > 10) {
      recommendations.push(
        `${network2gCount} Nachbarnetzwerke auf 2.4GHz. Priorisiere 5GHz für wichtige Geräte.`
      );
    }

    const hiddenNetworks = networks.filter(n => n.isHidden);
    if (hiddenNetworks.length > 0) {
      recommendations.push(
        `${hiddenNetworks.length} versteckte Netzwerke erkannt. Diese können zusätzliche Interferenzen verursachen.`
      );
    }

    return recommendations;
  }

  getNeighborHistory(): NeighborNetwork[] {
    return [...this.neighborHistory];
  }

  getStrongestNeighbors(limit: number = 10): NeighborNetwork[] {
    return [...this.neighborHistory]
      .sort((a, b) => b.signalStrength - a.signalStrength)
      .slice(0, limit);
  }

  getChannelUsageStats(): {
    band: '2.4GHz' | '5GHz';
    channel: number;
    networkCount: number;
    avgSignal: number;
  }[] {
    const stats = new Map<string, { count: number; signals: number[] }>();

    for (const network of this.neighborHistory) {
      const key = `${network.band}-${network.channel}`;
      const current = stats.get(key) ?? { count: 0, signals: [] };
      current.count++;
      current.signals.push(network.signalStrength);
      stats.set(key, current);
    }

    return Array.from(stats.entries()).map(([key, value]) => {
      const [band, channel] = key.split('-');
      return {
        band: band as '2.4GHz' | '5GHz',
        channel: parseInt(channel!, 10),
        networkCount: value.count,
        avgSignal: value.signals.reduce((a, b) => a + b, 0) / value.signals.length,
      };
    }).sort((a, b) => b.networkCount - a.networkCount);
  }
}
