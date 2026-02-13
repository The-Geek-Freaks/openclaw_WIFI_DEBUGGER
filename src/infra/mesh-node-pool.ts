import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createChildLogger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { withTimeout, Semaphore } from '../utils/async-helpers.js';
import type { Config } from '../config/index.js';

const logger = createChildLogger('mesh-node-pool');

const _CONNECTION_TIMEOUT_MS = 15000;
const COMMAND_TIMEOUT_MS = 30000;
const MAX_CONCURRENT_COMMANDS = 3;
const RECONNECT_INTERVAL_MS = 60000;
const MAX_RECONNECT_ATTEMPTS = 3;

export interface MeshNodeInfo {
  id: string;
  name: string;
  macAddress: string;
  ipAddress: string;
  isMainRouter: boolean;
  firmwareVersion: string;
  model: string;
  role: 'router' | 'node';
  status: 'online' | 'offline' | 'unreachable';
  sshAvailable: boolean;
  lastSeen: Date;
  uptime: number;
  cpuUsage: number;
  memoryUsage: number;
  connectedClients: number;
}

export interface NodeConnection {
  nodeId: string;
  ipAddress: string;
  connected: boolean;
  lastCommand: Date;
  semaphore: Semaphore;
  reconnectAttempts: number;
}

export class MeshNodePool {
  private readonly config: Config;
  private readonly mainRouterIp: string;
  private mainConnected: boolean = false;
  private nodeConnections: Map<string, NodeConnection> = new Map();
  private discoveredNodes: Map<string, MeshNodeInfo> = new Map();
  private readonly sshPort: number;
  private readonly sshUser: string;
  private readonly sshKeyPath: string | undefined;
  private readonly sshPassword: string | undefined;
  private readonly mainSemaphore: Semaphore;
  private reconnectInterval: NodeJS.Timeout | null = null;

  constructor(config: Config) {
    this.config = config;
    this.mainRouterIp = config.asus.host;
    this.sshPort = config.asus.sshPort;
    this.sshUser = config.asus.sshUser;
    this.sshKeyPath = config.asus.sshKeyPath;
    this.sshPassword = config.asus.sshPassword;
    this.mainSemaphore = new Semaphore(MAX_CONCURRENT_COMMANDS);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Mesh Node Pool');
    
    await this.connectToMainRouter();
    await this.discoverAllNodes();
    await this.establishNodeConnections();
    
    logger.info({ 
      nodeCount: this.discoveredNodes.size,
      connectedCount: this.nodeConnections.size 
    }, 'Mesh Node Pool initialized');
  }

  private async connectToMainRouter(): Promise<void> {
    try {
      const result = await this.executeSshCommand(this.mainRouterIp, 'echo "connected"');
      if (result.trim() === 'connected') {
        this.mainConnected = true;
        logger.info({ host: this.mainRouterIp }, 'Connected to main router via system SSH');
      } else {
        throw new Error('Unexpected response from SSH test');
      }
    } catch (err) {
      this.mainConnected = false;
      logger.error({ err, host: this.mainRouterIp }, 'Main router connection error');
      throw err;
    }
  }

  private buildSshArgs(host: string): string[] {
    const args: string[] = [
      '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'ConnectTimeout=10',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'LogLevel=ERROR',
      '-p', String(this.sshPort),
    ];

    if (this.sshKeyPath) {
      args.push('-i', this.sshKeyPath);
    }

    args.push(`${this.sshUser}@${host}`);

    return args;
  }

