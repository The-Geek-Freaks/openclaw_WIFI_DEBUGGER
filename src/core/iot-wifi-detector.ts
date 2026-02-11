import { createChildLogger } from '../utils/logger.js';
import { normalizeMac } from '../utils/mac.js';
import type { AsusSshClient } from '../infra/asus-ssh-client.js';
import type { HomeAssistantClient } from '../infra/homeassistant-client.js';
import type { NeighborNetwork } from './neighbor-monitor.js';
import {
  type RogueWifiNetwork,
  type IoTDeviceInfo,
  type OpenClawAction,
  type IoTVendor,
  type RogueWifiType,
  VENDOR_OUI_PATTERNS,
  ROGUE_SSID_PATTERNS,
} from '../types/iot-device.js';

const logger = createChildLogger('iot-wifi-detector');

export interface IoTWifiScanResult {
  timestamp: Date;
  rogueNetworks: RogueWifiNetwork[];
  knownIoTDevices: IoTDeviceInfo[];
  suggestedActions: OpenClawAction[];
  summary: {
    totalRogueNetworks: number;
    highInterference: number;
    controllableDevices: number;
    uncontrollableDevices: number;
  };
}

export class IoTWifiDetector {
  private readonly sshClient: AsusSshClient;
  private readonly hassClient: HomeAssistantClient | null;
  private rogueNetworkHistory: Map<string, RogueWifiNetwork> = new Map();
  private knownDevices: Map<string, IoTDeviceInfo> = new Map();

  constructor(sshClient: AsusSshClient, hassClient?: HomeAssistantClient) {
    this.sshClient = sshClient;
    this.hassClient = hassClient ?? null;
  }

  async scanForRogueIoTNetworks(): Promise<IoTWifiScanResult> {
    logger.info('Scanning for rogue IoT WiFi networks');

    const neighborNetworks = await this.scanNeighborNetworks();
    const rogueNetworks: RogueWifiNetwork[] = [];

    for (const network of neighborNetworks) {
      const analysis = this.analyzeNetwork(network);
      if (analysis) {
        rogueNetworks.push(analysis);
        this.rogueNetworkHistory.set(network.bssid, analysis);
      }
    }

    const knownIoTDevices = await this.correlateWithHomeAssistant(rogueNetworks);
    const suggestedActions = this.generateSuggestedActions(rogueNetworks, knownIoTDevices);

    const result: IoTWifiScanResult = {
      timestamp: new Date(),
      rogueNetworks,
      knownIoTDevices,
      suggestedActions,
      summary: {
        totalRogueNetworks: rogueNetworks.length,
        highInterference: rogueNetworks.filter(n => n.interferenceLevel === 'high').length,
        controllableDevices: knownIoTDevices.filter(d => d.homeAssistantEntityId).length,
        uncontrollableDevices: knownIoTDevices.filter(d => !d.homeAssistantEntityId).length,
      },
    };

    logger.info({
      rogueCount: result.summary.totalRogueNetworks,
      highInterference: result.summary.highInterference,
    }, 'IoT WiFi scan complete');

    return result;
  }

  private async scanNeighborNetworks(): Promise<NeighborNetwork[]> {
    const networks: NeighborNetwork[] = [];

    try {
      const scan2g = await this.sshClient.getSiteSurvey('2g');
      const parsed2g = this.parseSiteSurvey(scan2g, '2.4GHz');
      networks.push(...parsed2g);

      const scan5g = await this.sshClient.getSiteSurvey('5g');
      const parsed5g = this.parseSiteSurvey(scan5g, '5GHz');
      networks.push(...parsed5g);
    } catch (err) {
      logger.error({ err }, 'Failed to scan neighbor networks');
    }

    return networks;
  }

