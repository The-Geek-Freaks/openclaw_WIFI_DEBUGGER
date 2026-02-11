import { spawn } from 'child_process';
import { EventEmitter } from 'eventemitter3';
import { access, constants } from 'fs/promises';
import { createChildLogger } from '../utils/logger.js';
import { withTimeout, Semaphore } from '../utils/async-helpers.js';
import type { Config } from '../config/index.js';

const logger = createChildLogger('asus-ssh');

export interface SshClientEvents {
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
}

const SSH_CONNECT_TIMEOUT = 15000;
const SSH_COMMAND_TIMEOUT = 30000;
const MAX_CONCURRENT_COMMANDS = 5;

export class AsusSshClient extends EventEmitter<SshClientEvents> {
  private connected: boolean = false;
  private readonly config: Config['asus'];
  private readonly commandSemaphore = new Semaphore(MAX_CONCURRENT_COMMANDS);

  constructor(config: Config['asus']) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const connectPromise = this.testConnection();
    return withTimeout(connectPromise, SSH_CONNECT_TIMEOUT, 'SSH connection timed out');
  }

  private async testConnection(): Promise<void> {
    try {
      const result = await this.executeRaw('echo "connected"');
      if (result.trim() === 'connected') {
        this.connected = true;
        logger.info({ host: this.config.host }, 'SSH connection established via system SSH');
        this.emit('connected');
      } else {
        throw new Error('Unexpected response from SSH test');
      }
    } catch (err) {
      this.connected = false;
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  private buildSshArgs(): string[] {
    const args: string[] = [
      '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'ConnectTimeout=10',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'LogLevel=ERROR',
      '-p', String(this.config.sshPort),
    ];

    if (this.config.sshKeyPath) {
      args.push('-i', this.config.sshKeyPath);
    }

    args.push(`${this.config.sshUser}@${this.config.host}`);

    return args;
  }

  private executeRaw(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [...this.buildSshArgs(), command];
      
      logger.debug({ host: this.config.host, command: command.substring(0, 50) }, 'Executing SSH command');

      const sshProcess = spawn('ssh', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      sshProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      sshProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      sshProcess.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(stdout);
        } else if (code === 255) {
          const errorMsg = stderr || 'SSH connection failed';
          logger.error({ code, stderr: errorMsg, host: this.config.host }, 'SSH connection error');
          this.connected = false;
          reject(new Error(`SSH connection failed: ${errorMsg}`));
        } else {
          resolve(stdout);
        }
      });

      sshProcess.on('error', (err: Error) => {
        logger.error({ err }, 'Failed to spawn SSH process');
        reject(new Error(`Failed to spawn SSH: ${err.message}`));
      });
    });
  }

  async ensureConnected(): Promise<void> {
    if (this.connected) return;
    await this.connect();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit('disconnected');
    logger.info('SSH client disconnected');
  }

  async execute(command: string): Promise<string> {
    return this.commandSemaphore.withLock(async () => {
      const executePromise = this.executeRaw(command);
      return withTimeout(executePromise, SSH_COMMAND_TIMEOUT, `Command timed out: ${command.substring(0, 50)}`);
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