  private executeSshCommand(host: string, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';
      const usePassword = this.sshPassword && !this.sshKeyPath;
      
      let executable: string;
      let args: string[];
      
      if (usePassword && isWindows) {
        // Use Python paramiko helper on Windows
        executable = 'python';
        args = [
          join(__dirname, '..', '..', 'ssh-helper.py'),
          host,
          this.sshUser,
          this.sshPassword!,
          command,
        ];
      } else if (usePassword) {
        // Use sshpass on Linux/Mac
        executable = 'sshpass';
        args = ['-p', this.sshPassword!, 'ssh', ...this.buildSshArgs(host), command];
      } else {
        // Key-based auth
        executable = 'ssh';
        args = [...this.buildSshArgs(host), command];
      }
      
      logger.debug({ host, command: command.substring(0, 50), usePassword, isWindows }, 'Executing SSH command');

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
          logger.error({ code, stderr: errorMsg, host }, 'SSH connection error');
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

  async discoverAllNodes(): Promise<MeshNodeInfo[]> {
    logger.info('Discovering all mesh nodes');
    this.discoveredNodes.clear();

    if (!this.mainConnected) {
      throw new Error('Main router not connected');
    }

    const mainNodeInfo = await this.getMainRouterInfo();
    this.discoveredNodes.set(mainNodeInfo.id, mainNodeInfo);

    const meshNodes = await this.getAiMeshNodes();
    for (const node of meshNodes) {
      this.discoveredNodes.set(node.id, node);
    }

    logger.info({ count: this.discoveredNodes.size }, 'Node discovery complete');
    return Array.from(this.discoveredNodes.values());
  }

  private async getMainRouterInfo(): Promise<MeshNodeInfo> {
    const systemInfo = await this.executeOnMain('nvram show 2>/dev/null | grep -E "^(productid|firmver|buildno|lan_ipaddr|lan_hwaddr|uptime)" | head -10');
    const cpuInfo = await this.executeOnMain('top -bn1 | head -3');
    const memInfo = await this.executeOnMain('free | grep Mem');
    // Dynamically get interface names from nvram instead of hardcoded values
    const wl0Ifname = (await this.executeOnMain('nvram get wl0_ifname 2>/dev/null')).trim() || 'eth6';
    const wl1Ifname = (await this.executeOnMain('nvram get wl1_ifname 2>/dev/null')).trim() || 'eth7';
    const clientCount = await this.executeOnMain(`wl -i ${wl0Ifname} assoclist 2>/dev/null | wc -l; wl -i ${wl1Ifname} assoclist 2>/dev/null | wc -l`);

    const lines = systemInfo.split('\n');
    const getValue = (key: string): string => {
      const line = lines.find(l => l.startsWith(`${key}=`));
      return line?.split('=')[1] ?? '';
    };

    const cpuMatch = cpuInfo.match(/(\d+)%\s*id/);
    const cpuUsage = cpuMatch ? 100 - parseInt(cpuMatch[1]!, 10) : 0;

    const memParts = memInfo.trim().split(/\s+/);
    const memTotal = parseInt(memParts[1] ?? '1', 10);
    const memUsed = parseInt(memParts[2] ?? '0', 10);
    const memoryUsage = Math.round((memUsed / memTotal) * 100);

    const clientLines = clientCount.trim().split('\n');
    const connectedClients = clientLines.reduce((sum, l) => sum + parseInt(l.trim() || '0', 10), 0);

    return {
      id: 'main',
      name: getValue('productid') || 'Main Router',
      macAddress: getValue('lan_hwaddr'),
      ipAddress: this.mainRouterIp,
      isMainRouter: true,
      firmwareVersion: `${getValue('firmver')}.${getValue('buildno')}`,
      model: getValue('productid'),
      role: 'router',
      status: 'online',
      sshAvailable: true,
      lastSeen: new Date(),
      uptime: this.parseUptime(getValue('uptime')),
      cpuUsage,
      memoryUsage,
      connectedClients,
    };
  }

  private async getAiMeshNodes(): Promise<MeshNodeInfo[]> {
    const nodes: MeshNodeInfo[] = [];

    try {
      const cfgClientList = await this.executeOnMain('nvram get cfg_clientlist');
      const _cfgAlias = await this.executeOnMain('nvram get cfg_alias');
      
      const macList = cfgClientList.split('<').filter(Boolean).map(entry => {
        const parts = entry.split('>');
        return {
          mac: parts[0]?.toLowerCase() ?? '',
          ip: parts[1] ?? '',
          model: parts[2] ?? '',
          alias: parts[3] ?? '',
        };
      });

      const arpOutput = await this.executeOnMain('cat /proc/net/arp');
      const arpEntries = new Map<string, string>();
      
      for (const line of arpOutput.split('\n').slice(1)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const ip = parts[0]!;
          const mac = parts[3]!.toLowerCase();
          arpEntries.set(mac, ip);
        }
      }

      for (const meshEntry of macList) {
        if (!meshEntry.mac || meshEntry.mac === this.discoveredNodes.get('main')?.macAddress.toLowerCase()) {
          continue;
        }

        const ip = meshEntry.ip || arpEntries.get(meshEntry.mac) || '';
        
        if (!ip) {
          logger.warn({ mac: meshEntry.mac }, 'Could not find IP for mesh node');
          continue;
        }

        const nodeInfo: MeshNodeInfo = {
          id: `node_${meshEntry.mac.replace(/:/g, '')}`,
          name: meshEntry.alias || meshEntry.model || `AiMesh Node ${meshEntry.mac}`,
          macAddress: meshEntry.mac,
          ipAddress: ip,
          isMainRouter: false,
          firmwareVersion: '',
          model: meshEntry.model,
          role: 'node',
          status: 'online',
          sshAvailable: false,
          lastSeen: new Date(),
          uptime: 0,
          cpuUsage: 0,
          memoryUsage: 0,
          connectedClients: 0,
        };

        const isReachable = await this.checkNodeReachability(ip);
        if (isReachable) {
          nodeInfo.status = 'online';
          nodeInfo.sshAvailable = await this.checkSshAvailability(ip);
        } else {
          nodeInfo.status = 'unreachable';
        }

        nodes.push(nodeInfo);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to discover AiMesh nodes');
    }

    return nodes;
  }

  private async checkNodeReachability(ip: string): Promise<boolean> {
    try {
      const result = await this.executeOnMain(`ping -c 1 -W 2 ${ip} > /dev/null 2>&1 && echo "ok" || echo "fail"`);
      return result.trim() === 'ok';
    } catch {
      return false;
    }
  }

  private async checkSshAvailability(ip: string): Promise<boolean> {
    try {
      const result = await this.executeOnMain(`nc -z -w 2 ${ip} ${this.sshPort} && echo "ok" || echo "fail"`);
      return result.trim() === 'ok';
    } catch {
      return false;
    }
  }

  async establishNodeConnections(): Promise<void> {
    logger.info('Establishing SSH connections to mesh nodes');

    for (const node of this.discoveredNodes.values()) {
      if (node.isMainRouter) continue;
      if (!node.sshAvailable) {
        logger.warn({ nodeId: node.id, ip: node.ipAddress }, 'SSH not available on node');
        continue;
      }

      try {
        await this.connectToNode(node);
      } catch (err) {
        logger.error({ err, nodeId: node.id }, 'Failed to connect to node');
      }
    }

    logger.info({ connectedCount: this.nodeConnections.size }, 'Node connections established');
  }

  private async connectToNode(node: MeshNodeInfo): Promise<void> {
    try {
      const result = await this.executeSshCommand(node.ipAddress, 'echo "connected"');
      if (result.trim() === 'connected') {
        logger.info({ nodeId: node.id, ip: node.ipAddress }, 'Connected to mesh node via system SSH');
        
        this.nodeConnections.set(node.id, {
          nodeId: node.id,
          ipAddress: node.ipAddress,
          connected: true,
          lastCommand: new Date(),
          semaphore: new Semaphore(MAX_CONCURRENT_COMMANDS),
          reconnectAttempts: 0,
        });

        await this.updateNodeInfoFromConnection(node.id);
      } else {
        throw new Error('Unexpected response from SSH test');
      }
    } catch (err) {
      logger.warn({ err, nodeId: node.id }, 'Node connection error');
      throw err;
    }
  }

  private async updateNodeInfoFromConnection(nodeId: string): Promise<void> {
    const node = this.discoveredNodes.get(nodeId);
    if (!node) return;

    try {
      const systemInfo = await this.executeOnNode(nodeId, 'nvram show 2>/dev/null | grep -E "^(productid|firmver|buildno)" | head -5');
      const cpuInfo = await this.executeOnNode(nodeId, 'top -bn1 | head -3');
      const memInfo = await this.executeOnNode(nodeId, 'free | grep Mem');
      const clientCount = await this.executeOnNode(nodeId, 'wl -i eth6 assoclist 2>/dev/null | wc -l; wl -i eth7 assoclist 2>/dev/null | wc -l');
      const uptimeOutput = await this.executeOnNode(nodeId, 'cat /proc/uptime');

      const lines = systemInfo.split('\n');
      const getValue = (key: string): string => {
        const line = lines.find(l => l.startsWith(`${key}=`));
        return line?.split('=')[1] ?? '';
      };

      node.firmwareVersion = `${getValue('firmver')}.${getValue('buildno')}`;
      node.model = getValue('productid') || node.model;

      const cpuMatch = cpuInfo.match(/(\d+)%\s*id/);
      node.cpuUsage = cpuMatch ? 100 - parseInt(cpuMatch[1]!, 10) : 0;

      const memParts = memInfo.trim().split(/\s+/);
      const memTotal = parseInt(memParts[1] ?? '1', 10);
      const memUsed = parseInt(memParts[2] ?? '0', 10);
      node.memoryUsage = Math.round((memUsed / memTotal) * 100);

      const clientLines = clientCount.trim().split('\n');
      node.connectedClients = clientLines.reduce((sum, l) => sum + parseInt(l.trim() || '0', 10), 0);

      node.uptime = parseFloat(uptimeOutput.split(' ')[0] ?? '0');
      node.lastSeen = new Date();

      logger.info({ nodeId, model: node.model, firmware: node.firmwareVersion }, 'Node info updated');
    } catch (err) {
      logger.warn({ err, nodeId }, 'Failed to update node info');
    }
  }

  private async executeOnMain(command: string): Promise<string> {
    if (!this.mainConnected) {
      throw new Error('Main router not connected');
    }

    return this.mainSemaphore.withLock(async () => {
      const exec = this.executeSshCommand(this.mainRouterIp, command);
      return withTimeout(exec, COMMAND_TIMEOUT_MS, `Main router command: ${command.slice(0, 50)}`);
    });
  }

  async executeOnNode(nodeId: string, command: string): Promise<string> {
    if (nodeId === 'main') {
      return this.executeOnMain(command);
    }

    const connection = this.nodeConnections.get(nodeId);
    if (!connection?.connected) {
      throw new Error(`Node ${nodeId} not connected`);
    }

    return connection.semaphore.withLock(async () => {
      const exec = this.executeSshCommand(connection.ipAddress, command);
      const result = await withTimeout(exec, COMMAND_TIMEOUT_MS, `Node ${nodeId} command`);
      connection.lastCommand = new Date();
      return result;
    });
  }

  async executeOnAllNodes(command: string): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    for (const nodeId of this.discoveredNodes.keys()) {
      try {
        const result = await this.executeOnNode(nodeId, command);
        results.set(nodeId, result);
      } catch (err) {
        logger.warn({ err, nodeId }, 'Failed to execute on node');
        results.set(nodeId, `ERROR: ${err}`);
      }
    }

    return results;
  }

