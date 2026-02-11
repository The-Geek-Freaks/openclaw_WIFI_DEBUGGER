import { createChildLogger } from '../utils/logger.js';
import { 
  findBestZigbeeChannel, 
  WIFI_2G_CHANNELS, 
  WIFI_5G_CHANNELS,
  getWifi2gZigbeeOverlap 
} from '../utils/frequency.js';
import type { AsusSshClient } from '../infra/asus-ssh-client.js';
import type { MeshNetworkState, ChannelScanResult } from '../types/network.js';
import type { ZigbeeNetworkState } from '../types/zigbee.js';
import type { OptimizationSuggestion } from '../types/analysis.js';

const logger = createChildLogger('frequency-optimizer');

interface ChannelScore {
  channel: number;
  score: number;
  utilization: number;
  interferingNetworks: number;
  zigbeeOverlap: number;
}

export class FrequencyOptimizer {
  private readonly sshClient: AsusSshClient;

  constructor(sshClient: AsusSshClient) {
    this.sshClient = sshClient;
  }

  async scanChannels(band: '2g' | '5g'): Promise<ChannelScanResult[]> {
    const results: ChannelScanResult[] = [];

    try {
      const scanOutput = await this.sshClient.getSiteSurvey(band);
      const lines = scanOutput.split('\n');
      
      const channelMap = new Map<number, ChannelScanResult>();
      
      for (const line of lines) {
        let ssid = '';
        let bssid = '';
        let channel = 0;
        let rssi = -100;

        const ssidMatch = line.match(/SSID[:\s]+["']?([^"'\t\n]+)["']?/i);
        if (ssidMatch) ssid = ssidMatch[1]?.trim() ?? '';

        const bssidMatch = line.match(/([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/);
        if (bssidMatch) bssid = bssidMatch[0] ?? '';

        const channelMatch = line.match(/(?:Channel|Chan)[:\s]*(\d+)/i);
        if (channelMatch) channel = parseInt(channelMatch[1] ?? '0', 10);

        const rssiMatch = line.match(/(?:RSSI|Signal)[:\s]*(-?\d+)/i);
        if (rssiMatch) rssi = parseInt(rssiMatch[1] ?? '-100', 10);

        if (channel > 0 && bssid) {
          if (!channelMap.has(channel)) {
            channelMap.set(channel, {
              channel,
              band: band === '2g' ? '2.4GHz' : '5GHz',
              utilization: 0,
              noiseFloor: -95,
              interferingNetworks: [],
            });
          }

          const channelResult = channelMap.get(channel)!;
          channelResult.interferingNetworks.push({
            ssid,
            bssid,
            channel,
            signalStrength: rssi,
            overlap: 1,
          });
        }
      }

      for (const result of channelMap.values()) {
        result.utilization = Math.min(100, result.interferingNetworks.length * 15);
        results.push(result);
      }

      if (results.length === 0) {
        logger.warn({ band, linesCount: lines.length }, 'No channels found in scan output');
        logger.debug({ scanOutput: scanOutput.substring(0, 500) }, 'Scan output sample');
      }
    } catch (err) {
      logger.error({ err, band }, 'Failed to scan channels');
    }

    return results;
  }

  async generateOptimizations(
    meshState: MeshNetworkState,
    zigbeeState?: ZigbeeNetworkState
  ): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];
    
    const [scan2g, scan5g] = await Promise.all([
      this.scanChannels('2g'),
      this.scanChannels('5g'),
    ]);

    const wifi2gSettings = meshState.wifiSettings.find(s => s.band === '2.4GHz');
    const wifi5gSettings = meshState.wifiSettings.find(s => s.band === '5GHz');

    if (wifi2gSettings) {
      const best2gChannel = this.findBestWifiChannel(
        scan2g, 
        WIFI_2G_CHANNELS as unknown as number[],
        zigbeeState?.channel
      );

      if (best2gChannel.channel !== wifi2gSettings.channel && best2gChannel.improvement > 20) {
        suggestions.push({
          id: 'channel-2g-optimize',
          priority: 8,
          category: 'channel',
          currentValue: wifi2gSettings.channel,
          suggestedValue: best2gChannel.channel,
          expectedImprovement: `${best2gChannel.improvement.toFixed(0)}% less interference`,
          riskLevel: 'medium',
          affectedDevices: meshState.devices
            .filter(d => d.connectionType === 'wireless_2g')
            .map(d => d.macAddress),
          description: `Change 2.4GHz channel from ${wifi2gSettings.channel} to ${best2gChannel.channel}`,
        });
      }
    }

    if (wifi5gSettings) {
      const best5gChannel = this.findBestWifiChannel(
        scan5g, 
        WIFI_5G_CHANNELS as unknown as number[]
      );

      if (best5gChannel.channel !== wifi5gSettings.channel && best5gChannel.improvement > 15) {
        suggestions.push({
          id: 'channel-5g-optimize',
          priority: 7,
          category: 'channel',
          currentValue: wifi5gSettings.channel,
          suggestedValue: best5gChannel.channel,
          expectedImprovement: `${best5gChannel.improvement.toFixed(0)}% less interference`,
          riskLevel: 'medium',
          affectedDevices: meshState.devices
            .filter(d => d.connectionType === 'wireless_5g')
            .map(d => d.macAddress),
          description: `Change 5GHz channel from ${wifi5gSettings.channel} to ${best5gChannel.channel}`,
        });
      }
    }

    if (zigbeeState && wifi2gSettings) {
      const bestZigbee = findBestZigbeeChannel(
        [wifi2gSettings.channel],
        zigbeeState.channel
      );

      if (bestZigbee.improvement > 0) {
        suggestions.push({
          id: 'zigbee-channel-optimize',
          priority: 9,
          category: 'zigbee',
          currentValue: zigbeeState.channel,
          suggestedValue: bestZigbee.channel,
          expectedImprovement: bestZigbee.reason,
          riskLevel: 'high',
          affectedDevices: zigbeeState.devices.map(d => d.ieeeAddress),
          description: `Change Zigbee channel from ${zigbeeState.channel} to ${bestZigbee.channel} to avoid WiFi interference`,
        });
      }
    }

    for (const settings of meshState.wifiSettings) {
      if (!settings.roamingAssistant && meshState.nodes.length > 1) {
        suggestions.push({
          id: `roaming-enable-${settings.band}`,
          priority: 6,
          category: 'roaming',
          currentValue: false,
          suggestedValue: true,
          expectedImprovement: 'Better mesh roaming for mobile devices',
          riskLevel: 'low',
          affectedDevices: [],
          description: `Enable roaming assistant for ${settings.band}`,
        });
      }

      if (settings.band === '5GHz' && settings.channelWidth < 80) {
        suggestions.push({
          id: 'channel-width-5g',
          priority: 5,
          category: 'channel',
          currentValue: settings.channelWidth,
          suggestedValue: 80,
          expectedImprovement: 'Higher throughput on 5GHz',
          riskLevel: 'low',
          affectedDevices: [],
          description: `Increase 5GHz channel width from ${settings.channelWidth}MHz to 80MHz`,
        });
      }

      if (!settings.muMimo) {
        suggestions.push({
          id: `mu-mimo-${settings.band}`,
          priority: 4,
          category: 'channel',
          currentValue: false,
          suggestedValue: true,
          expectedImprovement: 'Better multi-device performance',
          riskLevel: 'low',
          affectedDevices: [],
          description: `Enable MU-MIMO on ${settings.band}`,
        });
      }
    }

    return suggestions.sort((a, b) => b.priority - a.priority);
  }

