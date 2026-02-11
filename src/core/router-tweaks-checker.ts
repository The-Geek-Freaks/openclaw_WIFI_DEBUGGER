import { createChildLogger } from '../utils/logger.js';
import type { AsusSshClient } from '../infra/asus-ssh-client.js';

const logger = createChildLogger('router-tweaks-checker');

export type TweakCategory = 
  | 'performance'
  | 'wifi_optimization'
  | 'security'
  | 'stability'
  | 'mesh_optimization'
  | 'merlin_scripts';

export type TweakRisk = 'low' | 'medium' | 'high';
export type TweakStatus = 'optimal' | 'suboptimal' | 'not_configured' | 'not_available' | 'unknown';

export interface TweakDefinition {
  id: string;
  name: string;
  description: string;
  category: TweakCategory;
  risk: TweakRisk;
  nvramKeys?: string[];
  checkCommand?: string;
  optimalValues?: Record<string, string | number | boolean>;
  recommendation: string;
  applyCommand?: string;
  requiresReboot: boolean;
  meshCompatible: boolean;
  minFirmwareVersion?: string;
  source: string;
}

export interface TweakCheckResult {
  tweak: TweakDefinition;
  status: TweakStatus;
  currentValues: Record<string, string | number | boolean>;
  optimalValues: Record<string, string | number | boolean>;
  recommendation: string;
  canAutoApply: boolean;
  impactDescription: string;
}

export interface TweaksReport {
  timestamp: Date;
  firmwareVersion: string;
  isMerlin: boolean;
  isAiMesh: boolean;
  nodeCount: number;
  overallScore: number;
  categories: Record<TweakCategory, {
    score: number;
    tweaksChecked: number;
    tweaksOptimal: number;
  }>;
  results: TweakCheckResult[];
  topRecommendations: TweakCheckResult[];
  installedScripts: string[];
  recommendedScripts: Array<{
    name: string;
    description: string;
    installCommand: string;
    benefit: string;
  }>;
}