  async getWifiSettingsFromAllNodes(): Promise<Map<string, {
    channel2g: number;
    channel5g: number;
    txpower2g: number;
    txpower5g: number;
    bandwidth2g: number;
    bandwidth5g: number;
  }>> {
    const settings = new Map();

    for (const nodeId of this.discoveredNodes.keys()) {
      try {
        const output = await this.executeOnNode(nodeId, `
          echo "channel2g=$(nvram get wl0_channel)"
          echo "channel5g=$(nvram get wl1_channel)"
          echo "txpower2g=$(nvram get wl0_txpower)"
          echo "txpower5g=$(nvram get wl1_txpower)"
          echo "bw2g=$(nvram get wl0_bw)"
          echo "bw5g=$(nvram get wl1_bw)"
        `);

        const lines = output.split('\n');
        const getValue = (key: string): number => {
          const line = lines.find(l => l.startsWith(`${key}=`));
          return parseInt(line?.split('=')[1] ?? '0', 10);
        };

        settings.set(nodeId, {
          channel2g: getValue('channel2g'),
          channel5g: getValue('channel5g'),
          txpower2g: getValue('txpower2g'),
          txpower5g: getValue('txpower5g'),
          bandwidth2g: getValue('bw2g'),
          bandwidth5g: getValue('bw5g'),
        });
      } catch (err) {
        logger.warn({ err, nodeId }, 'Failed to get WiFi settings');
      }
    }

    return settings;
  }

