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
}