const TWEAK_DEFINITIONS: TweakDefinition[] = [
  {
    id: 'disable_legacy_80211b',
    name: 'Disable 802.11b Legacy Mode',
    description: 'Disables slow 802.11b rates that reduce overall WiFi performance',
    category: 'wifi_optimization',
    risk: 'low',
    nvramKeys: ['wl0_nmode_x', 'wl1_nmode_x'],
    optimalValues: { wl0_nmode_x: '0', wl1_nmode_x: '0' },
    recommendation: 'Disable 802.11b to improve airtime efficiency. Only very old devices (pre-2003) need 802.11b.',
    requiresReboot: false,
    meshCompatible: true,
    source: 'SNBForums, Reddit r/Asus_Merlin',
  },
  {
    id: 'roaming_assistant',
    name: 'Roaming Assistant',
    description: 'Helps devices roam to better APs by disconnecting weak clients',
    category: 'mesh_optimization',
    risk: 'low',
    nvramKeys: ['wl0_user_rssi', 'wl1_user_rssi'],
    optimalValues: { wl0_user_rssi: '-70', wl1_user_rssi: '-70' },
    recommendation: 'Enable Roaming Assistant with -70dBm threshold for better mesh roaming. Adjust to -75dBm if devices disconnect too often.',
    requiresReboot: false,
    meshCompatible: true,
    source: 'ASUS Official, SNBForums',
  },
  {
    id: 'band_steering',
    name: 'Smart Connect / Band Steering',
    description: 'Automatically steers dual-band devices to the optimal band',
    category: 'wifi_optimization',
    risk: 'low',
    nvramKeys: ['smart_connect_x', 'wl0_bsd_steering_policy', 'wl1_bsd_steering_policy'],
    optimalValues: { smart_connect_x: '0' },
    recommendation: 'Disable Smart Connect for manual band control OR enable with proper steering policies. Separate SSIDs often work better.',
    requiresReboot: false,
    meshCompatible: true,
    source: 'Reddit, SNBForums community consensus',
  },
  {
    id: 'nat_acceleration',
    name: 'NAT Acceleration (CTF/FA)',
    description: 'Hardware-accelerated NAT for maximum throughput',
    category: 'performance',
    risk: 'medium',
    nvramKeys: ['ctf_disable', 'ctf_fa_mode'],
    optimalValues: { ctf_disable: '0', ctf_fa_mode: '2' },
    recommendation: 'Enable NAT Acceleration for maximum WAN speed. Disable only if using QoS, Traffic Analyzer, or VPN.',
    requiresReboot: true,
    meshCompatible: true,
    source: 'SNBForums, Merlin Wiki',
  },
  {
    id: 'beamforming',
    name: 'Explicit Beamforming',
    description: 'Focuses WiFi signal towards connected devices',
    category: 'wifi_optimization',
    risk: 'low',
    nvramKeys: ['wl0_txbf', 'wl1_txbf', 'wl0_itxbf', 'wl1_itxbf'],
    optimalValues: { wl0_txbf: '1', wl1_txbf: '1', wl0_itxbf: '1', wl1_itxbf: '1' },
    recommendation: 'Enable beamforming for better signal strength and range to supported devices.',
    requiresReboot: false,
    meshCompatible: true,
    source: 'ASUS Official',
  },
  {
    id: 'mu_mimo',
    name: 'MU-MIMO',
    description: 'Multi-User MIMO for simultaneous multi-device communication',
    category: 'performance',
    risk: 'low',
    nvramKeys: ['wl0_mumimo', 'wl1_mumimo'],
    optimalValues: { wl0_mumimo: '1', wl1_mumimo: '1' },
    recommendation: 'Enable MU-MIMO for better performance with multiple simultaneous clients.',
    requiresReboot: false,
    meshCompatible: true,
    source: 'ASUS Official',
  },
  {
    id: 'ofdma',
    name: 'OFDMA (WiFi 6)',
    description: 'Orthogonal Frequency Division Multiple Access for efficiency',
    category: 'performance',
    risk: 'low',
    nvramKeys: ['wl0_ofdma', 'wl1_ofdma'],
    optimalValues: { wl0_ofdma: '1', wl1_ofdma: '1' },
    recommendation: 'Enable OFDMA for better efficiency with many WiFi 6 clients.',
    requiresReboot: false,
    meshCompatible: true,
    minFirmwareVersion: '386.1',
    source: 'ASUS Official, WiFi 6 specification',
  },
  {
    id: 'target_wake_time',
    name: 'Target Wake Time (TWT)',
    description: 'WiFi 6 power saving feature for IoT devices',
    category: 'stability',
    risk: 'low',
    nvramKeys: ['wl0_twt', 'wl1_twt'],
    optimalValues: { wl0_twt: '1', wl1_twt: '1' },
    recommendation: 'Enable TWT for better battery life on WiFi 6 IoT devices.',
    requiresReboot: false,
    meshCompatible: true,
    minFirmwareVersion: '386.1',
    source: 'WiFi 6 specification',
  },
  {
    id: 'airtime_fairness',
    name: 'Airtime Fairness',
    description: 'Prevents slow devices from hogging airtime',
    category: 'performance',
    risk: 'medium',
    nvramKeys: ['wl0_atf', 'wl1_atf'],
    optimalValues: { wl0_atf: '1', wl1_atf: '1' },
    recommendation: 'Enable Airtime Fairness if you have mixed fast/slow devices. May cause issues with some legacy devices.',
    requiresReboot: false,
    meshCompatible: true,
    source: 'SNBForums',
  },
  {
    id: 'ampdu_rts',
    name: 'AMPDU RTS Optimization',
    description: 'Optimizes aggregated packet handling',
    category: 'performance',
    risk: 'low',
    nvramKeys: ['wl0_ampdu_rts', 'wl1_ampdu_rts'],
    optimalValues: { wl0_ampdu_rts: '1', wl1_ampdu_rts: '1' },
    recommendation: 'Enable AMPDU RTS for better performance in congested environments.',
    requiresReboot: false,
    meshCompatible: true,
    source: 'Merlin Firmware defaults',
  },
  {
    id: 'ack_suppression',
    name: 'ACK Suppression',
    description: 'Reduces acknowledgment overhead on 5GHz',
    category: 'performance',
    risk: 'low',
    nvramKeys: ['wl1_ack_ratio'],
    optimalValues: { wl1_ack_ratio: '4' },
    recommendation: 'Enable ACK suppression on 5GHz for better throughput.',
    requiresReboot: false,
    meshCompatible: true,
    source: 'SNBForums optimization threads',
  },
  {
    id: 'dns_optimization',
    name: 'DNS Configuration',
    description: 'Use fast, reliable DNS servers',
    category: 'performance',
    risk: 'low',
    nvramKeys: ['wan0_dns', 'wan0_dnsenable_x'],
    optimalValues: { wan0_dnsenable_x: '0' },
    recommendation: 'Use custom DNS (1.1.1.1, 8.8.8.8, or local Pi-hole) instead of ISP DNS for faster resolution.',
    requiresReboot: false,
    meshCompatible: true,
    source: 'General networking best practice',
  },
  {
    id: 'wired_backhaul',
    name: 'Wired Mesh Backhaul',
    description: 'Use Ethernet instead of wireless for mesh backhaul',
    category: 'mesh_optimization',
    risk: 'low',
    nvramKeys: ['cfg_cost'],
    optimalValues: {},
    recommendation: 'Use wired (Ethernet) backhaul for mesh nodes whenever possible. Wireless backhaul cuts available bandwidth in half.',
    requiresReboot: false,
    meshCompatible: true,
    source: 'ASUS Official, all mesh best practices',
  },
  {
    id: 'jffs_scripts',
    name: 'JFFS Custom Scripts',
    description: 'Enable custom scripts support (Merlin)',
    category: 'merlin_scripts',
    risk: 'low',
    nvramKeys: ['jffs2_scripts'],
    optimalValues: { jffs2_scripts: '1' },
    recommendation: 'Enable JFFS scripts to use Merlin addons like Diversion, Skynet, FlexQoS.',
    requiresReboot: false,
    meshCompatible: true,
    source: 'Merlin Wiki',
  },
  {
    id: 'stp_disable',
    name: 'Disable STP (Single Router)',
    description: 'Spanning Tree Protocol adds latency if not needed',
    category: 'performance',
    risk: 'medium',
    nvramKeys: ['lan_stp'],
    optimalValues: { lan_stp: '0' },
    recommendation: 'Disable STP if you have a simple network without loops. Keep enabled for complex networks.',
    requiresReboot: false,
    meshCompatible: false,
    source: 'SNBForums',
  },
  {
    id: 'ipv6_optimization',
    name: 'IPv6 Configuration',
    description: 'Proper IPv6 setup for modern networks',
    category: 'stability',
    risk: 'low',
    nvramKeys: ['ipv6_service', 'ipv6_accept_ra'],
    optimalValues: {},
    recommendation: 'Enable IPv6 if your ISP supports it. Use Native or Passthrough mode.',
    requiresReboot: false,
    meshCompatible: true,
    source: 'General networking',
  },
];