  async setWifiChannelOnAllNodes(band: '2g' | '5g', channel: number): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const nvramKey = band === '2g' ? 'wl0_channel' : 'wl1_channel';

    for (const nodeId of this.discoveredNodes.keys()) {
      try {
        await this.executeOnNode(nodeId, `nvram set ${nvramKey}=${channel}`);
        await this.executeOnNode(nodeId, 'nvram commit');
        results.set(nodeId, true);
        logger.info({ nodeId, band, channel }, 'Channel set on node');
      } catch (err) {
        logger.error({ err, nodeId }, 'Failed to set channel');
        results.set(nodeId, false);
      }
    }

    return results;
  }

  async syncSettingsAcrossNodes(settings: {
    channel2g?: number;
    channel5g?: number;
    txpower2g?: number;
    txpower5g?: number;
  }): Promise<Map<string, { success: boolean; error?: string }>> {
    const results = new Map<string, { success: boolean; error?: string }>();

    const commands: string[] = [];
    if (settings.channel2g !== undefined) {
      commands.push(`nvram set wl0_channel=${settings.channel2g}`);
    }
    if (settings.channel5g !== undefined) {
      commands.push(`nvram set wl1_channel=${settings.channel5g}`);
    }
    if (settings.txpower2g !== undefined) {
      commands.push(`nvram set wl0_txpower=${settings.txpower2g}`);
    }
    if (settings.txpower5g !== undefined) {
      commands.push(`nvram set wl1_txpower=${settings.txpower5g}`);
    }

    if (commands.length === 0) {
      return results;
    }

    commands.push('nvram commit');
    const fullCommand = commands.join(' && ');

    for (const nodeId of this.discoveredNodes.keys()) {
      try {
        await this.executeOnNode(nodeId, fullCommand);
        results.set(nodeId, { success: true });
        logger.info({ nodeId }, 'Settings synced to node');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.set(nodeId, { success: false, error: errorMsg });
        logger.error({ err, nodeId }, 'Failed to sync settings');
      }
    }

    return results;
  }

  async restartWirelessOnAllNodes(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const nodeId of this.discoveredNodes.keys()) {
      try {
        await this.executeOnNode(nodeId, 'service restart_wireless');
        results.set(nodeId, true);
        logger.info({ nodeId }, 'Wireless restarted on node');
      } catch (err) {
        logger.error({ err, nodeId }, 'Failed to restart wireless');
        results.set(nodeId, false);
      }
    }

    return results;
  }

  getDiscoveredNodes(): MeshNodeInfo[] {
    return Array.from(this.discoveredNodes.values());
  }

  getConnectedNodes(): MeshNodeInfo[] {
    return Array.from(this.discoveredNodes.values()).filter(node => {
      if (node.isMainRouter) return true;
      const conn = this.nodeConnections.get(node.id);
      return conn?.connected ?? false;
    });
  }

  getNodeById(nodeId: string): MeshNodeInfo | undefined {
    return this.discoveredNodes.get(nodeId);
  }

  isNodeConnected(nodeId: string): boolean {
    if (nodeId === 'main') return this.mainConnected;
    return this.nodeConnections.get(nodeId)?.connected ?? false;
  }

  private parseUptime(uptimeStr: string): number {
    const match = uptimeStr.match(/(\d+)/);
    return match ? parseInt(match[1]!, 10) : 0;
  }

  async refreshNodeStatus(): Promise<void> {
    for (const node of this.discoveredNodes.values()) {
      if (node.isMainRouter) continue;

      const isReachable = await this.checkNodeReachability(node.ipAddress);
      node.status = isReachable ? 'online' : 'unreachable';
      node.lastSeen = isReachable ? new Date() : node.lastSeen;

      const conn = this.nodeConnections.get(node.id);
      if (conn && !conn.connected && isReachable && node.sshAvailable) {
        try {
          await this.connectToNode(node);
        } catch {
          logger.warn({ nodeId: node.id }, 'Failed to reconnect to node');
        }
      }
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Mesh Node Pool');

    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    for (const conn of this.nodeConnections.values()) {
      conn.connected = false;
    }

    this.mainConnected = false;
    this.nodeConnections.clear();
    this.discoveredNodes.clear();
    logger.info('Mesh Node Pool shutdown complete');
  }

  startAutoReconnect(): void {
    if (this.reconnectInterval) return;

    this.reconnectInterval = setInterval(async () => {
      for (const [nodeId, conn] of this.nodeConnections) {
        if (!conn.connected && conn.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const node = this.discoveredNodes.get(nodeId);
          if (node && node.sshAvailable) {
            try {
              logger.info({ nodeId }, 'Attempting reconnection');
              await this.connectToNode(node);
              conn.reconnectAttempts = 0;
            } catch {
              conn.reconnectAttempts++;
              logger.warn({ nodeId, attempts: conn.reconnectAttempts }, 'Reconnection failed');
            }
          }
        }
      }
    }, RECONNECT_INTERVAL_MS);
  }

  getPoolStats(): {
    totalNodes: number;
    connectedNodes: number;
    mainConnected: boolean;
    pendingReconnects: number;
  } {
    const pendingReconnects = Array.from(this.nodeConnections.values())
      .filter(c => !c.connected && c.reconnectAttempts < MAX_RECONNECT_ATTEMPTS).length;

    return {
      totalNodes: this.discoveredNodes.size,
      connectedNodes: this.getConnectedNodes().length,
      mainConnected: this.mainConnected,
      pendingReconnects,
    };
  }
}
