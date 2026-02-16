import { createChildLogger } from '../utils/logger.js';
import { findBestZigbeeChannel, getWifi2gZigbeeOverlap } from '../utils/frequency.js';
import type { HomeAssistantClient } from '../infra/homeassistant-client.js';
import type { ZigbeeNetworkState, ZigbeeDevice, ZigbeeLink, FrequencyConflict } from '../types/zigbee.js';
import type { WifiSettings } from '../types/network.js';

const logger = createChildLogger('zigbee-analyzer');

export class ZigbeeAnalyzer {
  private readonly hassClient: HomeAssistantClient;
  private currentState: ZigbeeNetworkState | null = null;

  constructor(hassClient: HomeAssistantClient) {
    this.hassClient = hassClient;
  }

  async scan(): Promise<ZigbeeNetworkState> {
    logger.info('Scanning Zigbee network');

    const [devices, networkInfo] = await Promise.all([
      this.getDevices(),
      this.getNetworkInfo(),
    ]);

    const links = this.buildNetworkTopology(devices);

    const state: ZigbeeNetworkState = {
      channel: networkInfo?.channel ?? 15,
      panId: networkInfo?.panId ?? 0,
      extendedPanId: networkInfo?.extendedPanId ?? '',
      devices,
      links,
      lastUpdated: new Date(),
    };

    this.currentState = state;
    logger.info({ deviceCount: devices.length, channel: state.channel }, 'Zigbee scan complete');
    return state;
  }