const MERLIN_SCRIPTS = [
  {
    name: 'Diversion',
    description: 'Router-level ad-blocker using dnsmasq',
    installCommand: 'amtm',
    checkCommand: 'which diversion',
    benefit: 'Blocks ads and trackers for all devices on network without client software',
    category: 'security' as TweakCategory,
  },
  {
    name: 'Skynet',
    description: 'Advanced firewall and intrusion prevention',
    installCommand: 'amtm',
    checkCommand: 'which skynet',
    benefit: 'Blocks malicious IPs, provides firewall logging and country blocking',
    category: 'security' as TweakCategory,
  },
  {
    name: 'FlexQoS',
    description: 'Enhanced QoS with flexible rules',
    installCommand: 'amtm',
    checkCommand: 'which flexqos',
    benefit: 'Better traffic prioritization than stock QoS, gaming/streaming optimization',
    category: 'performance' as TweakCategory,
  },
  {
    name: 'YazFi',
    description: 'Enhanced guest WiFi networks',
    installCommand: 'amtm',
    checkCommand: 'which yazfi',
    benefit: 'Isolated guest networks with custom DHCP, VPN routing, bandwidth limits',
    category: 'security' as TweakCategory,
  },
  {
    name: 'connmon',
    description: 'Connection monitor and logger',
    installCommand: 'amtm',
    checkCommand: 'which connmon',
    benefit: 'Tracks internet connectivity, logs outages, detects ISP issues',
    category: 'stability' as TweakCategory,
  },
  {
    name: 'spdMerlin',
    description: 'Scheduled speed tests',
    installCommand: 'amtm',
    checkCommand: 'which spdmerlin',
    benefit: 'Automatic speed tests to track ISP performance over time',
    category: 'stability' as TweakCategory,
  },
  {
    name: 'BACKUPMON',
    description: 'Automated backup solution',
    installCommand: 'amtm',
    checkCommand: 'which backupmon',
    benefit: 'Automatic backups of JFFS and NVRAM to USB drive',
    category: 'stability' as TweakCategory,
  },
  {
    name: 'ntpMerlin',
    description: 'Enhanced NTP time sync',
    installCommand: 'amtm',
    checkCommand: 'which ntpmerlin',
    benefit: 'More reliable time synchronization, important for certificates and logs',
    category: 'stability' as TweakCategory,
  },
  {
    name: 'scMerlin',
    description: 'Service control manager',
    installCommand: 'amtm',
    checkCommand: 'which scmerlin',
    benefit: 'Easy management of router services, scheduled service restarts',
    category: 'stability' as TweakCategory,
  },
  {
    name: 'Unbound Manager',
    description: 'Local recursive DNS resolver',
    installCommand: 'amtm',
    checkCommand: 'which unbound_manager',
    benefit: 'Privacy-focused DNS resolution without third-party DNS',
    category: 'security' as TweakCategory,
  },
];

