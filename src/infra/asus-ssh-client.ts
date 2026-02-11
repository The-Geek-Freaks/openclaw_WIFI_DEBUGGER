import { Client, ConnectConfig } from 'ssh2';
import { EventEmitter } from 'eventemitter3';
import { createChildLogger } from '../utils/logger.js';
import type { Config } from '../config/index.js';

const logger = createChildLogger('asus-ssh');

export interface SshClientEvents {
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
}

export class AsusSshClient extends EventEmitter<SshClientEvents> {
  private client: Client | null = null;
  private connected: boolean = false;
  private readonly config: Config['asus'];

  constructor(config: Config['asus']) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.client = new Client();

      const connectConfig: ConnectConfig = {
        host: this.config.host,
        port: this.config.sshPort,
        username: this.config.sshUser,
      };

      if (this.config.sshKeyPath) {
        connectConfig.privateKey = require('fs').readFileSync(this.config.sshKeyPath);
      } else if (this.config.sshPassword) {
        connectConfig.password = this.config.sshPassword;
      }

      this.client.on('ready', () => {
        this.connected = true;
        logger.info('SSH connection established');
        this.emit('connected');
        resolve();
      });

      this.client.on('error', (err) => {
        logger.error({ err }, 'SSH connection error');
        this.emit('error', err);
        reject(err);
      });

      this.client.on('close', () => {
        this.connected = false;
        logger.info('SSH connection closed');
        this.emit('disconnected');
      });

      this.client.connect(connectConfig);
    });
  }

  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      this.client.end();
      this.connected = false;
    }
  }

  async execute(command: string): Promise<string> {
    if (!this.client || !this.connected) {
      throw new Error('SSH client not connected');
    }

    return new Promise((resolve, reject) => {
      this.client!.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('close', (code: number) => {
          if (code !== 0 && stderr) {
            reject(new Error(`Command failed with code ${code}: ${stderr}`));
          } else {
            resolve(stdout);
          }
        });

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });
  }

  async getMeshNodes(): Promise<string> {
    return this.execute('nvram get cfg_device_list');
  }

  async getClientList(): Promise<string> {
    return this.execute('nvram get custom_clientlist');
  }

  async getWirelessClients(): Promise<string> {
    return this.execute('wl -i eth6 assoclist && wl -i eth7 assoclist');
  }

  async getClientSignalStrength(macAddress: string): Promise<string> {
    return this.execute(`wl -i eth6 rssi ${macAddress} 2>/dev/null || wl -i eth7 rssi ${macAddress} 2>/dev/null`);
  }

  async getSiteSurvey(band: '2g' | '5g'): Promise<string> {
    const iface = band === '2g' ? 'eth6' : 'eth7';
    return this.execute(`wl -i ${iface} scanresults`);
  }

  async getWifiSettings(): Promise<Record<string, string>> {
    const commands = [
      'nvram get wl0_ssid',
      'nvram get wl1_ssid',
      'nvram get wl0_channel',
      'nvram get wl1_channel',
      'nvram get wl0_chanspec',
      'nvram get wl1_chanspec',
      'nvram get wl0_bw',
      'nvram get wl1_bw',
      'nvram get wl0_txpower',
      'nvram get wl1_txpower',
      'nvram get smart_connect_x',
      'nvram get wl0_bsd_steering_policy',
      'nvram get wl1_bsd_steering_policy',
    ];

    const result: Record<string, string> = {};
    
    for (const cmd of commands) {
      const key = cmd.replace('nvram get ', '');
      try {
        result[key] = (await this.execute(cmd)).trim();
      } catch {
        result[key] = '';
      }
    }

    return result;
  }

  async setNvram(key: string, value: string): Promise<void> {
    await this.execute(`nvram set ${key}="${value}"`);
    logger.info({ key, value }, 'NVRAM value set');
  }

  async commitNvram(): Promise<void> {
    await this.execute('nvram commit');
    logger.info('NVRAM committed');
  }

  async restartWireless(): Promise<void> {
    await this.execute('service restart_wireless');
    logger.info('Wireless service restarted');
  }

  async getArpTable(): Promise<string> {
    return this.execute('cat /proc/net/arp');
  }

  async getDhcpLeases(): Promise<string> {
    return this.execute('cat /var/lib/misc/dnsmasq.leases');
  }

  async getSystemInfo(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    
    result['uptime'] = await this.execute('cat /proc/uptime');
    result['cpu'] = await this.execute("top -bn1 | grep 'CPU:' | head -1");
    result['memory'] = await this.execute('free');
    result['firmware'] = await this.execute('nvram get firmver');
    result['model'] = await this.execute('nvram get productid');
    
    return result;
  }

  async getAiMeshNodeList(): Promise<string> {
    return this.execute('nvram get amas_cap_mac');
  }

  async getAiMeshClientList(): Promise<string> {
    return this.execute('cat /tmp/clientlist.json 2>/dev/null || echo "[]"');
  }

  async getWirelessLog(): Promise<string> {
    return this.execute('dmesg | grep -i wireless | tail -100');
  }

  isConnected(): boolean {
    return this.connected;
  }
}
