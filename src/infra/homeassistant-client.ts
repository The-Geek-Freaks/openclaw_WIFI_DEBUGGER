import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import { EventEmitter } from 'eventemitter3';
import { createChildLogger } from '../utils/logger.js';
import { withTimeout } from '../utils/async-helpers.js';
import type { HassConfig, HassEntityState, HassEvent, ZhaDevice, Zigbee2MqttDevice } from '../types/homeassistant.js';

const logger = createChildLogger('hass-client');

export interface HassClientEvents {
  connected: () => void;
  disconnected: () => void;
  stateChanged: (entityId: string, newState: HassEntityState) => void;
  event: (event: HassEvent) => void;
  error: (error: Error) => void;
}

const WS_TIMEOUT = 30000;
const RECONNECT_DELAY = 5000;
const MAX_RECONNECT_ATTEMPTS = 3;

export class HomeAssistantClient extends EventEmitter<HassClientEvents> {
  private readonly config: HassConfig;
  private readonly http: AxiosInstance;
  private ws: WebSocket | null = null;
  private wsMessageId: number = 1;
  private wsCallbacks: Map<number, { resolve: (data: unknown) => void; reject: (err: Error) => void; timeout: NodeJS.Timeout }> = new Map();
  private reconnectAttempts: number = 0;
  private isConnecting: boolean = false;