  private findBestWifiChannel(
    scanResults: ChannelScanResult[],
    availableChannels: number[],
    zigbeeChannel?: number
  ): { channel: number; improvement: number; score: number } {
    const scores: ChannelScore[] = [];

    for (const channel of availableChannels) {
      const scanResult = scanResults.find(r => r.channel === channel);
      
      let score = 100;
      let utilization = 0;
      let interferingNetworks = 0;
      let zigbeeOverlap = 0;

      if (scanResult) {
        utilization = scanResult.utilization;
        interferingNetworks = scanResult.interferingNetworks.length;
        score -= utilization * 0.5;
        score -= interferingNetworks * 5;

        for (const network of scanResult.interferingNetworks) {
          if (network.signalStrength > -60) {
            score -= 10;
          } else if (network.signalStrength > -70) {
            score -= 5;
          }
        }
      }

      if (zigbeeChannel) {
        zigbeeOverlap = getWifi2gZigbeeOverlap(channel, zigbeeChannel);
        score -= zigbeeOverlap * 30;
      }

      if ([1, 6, 11].includes(channel)) {
        score += 5;
      }

      scores.push({
        channel,
        score: Math.max(0, score),
        utilization,
        interferingNetworks,
        zigbeeOverlap,
      });
    }

    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];
    const current = scores.find(s => s.channel === availableChannels[0]) ?? scores[0];

