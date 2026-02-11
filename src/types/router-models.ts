import { z } from 'zod';

export const RouterGenerationSchema = z.enum([
  'wifi5',      // 802.11ac (AC models)
  'wifi6',      // 802.11ax (AX models)
  'wifi6e',     // 802.11ax + 6GHz (AXE models)
  'wifi7',      // 802.11be (BE models)
]);
export type RouterGeneration = z.infer<typeof RouterGenerationSchema>;

export const RouterCapabilitySchema = z.enum([
  'aimesh',
  'aimesh_2',
  'smart_connect',
  'band_steering',
  'mu_mimo',
  'ofdma',
  'dfs',
  'mlo',              // WiFi 7 Multi-Link Operation
  'wpa3',
  '160mhz',
  '320mhz',           // WiFi 7
  'iptv',
  'wireguard',
  'tailscale',
  'usb_3',
  'usb_4',
  '2.5g_wan',
  '10g_wan',
  '10g_lan',
  'link_aggregation',
]);
export type RouterCapability = z.infer<typeof RouterCapabilitySchema>;

export const RouterModelInfoSchema = z.object({
  model: z.string(),
  generation: RouterGenerationSchema,
  wifiBands: z.array(z.enum(['2.4GHz', '5GHz', '5GHz-2', '6GHz'])),
  maxSpeed: z.number(),
  capabilities: z.array(RouterCapabilitySchema),
  sshInterface: z.object({
    wl0: z.string().describe('2.4GHz interface name'),
    wl1: z.string().describe('5GHz interface name'),
    wl2: z.string().optional().describe('5GHz-2 or 6GHz interface name'),
    wl3: z.string().optional().describe('6GHz interface name (quad-band)'),
  }),
  nvramPrefix: z.object({
    wifi2g: z.string(),
    wifi5g: z.string(),
    wifi5g2: z.string().optional(),
    wifi6g: z.string().optional(),
  }),
  aimeshRole: z.enum(['router', 'node', 'both']),
  minFirmware: z.string().optional(),
});
export type RouterModelInfo = z.infer<typeof RouterModelInfoSchema>;