export class RouterTweaksChecker {
  private readonly sshClient: AsusSshClient;
  private nvramCache: Record<string, string> = {};
  private firmwareVersion: string = '';
  private isMerlin: boolean = false;

  constructor(sshClient: AsusSshClient) {
    this.sshClient = sshClient;
  }

  async checkAllTweaks(): Promise<TweaksReport> {
    logger.info('Starting comprehensive tweaks check');

    await this.loadNvramValues();
    await this.detectFirmware();

    const isAiMesh = this.nvramCache['cfg_master'] === '1' || 
                     parseInt(this.nvramCache['cfg_sdn'] ?? '0', 10) > 0;
    const nodeCount = parseInt(this.nvramCache['cfg_device_list']?.split('<').length.toString() ?? '1', 10);

    const results: TweakCheckResult[] = [];
    const categoryScores: Record<TweakCategory, { optimal: number; total: number }> = {
      performance: { optimal: 0, total: 0 },
      wifi_optimization: { optimal: 0, total: 0 },
      security: { optimal: 0, total: 0 },
      stability: { optimal: 0, total: 0 },
      mesh_optimization: { optimal: 0, total: 0 },
      merlin_scripts: { optimal: 0, total: 0 },
    };

    for (const tweak of TWEAK_DEFINITIONS) {
      if (!tweak.meshCompatible && isAiMesh) continue;
      if (tweak.minFirmwareVersion && !this.checkMinVersion(tweak.minFirmwareVersion)) continue;

      const result = await this.checkTweak(tweak);
      results.push(result);

      categoryScores[tweak.category].total++;
      if (result.status === 'optimal') {
        categoryScores[tweak.category].optimal++;
      }
    }

    const installedScripts = await this.checkInstalledScripts();
    const recommendedScripts = this.getRecommendedScripts(installedScripts);

    const categories = Object.fromEntries(
      Object.entries(categoryScores).map(([cat, scores]) => [
        cat,
        {
          score: scores.total > 0 ? Math.round((scores.optimal / scores.total) * 100) : 100,
          tweaksChecked: scores.total,
          tweaksOptimal: scores.optimal,
        },
      ])
    ) as Record<TweakCategory, { score: number; tweaksChecked: number; tweaksOptimal: number }>;

    const overallScore = Math.round(
      Object.values(categories).reduce((sum, c) => sum + c.score, 0) / Object.keys(categories).length
    );

    const topRecommendations = results
      .filter(r => r.status !== 'optimal' && r.status !== 'not_available')
      .sort((a, b) => {
        const riskOrder = { low: 0, medium: 1, high: 2 };
        return riskOrder[a.tweak.risk] - riskOrder[b.tweak.risk];
      })
      .slice(0, 5);

    logger.info({ overallScore, tweaksChecked: results.length }, 'Tweaks check complete');

    return {
      timestamp: new Date(),
      firmwareVersion: this.firmwareVersion,
      isMerlin: this.isMerlin,
      isAiMesh,
      nodeCount,
      overallScore,
      categories,
      results,
      topRecommendations,
      installedScripts,
      recommendedScripts,
    };
  }

