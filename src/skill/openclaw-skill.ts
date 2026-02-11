import { createChildLogger } from '../utils/logger.js';
import { loadConfigFromEnv, type Config } from '../config/index.js';
import { AsusSshClient } from '../infra/asus-ssh-client.js';
import { HomeAssistantClient } from '../infra/homeassistant-client.js';
import { SnmpClient } from '../infra/snmp-client.js';
import { MeshAnalyzer } from '../core/mesh-analyzer.js';
import { TriangulationEngine } from '../core/triangulation.js';
import { ProblemDetector } from '../core/problem-detector.js';
import { FrequencyOptimizer } from '../core/frequency-optimizer.js';
import { ZigbeeAnalyzer } from '../core/zigbee-analyzer.js';
import { HeatmapGenerator } from '../core/heatmap-generator.js';
import { BenchmarkEngine } from '../core/benchmark-engine.js';
import { IoTWifiDetector } from '../core/iot-wifi-detector.js';
import { NetworkTopologyAnalyzer } from '../core/network-topology-analyzer.js';
import { NetworkIntelligence } from '../core/network-intelligence.js';
import { SpatialRecommendationEngine } from '../core/spatial-recommendations.js';
import { FloorPlanManager } from '../core/floor-plan-manager.js';
import { AlertingService } from '../core/alerting-service.js';
import type { SkillAction, SkillResponse } from './actions.js';
import type { MeshNetworkState } from '../types/network.js';
import type { ZigbeeNetworkState } from '../types/zigbee.js';
import type { OptimizationSuggestion, NetworkHealthScore } from '../types/analysis.js';

const logger = createChildLogger('openclaw-skill');

export class OpenClawAsusMeshSkill {
  private readonly config: Config;
  private readonly sshClient: AsusSshClient;
  private readonly hassClient: HomeAssistantClient;
  private readonly meshAnalyzer: MeshAnalyzer;
  private readonly triangulation: TriangulationEngine;
  private readonly problemDetector: ProblemDetector;
  private readonly frequencyOptimizer: FrequencyOptimizer;
  private readonly zigbeeAnalyzer: ZigbeeAnalyzer;
  private readonly heatmapGenerator: HeatmapGenerator;
  private readonly benchmarkEngine: BenchmarkEngine;
  private readonly iotDetector: IoTWifiDetector;
  private readonly topologyAnalyzer: NetworkTopologyAnalyzer;
  private readonly snmpClient: SnmpClient;
  private readonly networkIntelligence: NetworkIntelligence;
  private readonly spatialEngine: SpatialRecommendationEngine;
  private readonly floorPlanManager: FloorPlanManager;
  private readonly alertingService: AlertingService;
  
  private meshState: MeshNetworkState | null = null;
  private zigbeeState: ZigbeeNetworkState | null = null;
  private pendingOptimizations: Map<string, OptimizationSuggestion> = new Map();
  private initialized: boolean = false;
  private readonly startTime: Date = new Date();
  private actionCount: number = 0;
  private errorCount: number = 0;

  constructor(config?: Config) {
    this.config = config ?? loadConfigFromEnv();
    
    this.sshClient = new AsusSshClient(this.config.asus);
    this.hassClient = new HomeAssistantClient(this.config.homeAssistant);
    this.meshAnalyzer = new MeshAnalyzer(this.sshClient);
    this.triangulation = new TriangulationEngine();
    this.problemDetector = new ProblemDetector();
    this.frequencyOptimizer = new FrequencyOptimizer(this.sshClient);
    this.zigbeeAnalyzer = new ZigbeeAnalyzer(this.hassClient);
    this.heatmapGenerator = new HeatmapGenerator();
    this.benchmarkEngine = new BenchmarkEngine(this.sshClient);
    this.iotDetector = new IoTWifiDetector(this.sshClient, this.hassClient);
    this.snmpClient = new SnmpClient();
    this.topologyAnalyzer = new NetworkTopologyAnalyzer(this.snmpClient);
    this.networkIntelligence = new NetworkIntelligence(
      this.sshClient,
      this.hassClient,
      this.snmpClient,
      this.meshAnalyzer,
      this.zigbeeAnalyzer,
      this.frequencyOptimizer,
      this.topologyAnalyzer
    );
    this.spatialEngine = new SpatialRecommendationEngine();
    this.floorPlanManager = new FloorPlanManager();
    this.alertingService = new AlertingService();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing OpenClaw ASUS Mesh Skill');
    
    try {
      await this.sshClient.connect();
      logger.info('Connected to ASUS router via SSH');
    } catch (err) {
      logger.error({ err }, 'Failed to connect to ASUS router');
      throw err;
    }

    try {
      await this.hassClient.connect();
      logger.info('Connected to Home Assistant');
    } catch (err) {
      logger.warn({ err }, 'Failed to connect to Home Assistant - Zigbee features will be limited');
    }

    this.initialized = true;
    logger.info('Skill initialized successfully');
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down skill');
    
    try {
      this.meshAnalyzer.destroy();
    } catch (err) {
      logger.warn({ err }, 'Error destroying mesh analyzer');
    }

    try {
      await this.sshClient.disconnect();
    } catch (err) {
      logger.warn({ err }, 'Error disconnecting SSH');
    }

    try {
      await this.hassClient.disconnect();
    } catch (err) {
      logger.warn({ err }, 'Error disconnecting Home Assistant');
    }

    this.initialized = false;
    logger.info('Skill shutdown complete');
  }

  registerShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (err) => {
      logger.error({ err }, 'Uncaught exception');
      shutdown('uncaughtException').catch(() => process.exit(1));
    });
    process.on('unhandledRejection', (reason) => {
      logger.error({ reason }, 'Unhandled rejection');
    });
  }

  async execute(action: SkillAction): Promise<SkillResponse> {
    if (!this.initialized) {
      return this.errorResponse(action.action, 'Skill not initialized. Call initialize() first.');
    }

    logger.info({ action: action.action }, 'Executing action');

    try {
      switch (action.action) {
        case 'scan_network':
          return await this.handleScanNetwork();
        
        case 'get_network_health':
          return await this.handleGetNetworkHealth();
        
        case 'get_device_list':
          return await this.handleGetDeviceList(action.params?.filter);
        
        case 'get_device_details':
          return await this.handleGetDeviceDetails(action.params.macAddress);
        
        case 'get_device_signal_history':
          return await this.handleGetDeviceSignalHistory(
            action.params.macAddress,
            action.params.hours
          );
        
        case 'get_mesh_nodes':
          return await this.handleGetMeshNodes();
        
        case 'get_wifi_settings':
          return await this.handleGetWifiSettings();
        
        case 'set_wifi_channel':
          return await this.handleSetWifiChannel(
            action.params.band,
            action.params.channel
          );
        
        case 'get_problems':
          return await this.handleGetProblems(action.params?.severity);
        
        case 'get_optimization_suggestions':
          return await this.handleGetOptimizationSuggestions();
        
        case 'apply_optimization':
          return await this.handleApplyOptimization(
            action.params.suggestionId,
            action.params.confirm
          );
        
        case 'scan_zigbee':
          return await this.handleScanZigbee();
        
        case 'get_zigbee_devices':
          return await this.handleGetZigbeeDevices();
        
        case 'get_frequency_conflicts':
          return await this.handleGetFrequencyConflicts();
        
        case 'get_spatial_map':
          return await this.handleGetSpatialMap();
        
        case 'set_node_position': {
          const nodeParams: { nodeId: string; x: number; y: number; z?: number; room?: string } = {
            nodeId: action.params.nodeId,
            x: action.params.x,
            y: action.params.y,
          };
          if (action.params.z !== undefined) nodeParams.z = action.params.z;
          if (action.params.room !== undefined) nodeParams.room = action.params.room;
          return await this.handleSetNodePosition(nodeParams);
        }
        
        case 'get_connection_stability':
          return await this.handleGetConnectionStability(
            action.params.macAddress,
            action.params.hours
          );
        
        case 'restart_wireless':
          return await this.handleRestartWireless(action.params.confirm);
        
        case 'get_channel_scan':
          return await this.handleGetChannelScan(action.params?.band);
        
        case 'scan_rogue_iot':
          return await this.handleScanRogueIot();
        
        case 'get_heatmap':
          return await this.handleGetHeatmap(action.params?.floor);
        
        case 'run_benchmark':
          return await this.handleRunBenchmark();
        
        case 'sync_mesh_settings':
          return await this.handleSyncMeshSettings(
            action.params?.channel2g,
            action.params?.channel5g
          );
        
        case 'analyze_network_topology':
          return await this.handleAnalyzeNetworkTopology();
        
        case 'full_intelligence_scan':
          return await this.handleFullIntelligenceScan(action.params?.targets);
        
        case 'get_environment_summary':
          return await this.handleGetEnvironmentSummary();
        
        case 'get_homeassistant_data':
          return await this.handleGetHomeAssistantData(action.params?.include);
        
        case 'get_placement_recommendations':
          return await this.handleGetPlacementRecommendations();
        
        case 'set_floor_plan':
          return await this.handleSetFloorPlan(action.params);
        
        case 'get_floor_visualization':
          return await this.handleGetFloorVisualization(action.params.floor);
        
        case 'get_quick_diagnosis':
          return await this.handleGetQuickDiagnosis();
        
        case 'get_switch_status':
          return await this.handleGetSwitchStatus(action.params?.host);
        
        case 'get_port_traffic':
          return await this.handleGetPortTraffic(action.params.host, action.params.port);
        
        case 'get_vlan_info':
          return await this.handleGetVlanInfo(action.params.host);
        
        case 'get_poe_status':
          return await this.handleGetPoEStatus(action.params.host);
        
        case 'set_poe_enabled':
          return await this.handleSetPoEEnabled(action.params.host, action.params.port, action.params.enabled);
        
        case 'get_roaming_analysis':
          return await this.handleGetRoamingAnalysis(action.params.macAddress);
        
        case 'configure_alerts':
          return await this.handleConfigureAlerts(action.params);
        
        case 'get_alerts':
          return await this.handleGetAlerts(action.params?.hours);
        
        default:
          return this.errorResponse('unknown', 'Unknown action');
      }
    } catch (err) {
      logger.error({ err, action: action.action }, 'Action execution failed');
      return this.errorResponse(
        action.action,
        err instanceof Error ? err.message : 'Unknown error'
      );
    }
  }

  private async handleScanNetwork(): Promise<SkillResponse> {
    this.meshState = await this.meshAnalyzer.scan();
    
    return this.successResponse('scan_network', {
      nodes: this.meshState.nodes.length,
      devices: this.meshState.devices.length,
      wifiSettings: this.meshState.wifiSettings,
      lastUpdated: this.meshState.lastUpdated,
    });
  }

  private async handleGetNetworkHealth(): Promise<SkillResponse> {
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    const problems = this.problemDetector.analyze(
      this.meshState,
      this.meshAnalyzer.getConnectionEvents(),
      undefined,
      this.zigbeeState ?? undefined
    );

    const healthScore = this.problemDetector.calculateHealthScore(this.meshState, problems);

    return this.successResponse('get_network_health', healthScore, 
      this.generateHealthSuggestions(healthScore)
    );
  }

  private async handleGetDeviceList(
    filter?: 'all' | 'wireless' | 'wired' | 'problematic'
  ): Promise<SkillResponse> {
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    let devices = this.meshState.devices;

    switch (filter) {
      case 'wireless':
        devices = devices.filter(d => d.connectionType.startsWith('wireless'));
        break;
      case 'wired':
        devices = devices.filter(d => d.connectionType === 'wired');
        break;
      case 'problematic':
        devices = devices.filter(d => 
          d.status === 'unstable' || 
          (d.signalStrength !== undefined && d.signalStrength < -75)
        );
        break;
    }

    return this.successResponse('get_device_list', {
      count: devices.length,
      devices: devices.map(d => ({
        mac: d.macAddress,
        hostname: d.hostname,
        ip: d.ipAddress,
        connection: d.connectionType,
        signal: d.signalStrength,
        status: d.status,
      })),
    });
  }

  private async handleGetDeviceDetails(macAddress: string): Promise<SkillResponse> {
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    const device = this.meshState.devices.find(d => d.macAddress === macAddress);
    if (!device) {
      return this.errorResponse('get_device_details', `Device ${macAddress} not found`);
    }

    const signalQuality = this.meshAnalyzer.getDeviceSignalQuality(macAddress);
    const events = this.meshAnalyzer.getConnectionEvents(macAddress);

    return this.successResponse('get_device_details', {
      device,
      signalQuality,
      recentEvents: events.slice(-10),
    });
  }

  private async handleGetDeviceSignalHistory(
    macAddress: string,
    hours?: number
  ): Promise<SkillResponse> {
    const history = this.meshAnalyzer.getSignalHistory(macAddress);
    
    const cutoff = Date.now() - (hours ?? 24) * 60 * 60 * 1000;
    const filtered = history.filter(m => m.timestamp.getTime() > cutoff);

    return this.successResponse('get_device_signal_history', {
      macAddress,
      measurements: filtered,
      count: filtered.length,
    });
  }

  private async handleGetMeshNodes(): Promise<SkillResponse> {
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    return this.successResponse('get_mesh_nodes', {
      nodes: this.meshState.nodes,
    });
  }

  private async handleGetWifiSettings(): Promise<SkillResponse> {
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    return this.successResponse('get_wifi_settings', {
      settings: this.meshState.wifiSettings,
    });
  }

  private async handleSetWifiChannel(
    band: '2.4GHz' | '5GHz',
    channel: number
  ): Promise<SkillResponse> {
    const nvramKey = band === '2.4GHz' ? 'wl0_channel' : 'wl1_channel';
    
    await this.sshClient.setNvram(nvramKey, String(channel));
    await this.sshClient.commitNvram();

    return this.successResponse('set_wifi_channel', {
      band,
      channel,
      message: `Channel set to ${channel}. Restart wireless to apply.`,
    }, ['Run restart_wireless to apply the change']);
  }

  private async handleGetProblems(
    severity?: 'all' | 'critical' | 'error' | 'warning'
  ): Promise<SkillResponse> {
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    let problems = this.problemDetector.analyze(
      this.meshState,
      this.meshAnalyzer.getConnectionEvents(),
      undefined,
      this.zigbeeState ?? undefined
    );

    if (severity && severity !== 'all') {
      problems = problems.filter(p => p.severity === severity);
    }

    return this.successResponse('get_problems', {
      count: problems.length,
      problems: problems.map(p => ({
        id: p.id,
        category: p.category,
        severity: p.severity,
        description: p.description,
        recommendation: p.recommendation,
        autoFixAvailable: p.autoFixAvailable,
      })),
    });
  }

  private async handleGetOptimizationSuggestions(): Promise<SkillResponse> {
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    const suggestions = await this.frequencyOptimizer.generateOptimizations(
      this.meshState,
      this.zigbeeState ?? undefined
    );

    this.pendingOptimizations.clear();
    for (const s of suggestions) {
      this.pendingOptimizations.set(s.id, s);
    }

    return this.successResponse('get_optimization_suggestions', {
      count: suggestions.length,
      suggestions: suggestions.map(s => ({
        id: s.id,
        priority: s.priority,
        category: s.category,
        description: s.description,
        expectedImprovement: s.expectedImprovement,
        riskLevel: s.riskLevel,
      })),
    });
  }

  private async handleApplyOptimization(
    suggestionId: string,
    confirm: boolean
  ): Promise<SkillResponse> {
    const suggestion = this.pendingOptimizations.get(suggestionId);
    
    if (!suggestion) {
      return this.errorResponse('apply_optimization', 
        `Optimization ${suggestionId} not found. Get fresh suggestions first.`
      );
    }

    if (!confirm) {
      return this.successResponse('apply_optimization', {
        suggestion,
        status: 'pending_confirmation',
        message: 'Set confirm=true to apply this optimization',
      });
    }

    const success = await this.frequencyOptimizer.applyAndRestart(suggestion);
    
    if (success) {
      this.pendingOptimizations.delete(suggestionId);
    }

    return this.successResponse('apply_optimization', {
      suggestionId,
      applied: success,
      message: success 
        ? 'Optimization applied and wireless restarted' 
        : 'Failed to apply optimization',
    });
  }

  private async handleScanZigbee(): Promise<SkillResponse> {
    this.zigbeeState = await this.zigbeeAnalyzer.scan();

    return this.successResponse('scan_zigbee', {
      channel: this.zigbeeState.channel,
      deviceCount: this.zigbeeState.devices.length,
      stats: this.zigbeeAnalyzer.getNetworkStats(),
    });
  }

  private async handleGetZigbeeDevices(): Promise<SkillResponse> {
    if (!this.zigbeeState) {
      this.zigbeeState = await this.zigbeeAnalyzer.scan();
    }

    const health = this.zigbeeAnalyzer.getDeviceHealth();

    return this.successResponse('get_zigbee_devices', {
      devices: health.map(h => ({
        ieee: h.device.ieeeAddress,
        name: h.device.friendlyName,
        type: h.device.type,
        lqi: h.device.lqi,
        available: h.device.available,
        healthScore: h.healthScore,
        issues: h.issues,
      })),
    });
  }

  private async handleGetFrequencyConflicts(): Promise<SkillResponse> {
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }
    if (!this.zigbeeState) {
      this.zigbeeState = await this.zigbeeAnalyzer.scan();
    }

    const conflicts = this.zigbeeAnalyzer.analyzeFrequencyConflicts(
      this.meshState.wifiSettings
    );

    return this.successResponse('get_frequency_conflicts', {
      conflicts,
      hasConflicts: conflicts.some(c => c.conflictSeverity !== 'none'),
    });
  }

  private async handleGetSpatialMap(): Promise<SkillResponse> {
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    const deviceSignals = new Map<string, Array<{ nodeMac: string; rssi: number }>>();
    
    for (const device of this.meshState.devices) {
      if (device.signalStrength) {
        deviceSignals.set(device.macAddress, [{
          nodeMac: device.connectedToNode,
          rssi: device.signalStrength,
        }]);
      }
    }

    const spatialMap = this.triangulation.generateSpatialMap(
      this.meshState.nodes,
      this.meshState.devices,
      deviceSignals
    );

    return this.successResponse('get_spatial_map', spatialMap);
  }

  private async handleSetNodePosition(params: {
    nodeId: string;
    x: number;
    y: number;
    z?: number;
    room?: string;
  }): Promise<SkillResponse> {
    this.triangulation.setNodePosition(
      params.nodeId,
      params.nodeId,
      params.x,
      params.y,
      params.z ?? 0
    );

    return this.successResponse('set_node_position', {
      nodeId: params.nodeId,
      position: { x: params.x, y: params.y, z: params.z ?? 0 },
      room: params.room,
    });
  }

  private async handleGetConnectionStability(
    macAddress: string,
    hours?: number
  ): Promise<SkillResponse> {
    const events = this.meshAnalyzer.getConnectionEvents(macAddress);
    const report = this.problemDetector.generateStabilityReport(
      macAddress,
      events,
      hours ?? 24
    );

    return this.successResponse('get_connection_stability', report);
  }

  private async handleRestartWireless(confirm: boolean): Promise<SkillResponse> {
    if (!confirm) {
      return this.successResponse('restart_wireless', {
        status: 'pending_confirmation',
        message: 'This will temporarily disconnect all wireless clients. Set confirm=true to proceed.',
      });
    }

    await this.sshClient.restartWireless();

    return this.successResponse('restart_wireless', {
      status: 'restarted',
      message: 'Wireless service restarted. Clients will reconnect shortly.',
    });
  }

  private async handleGetChannelScan(
    band?: '2.4GHz' | '5GHz' | 'both'
  ): Promise<SkillResponse> {
    const results = [];

    if (!band || band === 'both' || band === '2.4GHz') {
      results.push(...await this.frequencyOptimizer.scanChannels('2g'));
    }
    if (!band || band === 'both' || band === '5GHz') {
      results.push(...await this.frequencyOptimizer.scanChannels('5g'));
    }

    return this.successResponse('get_channel_scan', {
      channels: results,
    });
  }

  private async handleScanRogueIot(): Promise<SkillResponse> {
    const result = await this.iotDetector.scanForRogueIoTNetworks();

    return this.successResponse('scan_rogue_iot', {
      rogueNetworks: result.rogueNetworks.length,
      networks: result.rogueNetworks,
      suggestedActions: result.suggestedActions,
    });
  }

  private async handleGetHeatmap(floor?: number): Promise<SkillResponse> {
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    const heatmap = this.heatmapGenerator.generateFloorHeatmap(floor ?? 0);

    return this.successResponse('get_heatmap', heatmap);
  }

  private async handleRunBenchmark(): Promise<SkillResponse> {
    const result = await this.benchmarkEngine.runFullBenchmark();

    return this.successResponse('run_benchmark', {
      id: result.id,
      duration: result.duration,
      tests: result.tests,
      timestamp: result.timestamp,
    });
  }

  private async handleSyncMeshSettings(
    channel2g?: number,
    channel5g?: number
  ): Promise<SkillResponse> {
    const changes: string[] = [];

    if (channel2g !== undefined) {
      await this.sshClient.setNvram('wl0_channel', String(channel2g));
      changes.push(`2.4GHz channel set to ${channel2g}`);
    }
    if (channel5g !== undefined) {
      await this.sshClient.setNvram('wl1_channel', String(channel5g));
      changes.push(`5GHz channel set to ${channel5g}`);
    }

    if (changes.length > 0) {
      await this.sshClient.commitNvram();
    }

    return this.successResponse('sync_mesh_settings', {
      changes,
      message: changes.length > 0 
        ? 'Settings synced. Restart wireless to apply.' 
        : 'No changes specified',
    });
  }

  private async handleAnalyzeNetworkTopology(): Promise<SkillResponse> {
    const topology = await this.topologyAnalyzer.discoverTopology();

    return this.successResponse('analyze_network_topology', {
      devices: topology.devices.length,
      links: topology.links.length,
      bottlenecks: topology.bottlenecks,
      problemDevices: topology.problemDevices,
      overallHealth: topology.overallHealthScore,
      recommendations: topology.recommendations,
    });
  }

  private async handleFullIntelligenceScan(
    targets?: Array<'minimize_interference' | 'maximize_throughput' | 'balance_coverage' | 'protect_zigbee' | 'reduce_neighbor_overlap' | 'improve_roaming'>
  ): Promise<SkillResponse> {
    const defaultTargets = targets ?? ['minimize_interference', 'protect_zigbee'];
    
    const result = await this.networkIntelligence.performFullScan(defaultTargets);

    this.meshState = result.context.topologyState ? {
      nodes: [],
      devices: [],
      wifiSettings: result.context.wifiState.ownNetworks.map(n => ({
        ssid: n.ssid,
        band: n.band as '2.4GHz' | '5GHz',
        channel: n.channel,
        channelWidth: n.channelWidth,
        txPower: 100,
        standard: '802.11ax' as const,
        security: 'WPA3' as const,
        bandSteering: false,
        smartConnect: false,
        roamingAssistant: false,
        beamforming: false,
        muMimo: false,
      })),
      lastUpdated: new Date(),
    } : this.meshState;

    return this.successResponse('full_intelligence_scan', {
      duration: result.duration,
      environmentScore: result.context.environmentScore,
      dataSources: result.context.dataSources.map(ds => ({
        source: ds.source,
        available: ds.available,
        freshness: ds.dataFreshness,
      })),
      spectrumOverview: result.context.spectrumMaps.map(m => ({
        band: m.band,
        congestion: m.congestionScore,
        recommendedChannels: m.recommendedChannels,
        neighborCount: m.occupants.filter(o => o.type === 'wifi_neighbor').length,
      })),
      zigbeeStatus: result.context.zigbeeState ? {
        channel: result.context.zigbeeState.channel,
        devices: result.context.zigbeeState.deviceCount,
        wifiConflict: result.context.zigbeeState.hasConflictWithWifi,
      } : null,
      recommendations: result.recommendations.slice(0, 5).map(r => ({
        id: r.id,
        priority: r.priority,
        target: r.target,
        action: r.action.type,
        reasoning: r.reasoning,
        confidence: r.confidence,
        requiresRestart: r.requiresRestart,
      })),
      warnings: result.warnings,
      errors: result.errors,
    }, this.generateIntelligenceSuggestions(result));
  }

  private async handleGetEnvironmentSummary(): Promise<SkillResponse> {
    const summary = this.networkIntelligence.getEnvironmentSummary();
    const lastResult = this.networkIntelligence.getLastScanResult();

    return this.successResponse('get_environment_summary', {
      summary,
      lastScanTime: lastResult?.endTime?.toISOString() ?? null,
      phase: this.networkIntelligence.getCurrentPhase(),
    });
  }

  private generateIntelligenceSuggestions(result: { 
    recommendations: Array<{ priority: number; target: string }>; 
    context: { environmentScore: { overall: number } };
    errors: string[];
  }): string[] {
    const suggestions: string[] = [];

    if (result.context.environmentScore.overall < 50) {
      suggestions.push('Network environment needs attention - follow recommendations');
    }

    const highPriorityRecs = result.recommendations.filter(r => r.priority >= 8);
    if (highPriorityRecs.length > 0) {
      suggestions.push(`${highPriorityRecs.length} high-priority recommendations available`);
    }

    if (result.errors.length > 0) {
      suggestions.push('Some data sources unavailable - results may be incomplete');
    }

    return suggestions;
  }

  private generateHealthSuggestions(health: NetworkHealthScore): string[] {
    const suggestions: string[] = [];

    if (health.categories.signalQuality < 70) {
      suggestions.push('Check device positions and consider adding mesh nodes');
    }
    if (health.categories.channelOptimization < 70) {
      suggestions.push('Run get_optimization_suggestions to find better channel settings');
    }
    if (health.categories.zigbeeHealth < 70) {
      suggestions.push('Check for WiFi/Zigbee frequency conflicts');
    }
    if (health.categories.interferenceLevel < 70) {
      suggestions.push('Run get_channel_scan to analyze interference');
    }

    return suggestions;
  }

  private successResponse(
    action: string,
    data: unknown,
    suggestions?: string[]
  ): SkillResponse {
    return {
      success: true,
      action,
      data,
      suggestions,
      timestamp: new Date().toISOString(),
    };
  }

  private errorResponse(action: string, error: string): SkillResponse {
    this.errorCount++;
    return {
      success: false,
      action,
      error,
      timestamp: new Date().toISOString(),
    };
  }

  getHealthCheck(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    initialized: boolean;
    uptime: number;
    connections: {
      ssh: boolean;
      homeAssistant: boolean;
    };
  } {
    const uptimeMs = Date.now() - this.startTime.getTime();

    const sshConnected = this.sshClient.isConnected();
    const hassConnected = this.hassClient.isConnected();

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (!this.initialized) {
      status = 'unhealthy';
    } else if (!sshConnected) {
      status = 'unhealthy';
    } else if (!hassConnected) {
      status = 'degraded';
    }

    return {
      status,
      initialized: this.initialized,
      uptime: Math.floor(uptimeMs / 1000),
      connections: {
        ssh: sshConnected,
        homeAssistant: hassConnected,
      },
    };
  }

  getStats(): {
    uptime: number;
    actionCount: number;
    errorCount: number;
    errorRate: number;
    meshState: {
      nodes: number;
      devices: number;
    } | null;
    lastScan: string | null;
  } {
    const uptimeMs = Date.now() - this.startTime.getTime();
    const errorRate = this.actionCount > 0 
      ? (this.errorCount / this.actionCount) * 100 
      : 0;

    return {
      uptime: Math.floor(uptimeMs / 1000),
      actionCount: this.actionCount,
      errorCount: this.errorCount,
      errorRate: Math.round(errorRate * 100) / 100,
      meshState: this.meshState ? {
        nodes: this.meshState.nodes.length,
        devices: this.meshState.devices.length,
      } : null,
      lastScan: this.meshState?.lastUpdated?.toISOString() ?? null,
    };
  }

  isReady(): boolean {
    return this.initialized && this.sshClient.isConnected();
  }

  private async handleGetHomeAssistantData(
    include?: Array<'zigbee' | 'bluetooth' | 'snmp' | 'device_trackers' | 'router_entities' | 'all'>
  ): Promise<SkillResponse> {
    if (!this.hassClient) {
      return this.errorResponse('get_homeassistant_data', 'Home Assistant not configured');
    }

    const includeSet = new Set(include ?? ['all']);
    const includeAll = includeSet.has('all');

    const result: Record<string, unknown> = {
      source: 'home_assistant',
      timestamp: new Date().toISOString(),
    };

    try {
      if (includeAll) {
        const allData = await this.hassClient.getAllNetworkData();
        return this.successResponse('get_homeassistant_data', {
          ...result,
          ...allData,
          dataSources: {
            zigbee: allData.zigbee.available,
            bluetooth: allData.bluetooth.available,
            snmp: allData.networkEntities.snmp.length > 0,
            deviceTrackers: allData.deviceTrackers.length,
            routerEntities: allData.routerEntities.length,
          },
        }, [
          'Nutze get_zigbee_devices für detaillierte Zigbee-Analyse',
          'Nutze full_intelligence_scan für vollständige Netzwerk-Analyse',
          allData.zigbee.available 
            ? `Zigbee aktiv auf Kanal ${allData.zigbee.channel} mit ${allData.zigbee.deviceCount} Geräten` 
            : 'Zigbee nicht verfügbar - ZHA oder Zigbee2MQTT nicht konfiguriert?',
        ]);
      }

      if (includeSet.has('zigbee')) {
        const topology = await this.hassClient.getZigbeeTopology();
        const networkInfo = await this.hassClient.getZhaNetworkInfo();
        const devices = await this.hassClient.getZhaDevices();
        result['zigbee'] = {
          channel: networkInfo?.channel ?? null,
          deviceCount: devices.length,
          topology,
          devices: devices.map(d => ({
            ieee: d.ieee,
            name: d.name,
            type: d.device_type,
            manufacturer: d.manufacturer,
            model: d.model,
            lqi: d.lqi,
            rssi: d.rssi,
            available: d.available,
            powerSource: d.power_source,
          })),
        };
      }

      if (includeSet.has('bluetooth')) {
        result['bluetooth'] = await this.hassClient.getBluetoothDevices();
      }

      if (includeSet.has('snmp')) {
        const networkEntities = await this.hassClient.getNetworkEntities();
        result['snmp'] = networkEntities.snmp;
        result['networkMonitoring'] = {
          speedtest: networkEntities.speedtest,
          ping: networkEntities.ping,
          uptime: networkEntities.uptime,
          bandwidth: networkEntities.bandwidth,
        };
      }

      if (includeSet.has('device_trackers')) {
        result['deviceTrackers'] = await this.hassClient.getDeviceTrackers();
      }

      if (includeSet.has('router_entities')) {
        result['routerEntities'] = await this.hassClient.getRouterEntities();
      }

      return this.successResponse('get_homeassistant_data', result, [
        'Home Assistant Daten erfolgreich abgerufen',
        'Nutze full_intelligence_scan für vollständige Analyse mit allen Quellen',
      ]);
    } catch (err) {
      logger.error({ err }, 'Failed to get Home Assistant data');
      return this.errorResponse(
        'get_homeassistant_data',
        `Failed to get Home Assistant data: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  private async handleGetPlacementRecommendations(): Promise<SkillResponse> {
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    const analysis = this.spatialEngine.analyzeAndRecommend(this.meshState);

    const suggestions: string[] = [];
    
    if (analysis.recommendations.length === 0) {
      suggestions.push('Keine Platzierungsempfehlungen - Netzwerk ist gut optimiert');
    } else {
      suggestions.push(`${analysis.summary.criticalIssues} kritische Probleme gefunden`);
      
      for (const rec of analysis.recommendations.slice(0, 3)) {
        suggestions.push(rec.humanReadable.split('\n')[0]);
      }
    }

    return this.successResponse('get_placement_recommendations', {
      recommendations: analysis.recommendations.map(r => ({
        id: r.id,
        type: r.type,
        priority: r.priority,
        target: r.target,
        recommendation: r.recommendation,
        confidence: r.confidence,
        humanReadable: r.humanReadable,
        visualization: r.asciiVisualization,
      })),
      deadZones: analysis.deadZones,
      overlapZones: analysis.overlapZones,
      summary: analysis.summary,
    }, suggestions);
  }

  private async handleSetFloorPlan(params: {
    floor: number;
    name: string;
    imagePath?: string | undefined;
    imageBase64?: string | undefined;
    widthMeters: number;
    heightMeters: number;
  }): Promise<SkillResponse> {
    let result;

    if (params.imageBase64) {
      result = await this.floorPlanManager.setFloorPlanFromBase64({
        floor: params.floor,
        name: params.name,
        imageBase64: params.imageBase64,
        widthMeters: params.widthMeters,
        heightMeters: params.heightMeters,
      });
    } else if (params.imagePath) {
      result = await this.floorPlanManager.setFloorPlan({
        floor: params.floor,
        name: params.name,
        imagePath: params.imagePath,
        widthMeters: params.widthMeters,
        heightMeters: params.heightMeters,
      });
    } else {
      return this.errorResponse('set_floor_plan', 'Entweder imagePath oder imageBase64 muss angegeben werden');
    }

    if (!result.success) {
      return this.errorResponse('set_floor_plan', result.message);
    }

    return this.successResponse('set_floor_plan', {
      floor: params.floor,
      name: params.name,
      configured: true,
      allFloors: this.floorPlanManager.getAllFloors(),
    }, [
      result.message,
      'Nutze get_floor_visualization um die Etage mit Netzwerkdaten anzuzeigen',
    ]);
  }

  private async handleGetFloorVisualization(floor: number): Promise<SkillResponse> {
    if (!this.floorPlanManager.hasFloorPlans()) {
      return this.errorResponse(
        'get_floor_visualization',
        'Keine Grundrisse konfiguriert. Nutze set_floor_plan zuerst.'
      );
    }

    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    const visualization = this.floorPlanManager.generateVisualization(
      floor,
      this.meshState.nodes,
      this.meshState.devices
    );

    if (!visualization) {
      return this.errorResponse(
        'get_floor_visualization',
        `Kein Grundriss für Etage ${floor} konfiguriert. Verfügbare Etagen: ${this.floorPlanManager.getAllFloors().join(', ')}`
      );
    }

    return this.successResponse('get_floor_visualization', {
      floor: visualization.floor,
      floorName: visualization.floorName,
      imageBase64: visualization.imageBase64,
      svgOverlay: visualization.svgOverlay,
      asciiPreview: visualization.asciiPreview,
      nodes: visualization.nodes,
      devices: visualization.devices,
      legend: visualization.legend,
      summary: {
        nodeCount: visualization.nodes.length,
        deviceCount: visualization.devices.length,
        signalZones: visualization.signalZones.length,
      },
    }, [
      `Etage ${floor}: ${visualization.nodes.length} Nodes, ${visualization.devices.length} Geräte`,
      'Das SVG-Overlay kann über das Grundrissbild gelegt werden',
      'asciiPreview zeigt eine Text-Vorschau der Etage',
    ]);
  }

  private async handleGetQuickDiagnosis(): Promise<SkillResponse> {
    const startTime = Date.now();
    
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    const problems = this.problemDetector.analyze(this.meshState, []);
    const health = this.problemDetector.calculateHealthScore(this.meshState, problems);
    const spatialAnalysis = this.spatialEngine.analyzeAndRecommend(this.meshState);

    const criticalProblems = problems.filter(p => p.severity === 'critical');
    const highProblems = problems.filter(p => p.severity === 'error');
    const warnings = problems.filter(p => p.severity === 'warning');

    const quickFixes: Array<{
      priority: number;
      severity: 'critical' | 'high' | 'medium' | 'low';
      problem: string;
      solution: string;
      action: string;
      autoFixable: boolean;
    }> = [];

    for (const problem of criticalProblems) {
      quickFixes.push({
        priority: 1,
        severity: 'critical',
        problem: problem.description,
        solution: problem.recommendation,
        action: problem.autoFixAvailable ? `apply_optimization mit id: ${problem.id}` : 'Manuell beheben',
        autoFixable: problem.autoFixAvailable,
      });
    }

    for (const problem of highProblems) {
      quickFixes.push({
        priority: 2,
        severity: 'high',
        problem: problem.description,
        solution: problem.recommendation,
        action: problem.autoFixAvailable ? `apply_optimization mit id: ${problem.id}` : 'Manuell beheben',
        autoFixable: problem.autoFixAvailable,
      });
    }

    for (const rec of spatialAnalysis.recommendations.slice(0, 3)) {
      quickFixes.push({
        priority: rec.priority === 'critical' ? 1 : rec.priority === 'high' ? 2 : 3,
        severity: rec.priority === 'critical' ? 'critical' : rec.priority === 'high' ? 'high' : 'medium',
        problem: `${rec.target.name}: ${rec.recommendation.reason}`,
        solution: rec.humanReadable.split('\n')[0],
        action: 'Gerät/Node manuell verschieben',
        autoFixable: false,
      });
    }

    quickFixes.sort((a, b) => a.priority - b.priority);

    const status = criticalProblems.length > 0 ? '🔴 KRITISCH' :
                   highProblems.length > 0 ? '🟠 PROBLEME' :
                   warnings.length > 0 ? '🟡 HINWEISE' : '🟢 OPTIMAL';

    const nextSteps: string[] = [];
    
    if (quickFixes.length > 0) {
      nextSteps.push(`🔧 ${quickFixes.length} Probleme gefunden - erste Priorität: ${quickFixes[0].problem.substring(0, 50)}...`);
      if (quickFixes.some(f => f.autoFixable)) {
        nextSteps.push('💡 Einige Probleme können automatisch behoben werden mit apply_optimization');
      }
    } else {
      nextSteps.push('✅ Keine kritischen Probleme - Netzwerk läuft optimal');
    }

    nextSteps.push(`📊 Health Score: ${health.overall}/100 - ${health.overall >= 80 ? 'Gut' : health.overall >= 60 ? 'Verbesserungspotential' : 'Optimierung empfohlen'}`);
    
    if (this.meshState.devices.length > 0) {
      const weakDevices = this.meshState.devices.filter(d => (d.signalStrength ?? -100) < -75);
      if (weakDevices.length > 0) {
        nextSteps.push(`📶 ${weakDevices.length} Geräte mit schwachem Signal - nutze get_placement_recommendations`);
      }
    }

    nextSteps.push('📋 Für detaillierte Analyse: full_intelligence_scan');
    nextSteps.push('🗣️ Für Zusammenfassung an Benutzer: get_environment_summary');

    return this.successResponse('get_quick_diagnosis', {
      status,
      diagnosisTime: `${Date.now() - startTime}ms`,
      healthScore: health.overall,
      summary: {
        criticalCount: criticalProblems.length,
        highCount: highProblems.length,
        warningCount: warnings.length,
        totalDevices: this.meshState.devices.length,
        totalNodes: this.meshState.nodes.length,
      },
      quickFixes: quickFixes.slice(0, 5),
      topPriority: quickFixes[0] ?? null,
    }, nextSteps);
  }

  private async handleGetSwitchStatus(host?: string): Promise<SkillResponse> {
    if (!this.snmpClient.isConfigured()) {
      return this.errorResponse(
        'get_switch_status',
        'Keine SNMP-Geräte konfiguriert. Füge Switches in der Config hinzu.'
      );
    }

    const devices = this.snmpClient.getConfiguredDevices();
    const results: Array<{
      host: string;
      status: Awaited<ReturnType<SnmpClient['getSwitchStatus']>>;
    }> = [];

    const targetDevices = host 
      ? devices.filter(d => d.host === host)
      : devices;

    for (const device of targetDevices) {
      const status = await this.snmpClient.getSwitchStatus(device.host, device.port);
      results.push({ host: device.host, status });
    }

    const successfulResults = results.filter(r => r.status !== null);
    
    if (successfulResults.length === 0) {
      return this.errorResponse(
        'get_switch_status',
        host 
          ? `Switch ${host} nicht erreichbar via SNMP`
          : 'Keine Switches erreichbar via SNMP'
      );
    }

    const suggestions: string[] = [];
    
    for (const r of successfulResults) {
      if (r.status) {
        suggestions.push(`${r.status.name}: ${r.status.activePorts}/${r.status.portCount} Ports aktiv`);
        if (r.status.temperature && r.status.temperature > 60) {
          suggestions.push(`⚠️ ${r.status.name}: Hohe Temperatur (${r.status.temperature}°C)`);
        }
        if (r.status.poeStatus) {
          suggestions.push(`PoE: ${r.status.poeStatus.usedPower}W von ${r.status.poeStatus.totalPower}W`);
        }
      }
    }

    suggestions.push('Nutze get_port_traffic für Details zu einzelnen Ports');

    return this.successResponse('get_switch_status', {
      switches: successfulResults.map(r => r.status),
      summary: {
        totalSwitches: successfulResults.length,
        totalPorts: successfulResults.reduce((sum, r) => sum + (r.status?.portCount ?? 0), 0),
        activePorts: successfulResults.reduce((sum, r) => sum + (r.status?.activePorts ?? 0), 0),
      },
    }, suggestions);
  }

  private async handleGetPortTraffic(host: string, portNumber?: number): Promise<SkillResponse> {
    if (!this.snmpClient.isConfigured()) {
      return this.errorResponse(
        'get_port_traffic',
        'Keine SNMP-Geräte konfiguriert'
      );
    }

    const ports = await this.snmpClient.getSwitchPortDetails(host);
    
    if (ports.length === 0) {
      return this.errorResponse(
        'get_port_traffic',
        `Keine Port-Daten von ${host} erhalten. SNMP-Zugriff prüfen.`
      );
    }

    const filteredPorts = portNumber 
      ? ports.filter(p => p.port === portNumber)
      : ports;

    const activePorts = filteredPorts.filter(p => p.operStatus === 'up');
    const portsWithErrors = filteredPorts.filter(p => 
      p.traffic.rxErrors > 0 || p.traffic.txErrors > 0
    );

    const suggestions: string[] = [
      `${activePorts.length} von ${filteredPorts.length} Ports aktiv`,
    ];

    if (portsWithErrors.length > 0) {
      suggestions.push(`⚠️ ${portsWithErrors.length} Ports mit Fehlern - Kabel/Verbindung prüfen`);
    }

    const highUtilPorts = filteredPorts.filter(p => p.traffic.utilizationPercent > 80);
    if (highUtilPorts.length > 0) {
      suggestions.push(`📊 ${highUtilPorts.length} Ports mit hoher Auslastung (>80%)`);
    }

    suggestions.push('Richte HA-Sensoren ein für kontinuierliches Port-Traffic-Monitoring');

    return this.successResponse('get_port_traffic', {
      host,
      ports: filteredPorts,
      summary: {
        totalPorts: filteredPorts.length,
        activePorts: activePorts.length,
        portsWithErrors: portsWithErrors.length,
        highUtilizationPorts: highUtilPorts.length,
      },
    }, suggestions);
  }

  private async handleGetVlanInfo(host: string): Promise<SkillResponse> {
    const vlans = await this.snmpClient.getVlanInfo(host);
    
    if (vlans.length === 0) {
      return this.errorResponse('get_vlan_info', `Keine VLAN-Daten von ${host}`);
    }

    return this.successResponse('get_vlan_info', {
      host,
      vlans,
      summary: {
        totalVlans: vlans.length,
        vlanIds: vlans.map(v => v.id),
      },
    }, [
      `${vlans.length} VLANs gefunden`,
      'VLAN-Segmentierung verbessert Sicherheit und Performance',
    ]);
  }

  private async handleGetPoEStatus(host: string): Promise<SkillResponse> {
    const poeStatus = await this.snmpClient.getPoEStatus(host);
    
    if (poeStatus.length === 0) {
      return this.errorResponse('get_poe_status', 'Keine PoE-Daten verfügbar (nur MikroTik)');
    }

    const deliveringPorts = poeStatus.filter(p => p.status === 'delivering');
    const totalPower = poeStatus.reduce((sum, p) => sum + p.power, 0);

    return this.successResponse('get_poe_status', {
      host,
      ports: poeStatus,
      summary: {
        totalPorts: poeStatus.length,
        deliveringPorts: deliveringPorts.length,
        totalPowerWatts: totalPower,
      },
    }, [
      `${deliveringPorts.length} Ports liefern PoE`,
      `Gesamtleistung: ${totalPower.toFixed(1)}W`,
    ]);
  }

  private async handleSetPoEEnabled(host: string, port: number, enabled: boolean): Promise<SkillResponse> {
    const success = await this.snmpClient.setPoEEnabled(host, port, enabled);
    
    if (!success) {
      return this.errorResponse('set_poe_enabled', 'PoE-Steuerung fehlgeschlagen');
    }

    return this.successResponse('set_poe_enabled', {
      host,
      port,
      enabled,
      message: `PoE auf Port ${port} ${enabled ? 'aktiviert' : 'deaktiviert'}`,
    }, [
      enabled ? 'Gerät sollte in wenigen Sekunden starten' : 'Gerät wird ausgeschaltet',
    ]);
  }

  private async handleGetRoamingAnalysis(macAddress: string): Promise<SkillResponse> {
    const analysis = this.spatialEngine.getRoamingAnalysis(macAddress);

    return this.successResponse('get_roaming_analysis', {
      macAddress,
      ...analysis,
    }, [
      analysis.recommendation,
      analysis.pingPongCount > 0 ? 'Ping-Pong-Roaming erkannt' : 'Roaming stabil',
    ]);
  }

  private async handleConfigureAlerts(params: {
    webhookUrl?: string | undefined;
    mqttBroker?: string | undefined;
    mqttTopic?: string | undefined;
    minSeverity?: 'info' | 'warning' | 'critical' | undefined;
    cooldownMinutes?: number | undefined;
    enabled?: boolean | undefined;
  }): Promise<SkillResponse> {
    this.alertingService.configure({
      webhookUrl: params.webhookUrl,
      mqttBroker: params.mqttBroker,
      mqttTopic: params.mqttTopic,
      minSeverity: params.minSeverity,
      cooldownMinutes: params.cooldownMinutes,
      enabled: params.enabled ?? true,
    });

    const summary = this.alertingService.getAlertSummary();

    return this.successResponse('configure_alerts', {
      configured: true,
      isEnabled: summary.isEnabled,
      settings: params,
    }, [
      summary.isEnabled ? 'Alerting aktiviert' : 'Alerting konfiguriert aber nicht aktiv',
      params.webhookUrl ? 'Webhook konfiguriert' : 'Kein Webhook',
      params.mqttBroker ? 'MQTT konfiguriert' : 'Kein MQTT',
    ]);
  }

  private async handleGetAlerts(hours?: number): Promise<SkillResponse> {
    const history = this.alertingService.getAlertHistory(hours ?? 24);
    const summary = this.alertingService.getAlertSummary();
    const activeAlerts = this.alertingService.getActiveAlerts();

    return this.successResponse('get_alerts', {
      active: activeAlerts,
      history: history.alerts,
      summary,
    }, [
      `${summary.activeCount} aktive Alerts`,
      summary.criticalCount > 0 ? `${summary.criticalCount} kritische Alerts!` : 'Keine kritischen Alerts',
    ]);
  }
}
