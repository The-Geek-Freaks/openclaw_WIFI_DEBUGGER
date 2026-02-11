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
      
      // Stateful parser for multi-line wl scanresults format
      // Format: SSID: "name"\n BSSID: XX:XX\n Channel: N\n RSSI: -XX\n ...
      let currentNetwork: { ssid: string; bssid: string; channel: number; rssi: number } | null = null;
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Start of new network block
        if (trimmedLine.startsWith('SSID:')) {
          // Save previous network if complete
          if (currentNetwork && currentNetwork.channel > 0 && currentNetwork.bssid) {
            this.addNetworkToChannelMap(channelMap, currentNetwork, band);
          }
          
          // Start new network
          const ssidMatch = trimmedLine.match(/SSID:\s*"?([^"]*)"?/);
          currentNetwork = {
            ssid: ssidMatch?.[1]?.trim() ?? '',
            bssid: '',
            channel: 0,
            rssi: -100,
          };
          continue;
        }
        
        if (!currentNetwork) continue;
        
        // Parse BSSID
        if (trimmedLine.startsWith('BSSID:')) {
          const bssidMatch = trimmedLine.match(/BSSID:\s*([0-9A-Fa-f:]+)/i);
          if (bssidMatch) currentNetwork.bssid = bssidMatch[1] ?? '';
        }
        
        // Parse Channel (multiple formats)
        if (trimmedLine.includes('Channel:') || trimmedLine.includes('Chanspec:')) {
          const channelMatch = trimmedLine.match(/(?:Channel|Chanspec):\s*(\d+)/i);
          if (channelMatch) currentNetwork.channel = parseInt(channelMatch[1] ?? '0', 10);
        }
        
        // Parse RSSI/Signal
        if (trimmedLine.startsWith('RSSI:') || trimmedLine.includes('Signal:')) {
          const rssiMatch = trimmedLine.match(/(?:RSSI|Signal):\s*(-?\d+)/i);
          if (rssiMatch) currentNetwork.rssi = parseInt(rssiMatch[1] ?? '-100', 10);
        }
      }
      
      // Don't forget last network
      if (currentNetwork && currentNetwork.channel > 0 && currentNetwork.bssid) {
        this.addNetworkToChannelMap(channelMap, currentNetwork, band);
      }

      for (const result of channelMap.values()) {
        result.utilization = Math.min(100, result.interferingNetworks.length * 15);
        results.push(result);
      }

      if (results.length === 0) {
        logger.warn({ band, linesCount: lines.length }, 'No channels found in scan output');
        logger.debug({ scanOutput: scanOutput.substring(0, 500) }, 'Scan output sample');
      } else {
        logger.info({ band, networksFound: channelMap.size, totalNetworks: results.reduce((s, r) => s + r.interferingNetworks.length, 0) }, 'Channel scan complete');
      }
    } catch (err) {
      logger.error({ err, band }, 'Failed to scan channels');
    }

    return results;
  }

  private addNetworkToChannelMap(
    channelMap: Map<number, ChannelScanResult>,
    network: { ssid: string; bssid: string; channel: number; rssi: number },
    band: '2g' | '5g'
  ): void {
    if (!channelMap.has(network.channel)) {
      channelMap.set(network.channel, {
        channel: network.channel,
        band: band === '2g' ? '2.4GHz' : '5GHz',
        utilization: 0,
        noiseFloor: -95,
        interferingNetworks: [],
      });
    }

    const channelResult = channelMap.get(network.channel)!;
    channelResult.interferingNetworks.push({
      ssid: network.ssid,
      bssid: network.bssid,
      channel: network.channel,
      signalStrength: network.rssi,
      overlap: 1,
    });
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

  async generateApModeOptimizations(): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];
    
    try {
      const featureStatus = await this.sshClient.getRouterFeatureStatus();
      
      if (featureStatus.operationMode !== 'ap') {
        return suggestions;
      }

      logger.info('Router in AP-Mode detected - generating AP-specific optimizations');

      if (featureStatus.qosEnabled) {
        suggestions.push({
          id: 'ap-disable-qos',
          priority: 9,
          category: 'power',
          currentValue: true,
          suggestedValue: false,
          expectedImprovement: 'Reduzierte CPU-Last, weniger Latenz - QoS wird von OPNsense/Router übernommen',
          riskLevel: 'low',
          affectedDevices: [],
          description: 'QoS deaktivieren (im AP-Modus unnötig - OPNsense handhabt Traffic Shaping)',
        });
      }

      if (featureStatus.aiProtectionEnabled) {
        suggestions.push({
          id: 'ap-disable-aiprotection',
          priority: 9,
          category: 'power',
          currentValue: true,
          suggestedValue: false,
          expectedImprovement: 'Signifikant reduzierte CPU-Last - AiProtection verbraucht ~15-25% CPU',
          riskLevel: 'low',
          affectedDevices: [],
          description: 'AiProtection deaktivieren (im AP-Modus unnötig - Firewall übernimmt Security)',
        });
      }

      if (featureStatus.trafficAnalyzerEnabled) {
        suggestions.push({
          id: 'ap-disable-traffic-analyzer',
          priority: 8,
          category: 'power',
          currentValue: true,
          suggestedValue: false,
          expectedImprovement: 'Reduzierte CPU/RAM-Last - Traffic Analyzer speichert große Datenmengen',
          riskLevel: 'low',
          affectedDevices: [],
          description: 'Traffic Analyzer deaktivieren (im AP-Modus sieht er nur Bridge-Traffic)',
        });
      }

      if (featureStatus.adaptiveQosEnabled) {
        suggestions.push({
          id: 'ap-disable-adaptive-qos',
          priority: 8,
          category: 'power',
          currentValue: true,
          suggestedValue: false,
          expectedImprovement: 'Reduzierte CPU-Last - Adaptive QoS erfordert Deep Packet Inspection',
          riskLevel: 'low',
          affectedDevices: [],
          description: 'Adaptive QoS deaktivieren (im AP-Modus nicht funktional)',
        });
      }

      if (featureStatus.parentalControlEnabled) {
        suggestions.push({
          id: 'ap-disable-parental-control',
          priority: 7,
          category: 'power',
          currentValue: true,
          suggestedValue: false,
          expectedImprovement: 'Weniger DNS/URL-Filtering overhead',
          riskLevel: 'medium',
          affectedDevices: [],
          description: 'Parental Control deaktivieren (im AP-Modus auf OPNsense konfigurieren)',
        });
      }

      if (featureStatus.vpnServerEnabled) {
        suggestions.push({
          id: 'ap-disable-vpn-server',
          priority: 7,
          category: 'power',
          currentValue: true,
          suggestedValue: false,
          expectedImprovement: 'VPN Server benötigt WAN-Zugang - im AP-Modus nicht erreichbar',
          riskLevel: 'low',
          affectedDevices: [],
          description: 'VPN Server deaktivieren (im AP-Modus nicht funktional - auf OPNsense einrichten)',
        });
      }

      if (featureStatus.ddnsEnabled) {
        suggestions.push({
          id: 'ap-disable-ddns',
          priority: 6,
          category: 'power',
          currentValue: true,
          suggestedValue: false,
          expectedImprovement: 'DDNS im AP-Modus nutzlos - keine WAN-IP',
          riskLevel: 'low',
          affectedDevices: [],
          description: 'DDNS deaktivieren (im AP-Modus keine WAN-Verbindung)',
        });
      }

      if (featureStatus.uptEnabled) {
        suggestions.push({
          id: 'ap-disable-upnp',
          priority: 6,
          category: 'power',
          currentValue: true,
          suggestedValue: false,
          expectedImprovement: 'UPnP im AP-Modus ohne NAT nutzlos',
          riskLevel: 'low',
          affectedDevices: [],
          description: 'UPnP deaktivieren (kein NAT im AP-Modus)',
        });
      }

      suggestions.push({
        id: 'ap-info-ofdma',
        priority: 5,
        category: 'channel',
        currentValue: 'check',
        suggestedValue: 'evaluate',
        expectedImprovement: 'OFDMA kann bei wenigen Clients CPU-Last ohne Nutzen erzeugen',
        riskLevel: 'low',
        affectedDevices: [],
        description: 'OFDMA prüfen: Bei <10 Clients pro Band kann Deaktivierung CPU sparen',
      });

      suggestions.push({
        id: 'ap-info-mumimo',
        priority: 5,
        category: 'channel',
        currentValue: 'check',
        suggestedValue: 'evaluate',
        expectedImprovement: 'MU-MIMO sinnvoll nur mit vielen gleichzeitig aktiven Clients',
        riskLevel: 'low',
        affectedDevices: [],
        description: 'MU-MIMO prüfen: Bei wenig simultanen Downloads ggf. deaktivieren',
      });

    } catch (err) {
      logger.warn({ err }, 'Failed to get router feature status for AP-mode optimizations');
    }

    return suggestions.sort((a, b) => b.priority - a.priority);
  }

  async applyApModeOptimization(suggestion: OptimizationSuggestion): Promise<boolean> {
    logger.info({ suggestion }, 'Applying AP-mode optimization');

    try {
      switch (suggestion.id) {
        case 'ap-disable-qos':
          await this.sshClient.setNvram('qos_enable', '0');
          break;
        case 'ap-disable-aiprotection':
          await this.sshClient.setNvram('wrs_protect_enable', '0');
          await this.sshClient.setNvram('wrs_enable', '0');
          break;
        case 'ap-disable-traffic-analyzer':
          await this.sshClient.setNvram('bwdpi_db_enable', '0');
          break;
        case 'ap-disable-adaptive-qos':
          await this.sshClient.setNvram('qos_type', '0');
          break;
        case 'ap-disable-parental-control':
          await this.sshClient.setNvram('PARENTAL_CTRL', '0');
          break;
        case 'ap-disable-vpn-server':
          await this.sshClient.setNvram('VPNServer_enable', '0');
          break;
        case 'ap-disable-ddns':
          await this.sshClient.setNvram('ddns_enable_x', '0');
          break;
        case 'ap-disable-upnp':
          await this.sshClient.setNvram('upnp_enable', '0');
          break;
        default:
          logger.warn({ id: suggestion.id }, 'Unknown AP-mode optimization');
          return false;
      }

      await this.sshClient.commitNvram();
      logger.info({ suggestionId: suggestion.id }, 'AP-mode optimization applied');
      return true;
    } catch (err) {
      logger.error({ err, suggestionId: suggestion.id }, 'Failed to apply AP-mode optimization');
      return false;
    }
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