  private async loadNvramValues(): Promise<void> {
    const allKeys = new Set<string>();
    for (const tweak of TWEAK_DEFINITIONS) {
      tweak.nvramKeys?.forEach(k => allKeys.add(k));
    }
    allKeys.add('firmver');
    allKeys.add('buildno');
    allKeys.add('extendno');
    allKeys.add('cfg_master');
    allKeys.add('cfg_sdn');
    allKeys.add('cfg_device_list');

    try {
      const nvramOutput = await this.sshClient.execute(
        `nvram show 2>/dev/null | grep -E "^(${Array.from(allKeys).join('|')})="`
      );

      for (const line of nvramOutput.split('\n')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          this.nvramCache[key.trim()] = valueParts.join('=').trim();
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to load NVRAM values');
    }
  }

  private async detectFirmware(): Promise<void> {
    const firmver = this.nvramCache['firmver'] ?? '';
    const buildno = this.nvramCache['buildno'] ?? '';
    const extendno = this.nvramCache['extendno'] ?? '';

    this.firmwareVersion = `${firmver}.${buildno}${extendno ? `_${extendno}` : ''}`;
    this.isMerlin = extendno.toLowerCase().includes('merlin') || 
                    await this.checkMerlinInstalled();

    logger.info({ firmware: this.firmwareVersion, isMerlin: this.isMerlin }, 'Firmware detected');
  }

  private async checkMerlinInstalled(): Promise<boolean> {
    try {
      const result = await this.sshClient.execute('nvram get buildinfo 2>/dev/null || echo ""');
      return result.toLowerCase().includes('merlin');
    } catch {
      return false;
    }
  }

  private checkMinVersion(minVersion: string): boolean {
    const current = this.firmwareVersion.split('.').map(n => parseInt(n, 10) || 0);
    const required = minVersion.split('.').map(n => parseInt(n, 10) || 0);

    for (let i = 0; i < Math.max(current.length, required.length); i++) {
      const c = current[i] ?? 0;
      const r = required[i] ?? 0;
      if (c > r) return true;
      if (c < r) return false;
    }
    return true;
  }

  private async checkTweak(tweak: TweakDefinition): Promise<TweakCheckResult> {
    const currentValues: Record<string, string | number | boolean> = {};
    let status: TweakStatus = 'unknown';
    let allOptimal = true;
    let hasAnyValue = false;

    if (tweak.nvramKeys) {
      for (const key of tweak.nvramKeys) {
        const value = this.nvramCache[key];
        if (value !== undefined) {
          currentValues[key] = value;
          hasAnyValue = true;

          if (tweak.optimalValues && key in tweak.optimalValues) {
            const optimal = String(tweak.optimalValues[key]);
            if (value !== optimal) {
              allOptimal = false;
            }
          }
        }
      }
    }

    if (!hasAnyValue && tweak.nvramKeys && tweak.nvramKeys.length > 0) {
      status = 'not_available';
    } else if (Object.keys(tweak.optimalValues ?? {}).length === 0) {
      status = 'unknown';
    } else if (allOptimal) {
      status = 'optimal';
    } else {
      status = 'suboptimal';
    }

    const impactDescription = this.getImpactDescription(tweak);

    return {
      tweak,
      status,
      currentValues,
      optimalValues: tweak.optimalValues ?? {},
      recommendation: tweak.recommendation,
      canAutoApply: !!tweak.nvramKeys && tweak.risk !== 'high',
      impactDescription,
    };
  }

  private getImpactDescription(tweak: TweakDefinition): string {
    switch (tweak.category) {
      case 'performance':
        return 'May improve throughput and reduce latency';
      case 'wifi_optimization':
        return 'May improve WiFi speed, range, or reliability';
      case 'security':
        return 'Improves network security posture';
      case 'stability':
        return 'May improve connection stability and uptime';
      case 'mesh_optimization':
        return 'May improve mesh roaming and backhaul performance';
      case 'merlin_scripts':
        return 'Enables advanced Merlin firmware features';
      default:
        return 'May improve router operation';
    }
  }

  private async checkInstalledScripts(): Promise<string[]> {
    if (!this.isMerlin) return [];

    const installed: string[] = [];
    for (const script of MERLIN_SCRIPTS) {
      try {
        const result = await this.sshClient.execute(`${script.checkCommand} 2>/dev/null || echo ""`);
        if (result.trim()) {
          installed.push(script.name);
        }
      } catch {
        continue;
      }
    }
    return installed;
  }

  private getRecommendedScripts(installed: string[]): Array<{
    name: string;
    description: string;
    installCommand: string;
    benefit: string;
  }> {
    if (!this.isMerlin) {
      return [{
        name: 'Asuswrt-Merlin Firmware',
        description: 'Enhanced firmware with scripting support',
        installCommand: 'Flash from https://www.asuswrt-merlin.net/',
        benefit: 'Enables all Merlin scripts, better performance, more features',
      }];
    }

    return MERLIN_SCRIPTS
      .filter(s => !installed.includes(s.name))
      .slice(0, 5)
      .map(s => ({
        name: s.name,
        description: s.description,
        installCommand: s.installCommand,
        benefit: s.benefit,
      }));
  }

  async applyTweak(tweakId: string, confirm: boolean): Promise<{
    success: boolean;
    message: string;
    requiresReboot: boolean;
  }> {
    const tweak = TWEAK_DEFINITIONS.find(t => t.id === tweakId);
    if (!tweak) {
      return { success: false, message: `Tweak ${tweakId} not found`, requiresReboot: false };
    }

    if (!confirm) {
      return {
        success: false,
        message: `Tweak "${tweak.name}" requires confirmation. Risk level: ${tweak.risk}. ${tweak.recommendation}`,
        requiresReboot: tweak.requiresReboot,
      };
    }

    if (tweak.risk === 'high') {
      return {
        success: false,
        message: `High-risk tweaks cannot be auto-applied. Manual configuration required: ${tweak.recommendation}`,
        requiresReboot: tweak.requiresReboot,
      };
    }

    if (!tweak.nvramKeys || !tweak.optimalValues) {
      return {
        success: false,
        message: `Tweak "${tweak.name}" cannot be auto-applied. ${tweak.recommendation}`,
        requiresReboot: tweak.requiresReboot,
      };
    }

    try {
      for (const key of tweak.nvramKeys) {
        if (key in tweak.optimalValues) {
          const value = String(tweak.optimalValues[key]);
          await this.sshClient.execute(`nvram set ${key}=${value}`);
        }
      }
      await this.sshClient.execute('nvram commit');

      if (!tweak.requiresReboot) {
        await this.sshClient.execute('service restart_wireless 2>/dev/null || true');
      }

      logger.info({ tweakId, tweak: tweak.name }, 'Tweak applied successfully');

      return {
        success: true,
        message: `Tweak "${tweak.name}" applied successfully.${tweak.requiresReboot ? ' Reboot required for full effect.' : ''}`,
        requiresReboot: tweak.requiresReboot,
      };
    } catch (err) {
      logger.error({ err, tweakId }, 'Failed to apply tweak');
      return {
        success: false,
        message: `Failed to apply tweak: ${err instanceof Error ? err.message : 'Unknown error'}`,
        requiresReboot: false,
      };
    }
  }

  getTweakDefinitions(): TweakDefinition[] {
    return [...TWEAK_DEFINITIONS];
  }

  getMerlinScripts(): typeof MERLIN_SCRIPTS {
    return [...MERLIN_SCRIPTS];
  }
}
