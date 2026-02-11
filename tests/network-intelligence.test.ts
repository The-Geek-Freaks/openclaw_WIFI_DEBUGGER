import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSshClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
  execute: vi.fn().mockResolvedValue(''),
  getWifiSettings: vi.fn().mockResolvedValue({
    wl0_ssid: 'TestNetwork',
    wl0_channel: '6',
    wl0_bw: '20',
    wl0_txpower: '100',
    wl1_ssid: 'TestNetwork_5G',
    wl1_channel: '36',
    wl1_bw: '80',
    wl1_txpower: '100',
  }),
  getSiteSurvey: vi.fn().mockResolvedValue(''),
};

const mockHassClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(false),
  getZhaDevices: vi.fn().mockResolvedValue([]),
  getZhaNetworkInfo: vi.fn().mockResolvedValue({ channel: 15, pan_id: 0x1234, extended_pan_id: '' }),
};

const mockSnmpClient = {
  isConfigured: vi.fn().mockReturnValue(false),
};

const mockMeshAnalyzer = {
  scan: vi.fn().mockResolvedValue({
    nodes: [{ id: 'main', name: 'Main Router', isMainRouter: true }],
    devices: [],
    wifiSettings: [
      { ssid: 'TestNetwork', band: '2.4GHz', channel: 6, channelWidth: 20, txPower: 100 },
      { ssid: 'TestNetwork_5G', band: '5GHz', channel: 36, channelWidth: 80, txPower: 100 },
    ],
    lastUpdated: new Date(),
  }),
};

const mockZigbeeAnalyzer = {
  scan: vi.fn().mockResolvedValue({
    channel: 15,
    panId: 0x1234,
    extendedPanId: '',
    devices: [],
    links: [],
    lastUpdated: new Date(),
  }),
};

const mockFrequencyOptimizer = {
  scanChannels: vi.fn().mockResolvedValue([]),
};

const mockTopologyAnalyzer = {
  discoverTopology: vi.fn().mockResolvedValue({
    devices: [],
    links: [],
    bottlenecks: [],
    problemDevices: [],
    overallHealthScore: 80,
    recommendations: [],
  }),
};