    if (!best || !current) {
      return { channel: availableChannels[0] ?? 1, improvement: 0, score: 0 };
    }

    return {
      channel: best.channel,
      improvement: best.score - current.score,
      score: best.score,
    };
  }

  async applyOptimization(suggestion: OptimizationSuggestion): Promise<boolean> {
    logger.info({ suggestion }, 'Applying optimization');

    try {
      switch (suggestion.category) {
        case 'channel':
          if (suggestion.id.includes('channel-2g')) {
            await this.sshClient.setNvram('wl0_channel', String(suggestion.suggestedValue));
          } else if (suggestion.id.includes('channel-5g')) {
            await this.sshClient.setNvram('wl1_channel', String(suggestion.suggestedValue));
          } else if (suggestion.id.includes('width')) {
            await this.sshClient.setNvram('wl1_bw', String(suggestion.suggestedValue));
          } else if (suggestion.id.includes('mu-mimo')) {
            const nvramKey = suggestion.id.includes('2.4GHz') ? 'wl0_mumimo' : 'wl1_mumimo';
            await this.sshClient.setNvram(nvramKey, suggestion.suggestedValue ? '1' : '0');
          }
          break;

        case 'roaming':
          if (suggestion.id.includes('2.4GHz')) {
            await this.sshClient.setNvram('wl0_bsd_steering_policy', suggestion.suggestedValue ? '1' : '0');
          } else if (suggestion.id.includes('5GHz')) {
            await this.sshClient.setNvram('wl1_bsd_steering_policy', suggestion.suggestedValue ? '1' : '0');
          }
          break;

        case 'power':
          if (suggestion.id.includes('2g')) {
            await this.sshClient.setNvram('wl0_txpower', String(suggestion.suggestedValue));
          } else if (suggestion.id.includes('5g')) {
            await this.sshClient.setNvram('wl1_txpower', String(suggestion.suggestedValue));
          }
          break;

        case 'zigbee':
          logger.warn('Zigbee channel changes must be done through Home Assistant');
          return false;

        default:
          logger.warn({ category: suggestion.category }, 'Unknown optimization category');
          return false;
      }

      await this.sshClient.commitNvram();
      logger.info({ suggestionId: suggestion.id }, 'Optimization applied successfully');
      return true;
    } catch (err) {
      logger.error({ err, suggestionId: suggestion.id }, 'Failed to apply optimization');
      return false;
    }
  }

  async applyAndRestart(suggestion: OptimizationSuggestion): Promise<boolean> {
    const applied = await this.applyOptimization(suggestion);
    if (applied) {
      await this.sshClient.restartWireless();
      logger.info('Wireless service restarted');
    }
    return applied;
  }
}