  private async getDevices(): Promise<ZigbeeDevice[]> {
    const devices: ZigbeeDevice[] = [];

    try {
      const zhaDevices = await this.hassClient.getZhaDevices();
      
      for (const device of zhaDevices) {
        devices.push({
          ieeeAddress: device.ieee,
          networkAddress: device.nwk,
          friendlyName: device.name,
          type: device.device_type === 'Coordinator' ? 'coordinator' 
              : device.device_type === 'Router' ? 'router' 
              : 'end_device',
          manufacturer: device.manufacturer,
          model: device.model,
          powerSource: device.power_source === 'Battery' ? 'battery' 
                     : device.power_source === 'Mains' ? 'mains' 
                     : 'unknown',
          lqi: device.lqi ?? 0,
          lastSeen: device.last_seen ? new Date(device.last_seen) : undefined,
          available: device.available,
        });
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to get ZHA devices, trying Zigbee2MQTT');
      
      try {
        const z2mDevices = await this.hassClient.getZigbee2MqttDevices();
        
        for (const device of z2mDevices) {
          devices.push({
            ieeeAddress: device.ieee_address,
            networkAddress: device.network_address,
            friendlyName: device.friendly_name,
            type: device.type === 'Coordinator' ? 'coordinator'
                : device.type === 'Router' ? 'router'
                : 'end_device',
            manufacturer: device.definition?.vendor,
            model: device.definition?.model,
            powerSource: device.power_source === 'Battery' ? 'battery'
                       : device.power_source === 'Mains' ? 'mains'
                       : 'unknown',
            lqi: device.linkquality ?? 0,
            lastSeen: device.last_seen ? new Date(device.last_seen) : undefined,
            available: !device.disabled && !device.interviewing,
          });
        }
      } catch (z2mErr) {
        logger.error({ err: z2mErr }, 'Failed to get Zigbee devices from any source');
      }
    }

    return devices;
  }

  private async getNetworkInfo(): Promise<{ channel: number; panId: number; extendedPanId: string } | null> {
    try {
      const result = await this.hassClient.getZhaNetworkInfo();
      if (!result) return null;
      return {
        channel: result.channel,
        panId: result.pan_id,
        extendedPanId: result.extended_pan_id,
      };
    } catch (err) {
      logger.warn({ err }, 'Failed to get Zigbee network info');
      return null;
    }
  }

  private buildNetworkTopology(devices: ZigbeeDevice[]): ZigbeeLink[] {
    const links: ZigbeeLink[] = [];
    const coordinator = devices.find(d => d.type === 'coordinator');
    const routers = devices.filter(d => d.type === 'router');
    const endDevices = devices.filter(d => d.type === 'end_device');

    if (!coordinator) return links;

    for (const router of routers) {
      links.push({
        source: coordinator.ieeeAddress,
        target: router.ieeeAddress,
        lqi: router.lqi,
        depth: 1,
      });
    }

    for (const endDevice of endDevices) {
      const parentRouter = this.findBestParentForDevice(endDevice, routers, coordinator);
      
      links.push({
        source: parentRouter.ieeeAddress,
        target: endDevice.ieeeAddress,
        lqi: endDevice.lqi,
        depth: parentRouter === coordinator ? 1 : 2,
      });
    }

    return links;
  }

  private findBestParentForDevice(
    device: ZigbeeDevice, 
    routers: ZigbeeDevice[], 
    coordinator: ZigbeeDevice
  ): ZigbeeDevice {
    if (routers.length === 0) return coordinator;
    
    if (device.lqi >= 200) {
      return coordinator;
    }
    
    const availableRouters = routers.filter(r => r.available && r.lqi > 100);
    if (availableRouters.length === 0) return coordinator;
    
    const sortedRouters = [...availableRouters].sort((a, b) => b.lqi - a.lqi);
    return sortedRouters[0] ?? coordinator;
  }

  async buildNetworkTopologyWithNeighbors(): Promise<ZigbeeLink[]> {
    const links: ZigbeeLink[] = [];
    
    if (!this.currentState) return links;
    
    const devices = this.currentState.devices;
    const coordinator = devices.find(d => d.type === 'coordinator');
    
    if (!coordinator) return links;

    for (const device of devices) {
      if (device.type === 'coordinator') continue;
      
      try {
        const details = await this.hassClient.getZhaDeviceDetails(device.ieeeAddress);
        
        if (details.neighbors && details.neighbors.length > 0) {
          for (const neighbor of details.neighbors) {
            links.push({
              source: neighbor.ieee,
              target: device.ieeeAddress,
              lqi: neighbor.lqi,
              depth: neighbor.depth,
            });
          }
        } else {
          const parent = this.findBestParentForDevice(
            device, 
            devices.filter(d => d.type === 'router'), 
            coordinator
          );
          links.push({
            source: parent.ieeeAddress,
            target: device.ieeeAddress,
            lqi: device.lqi,
            depth: parent === coordinator ? 1 : 2,
          });
        }
      } catch {
        const parent = this.findBestParentForDevice(
          device, 
          devices.filter(d => d.type === 'router'), 
          coordinator
        );
        links.push({
          source: parent.ieeeAddress,
          target: device.ieeeAddress,
          lqi: device.lqi,
          depth: parent === coordinator ? 1 : 2,
        });
      }
    }

    return links;
  }

  analyzeFrequencyConflicts(wifiSettings: WifiSettings[]): FrequencyConflict[] {
    const conflicts: FrequencyConflict[] = [];
    
    if (!this.currentState) {
      logger.warn('No Zigbee state available for conflict analysis');
      return conflicts;
    }

    const zigbeeChannel = this.currentState.channel;

    for (const settings of wifiSettings) {
      if (settings.band !== '2.4GHz') continue;

      const overlap = getWifi2gZigbeeOverlap(settings.channel, zigbeeChannel);
      
      let severity: FrequencyConflict['conflictSeverity'];
      let recommendation: string;

      if (overlap === 0) {
        severity = 'none';
        recommendation = 'No action needed';
      } else if (overlap < 0.2) {
        severity = 'low';
        recommendation = 'Minor overlap, monitor for issues';
      } else if (overlap < 0.5) {
        severity = 'medium';
        recommendation = `Consider changing WiFi to channel 1 or 11, or Zigbee to channel ${this.suggestZigbeeChannel(settings.channel)}`;
      } else if (overlap < 0.8) {
        severity = 'high';
        recommendation = `Change WiFi to channel ${settings.channel <= 6 ? 11 : 1} or Zigbee to channel ${this.suggestZigbeeChannel(settings.channel)}`;
      } else {
        severity = 'critical';
        recommendation = `Immediate action needed: Change WiFi to channel ${settings.channel <= 6 ? 11 : 1} or Zigbee to channel ${this.suggestZigbeeChannel(settings.channel)}`;
      }

      conflicts.push({
        zigbeeChannel,
        wifiChannel: settings.channel,
        wifiBand: settings.band,
        conflictSeverity: severity,
        recommendation,
      });
    }

    return conflicts;
  }

  private suggestZigbeeChannel(wifiChannel: number): number {
    const bestChannels = findBestZigbeeChannel([wifiChannel], this.currentState?.channel ?? 15);
    return bestChannels.channel;
  }

  getDeviceHealth(): Array<{
    device: ZigbeeDevice;
    healthScore: number;
    issues: string[];
  }> {
    if (!this.currentState) return [];

    return this.currentState.devices.map(device => {
      const issues: string[] = [];
      let healthScore = 100;

      if (!device.available) {
        healthScore -= 50;
        issues.push('Device is unavailable');
      }

      if (device.lqi < 50) {
        healthScore -= 30;
        issues.push(`Low link quality (LQI: ${device.lqi})`);
      } else if (device.lqi < 100) {
        healthScore -= 15;
        issues.push(`Moderate link quality (LQI: ${device.lqi})`);
      }

      if (device.lastSeen) {
        const hoursSinceLastSeen = (Date.now() - device.lastSeen.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastSeen > 24) {
          healthScore -= 20;
          issues.push(`Not seen for ${Math.round(hoursSinceLastSeen)} hours`);
        }
      }

      if (device.powerSource === 'battery') {
        issues.push('Battery powered - check battery level');
      }

      return {
        device,
        healthScore: Math.max(0, healthScore),
        issues,
      };
    });
  }

  getNetworkStats(): {
    totalDevices: number;
    coordinators: number;
    routers: number;
    endDevices: number;
    averageLqi: number;
    unavailableDevices: number;
  } {
    if (!this.currentState) {
      return {
        totalDevices: 0,
        coordinators: 0,
        routers: 0,
        endDevices: 0,
        averageLqi: 0,
        unavailableDevices: 0,
      };
    }

    const devices = this.currentState.devices;
    const totalLqi = devices.reduce((sum, d) => sum + d.lqi, 0);

    return {
      totalDevices: devices.length,
      coordinators: devices.filter(d => d.type === 'coordinator').length,
      routers: devices.filter(d => d.type === 'router').length,
      endDevices: devices.filter(d => d.type === 'end_device').length,
      averageLqi: devices.length > 0 ? Math.round(totalLqi / devices.length) : 0,
      unavailableDevices: devices.filter(d => !d.available).length,
    };
  }

  getCurrentState(): ZigbeeNetworkState | null {
    return this.currentState;
  }
}