export const ROUTER_DATABASE: Record<string, RouterModelInfo> = {
  'RT-AX88U': {
    model: 'RT-AX88U',
    generation: 'wifi6',
    wifiBands: ['2.4GHz', '5GHz'],
    maxSpeed: 6000,
    capabilities: ['aimesh', 'smart_connect', 'band_steering', 'mu_mimo', 'ofdma', 'dfs', 'wpa3', '160mhz'],
    sshInterface: { wl0: 'eth6', wl1: 'eth7' },
    nvramPrefix: { wifi2g: 'wl0', wifi5g: 'wl1' },
    aimeshRole: 'both',
  },
  'RT-AX86U': {
    model: 'RT-AX86U',
    generation: 'wifi6',
    wifiBands: ['2.4GHz', '5GHz'],
    maxSpeed: 5700,
    capabilities: ['aimesh', 'smart_connect', 'band_steering', 'mu_mimo', 'ofdma', 'dfs', 'wpa3', '160mhz', '2.5g_wan'],
    sshInterface: { wl0: 'eth6', wl1: 'eth7' },
    nvramPrefix: { wifi2g: 'wl0', wifi5g: 'wl1' },
    aimeshRole: 'both',
  },
  'RT-AX86U Pro': {
    model: 'RT-AX86U Pro',
    generation: 'wifi6',
    wifiBands: ['2.4GHz', '5GHz'],
    maxSpeed: 5700,
    capabilities: ['aimesh_2', 'smart_connect', 'band_steering', 'mu_mimo', 'ofdma', 'dfs', 'wpa3', '160mhz', '2.5g_wan'],
    sshInterface: { wl0: 'eth6', wl1: 'eth7' },
    nvramPrefix: { wifi2g: 'wl0', wifi5g: 'wl1' },
    aimeshRole: 'both',
  },
  'GT-AX11000': {
    model: 'GT-AX11000',
    generation: 'wifi6',
    wifiBands: ['2.4GHz', '5GHz', '5GHz-2'],
    maxSpeed: 11000,
    capabilities: ['aimesh', 'smart_connect', 'band_steering', 'mu_mimo', 'ofdma', 'dfs', 'wpa3', '160mhz', 'link_aggregation'],
    sshInterface: { wl0: 'eth6', wl1: 'eth7', wl2: 'eth8' },
    nvramPrefix: { wifi2g: 'wl0', wifi5g: 'wl1', wifi5g2: 'wl2' },
    aimeshRole: 'both',
  },
  'GT-AX11000 Pro': {
    model: 'GT-AX11000 Pro',
    generation: 'wifi6',
    wifiBands: ['2.4GHz', '5GHz', '5GHz-2'],
    maxSpeed: 11000,
    capabilities: ['aimesh_2', 'smart_connect', 'band_steering', 'mu_mimo', 'ofdma', 'dfs', 'wpa3', '160mhz', '10g_wan', '2.5g_wan'],
    sshInterface: { wl0: 'eth6', wl1: 'eth7', wl2: 'eth8' },
    nvramPrefix: { wifi2g: 'wl0', wifi5g: 'wl1', wifi5g2: 'wl2' },
    aimeshRole: 'both',
  },
  'GT-AXE11000': {
    model: 'GT-AXE11000',
    generation: 'wifi6e',
    wifiBands: ['2.4GHz', '5GHz', '6GHz'],
    maxSpeed: 11000,
    capabilities: ['aimesh_2', 'smart_connect', 'band_steering', 'mu_mimo', 'ofdma', 'dfs', 'wpa3', '160mhz', '2.5g_wan'],
    sshInterface: { wl0: 'eth6', wl1: 'eth7', wl2: 'eth8' },
    nvramPrefix: { wifi2g: 'wl0', wifi5g: 'wl1', wifi6g: 'wl2' },
    aimeshRole: 'both',
  },
  'GT-AXE16000': {
    model: 'GT-AXE16000',
    generation: 'wifi6e',
    wifiBands: ['2.4GHz', '5GHz', '5GHz-2', '6GHz'],
    maxSpeed: 16000,
    capabilities: ['aimesh_2', 'smart_connect', 'band_steering', 'mu_mimo', 'ofdma', 'dfs', 'wpa3', '160mhz', '10g_wan', '10g_lan', '2.5g_wan'],
    sshInterface: { wl0: 'eth7', wl1: 'eth8', wl2: 'eth9', wl3: 'eth10' },
    nvramPrefix: { wifi2g: 'wl0', wifi5g: 'wl1', wifi5g2: 'wl2', wifi6g: 'wl3' },
    aimeshRole: 'both',
  },
  'RT-AXE7800': {
    model: 'RT-AXE7800',
    generation: 'wifi6e',
    wifiBands: ['2.4GHz', '5GHz', '6GHz'],
    maxSpeed: 7800,
    capabilities: ['aimesh_2', 'smart_connect', 'band_steering', 'mu_mimo', 'ofdma', 'wpa3', '160mhz', '2.5g_wan'],
    sshInterface: { wl0: 'eth6', wl1: 'eth7', wl2: 'eth8' },
    nvramPrefix: { wifi2g: 'wl0', wifi5g: 'wl1', wifi6g: 'wl2' },
    aimeshRole: 'both',
  },
  'ZenWiFi Pro ET12': {
    model: 'ZenWiFi Pro ET12',
    generation: 'wifi6e',
    wifiBands: ['2.4GHz', '5GHz', '6GHz'],
    maxSpeed: 11000,
    capabilities: ['aimesh_2', 'smart_connect', 'band_steering', 'mu_mimo', 'ofdma', 'wpa3', '160mhz', '2.5g_wan', '10g_wan'],
    sshInterface: { wl0: 'eth6', wl1: 'eth7', wl2: 'eth8' },
    nvramPrefix: { wifi2g: 'wl0', wifi5g: 'wl1', wifi6g: 'wl2' },
    aimeshRole: 'both',
  },
  'ZenWiFi XT8': {
    model: 'ZenWiFi XT8',
    generation: 'wifi6',
    wifiBands: ['2.4GHz', '5GHz', '5GHz-2'],
    maxSpeed: 6600,
    capabilities: ['aimesh', 'smart_connect', 'band_steering', 'mu_mimo', 'ofdma', 'wpa3', '160mhz'],
    sshInterface: { wl0: 'eth6', wl1: 'eth7', wl2: 'eth8' },
    nvramPrefix: { wifi2g: 'wl0', wifi5g: 'wl1', wifi5g2: 'wl2' },
    aimeshRole: 'both',
  },
  'ZenWiFi AX (XT8)': {
    model: 'ZenWiFi AX (XT8)',
    generation: 'wifi6',
    wifiBands: ['2.4GHz', '5GHz', '5GHz-2'],
    maxSpeed: 6600,
    capabilities: ['aimesh', 'smart_connect', 'band_steering', 'mu_mimo', 'ofdma', 'wpa3', '160mhz'],
    sshInterface: { wl0: 'eth6', wl1: 'eth7', wl2: 'eth8' },
    nvramPrefix: { wifi2g: 'wl0', wifi5g: 'wl1', wifi5g2: 'wl2' },
    aimeshRole: 'both',
  },
  'RT-AC68U': {
    model: 'RT-AC68U',
    generation: 'wifi5',
    wifiBands: ['2.4GHz', '5GHz'],
    maxSpeed: 1900,
    capabilities: ['aimesh', 'smart_connect', 'band_steering', 'mu_mimo'],
    sshInterface: { wl0: 'eth1', wl1: 'eth2' },
    nvramPrefix: { wifi2g: 'wl0', wifi5g: 'wl1' },
    aimeshRole: 'node',
  },
  'RT-AC86U': {
    model: 'RT-AC86U',
    generation: 'wifi5',
    wifiBands: ['2.4GHz', '5GHz'],
    maxSpeed: 2900,
    capabilities: ['aimesh', 'smart_connect', 'band_steering', 'mu_mimo', 'dfs', 'wpa3'],
    sshInterface: { wl0: 'eth5', wl1: 'eth6' },
    nvramPrefix: { wifi2g: 'wl0', wifi5g: 'wl1' },
    aimeshRole: 'both',
  },
  'GT-BE98 Pro': {
    model: 'GT-BE98 Pro',
    generation: 'wifi7',
    wifiBands: ['2.4GHz', '5GHz', '5GHz-2', '6GHz'],
    maxSpeed: 30000,
    capabilities: ['aimesh_2', 'smart_connect', 'band_steering', 'mu_mimo', 'ofdma', 'dfs', 'wpa3', '320mhz', 'mlo', '10g_wan', '10g_lan'],
    sshInterface: { wl0: 'eth6', wl1: 'eth7', wl2: 'eth8', wl3: 'eth9' },
    nvramPrefix: { wifi2g: 'wl0', wifi5g: 'wl1', wifi5g2: 'wl2', wifi6g: 'wl3' },
    aimeshRole: 'both',
  },
};