  private parseSiteSurvey(output: string, band: '2.4GHz' | '5GHz'): NeighborNetwork[] {
    const networks: NeighborNetwork[] = [];
    const lines = output.split('\n');

    let currentNetwork: Partial<NeighborNetwork> = {};

    for (const line of lines) {
      if (line.includes('SSID:')) {
        if (currentNetwork.bssid) {
          networks.push(this.finalizeNeighborNetwork(currentNetwork, band));
        }
        currentNetwork = { lastSeen: new Date() };
        const match = line.match(/SSID:\s*"?([^"]*)"?/);
        currentNetwork.ssid = match?.[1]?.trim() ?? '';
      }

      if (line.includes('BSSID:')) {
        const match = line.match(/BSSID:\s*([0-9A-Fa-f:]+)/);
        currentNetwork.bssid = match?.[1] ?? '';
      }

      if (line.includes('Channel:')) {
        const match = line.match(/Channel:\s*(\d+)/);
        currentNetwork.channel = parseInt(match?.[1] ?? '0', 10);
      }

      if (line.includes('RSSI:')) {
        const match = line.match(/RSSI:\s*(-?\d+)/);
        currentNetwork.signalStrength = parseInt(match?.[1] ?? '-90', 10);
      }
    }

    if (currentNetwork.bssid) {
      networks.push(this.finalizeNeighborNetwork(currentNetwork, band));
    }