describe('NetworkIntelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be importable', async () => {
    const { NetworkIntelligence } = await import('../src/core/network-intelligence.js');
    expect(NetworkIntelligence).toBeDefined();
  });

  it('should create instance with all dependencies', async () => {
    const { NetworkIntelligence } = await import('../src/core/network-intelligence.js');
    
    const intelligence = new NetworkIntelligence(
      mockSshClient as any,
      mockHassClient as any,
      mockSnmpClient as any,
      mockMeshAnalyzer as any,
      mockZigbeeAnalyzer as any,
      mockFrequencyOptimizer as any,
      mockTopologyAnalyzer as any
    );

    expect(intelligence).toBeDefined();
    expect(intelligence.getCurrentPhase()).toBe('idle');
  });

  it('should perform full scan and return results', async () => {
    const { NetworkIntelligence } = await import('../src/core/network-intelligence.js');
    
    const intelligence = new NetworkIntelligence(
      mockSshClient as any,
      mockHassClient as any,
      mockSnmpClient as any,
      mockMeshAnalyzer as any,
      mockZigbeeAnalyzer as any,
      mockFrequencyOptimizer as any,
      mockTopologyAnalyzer as any
    );

    const result = await intelligence.performFullScan(['minimize_interference']);

    expect(result).toBeDefined();
    expect(result.startTime).toBeInstanceOf(Date);
    expect(result.endTime).toBeInstanceOf(Date);
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.context).toBeDefined();
    expect(result.context.environmentScore).toBeDefined();
    expect(result.context.spectrumMaps).toBeInstanceOf(Array);
    expect(result.recommendations).toBeInstanceOf(Array);
  });

  it('should emit phase changes during scan', async () => {
    const { NetworkIntelligence } = await import('../src/core/network-intelligence.js');
    
    const intelligence = new NetworkIntelligence(
      mockSshClient as any,
      mockHassClient as any,
      mockSnmpClient as any,
      mockMeshAnalyzer as any,
      mockZigbeeAnalyzer as any,
      mockFrequencyOptimizer as any,
      mockTopologyAnalyzer as any
    );

    const phases: string[] = [];
    intelligence.on('phaseChanged', (phase) => phases.push(phase));

    await intelligence.performFullScan();

    expect(phases).toContain('collecting_router_data');
    expect(phases).toContain('scanning_neighbors');
    expect(phases).toContain('complete');
  });

  it('should calculate environment scores', async () => {
    const { NetworkIntelligence } = await import('../src/core/network-intelligence.js');
    
    const intelligence = new NetworkIntelligence(
      mockSshClient as any,
      mockHassClient as any,
      mockSnmpClient as any,
      mockMeshAnalyzer as any,
      mockZigbeeAnalyzer as any,
      mockFrequencyOptimizer as any,
      mockTopologyAnalyzer as any
    );

    const result = await intelligence.performFullScan();
    const scores = result.context.environmentScore;

    expect(scores.overall).toBeGreaterThanOrEqual(0);
    expect(scores.overall).toBeLessThanOrEqual(100);
    expect(scores.wifiHealth).toBeGreaterThanOrEqual(0);
    expect(scores.spectrumCongestion).toBeGreaterThanOrEqual(0);
    expect(scores.crossProtocolHarmony).toBeGreaterThanOrEqual(0);
  });

  it('should generate environment summary', async () => {
    const { NetworkIntelligence } = await import('../src/core/network-intelligence.js');
    
    const intelligence = new NetworkIntelligence(
      mockSshClient as any,
      mockHassClient as any,
      mockSnmpClient as any,
      mockMeshAnalyzer as any,
      mockZigbeeAnalyzer as any,
      mockFrequencyOptimizer as any,
      mockTopologyAnalyzer as any
    );

    const summaryBefore = intelligence.getEnvironmentSummary();
    expect(summaryBefore).toContain('No scan performed');

    await intelligence.performFullScan();

    const summaryAfter = intelligence.getEnvironmentSummary();
    expect(summaryAfter).toContain('Network Environment Score');
  });

  it('should handle data source failures gracefully', async () => {
    const { NetworkIntelligence } = await import('../src/core/network-intelligence.js');
    
    const failingMeshAnalyzer = {
      scan: vi.fn().mockRejectedValue(new Error('SSH connection failed')),
    };

    const intelligence = new NetworkIntelligence(
      mockSshClient as any,
      mockHassClient as any,
      mockSnmpClient as any,
      failingMeshAnalyzer as any,
      mockZigbeeAnalyzer as any,
      mockFrequencyOptimizer as any,
      mockTopologyAnalyzer as any
    );

    const result = await intelligence.performFullScan();

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('SSH connection failed');
  });

  it('should detect WiFi-Zigbee conflicts', async () => {
    const { NetworkIntelligence } = await import('../src/core/network-intelligence.js');
    
    const conflictingMeshAnalyzer = {
      scan: vi.fn().mockResolvedValue({
        nodes: [{ id: 'main', name: 'Main Router', isMainRouter: true }],
        devices: [],
        wifiSettings: [
          { ssid: 'TestNetwork', band: '2.4GHz', channel: 6, channelWidth: 20, txPower: 100 },
        ],
        lastUpdated: new Date(),
      }),
    };

    const conflictingZigbeeAnalyzer = {
      scan: vi.fn().mockResolvedValue({
        channel: 15,
        panId: 0x1234,
        extendedPanId: '',
        devices: [{ ieeeAddress: '0x1234', type: 'end_device', lqi: 200 }],
        links: [],
        lastUpdated: new Date(),
      }),
    };

    const intelligence = new NetworkIntelligence(
      mockSshClient as any,
      mockHassClient as any,
      mockSnmpClient as any,
      conflictingMeshAnalyzer as any,
      conflictingZigbeeAnalyzer as any,
      mockFrequencyOptimizer as any,
      mockTopologyAnalyzer as any
    );

    const result = await intelligence.performFullScan(['protect_zigbee']);

    expect(result.context.zigbeeState).toBeDefined();
  });
});