  constructor(config: HassConfig) {
    super();
    this.config = config;

    const protocol = config.useSsl ? 'https' : 'http';
    this.http = axios.create({
      baseURL: `${protocol}://${config.host}:${config.port}/api`,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  async connect(): Promise<void> {
    const protocol = this.config.useSsl ? 'wss' : 'ws';
    const url = `${protocol}://${this.config.host}:${this.config.port}/api/websocket`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        logger.info('WebSocket connection opened');
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        const message = JSON.parse(data.toString());
        this.handleWsMessage(message, resolve, reject);
      });

      this.ws.on('error', (err: Error) => {
        logger.error({ err }, 'WebSocket error');
        this.emit('error', err);
        reject(err);
      });

      this.ws.on('close', () => {
        logger.info('WebSocket connection closed');
        this.emit('disconnected');
      });
    });
  }

  private handleWsMessage(
    message: { type: string; id?: number; success?: boolean; result?: unknown; event?: unknown },
    connectResolve: () => void,
    connectReject: (err: Error) => void
  ): void {
    switch (message.type) {
      case 'auth_required':
        this.ws?.send(JSON.stringify({
          type: 'auth',
          access_token: this.config.accessToken,
        }));
        break;

      case 'auth_ok':
        logger.info('Authenticated with Home Assistant');
        this.emit('connected');
        connectResolve();
        break;

      case 'auth_invalid': {
        const err = new Error('Invalid Home Assistant authentication');
        this.emit('error', err);
        connectReject(err);
        break;
      }

      case 'result':
        if (message.id !== undefined) {
          const callback = this.wsCallbacks.get(message.id);
          if (callback) {
            clearTimeout(callback.timeout);
            this.wsCallbacks.delete(message.id);
            if (message.success) {
              callback.resolve(message.result);
            } else {
              callback.reject(new Error('Request failed'));
            }
          }
        }
        break;

      case 'event':
        this.emit('event', message.event as HassEvent);
        break;
    }
  }

  private async sendWsCommand<T>(type: string, data: Record<string, unknown> = {}): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const id = this.wsMessageId++;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const callback = this.wsCallbacks.get(id);
        if (callback) {
          this.wsCallbacks.delete(id);
          reject(new Error(`WebSocket request timeout for ${type}`));
        }
      }, WS_TIMEOUT);

      this.wsCallbacks.set(id, { 
        resolve: resolve as (data: unknown) => void, 
        reject,
        timeout,
      });
      
      this.ws!.send(JSON.stringify({ id, type, ...data }));
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async getStates(): Promise<HassEntityState[]> {
    const response = await this.http.get<HassEntityState[]>('/states');
    return response.data;
  }

  async getState(entityId: string): Promise<HassEntityState> {
    const response = await this.http.get<HassEntityState>(`/states/${entityId}`);
    return response.data;
  }

  async callService(domain: string, service: string, data?: Record<string, unknown>): Promise<void> {
    await this.http.post(`/services/${domain}/${service}`, data ?? {});
    logger.info({ domain, service }, 'Service called');
  }

  async subscribeToEvents(eventType?: string): Promise<void> {
    await this.sendWsCommand('subscribe_events', eventType ? { event_type: eventType } : {});
    logger.info({ eventType }, 'Subscribed to events');
  }

  async getZhaDevices(): Promise<ZhaDevice[]> {
    try {
      const result = await this.sendWsCommand<ZhaDevice[]>('zha/devices');
      return result;
    } catch (err) {
      logger.warn({ err }, 'Failed to get ZHA devices - ZHA might not be configured');
      return [];
    }
  }

  async getZhaNetworkInfo(): Promise<{
    channel: number;
    pan_id: number;
    extended_pan_id: string;
  } | null> {
    try {
      const result = await this.sendWsCommand<{
        channel: number;
        pan_id: number;
        extended_pan_id: string;
      }>('zha/network');
      return result;
    } catch (err) {
      logger.warn({ err }, 'Failed to get ZHA network info');
      return null;
    }
  }

  async getZigbee2MqttDevices(): Promise<Zigbee2MqttDevice[]> {
    try {
      const states = await this.getStates();
      const bridgeState = states.find(s => s.entity_id === 'sensor.zigbee2mqtt_bridge_state');
      
      if (!bridgeState) {
        logger.warn('Zigbee2MQTT bridge not found');
        return [];
      }

      const response = await this.http.get('/states');
      const z2mEntities = response.data.filter((s: HassEntityState) => 
        s.entity_id.startsWith('sensor.') && 
        s.attributes['device_class'] === 'zigbee2mqtt'
      );

      return z2mEntities.map((e: HassEntityState) => e.attributes as unknown as Zigbee2MqttDevice);
    } catch (err) {
      logger.warn({ err }, 'Failed to get Zigbee2MQTT devices');
      return [];
    }
  }

  async getZigbeeNetworkMap(): Promise<{
    nodes: Array<{ ieee: string; friendly_name: string; type: string }>;
    links: Array<{ source: string; target: string; lqi: number }>;
  }> {
    const devices = await this.getZhaDevices();
    
    return {
      nodes: devices.map(d => ({
        ieee: d.ieee,
        friendly_name: d.name,
        type: d.device_type,
      })),
      links: [],
    };
  }

  async setZhaChannel(channel: number): Promise<void> {
    if (channel < 11 || channel > 26) {
      throw new Error(`Invalid Zigbee channel: ${channel}. Must be 11-26.`);
    }
    
    logger.warn({ channel }, 'ZHA channel change requested - this requires coordinator restart');
  }

  async getConfig(): Promise<Record<string, unknown>> {
    const response = await this.http.get('/config');
    return response.data;
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.http.get('/');
      return true;
    } catch {
      return false;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async getNetworkEntities(): Promise<{
    snmp: HassEntityState[];
    speedtest: HassEntityState[];
    ping: HassEntityState[];
    uptime: HassEntityState[];
    bandwidth: HassEntityState[];
  }> {
    try {
      const states = await this.getStates();
      
      return {
        snmp: states.filter(s => 
          s.entity_id.includes('snmp') || 
          s.attributes['integration'] === 'snmp'
        ),
        speedtest: states.filter(s => 
          s.entity_id.includes('speedtest') ||
          s.entity_id.includes('speed_test')
        ),
        ping: states.filter(s => 
          s.entity_id.includes('ping') ||
          (s.attributes['device_class'] === 'connectivity')
        ),
        uptime: states.filter(s => 
          s.entity_id.includes('uptime') ||
          s.attributes['device_class'] === 'duration'
        ),
        bandwidth: states.filter(s => 
          s.entity_id.includes('bandwidth') ||
          s.entity_id.includes('download') ||
          s.entity_id.includes('upload') ||
          s.entity_id.includes('bytes')
        ),
      };
    } catch (err) {
      logger.warn({ err }, 'Failed to get network entities from Home Assistant');
      return { snmp: [], speedtest: [], ping: [], uptime: [], bandwidth: [] };
    }
  }

  async getBluetoothDevices(): Promise<Array<{
    address: string;
    name: string;
    rssi: number;
    source: string;
    lastSeen: string;
  }>> {
    try {
      const states = await this.getStates();
      const btDevices: Array<{
        address: string;
        name: string;
        rssi: number;
        source: string;
        lastSeen: string;
      }> = [];

      for (const state of states) {
        if (state.entity_id.startsWith('sensor.') && 
            state.attributes['source_type'] === 'bluetooth') {
          btDevices.push({
            address: String(state.attributes['address'] ?? state.entity_id),
            name: String(state.attributes['friendly_name'] ?? state.entity_id),
            rssi: Number(state.attributes['rssi'] ?? -100),
            source: String(state.attributes['source'] ?? 'unknown'),
            lastSeen: state.last_updated,
          });
        }

        if (state.entity_id.includes('ble_') || state.entity_id.includes('bluetooth')) {
          const rssi = state.attributes['rssi'] ?? state.attributes['signal_strength'];
          if (rssi !== undefined) {
            btDevices.push({
              address: String(state.attributes['mac'] ?? state.attributes['address'] ?? state.entity_id),
              name: String(state.attributes['friendly_name'] ?? state.entity_id),
              rssi: Number(rssi),
              source: 'bluetooth_integration',
              lastSeen: state.last_updated,
            });
          }
        }
      }

      return btDevices;
    } catch (err) {
      logger.warn({ err }, 'Failed to get Bluetooth devices from Home Assistant');
      return [];
    }
  }

  async getRouterEntities(): Promise<Array<{
    entityId: string;
    name: string;
    state: string;
    deviceClass: string | null;
    attributes: Record<string, unknown>;
  }>> {
    try {
      const states = await this.getStates();
      const routerKeywords = ['router', 'asus', 'mesh', 'wifi', 'wlan', 'network', 'fritzbox', 'unifi'];
      
      return states
        .filter(s => routerKeywords.some(kw => s.entity_id.toLowerCase().includes(kw)))
        .map(s => ({
          entityId: s.entity_id,
          name: String(s.attributes['friendly_name'] ?? s.entity_id),
          state: s.state,
          deviceClass: String(s.attributes['device_class'] ?? null),
          attributes: s.attributes,
        }));
    } catch (err) {
      logger.warn({ err }, 'Failed to get router entities from Home Assistant');
      return [];
    }
  }

  async getDeviceTrackers(): Promise<Array<{
    entityId: string;
    name: string;
    state: string;
    sourceType: string;
    ip: string | null;
    mac: string | null;
    hostname: string | null;
    isConnected: boolean;
  }>> {
    try {
      const states = await this.getStates();
      
      return states
        .filter(s => s.entity_id.startsWith('device_tracker.'))
        .map(s => ({
          entityId: s.entity_id,
          name: String(s.attributes['friendly_name'] ?? s.entity_id),
          state: s.state,
          sourceType: String(s.attributes['source_type'] ?? 'unknown'),
          ip: s.attributes['ip'] ? String(s.attributes['ip']) : null,
          mac: s.attributes['mac'] ? String(s.attributes['mac']) : null,
          hostname: s.attributes['hostname'] ? String(s.attributes['hostname']) : null,
          isConnected: s.state === 'home',
        }));
    } catch (err) {
      logger.warn({ err }, 'Failed to get device trackers from Home Assistant');
      return [];
    }
  }

  async getZhaDeviceDetails(ieee: string): Promise<{
    device: ZhaDevice | null;
    neighbors: Array<{ ieee: string; lqi: number; depth: number }>;
    routes: Array<{ destination: string; nextHop: string; status: string }>;
  }> {
    try {
      const devices = await this.getZhaDevices();
      const device = devices.find(d => d.ieee === ieee) ?? null;
      
      let neighbors: Array<{ ieee: string; lqi: number; depth: number }> = [];
      let routes: Array<{ destination: string; nextHop: string; status: string }> = [];
      
      try {
        const neighborsResult = await this.sendWsCommand<Array<{ ieee: string; lqi: number; depth: number }>>(
          'zha/devices/neighbors', 
          { ieee }
        );
        neighbors = neighborsResult ?? [];
      } catch {
        logger.debug({ ieee }, 'No neighbor data available for device');
      }

      try {
        const routesResult = await this.sendWsCommand<Array<{ destination: string; nextHop: string; status: string }>>(
          'zha/devices/routes',
          { ieee }
        );
        routes = routesResult ?? [];
      } catch {
        logger.debug({ ieee }, 'No routing data available for device');
      }

      return { device, neighbors, routes };
    } catch (err) {
      logger.warn({ err, ieee }, 'Failed to get ZHA device details');
      return { device: null, neighbors: [], routes: [] };
    }
  }

  async getZigbeeTopology(): Promise<{
    coordinator: { ieee: string; channel: number } | null;
    routers: Array<{ ieee: string; name: string; lqi: number; children: number }>;
    endDevices: Array<{ ieee: string; name: string; parent: string; lqi: number }>;
    links: Array<{ source: string; target: string; lqi: number; rssi: number }>;
  }> {
    try {
      const networkInfo = await this.getZhaNetworkInfo();
      const devices = await this.getZhaDevices();
      
      const coordinator = networkInfo ? {
        ieee: devices.find(d => d.device_type === 'Coordinator')?.ieee ?? 'unknown',
        channel: networkInfo.channel,
      } : null;

      const routers = devices
        .filter(d => d.device_type === 'Router')
        .map(d => ({
          ieee: d.ieee,
          name: d.name,
          lqi: d.lqi ?? 0,
          children: 0,
        }));

      const endDevices = devices
        .filter(d => d.device_type === 'EndDevice')
        .map(d => ({
          ieee: d.ieee,
          name: d.name,
          parent: 'unknown',
          lqi: d.lqi ?? 0,
        }));

      const links: Array<{ source: string; target: string; lqi: number; rssi: number }> = [];
      
      for (const device of devices) {
        if (device.lqi && device.lqi > 0) {
          links.push({
            source: coordinator?.ieee ?? 'coordinator',
            target: device.ieee,
            lqi: device.lqi,
            rssi: device.rssi ?? -100,
          });
        }
      }

      return { coordinator, routers, endDevices, links };
    } catch (err) {
      logger.warn({ err }, 'Failed to get Zigbee topology');
      return { coordinator: null, routers: [], endDevices: [], links: [] };
    }
  }

  async getAllNetworkData(): Promise<{
    zigbee: {
      available: boolean;
      channel: number | null;
      deviceCount: number;
      topology: {
        coordinator: { ieee: string; channel: number } | null;
        routers: Array<{ ieee: string; name: string; lqi: number; children: number }>;
        endDevices: Array<{ ieee: string; name: string; parent: string; lqi: number }>;
        links: Array<{ source: string; target: string; lqi: number; rssi: number }>;
      };
    };
    bluetooth: {
      available: boolean;
      devices: Array<{ address: string; name: string; rssi: number; source: string; lastSeen: string }>;
    };
    networkEntities: {
      snmp: HassEntityState[];
      speedtest: HassEntityState[];
      ping: HassEntityState[];
      uptime: HassEntityState[];
      bandwidth: HassEntityState[];
    };
    deviceTrackers: Array<{
      entityId: string;
      name: string;
      state: string;
      sourceType: string;
      ip: string | null;
      mac: string | null;
      hostname: string | null;
      isConnected: boolean;
    }>;
    routerEntities: Array<{
      entityId: string;
      name: string;
      state: string;
      deviceClass: string | null;
      attributes: Record<string, unknown>;
    }>;
  }> {
    logger.info('Collecting all network data from Home Assistant');

    const [
      zigbeeTopology,
      networkInfo,
      bluetoothDevices,
      networkEntities,
      deviceTrackers,
      routerEntities,
    ] = await Promise.all([
      this.getZigbeeTopology(),
      this.getZhaNetworkInfo(),
      this.getBluetoothDevices(),
      this.getNetworkEntities(),
      this.getDeviceTrackers(),
      this.getRouterEntities(),
    ]);

    const zhaDevices = await this.getZhaDevices();

    return {
      zigbee: {
        available: zigbeeTopology.coordinator !== null || zhaDevices.length > 0,
        channel: networkInfo?.channel ?? null,
        deviceCount: zhaDevices.length,
        topology: zigbeeTopology,
      },
      bluetooth: {
        available: bluetoothDevices.length > 0,
        devices: bluetoothDevices,
      },
      networkEntities,
      deviceTrackers,
      routerEntities,
    };
  }
}