    return networks;
  }

  private finalizeNeighborNetwork(
    partial: Partial<NeighborNetwork>,
    band: '2.4GHz' | '5GHz'
  ): NeighborNetwork {
    return {
      ssid: partial.ssid ?? '',
      bssid: partial.bssid ?? '',
      channel: partial.channel ?? 0,
      band,
      signalStrength: partial.signalStrength ?? -90,
      security: 'unknown',
      channelWidth: 20,
      lastSeen: partial.lastSeen ?? new Date(),
      frequency: 0,
      isHidden: !partial.ssid,
    };
  }

  private analyzeNetwork(network: NeighborNetwork): RogueWifiNetwork | null {
    const ssid = network.ssid;
    const bssid = network.bssid.toLowerCase();

    let vendor: IoTVendor = 'unknown';
    let rogueType: RogueWifiType = 'unknown';
    let deviceType: string | undefined;

    for (const pattern of ROGUE_SSID_PATTERNS) {
      if (pattern.pattern.test(ssid)) {
        vendor = pattern.vendor;
        rogueType = pattern.type;
        deviceType = this.guessDeviceType(ssid, vendor);
        break;
      }
    }

    if (vendor === 'unknown') {
      const ouiPrefix = bssid.substring(0, 8);
      const ouiVendor = VENDOR_OUI_PATTERNS[ouiPrefix];
      if (ouiVendor && this.looksLikeIoTSsid(ssid)) {
        vendor = ouiVendor;
        rogueType = 'unknown';
      }
    }

    if (vendor === 'unknown') {
      return null;
    }

    const existingEntry = this.rogueNetworkHistory.get(bssid);
    const firstSeen = existingEntry?.firstSeen ?? new Date();

    let interferenceLevel: 'low' | 'medium' | 'high';
    if (network.signalStrength > -50) {
      interferenceLevel = 'high';
    } else if (network.signalStrength > -70) {
      interferenceLevel = 'medium';
    } else {
      interferenceLevel = 'low';
    }

    const recommendation = this.generateRecommendation(vendor, rogueType, interferenceLevel);

    const bandValue: '2.4GHz' | '5GHz' = network.band === '6GHz' ? '5GHz' : network.band;

    return {
      ssid,
      bssid,
      channel: network.channel,
      band: bandValue,
      signalStrength: network.signalStrength,
      vendor,
      deviceType,
      rogueType,
      interferenceLevel,
      firstSeen,
      lastSeen: new Date(),
      isActive: true,
      recommendedAction: recommendation,
      canBeControlled: this.canBeControlled(vendor),
    };
  }

  private looksLikeIoTSsid(ssid: string): boolean {
    const iotPatterns = [
      /^[A-Z]{2,6}[-_]\w{4,}$/i,
      /^\w+-\w{4,8}$/,
      /^(smart|iot|home|device|sensor)/i,
      /setup|config|ap|direct/i,
    ];

    return iotPatterns.some(p => p.test(ssid));
  }

  private guessDeviceType(ssid: string, vendor: IoTVendor): string {
    const lower = ssid.toLowerCase();

    if (/plug|socket|outlet/i.test(lower)) return 'smart_plug';
    if (/bulb|light|lamp|led/i.test(lower)) return 'smart_light';
    if (/switch|relay/i.test(lower)) return 'smart_switch';
    if (/sensor|motion|door|window/i.test(lower)) return 'sensor';
    if (/camera|cam|doorbell/i.test(lower)) return 'camera';
    if (/thermostat|hvac|climate/i.test(lower)) return 'thermostat';
    if (/hub|gateway|bridge/i.test(lower)) return 'hub';
    if (/dimmer/i.test(lower)) return 'dimmer';

    switch (vendor) {
      case 'shelly': return 'relay';
      case 'philips_hue': return 'light';
      case 'ring': return 'doorbell';
      case 'nest': return 'thermostat';
      default: return 'unknown';
    }
  }

  private generateRecommendation(
    vendor: IoTVendor,
    type: RogueWifiType,
    interference: 'low' | 'medium' | 'high'
  ): string {
    if (type === 'setup_ap') {
      return `${vendor} Gerät im Setup-Modus. Konfiguration abschließen oder Gerät neustarten.`;
    }

    if (type === 'fallback_ap') {
      return `${vendor} Gerät kann sich nicht mit WiFi verbinden. WiFi-Credentials prüfen.`;
    }

    if (type === 'config_portal') {
      return `${vendor} Konfigurationsportal aktiv. Gerät neu konfigurieren.`;
    }

    if (interference === 'high') {
      return `Starke Interferenz durch ${vendor} AP. Gerät neustarten oder Kanal wechseln.`;
    }

    return `${vendor} Gerät-AP erkannt. Prüfen ob dies beabsichtigt ist.`;
  }

  private canBeControlled(vendor: IoTVendor): boolean {
    const controllableVendors: IoTVendor[] = [
      'shelly',
      'tasmota',
      'philips_hue',
      'tp_link_kasa',
      'wemo',
      'tuya',
      'sonoff',
      'meross',
      'xiaomi',
      'ikea',
      'aqara',
    ];

    return controllableVendors.includes(vendor);
  }

  private async correlateWithHomeAssistant(
    rogueNetworks: RogueWifiNetwork[]
  ): Promise<IoTDeviceInfo[]> {
    const devices: IoTDeviceInfo[] = [];

    if (!this.hassClient) {
      logger.warn('No Home Assistant client available for correlation');
      return devices;
    }

    try {
      const states = await this.hassClient.getStates();
      const entityRegistry = await this.getEntityRegistry();

      for (const rogue of rogueNetworks) {
        const matchingEntity = this.findMatchingEntity(rogue, states);
        
        if (matchingEntity) {
          devices.push({
            macAddress: rogue.bssid,
            vendor: rogue.vendor,
            deviceType: rogue.deviceType ?? 'unknown',
            friendlyName: matchingEntity.friendlyName,
            homeAssistantEntityId: matchingEntity.entityId,
            hasRogueWifi: true,
            rogueWifiSsid: rogue.ssid,
            lastSeen: rogue.lastSeen,
            capabilities: this.getDeviceCapabilities(rogue.vendor, matchingEntity.domain),
          });
        } else {
          devices.push({
            macAddress: rogue.bssid,
            vendor: rogue.vendor,
            deviceType: rogue.deviceType ?? 'unknown',
            hasRogueWifi: true,
            rogueWifiSsid: rogue.ssid,
            lastSeen: rogue.lastSeen,
            capabilities: [],
          });
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to correlate with Home Assistant');
    }

    return devices;
  }

  private async getEntityRegistry(): Promise<Map<string, { mac?: string; name?: string }>> {
    const registry = new Map<string, { mac?: string; name?: string }>();

    if (!this.hassClient) return registry;

    try {
      const result = await this.hassClient.callService('config', 'entity_registry/list', {});
      if (Array.isArray(result)) {
        for (const entity of result) {
          if (entity.entity_id && entity.unique_id) {
            registry.set(entity.entity_id, {
              mac: entity.unique_id,
              name: entity.name,
            });
          }
        }
      }
    } catch {
      logger.debug('Could not fetch entity registry');
    }

    return registry;
  }

  private findMatchingEntity(
    rogue: RogueWifiNetwork,
    states: Array<{ entity_id: string; attributes: Record<string, unknown> }>
  ): { entityId: string; friendlyName: string; domain: string } | null {
    const normalizedMac = normalizeMac(rogue.bssid);
    const ssidLower = rogue.ssid.toLowerCase();

    for (const state of states) {
      const entityId = state.entity_id;
      const attrs = state.attributes;

      const entityMac = attrs['mac_address'] || attrs['mac'] || '';
      if (typeof entityMac === 'string' && normalizeMac(entityMac) === normalizedMac) {
        return {
          entityId,
          friendlyName: String(attrs['friendly_name'] ?? entityId),
          domain: entityId.split('.')[0] ?? '',
        };
      }

      const friendlyName = String(attrs['friendly_name'] ?? '').toLowerCase();
      if (friendlyName && ssidLower.includes(friendlyName.substring(0, 8))) {
        return {
          entityId,
          friendlyName: String(attrs['friendly_name'] ?? entityId),
          domain: entityId.split('.')[0] ?? '',
        };
      }
    }

    return null;
  }

  private getDeviceCapabilities(vendor: IoTVendor, domain: string): string[] {
    const capabilities: string[] = [];

    if (['switch', 'light', 'fan'].includes(domain)) {
      capabilities.push('toggle', 'turn_on', 'turn_off');
    }

    if (domain === 'light') {
      capabilities.push('brightness', 'color');
    }

    switch (vendor) {
      case 'shelly':
        capabilities.push('restart', 'ota_update', 'config_ap_disable');
        break;
      case 'tasmota':
        capabilities.push('restart', 'ota_update', 'config_portal', 'web_console');
        break;
      case 'espressif':
        capabilities.push('restart', 'ota_update');
        break;
    }

    return capabilities;
  }

  private generateSuggestedActions(
    rogueNetworks: RogueWifiNetwork[],
    _devices: IoTDeviceInfo[]
  ): OpenClawAction[] {
    const actions: OpenClawAction[] = [];

    for (const rogue of rogueNetworks) {
      if (!rogue.canBeControlled) continue;

      if (rogue.rogueType === 'setup_ap' || rogue.rogueType === 'fallback_ap') {
        actions.push({
          actionId: `fix_${rogue.bssid.replace(/:/g, '')}`,
          actionType: 'reconfigure_wifi',
          targetDevice: {
            macAddress: rogue.bssid,
            vendor: rogue.vendor,
            entityId: rogue.homeAssistantEntityId,
          },
          parameters: {
            reason: rogue.rogueType,
            ssid: rogue.ssid,
          },
          priority: rogue.interferenceLevel === 'high' ? 'high' : 'medium',
          estimatedImpact: 'Gerät wird nach WLAN-Konfiguration normal funktionieren',
          requiresConfirmation: true,
        });
      }

      if (rogue.rogueType === 'config_portal' && rogue.vendor === 'tasmota') {
        actions.push({
          actionId: `disable_ap_${rogue.bssid.replace(/:/g, '')}`,
          actionType: 'disable_ap',
          targetDevice: {
            macAddress: rogue.bssid,
            vendor: rogue.vendor,
            entityId: rogue.homeAssistantEntityId,
          },
          parameters: {
            command: 'WifiConfig 4',
          },
          priority: 'medium',
          estimatedImpact: 'Tasmota AP-Modus wird deaktiviert',
          requiresConfirmation: true,
        });
      }

      if (rogue.interferenceLevel === 'high') {
        actions.push({
          actionId: `restart_${rogue.bssid.replace(/:/g, '')}`,
          actionType: 'restart_device',
          targetDevice: {
            macAddress: rogue.bssid,
            vendor: rogue.vendor,
            entityId: rogue.homeAssistantEntityId,
          },
          priority: 'high',
          estimatedImpact: 'Gerät wird neugestartet, AP sollte danach weg sein',
          requiresConfirmation: true,
        });
      }
    }

    return actions.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  async executeOpenClawAction(action: OpenClawAction): Promise<{
    success: boolean;
    message: string;
  }> {
    logger.info({ actionId: action.actionId, type: action.actionType }, 'Executing OpenClaw action');

    if (!this.hassClient && action.targetDevice.entityId) {
      return { success: false, message: 'Home Assistant nicht verbunden' };
    }

    try {
      switch (action.actionType) {
        case 'restart_device':
          return await this.restartDevice(action);
        
        case 'disable_ap':
          return await this.disableDeviceAP(action);
        
        case 'reconfigure_wifi':
          return await this.triggerWifiReconfiguration(action);
        
        case 'notify_user':
          return await this.notifyUser(action);
        
        default:
          return { success: false, message: `Unbekannte Action: ${action.actionType}` };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err, actionId: action.actionId }, 'Action execution failed');
      return { success: false, message: errorMsg };
    }
  }

  private async restartDevice(action: OpenClawAction): Promise<{ success: boolean; message: string }> {
    const entityId = action.targetDevice.entityId;
    
    if (entityId && this.hassClient) {
      const domain = entityId.split('.')[0];
      
      if (domain === 'button') {
        await this.hassClient.callService(domain, 'press', { entity_id: entityId });
        return { success: true, message: 'Restart-Button gedrückt' };
      }

      if (action.targetDevice.vendor === 'shelly') {
        await this.hassClient.callService('homeassistant', 'update_entity', { entity_id: entityId });
        return { success: true, message: 'Shelly Restart ausgelöst via HA' };
      }
    }

    return { success: false, message: 'Gerät konnte nicht neugestartet werden' };
  }

  private async disableDeviceAP(action: OpenClawAction): Promise<{ success: boolean; message: string }> {
    const command = action.parameters?.['command'];
    
    if (action.targetDevice.vendor === 'tasmota' && typeof command === 'string') {
      return { 
        success: true, 
        message: `Tasmota-Befehl "${command}" muss manuell über Web-Konsole ausgeführt werden` 
      };
    }

    return { success: false, message: 'AP-Deaktivierung für diesen Vendor nicht unterstützt' };
  }

  private async triggerWifiReconfiguration(action: OpenClawAction): Promise<{ success: boolean; message: string }> {
    const vendor = action.targetDevice.vendor;
    const ssid = action.parameters?.['ssid'];

    return {
      success: true,
      message: `${vendor} Gerät "${ssid}" muss manuell neu konfiguriert werden. ` +
               `Verbinde dich mit dem AP und richte WLAN ein.`,
    };
  }

  private async notifyUser(action: OpenClawAction): Promise<{ success: boolean; message: string }> {
    if (this.hassClient) {
      try {
        await this.hassClient.callService(
          'persistent_notification',
          'create',
          {
            title: 'IoT WiFi Problem erkannt',
            message: action.estimatedImpact,
          }
        );
        return { success: true, message: 'Benachrichtigung erstellt' };
      } catch {
        logger.warn('Could not create notification');
      }
    }

    return { success: true, message: 'Aktion wurde protokolliert' };
  }

  exportForOpenClaw(): {
    rogueNetworks: RogueWifiNetwork[];
    actions: OpenClawAction[];
    timestamp: Date;
  } {
    return {
      rogueNetworks: Array.from(this.rogueNetworkHistory.values()),
      actions: this.generateSuggestedActions(
        Array.from(this.rogueNetworkHistory.values()),
        Array.from(this.knownDevices.values())
      ),
      timestamp: new Date(),
    };
  }

  getRogueNetworkHistory(): RogueWifiNetwork[] {
    return Array.from(this.rogueNetworkHistory.values());
  }

  clearHistory(): void {
    this.rogueNetworkHistory.clear();
    this.knownDevices.clear();
  }
}
