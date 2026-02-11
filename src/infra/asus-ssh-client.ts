import { spawn } from 'child_process';
import { EventEmitter } from 'eventemitter3';
import { createChildLogger } from '../utils/logger.js';
import { withTimeout, Semaphore } from '../utils/async-helpers.js';
import type { Config } from '../config/index.js';
import { getRouterInfo, type RouterModelInfo } from '../types/router-models.js';

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
  private routerModel: RouterModelInfo | null = null;
  private detectedInterfaces: { wl0?: string | undefined; wl1?: string | undefined; wl2?: string | undefined; wl3?: string | undefined } = {};

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
        
        await this.detectRouterModel();
      } else {
        throw new Error('Unexpected response from SSH test');
      }
    } catch (err) {
      this.connected = false;
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  private async detectRouterModel(): Promise<void> {
    try {
      const modelName = (await this.executeRaw('nvram get productid')).trim();
      this.routerModel = getRouterInfo(modelName) ?? null;
      
      if (this.routerModel) {
        this.detectedInterfaces = { ...this.routerModel.sshInterface };
        logger.info({ 
          model: modelName, 
          interfaces: this.detectedInterfaces 
        }, 'Router model detected with interface mapping');
      } else {
        await this.autoDetectInterfaces();
        logger.warn({ model: modelName }, 'Unknown router model, using auto-detected interfaces');
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to detect router model, using auto-detection');
      await this.autoDetectInterfaces();
    }
  }

  private async autoDetectInterfaces(): Promise<void> {
    const possibleInterfaces = ['eth5', 'eth6', 'eth7', 'eth8', 'eth9', 'eth10', 'wl0', 'wl1', 'wl2', 'wl3'];
    const detected: string[] = [];
    
    for (const iface of possibleInterfaces) {
      try {
        const result = await this.executeRaw(`wl -i ${iface} status 2>/dev/null | head -1`);
        if (result && !result.includes('No such device') && !result.includes('error')) {
          detected.push(iface);
        }
      } catch {
        // Interface not available
      }
    }
    
    if (detected.length >= 1) this.detectedInterfaces.wl0 = detected[0];
    if (detected.length >= 2) this.detectedInterfaces.wl1 = detected[1];
    if (detected.length >= 3) this.detectedInterfaces.wl2 = detected[2];
    if (detected.length >= 4) this.detectedInterfaces.wl3 = detected[3];
    
    logger.info({ detected, mapped: this.detectedInterfaces }, 'Auto-detected wireless interfaces');
  }

  getInterface(band: '2g' | '5g' | '5g2' | '6g'): string {
    switch (band) {
      case '2g': return this.detectedInterfaces.wl0 ?? 'eth6';
      case '5g': return this.detectedInterfaces.wl1 ?? 'eth7';
      case '5g2': return this.detectedInterfaces.wl2 ?? 'eth8';
      case '6g': return this.detectedInterfaces.wl3 ?? this.detectedInterfaces.wl2 ?? 'eth9';
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
    const iface2g = this.getInterface('2g');
    const iface5g = this.getInterface('5g');
    const iface5g2 = this.detectedInterfaces.wl2;
    const iface6g = this.detectedInterfaces.wl3;
    
    let cmd = `wl -i ${iface2g} assoclist 2>/dev/null; wl -i ${iface5g} assoclist 2>/dev/null`;
    if (iface5g2) cmd += `; wl -i ${iface5g2} assoclist 2>/dev/null`;
    if (iface6g) cmd += `; wl -i ${iface6g} assoclist 2>/dev/null`;
    
    return this.execute(cmd);
  }

  async getClientSignalStrength(macAddress: string): Promise<string> {
    const interfaces = [
      this.getInterface('2g'),
      this.getInterface('5g'),
      this.detectedInterfaces.wl2,
      this.detectedInterfaces.wl3,
    ].filter(Boolean);
    
    const cmd = interfaces
      .map(iface => `wl -i ${iface} rssi ${macAddress} 2>/dev/null`)
      .join(' || ');
    
    return this.execute(cmd);
  }

  async getSiteSurvey(band: '2g' | '5g' | '5g2' | '6g'): Promise<string> {
    const iface = this.getInterface(band);
    logger.debug({ band, iface }, 'Running site survey on interface');
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
