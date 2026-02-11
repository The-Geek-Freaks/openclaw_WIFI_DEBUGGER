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
    const possibleInterfaces = ['eth4', 'eth5', 'eth6', 'eth7', 'eth8', 'eth9', 'eth10', 'wl0', 'wl1', 'wl2', 'wl3'];
    const bandMap: { iface: string; band: '2g' | '5g' | '5g2' | '6g' }[] = [];
    
    for (const iface of possibleInterfaces) {
      try {
        const result = await this.executeRaw(`wl -i ${iface} status 2>/dev/null`);
        if (result && !result.includes('No such device') && !result.includes('error')) {
          const band = this.detectBandFromStatus(result);
          if (band) {
            bandMap.push({ iface, band });
            logger.debug({ iface, band }, 'Detected wireless interface band');
          }
        }
      } catch {
        // Interface not available
      }
    }
    
    // Assign interfaces by detected band
    const iface2g = bandMap.find(b => b.band === '2g');
    const iface5g = bandMap.filter(b => b.band === '5g');
    const iface6g = bandMap.find(b => b.band === '6g');
    
    if (iface2g) this.detectedInterfaces.wl0 = iface2g.iface;
    if (iface5g.length >= 1) this.detectedInterfaces.wl1 = iface5g[0]!.iface;
    if (iface5g.length >= 2) this.detectedInterfaces.wl2 = iface5g[1]!.iface;
    if (iface6g) this.detectedInterfaces.wl3 = iface6g.iface;
    
    // Fallback: if no band detected, use nvram
    if (bandMap.length === 0) {
      await this.detectInterfacesFromNvram();
    }
    
    logger.info({ bandMap, mapped: this.detectedInterfaces }, 'Auto-detected wireless interfaces by band');
  }

  private detectBandFromStatus(status: string): '2g' | '5g' | '6g' | null {
    // Parse "wl status" output for frequency/channel info
    // Example: "Chanspec: 6l (2437 MHz)" or "Chanspec: 36/80 (5180 MHz)"
    const freqMatch = status.match(/\((\d{4,5})\s*MHz\)/i);
    if (freqMatch) {
      const freq = parseInt(freqMatch[1]!, 10);
      if (freq >= 2400 && freq <= 2500) return '2g';
      if (freq >= 5150 && freq <= 5900) return '5g';
      if (freq >= 5925 && freq <= 7125) return '6g';
    }
    
    // Alternative: Check channel number
    const chanMatch = status.match(/Chanspec:\s*(\d+)/i);
    if (chanMatch) {
      const chan = parseInt(chanMatch[1]!, 10);
      if (chan >= 1 && chan <= 14) return '2g';
      if (chan >= 32 && chan <= 177) return '5g';
      if (chan >= 1 && chan <= 233 && status.includes('6GHz')) return '6g';
    }
    
    // Check for band indicator in status
    if (status.includes('2.4GHz') || status.includes('2.4 GHz')) return '2g';
    if (status.includes('5GHz') || status.includes('5 GHz')) return '5g';
    if (status.includes('6GHz') || status.includes('6 GHz')) return '6g';
    
    return null;
  }

  private async detectInterfacesFromNvram(): Promise<void> {
    try {
      // Read interface names from nvram
      const wl0 = (await this.executeRaw('nvram get wl0_ifname 2>/dev/null')).trim();
      const wl1 = (await this.executeRaw('nvram get wl1_ifname 2>/dev/null')).trim();
      const wl2 = (await this.executeRaw('nvram get wl2_ifname 2>/dev/null')).trim();
      const wl3 = (await this.executeRaw('nvram get wl3_ifname 2>/dev/null')).trim();
      
      if (wl0) this.detectedInterfaces.wl0 = wl0;
      if (wl1) this.detectedInterfaces.wl1 = wl1;
      if (wl2) this.detectedInterfaces.wl2 = wl2;
      if (wl3) this.detectedInterfaces.wl3 = wl3;
      
      logger.info({ wl0, wl1, wl2, wl3 }, 'Detected interfaces from nvram');
    } catch (err) {
      logger.warn({ err }, 'Failed to detect interfaces from nvram');
    }
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
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'ConnectTimeout=10',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'LogLevel=ERROR',
      '-p', String(this.config.sshPort),
    ];

    // BatchMode only for key-based auth (incompatible with password)
    if (!this.config.sshPassword) {
      args.unshift('-o', 'BatchMode=yes');
    }

    if (this.config.sshKeyPath) {
      args.push('-i', this.config.sshKeyPath);
    }

    args.push(`${this.config.sshUser}@${this.config.host}`);

    return args;
  }

  private executeRaw(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const sshArgs = [...this.buildSshArgs(), command];
      
      // Use sshpass wrapper if password is configured
      const usePassword = this.config.sshPassword && !this.config.sshKeyPath;
      const executable = usePassword ? 'sshpass' : 'ssh';
      const args = usePassword 
        ? ['-p', this.config.sshPassword!, 'ssh', ...sshArgs]
        : sshArgs;
      
      logger.debug({ host: this.config.host, command: command.substring(0, 50), usePassword }, 'Executing SSH command');

      const sshProcess = spawn(executable, args, {
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
    // For '5g', scan both 5GHz bands if available
    if (band === '5g') {
      const iface1 = this.getInterface('5g');
      const iface2 = this.detectedInterfaces.wl2;
      
      let cmd = `wl -i ${iface1} scan 2>/dev/null; sleep 2; wl -i ${iface1} scanresults 2>/dev/null`;
      
      if (iface2) {
        cmd += `; echo "---BAND2---"; wl -i ${iface2} scan 2>/dev/null; sleep 2; wl -i ${iface2} scanresults 2>/dev/null`;
      }
      
      logger.debug({ band, iface1, iface2 }, 'Running 5GHz site survey on all interfaces');
      return this.execute(cmd);
    }
    
    // For other bands, scan single interface
    const iface = this.getInterface(band);
    logger.debug({ band, iface }, 'Running site survey on interface');
    return this.execute(`wl -i ${iface} scan 2>/dev/null; sleep 2; wl -i ${iface} scanresults 2>/dev/null`);
  }

  async getOperationMode(): Promise<'router' | 'ap' | 'repeater' | 'media_bridge' | 'unknown'> {
    try {
      const swMode = (await this.execute('nvram get sw_mode')).trim();
      switch (swMode) {
        case '1': return 'router';
        case '3': return 'ap';
        case '2': return 'repeater';
        case '4': return 'media_bridge';
        default: return 'unknown';
      }
    } catch {
      return 'unknown';
    }
  }

  async getRouterFeatureStatus(): Promise<{
    operationMode: 'router' | 'ap' | 'repeater' | 'media_bridge' | 'unknown';
    qosEnabled: boolean;
    aiProtectionEnabled: boolean;
    trafficAnalyzerEnabled: boolean;
    adaptiveQosEnabled: boolean;
    parentalControlEnabled: boolean;
    guestNetworkEnabled: boolean;
    vpnServerEnabled: boolean;
    ddnsEnabled: boolean;
    uptEnabled: boolean;
    natEnabled: boolean;
  }> {
    const nvramVars = [
      'sw_mode',
      'qos_enable',
      'qos_type',
      'wrs_protect_enable',
      'wrs_enable',
      'TM_EULA',
      'bwdpi_db_enable',
      'PARENTAL_CTRL',
      'wl0.1_bss_enabled',
      'wl1.1_bss_enabled',
      'VPNServer_enable',
      'ddns_enable_x',
      'upnp_enable',
      'wan0_nat_x',
    ];
    
    const result: Record<string, string> = {};
    for (const v of nvramVars) {
      try {
        result[v] = (await this.execute(`nvram get ${v}`)).trim();
      } catch {
        result[v] = '';
      }
    }
    
    const swMode = result['sw_mode'];
    let operationMode: 'router' | 'ap' | 'repeater' | 'media_bridge' | 'unknown' = 'unknown';
    switch (swMode) {
      case '1': operationMode = 'router'; break;
      case '3': operationMode = 'ap'; break;
      case '2': operationMode = 'repeater'; break;
      case '4': operationMode = 'media_bridge'; break;
    }
    
    return {
      operationMode,
      qosEnabled: result['qos_enable'] === '1',
      aiProtectionEnabled: result['wrs_protect_enable'] === '1' || result['wrs_enable'] === '1',
      trafficAnalyzerEnabled: result['bwdpi_db_enable'] === '1',
      adaptiveQosEnabled: result['qos_type'] === '1',
      parentalControlEnabled: result['PARENTAL_CTRL'] === '1',
      guestNetworkEnabled: result['wl0.1_bss_enabled'] === '1' || result['wl1.1_bss_enabled'] === '1',
      vpnServerEnabled: result['VPNServer_enable'] === '1',
      ddnsEnabled: result['ddns_enable_x'] === '1',
      uptEnabled: result['upnp_enable'] === '1',
      natEnabled: result['wan0_nat_x'] === '1',
    };
  }

  async getAllClientSignals(): Promise<Map<string, number>> {
    const signals = new Map<string, number>();
    const interfaces = [
      this.getInterface('2g'),
      this.getInterface('5g'),
      this.detectedInterfaces.wl2,
      this.detectedInterfaces.wl3,
    ].filter(Boolean);
    
    for (const iface of interfaces) {
      try {
        const assoclist = await this.execute(`wl -i ${iface} assoclist 2>/dev/null`);
        const macs = assoclist.match(/([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}/g) ?? [];
        
        for (const mac of macs) {
          try {
            const rssiStr = await this.execute(`wl -i ${iface} rssi ${mac} 2>/dev/null`);
            const rssi = parseInt(rssiStr.trim(), 10);
            if (!isNaN(rssi) && rssi < 0) {
              signals.set(mac.toLowerCase(), rssi);
            }
          } catch {
            // Skip this MAC
          }
        }
      } catch {
        // Skip this interface
      }
    }
    
    return signals;
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
      'nvram get wl0_mumimo',
      'nvram get wl1_mumimo',
      'nvram get wl0_ofdma',
      'nvram get wl1_ofdma',
      'nvram get wl0_11ax',
      'nvram get wl1_11ax',
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