export const GENERATION_COMPATIBILITY: Record<RouterGeneration, RouterGeneration[]> = {
  'wifi7': ['wifi7', 'wifi6e', 'wifi6', 'wifi5'],
  'wifi6e': ['wifi6e', 'wifi6', 'wifi5'],
  'wifi6': ['wifi6', 'wifi5'],
  'wifi5': ['wifi5'],
};

export interface MixedMeshRecommendation {
  issue: string;
  severity: 'info' | 'warning' | 'critical';
  recommendation: string;
  affectedNodes: string[];
}

export function getRouterInfo(model: string): RouterModelInfo | undefined {
  const normalizedModel = model.trim().toUpperCase();
  
  for (const [key, info] of Object.entries(ROUTER_DATABASE)) {
    if (key.toUpperCase() === normalizedModel || 
        key.toUpperCase().replace(/-/g, '') === normalizedModel.replace(/-/g, '')) {
      return info;
    }
  }
  
  return undefined;
}

export function isCompatibleGeneration(gen1: RouterGeneration, gen2: RouterGeneration): boolean {
  return GENERATION_COMPATIBILITY[gen1]?.includes(gen2) ?? false;
}

export function getLowestCommonGeneration(generations: RouterGeneration[]): RouterGeneration {
  const order: RouterGeneration[] = ['wifi5', 'wifi6', 'wifi6e', 'wifi7'];
  let lowestIndex = order.length - 1;
  
  for (const gen of generations) {
    const index = order.indexOf(gen);
    if (index < lowestIndex) {
      lowestIndex = index;
    }
  }
  
  return order[lowestIndex]!;
}

export function getSharedCapabilities(models: RouterModelInfo[]): RouterCapability[] {
  if (models.length === 0) return [];
  
  const firstCaps = new Set(models[0]!.capabilities);
  
  for (let i = 1; i < models.length; i++) {
    const modelCaps = new Set(models[i]!.capabilities);
    for (const cap of firstCaps) {
      if (!modelCaps.has(cap)) {
        firstCaps.delete(cap);
      }
    }
  }
  
  return Array.from(firstCaps);
}
