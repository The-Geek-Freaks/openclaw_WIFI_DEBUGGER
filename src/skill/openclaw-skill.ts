import { createChildLogger, logSkillAction, getCurrentLogFile } from '../utils/logger.js';
import { metrics } from '../utils/metrics.js';
import { loadConfigFromEnv, type Config } from '../config/index.js';
import { AsusSshClient } from '../infra/asus-ssh-client.js';
import { HomeAssistantClient } from '../infra/homeassistant-client.js';
import { SnmpClient } from '../infra/snmp-client.js';
import { MeshNodePool } from '../infra/mesh-node-pool.js';
import { NetworkKnowledgeBase } from '../infra/network-knowledge-base.js';
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
import { RouterTweaksChecker } from '../core/router-tweaks-checker.js';
import { RealTriangulationEngine } from '../core/real-triangulation.js';
import { GeoLocationService } from '../core/geo-location-service.js';
import { WallDetector } from '../core/wall-detector.js';
import type { HouseConfig } from '../core/real-triangulation.js';
import type { NodePlacement } from '../types/building.js';
import type { SkillAction, SkillResponse } from './actions.js';
import type { FloorType } from '../types/building.js';
import type { MeshNetworkState } from '../types/network.js';
import type { ZigbeeNetworkState } from '../types/zigbee.js';
import type { OptimizationSuggestion, NetworkHealthScore } from '../types/analysis.js';

const logger = createChildLogger('openclaw-skill');

export class OpenClawAsusMeshSkill {
  private readonly config: Config;
  private readonly sshClient: AsusSshClient;
  private readonly hassClient: HomeAssistantClient;
  private nodePool: MeshNodePool | null = null;
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
  private readonly knowledgeBase: NetworkKnowledgeBase;
  private readonly tweaksChecker: RouterTweaksChecker;
  private readonly realTriangulation: RealTriangulationEngine;
  private readonly geoLocationService: GeoLocationService;
  private readonly wallDetector: WallDetector;
  
  private meshState: MeshNetworkState | null = null;
  private zigbeeState: ZigbeeNetworkState | null = null;
  private pendingOptimizations: Map<string, OptimizationSuggestion> = new Map();
  private initialized: boolean = false;
  private sshConnected: boolean = false;
  private hassConnected: boolean = false;
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
    this.snmpClient = new SnmpClient(this.config.snmp?.devices ?? []);
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
    this.knowledgeBase = new NetworkKnowledgeBase();
    this.tweaksChecker = new RouterTweaksChecker(this.sshClient);
    this.realTriangulation = new RealTriangulationEngine();
    this.geoLocationService = new GeoLocationService();
    this.wallDetector = new WallDetector();
    
    // Connect MeshAnalyzer to RealTriangulationEngine for signal forwarding
    this.meshAnalyzer.setTriangulationEngine(this.realTriangulation);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing OpenClaw ASUS Mesh Skill');
    
    // SSH connection is now LAZY - only connect when an action needs it
    // This allows local-only actions (set_node_position_3d, set_house_config, etc.) to work without SSH
    
    try {
      await this.knowledgeBase.initialize();
      logger.info('Knowledge base loaded');
    } catch (err) {
      logger.warn({ err }, 'Failed to initialize knowledge base - data persistence disabled');
    }

    this.initialized = true;
    logger.info('Skill initialized (SSH connection deferred until needed)');
  }

  /**
   * Ensure SSH is connected. Called lazily by actions that need SSH.
   * @throws Error if SSH connection fails
   */
  private async ensureSshConnected(): Promise<void> {
    if (this.sshConnected) return;
    
    logger.info('Establishing SSH connection (lazy init)');
    try {
      await this.sshClient.connect();
      this.sshConnected = true;
      logger.info('Connected to ASUS router via SSH');
      
      // Initialize MeshNodePool for multi-node scanning
      try {
        this.nodePool = new MeshNodePool(this.config);
        await this.nodePool.initialize();
        this.meshAnalyzer.setNodePool(this.nodePool);
        logger.info({ nodeCount: this.nodePool.getDiscoveredNodes().length }, 'MeshNodePool initialized');
      } catch (err) {
        logger.warn({ err }, 'Failed to initialize MeshNodePool - single-node scanning only');
      }
    } catch (err) {
      logger.error({ err }, 'Failed to connect to ASUS router via SSH');
      throw err;
    }
  }

  /**
   * Ensure Home Assistant is connected. Called lazily by actions that need HA.
   */
  private async ensureHassConnected(): Promise<void> {
    if (this.hassConnected) return;
    
    try {
      await this.hassClient.connect();
      this.hassConnected = true;
      logger.info('Connected to Home Assistant');
    } catch (err) {
      logger.warn({ err }, 'Failed to connect to Home Assistant - Zigbee features limited');
    }
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

    try {
      await this.knowledgeBase.shutdown();
    } catch (err) {
      logger.warn({ err }, 'Error shutting down knowledge base');
    }

    if (this.nodePool) {
      try {
        await this.nodePool.shutdown();
      } catch (err) {
        logger.warn({ err }, 'Error shutting down MeshNodePool');
      }
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
    
    // SIGHUP for config reload (Linus Torvalds recommendation)
    // Note: SIGHUP does not exist on Windows - guard with platform check
    if (process.platform !== 'win32') {
      process.on('SIGHUP', () => {
        logger.info('Received SIGHUP - reloading configuration');
        this.reloadConfig().catch(err => {
          logger.error({ err }, 'Failed to reload config on SIGHUP');
        });
      });
    }
    
    process.on('uncaughtException', (err) => {
      logger.error({ err }, 'Uncaught exception');
      shutdown('uncaughtException').catch(() => process.exit(1));
    });
    process.on('unhandledRejection', (reason) => {
      logger.error({ reason }, 'Unhandled rejection');
    });
  }

  private async reloadConfig(): Promise<void> {
    logger.info('Reloading skill configuration...');
    try {
      await this.knowledgeBase.initialize();
      logger.info('Configuration reloaded successfully');
    } catch (err) {
      logger.error({ err }, 'Config reload failed');
      throw err;
    }
  }

  exportState(): {
    meshState: MeshNetworkState | null;
    zigbeeState: ZigbeeNetworkState | null;
    pendingOptimizations: Array<[string, OptimizationSuggestion]>;
    actionCount: number;
    errorCount: number;
    nodePositions: NodePlacement[];
    houseConfig: HouseConfig | null;
    signalMeasurements: Record<string, Array<{ nodeMac: string; rssi: number; timestamp: string }>>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    propertyData: any;
  } {
    return {
      meshState: this.meshState,
      zigbeeState: this.zigbeeState,
      pendingOptimizations: Array.from(this.pendingOptimizations.entries()),
      actionCount: this.actionCount,
      errorCount: this.errorCount,
      nodePositions: this.realTriangulation.getNodePositions(),
      houseConfig: this.realTriangulation.getHouseConfig(),
      signalMeasurements: this.realTriangulation.exportSignalMeasurements(),
      propertyData: this.geoLocationService.exportPropertyData(),
    };
  }

  importState(state: {
    meshState?: MeshNetworkState | null;
    zigbeeState?: ZigbeeNetworkState | null;
    pendingOptimizations?: Array<[string, OptimizationSuggestion]>;
    actionCount?: number;
    errorCount?: number;
    nodePositions?: NodePlacement[];
    houseConfig?: HouseConfig | null;
    signalMeasurements?: Record<string, Array<{ nodeMac: string; rssi: number; timestamp: string }>>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    propertyData?: any;
  }): void {
    if (state.meshState !== undefined) {
      this.meshState = state.meshState;
    }
    if (state.zigbeeState !== undefined) {
      this.zigbeeState = state.zigbeeState;
    }
    if (state.pendingOptimizations) {
      this.pendingOptimizations = new Map(state.pendingOptimizations);
    }
    if (state.actionCount !== undefined) {
      this.actionCount = state.actionCount;
    }
    if (state.errorCount !== undefined) {
      this.errorCount = state.errorCount;
    }
    // Restore triangulation state (node positions and house config)
    if (state.nodePositions && state.nodePositions.length > 0) {
      this.realTriangulation.setNodePositions(state.nodePositions);
    }
    if (state.houseConfig) {
      this.realTriangulation.setHouseConfig(state.houseConfig);
    }
    // Restore signal measurements AFTER node positions (required for position lookup)
    if (state.signalMeasurements && Object.keys(state.signalMeasurements).length > 0) {
      this.realTriangulation.importSignalMeasurements(state.signalMeasurements);
    }
    // Restore geo location data
    if (state.propertyData) {
      this.geoLocationService.importPropertyData(state.propertyData as Parameters<typeof this.geoLocationService.importPropertyData>[0]);
    }
    const signalStats = this.realTriangulation.getSignalMeasurementCount();
    logger.info({ 
      hasMeshState: !!this.meshState, 
      hasZigbeeState: !!this.zigbeeState,
      pendingOptimizations: this.pendingOptimizations.size,
      nodePositions: state.nodePositions?.length ?? 0,
      hasHouseConfig: !!state.houseConfig,
      signalDevices: signalStats.devices,
      signalMeasurements: signalStats.measurements,
      hasPropertyData: !!state.propertyData,
    }, 'State imported from cache');
  }

  async execute(action: SkillAction): Promise<SkillResponse> {
    if (!this.initialized) {
      return this.errorResponse(action.action, 'Skill not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    const actionParams = 'params' in action ? action.params as Record<string, unknown> : undefined;
    
    // Log action start with proof that TypeScript is running
    logSkillAction(action.action, actionParams, 'started', {
      logFile: getCurrentLogFile(),
      skillVersion: '1.0.0',
      nodeVersion: process.version,
    });

    logger.info({ action: action.action }, 'Executing action');
    this.actionCount++;

    try {
      const result = await this.executeAction(action);
      const durationMs = Date.now() - startTime;
      
      // Record metrics (Kelsey Hightower recommendation)
      metrics.recordAction(action.action, durationMs, result.success);
      
      // Log successful completion
      logSkillAction(action.action, actionParams, 'success', {
        durationMs,
        success: result.success,
      });
      
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.errorCount++;
      
      // Record metrics for failed action
      metrics.recordAction(action.action, durationMs, false);
      
      // Log error
      logSkillAction(action.action, actionParams, 'error', {
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });
      
      logger.error({ err, action: action.action }, 'Action execution failed');
      return this.errorResponse(
        action.action,
        err instanceof Error ? err.message : 'Unknown error'
      );
    }
  }

  private async executeAction(action: SkillAction): Promise<SkillResponse> {
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
        case 'detect_problems':
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
            action.params?.macAddress,
            action.params?.hours
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
          return await this.handleGetRoamingAnalysis(action.params?.macAddress);
        
        case 'configure_alerts':
          return await this.handleConfigureAlerts(action.params);
        
        case 'get_alerts':
          return await this.handleGetAlerts(action.params?.hours);
        
        case 'get_knowledge_stats':
          return this.handleGetKnowledgeStats();
        
        case 'get_known_devices':
          return this.handleGetKnownDevices(action.params?.filter);
        
        case 'mark_device_known':
          return this.handleMarkDeviceKnown(
            action.params.macAddress,
            action.params.customName,
            action.params.deviceType,
            action.params.notes
          );
        
        case 'get_network_history':
          return this.handleGetNetworkHistory(action.params?.limit);
        
        case 'export_knowledge':
          return this.handleExportKnowledge();
        
        case 'check_router_tweaks':
          return await this.handleCheckRouterTweaks();
        
        case 'apply_router_tweak':
          return await this.handleApplyRouterTweak(action.params.tweakId, action.params.confirm);
        
        case 'get_recommended_scripts':
          return await this.handleGetRecommendedScripts();
        
        case 'set_house_config':
          return this.handleSetHouseConfig(action.params as Parameters<typeof this.handleSetHouseConfig>[0]);
        
        case 'get_house_config':
          return this.handleGetHouseConfig();
        
        case 'triangulate_devices':
          return await this.handleTriangulateDevices(action.params?.deviceMac);
        
        case 'get_auto_map':
          return await this.handleGetAutoMap(action.params?.floorNumber);
        
        case 'get_svg_map':
          return this.handleGetSvgMap(action.params?.floorNumber);
        
        case 'generate_full_house_map':
          return await this.handleGenerateFullHouseMap(action.params);
        
        case 'set_node_position_3d':
          return this.handleSetNodePosition3D(action.params as Parameters<typeof this.handleSetNodePosition3D>[0]);
        
        case 'record_signal_measurement':
          return this.handleRecordSignalMeasurement(action.params);
        
        case 'get_log_info':
          return this.handleGetLogInfo();
        
        case 'get_metrics':
          return this.handleGetMetrics();
        
        case 'reset_circuit_breaker':
          return this.handleResetCircuitBreaker();
        
        case 'set_location':
          return await this.handleSetLocation(action.params);
        
        case 'generate_floor_plans':
          return this.handleGenerateFloorPlans(action.params);
        
        case 'get_property_info':
          return this.handleGetPropertyInfo();
        
        case 'fetch_map_image':
          return await this.handleFetchMapImage(action.params?.zoom);
        
        case 'detect_walls':
          return this.handleDetectWalls(action.params?.floorNumber);
        
        default:
          return this.errorResponse('unknown', 'Unknown action');
      }
  }

  private async handleScanNetwork(): Promise<SkillResponse> {
    await this.ensureSshConnected();
    this.meshState = await this.meshAnalyzer.scan();
    
    this.persistScanData();
    
    const suggestions: string[] = [
      '📊 get_network_health - Netzwerk-Gesundheit prüfen',
      '📋 get_device_list - Alle Geräte auflisten',
      '⚠️ get_problems - Erkannte Probleme anzeigen',
      '📡 get_channel_scan - Kanal-Interferenz analysieren (für Speed-Optimierung)',
      '💡 get_optimization_suggestions - Optimierungsvorschläge',
    ];

    return this.successResponse('scan_network', {
      nodes: this.meshState.nodes.length,
      devices: this.meshState.devices.length,
      wifiSettings: this.meshState.wifiSettings,
      lastUpdated: this.meshState.lastUpdated,
    }, suggestions);
  }

  private persistScanData(): void {
    if (!this.meshState) return;

    try {
      for (const node of this.meshState.nodes) {
        this.knowledgeBase.updateMeshNode(node);
      }

      for (const device of this.meshState.devices) {
        this.knowledgeBase.updateDevice(device);
      }

      const healthScore = this.problemDetector.calculateHealthScore(
        this.meshState,
        this.problemDetector.analyze(this.meshState, this.meshAnalyzer.getConnectionEvents())
      );

      this.knowledgeBase.addSnapshot(
        this.meshState.nodes,
        this.meshState.devices,
        this.meshState.wifiSettings,
        healthScore.overall,
        this.zigbeeState?.channel,
        this.zigbeeState?.devices.length
      );

      logger.debug({ 
        devices: this.meshState.devices.length,
        nodes: this.meshState.nodes.length,
      }, 'Scan data persisted to knowledge base');
    } catch (err) {
      logger.warn({ err }, 'Failed to persist scan data');
    }
  }

  private async handleGetNetworkHealth(): Promise<SkillResponse> {
    await this.ensureSshConnected();
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
    await this.ensureSshConnected();
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

    const suggestions: string[] = [
      '🔍 get_device_details(macAddress) - Details zu einem Gerät',
      '📶 get_connection_stability(macAddress) - Verbindungsstabilität prüfen',
      '🏷️ mark_device_known(macAddress) - Gerät benennen und kategorisieren',
    ];

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
    }, suggestions);
  }

  private async handleGetDeviceDetails(macAddress: string): Promise<SkillResponse> {
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    const normalizedMac = macAddress.toUpperCase().replace(/[:-]/g, ':');
    const device = this.meshState.devices.find(d => 
      d.macAddress.toUpperCase().replace(/[:-]/g, ':') === normalizedMac
    );
    if (!device) {
      return this.successResponse('get_device_details', {
        found: false,
        macAddress,
        message: `Gerät ${macAddress} nicht im Netzwerk gefunden`,
        knownDevices: this.meshState.devices.length,
        hint: 'Führe scan_network aus um aktuelle Geräte zu laden',
      }, [
        '🔄 scan_network - Netzwerk neu scannen',
        '📋 get_device_list - Alle bekannten Geräte anzeigen',
      ]);
    }

    const signalQuality = this.meshAnalyzer.getDeviceSignalQuality(macAddress);
    const events = this.meshAnalyzer.getConnectionEvents(macAddress);

    const suggestions: string[] = [
      '📶 get_device_signal_history - Signal-Verlauf anzeigen',
      '📊 get_connection_stability - Verbindungsstabilität prüfen',
      '🏷️ mark_device_known - Gerät benennen',
    ];

    return this.successResponse('get_device_details', {
      device,
      signalQuality,
      recentEvents: events.slice(-10),
    }, suggestions);
  }

  private async handleGetDeviceSignalHistory(
    macAddress: string,
    hours?: number
  ): Promise<SkillResponse> {
    const history = this.meshAnalyzer.getSignalHistory(macAddress);
    
    const cutoff = Date.now() - (hours ?? 24) * 60 * 60 * 1000;
    const filtered = history.filter(m => m.timestamp.getTime() > cutoff);

    const suggestions: string[] = [
      '📊 get_connection_stability - Stabilitätsanalyse',
      '🔍 get_device_details - Gerätedetails anzeigen',
    ];

    return this.successResponse('get_device_signal_history', {
      macAddress,
      measurements: filtered,
      count: filtered.length,
    }, suggestions);
  }

  private async handleGetMeshNodes(): Promise<SkillResponse> {
    await this.ensureSshConnected();
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    const suggestions: string[] = [
      '🏠 set_house_config - Haus-Layout für Triangulation konfigurieren',
      '📍 set_node_position_3d - Node-Position setzen (für jeden Node)',
      '📐 triangulate_devices - Geräte-Positionen berechnen',
      '🗺️ get_auto_map - Auto-generierte Karte anzeigen',
    ];

    return this.successResponse('get_mesh_nodes', {
      nodes: this.meshState.nodes,
    }, suggestions);
  }

  private async handleGetWifiSettings(): Promise<SkillResponse> {
    await this.ensureSshConnected();
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    const suggestions: string[] = [
      '📡 set_wifi_channel - Kanal ändern',
      '🔧 check_router_tweaks - Router-Optimierungen prüfen',
      '📊 get_channel_scan - Kanal-Interferenz analysieren',
    ];

    return this.successResponse('get_wifi_settings', {
      settings: this.meshState.wifiSettings,
    }, suggestions);
  }

  private async handleSetWifiChannel(
    band: '2.4GHz' | '5GHz',
    channel: number
  ): Promise<SkillResponse> {
    await this.ensureSshConnected();
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

    const suggestions: string[] = [];
    const autoFixable = problems.filter(p => p.autoFixAvailable);
    if (autoFixable.length > 0) {
      suggestions.push(`💡 ${autoFixable.length} Probleme können automatisch behoben werden - get_optimization_suggestions`);
    }
    if (problems.some(p => p.category === 'frequency_overlap')) {
      suggestions.push('📡 get_frequency_conflicts - WiFi/Zigbee Konflikte analysieren');
    }
    if (problems.some(p => p.category === 'signal_weakness')) {
      suggestions.push('🗺️ get_heatmap - Signal-Heatmap für Problemzonen');
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
    }, suggestions);
  }

  private async handleGetOptimizationSuggestions(): Promise<SkillResponse> {
    await this.ensureSshConnected();
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    const wifiSuggestions = await this.frequencyOptimizer.generateOptimizations(
      this.meshState,
      this.zigbeeState ?? undefined
    );

    const apModeSuggestions = await this.frequencyOptimizer.generateApModeOptimizations();
    
    const allSuggestions = [...apModeSuggestions, ...wifiSuggestions]
      .sort((a, b) => b.priority - a.priority);

    this.pendingOptimizations.clear();
    for (const s of allSuggestions) {
      this.pendingOptimizations.set(s.id, s);
    }

    const operationMode = apModeSuggestions.length > 0 ? 'ap' : 'router';

    const responseSuggestions: string[] = [];
    
    // Warnung wenn full_intelligence_scan nicht ausgeführt wurde
    const lastScan = this.networkIntelligence.getLastScanResult();
    if (!lastScan) {
      responseSuggestions.push('⚠️ Tipp: full_intelligence_scan liefert bessere Ergebnisse (inkl. Zigbee, SNMP, Nachbar-Netze)');
    }
    
    if (allSuggestions.length > 0) {
      responseSuggestions.push('✅ apply_optimization(suggestionId, confirm=true) - Optimierung anwenden');
    }

    return this.successResponse('get_optimization_suggestions', {
      operationMode,
      count: allSuggestions.length,
      apModeOptimizations: apModeSuggestions.length,
      suggestions: allSuggestions.map(s => ({
        id: s.id,
        priority: s.priority,
        category: s.category,
        description: s.description,
        expectedImprovement: s.expectedImprovement,
        riskLevel: s.riskLevel,
      })),
    }, responseSuggestions);
  }

  private async handleApplyOptimization(
    suggestionId: string,
    confirm: boolean
  ): Promise<SkillResponse> {
    await this.ensureSshConnected();
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

    let success: boolean;
    let needsRestart = false;
    
    if (suggestionId.startsWith('ap-')) {
      success = await this.frequencyOptimizer.applyApModeOptimization(suggestion);
    } else {
      success = await this.frequencyOptimizer.applyAndRestart(suggestion);
      needsRestart = true;
    }
    
    if (success) {
      this.pendingOptimizations.delete(suggestionId);
    }

    const followUpSuggestions = success ? [
      '🔄 Neuen Netzwerk-Scan durchführen um Verbesserungen zu messen (scan_network)',
      '📊 Health Score neu berechnen (get_network_health)',
      '⚡ Speed/Latency Benchmark ausführen mit iPerf3 (run_benchmark)',
      '📶 Signal-Stärke aller Geräte messen (get_device_list mit signal data)',
      '🗺️ Signal-Heatmap generieren für visuelle Analyse (get_heatmap)',
      '📍 Räumliche Platzierungsempfehlungen abrufen (get_placement_recommendations)',
      '📐 Triangulationsdaten für Geräte-Positionierung sammeln (get_device_positions)',
      '🏠 Grundriss konfigurieren mit Raum-JPGs für bessere Visualisierung (set_floor_plan)',
    ] : [];

    return this.successResponse('apply_optimization', {
      suggestionId,
      applied: success,
      requiresReboot: suggestionId.startsWith('ap-'),
      message: success 
        ? needsRestart 
          ? 'Optimization applied and wireless restarted' 
          : 'Optimization applied - reboot router for full effect'
        : 'Failed to apply optimization',
      nextSteps: success ? {
        recommended: [
          { action: 'scan_network', reason: 'Verify improvements after optimization' },
          { action: 'get_network_health', reason: 'Compare health score before/after' },
          { action: 'run_benchmark', reason: 'Measure speed/latency with iPerf3 before/after' },
        ],
        telemetry: [
          { action: 'get_device_list', reason: 'Collect signal strength for all devices' },
          { action: 'get_channel_scan', reason: 'Analyze channel congestion levels' },
          { action: 'get_frequency_conflicts', reason: 'Check WiFi/Zigbee interference' },
        ],
        visualization: [
          { action: 'get_heatmap', reason: 'Visualize signal coverage changes' },
          { action: 'get_floor_visualization', reason: 'See devices on floor plan' },
        ],
        spatial: [
          { action: 'get_placement_recommendations', reason: 'Optimize device/node positions' },
          { action: 'set_floor_plan', reason: 'Upload room images for spatial mapping' },
          { action: 'get_roaming_analysis', reason: 'Check client roaming behavior' },
        ],
        askUser: [
          'Soll ich einen Verification-Scan durchführen?',
          'Möchtest du einen Speed-Test (iPerf3) ausführen?',
          'Soll ich Signal-Telemetrie für alle Geräte sammeln?',
          'Möchtest du eine Heatmap sehen?',
          'Soll ich Triangulationsdaten sammeln für räumliche Empfehlungen?',
          'Hast du Grundriss-Bilder (JPG) die ich für die Raum-Map nutzen kann?',
        ],
      } : undefined,
    }, followUpSuggestions);
  }

  private async handleScanZigbee(): Promise<SkillResponse> {
    await this.ensureHassConnected();
    this.zigbeeState = await this.zigbeeAnalyzer.scan();

    try {
      for (const device of this.zigbeeState.devices) {
        this.knowledgeBase.updateZigbeeDevice(device);
      }
      logger.debug({ count: this.zigbeeState.devices.length }, 'Zigbee devices persisted');
    } catch (err) {
      logger.warn({ err }, 'Failed to persist Zigbee devices');
    }

    const suggestions: string[] = [
      '📡 get_frequency_conflicts - WiFi/Zigbee Interferenz prüfen',
      '🔧 get_zigbee_devices - Alle Zigbee-Geräte mit Health-Status',
      '🧠 full_intelligence_scan(targets=["protect_zigbee"]) - Zigbee-optimierte Analyse',
    ];

    return this.successResponse('scan_zigbee', {
      channel: this.zigbeeState.channel,
      deviceCount: this.zigbeeState.devices.length,
      stats: this.zigbeeAnalyzer.getNetworkStats(),
    }, suggestions);
  }

  private async handleGetZigbeeDevices(): Promise<SkillResponse> {
    await this.ensureHassConnected();
    if (!this.zigbeeState) {
      this.zigbeeState = await this.zigbeeAnalyzer.scan();
    }

    const health = this.zigbeeAnalyzer.getDeviceHealth();

    const suggestions: string[] = [
      '📡 get_frequency_conflicts - WiFi/Zigbee Konflikte prüfen',
      '📊 scan_zigbee - Zigbee-Netzwerk neu scannen',
    ];

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
    }, suggestions);
  }

  private async handleGetFrequencyConflicts(): Promise<SkillResponse> {
    await this.ensureSshConnected();
    await this.ensureHassConnected();
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }
    if (!this.zigbeeState) {
      this.zigbeeState = await this.zigbeeAnalyzer.scan();
    }

    const conflicts = this.zigbeeAnalyzer.analyzeFrequencyConflicts(
      this.meshState.wifiSettings
    );

    const hasConflicts = conflicts.some(c => c.conflictSeverity !== 'none');
    const suggestions: string[] = [];
    
    if (hasConflicts) {
      suggestions.push('🧠 full_intelligence_scan(targets=["protect_zigbee"]) - Optimierung berechnen');
      suggestions.push('💡 get_optimization_suggestions - Kanal-Änderungen vorschlagen');
    } else {
      suggestions.push('✅ Keine Konflikte - WiFi und Zigbee arbeiten harmonisch');
    }

    return this.successResponse('get_frequency_conflicts', {
      conflicts,
      hasConflicts,
    }, suggestions);
  }

  private async handleGetSpatialMap(): Promise<SkillResponse> {
    await this.ensureSshConnected();
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

    return this.successResponse('get_spatial_map', spatialMap, [
      '📍 set_node_position_3d - Node-Position setzen',
      '📰 triangulate_devices - Geräte triangulieren',
    ]);
  }

  private async handleSetNodePosition(params: {
    nodeId: string;
    x: number;
    y: number;
    z?: number;
    room?: string;
  }): Promise<SkillResponse> {
    // Sync with legacy triangulation engine
    this.triangulation.setNodePosition(
      params.nodeId,
      params.nodeId,
      params.x,
      params.y,
      params.z ?? 0
    );

    // Also sync with real triangulation engine for triangulate_devices to work
    this.realTriangulation.setNodePosition({
      nodeId: params.nodeId,
      nodeMac: params.nodeId,
      floor: 'ground',
      floorNumber: 0,
      position: { x: params.x, y: params.y, z: params.z ?? 0 },
      coverageRadius2g: 15,
      coverageRadius5g: 10,
      isOutdoor: false,
    });

    const allPositions = this.realTriangulation.getNodePositions();

    return this.successResponse('set_node_position', {
      nodeId: params.nodeId,
      position: { x: params.x, y: params.y, z: params.z ?? 0 },
      room: params.room,
      totalNodesPositioned: allPositions.length,
    }, [
      allPositions.length < 3 
        ? `📍 ${3 - allPositions.length} weitere Nodes positionieren für Triangulation`
        : '✅ Genug Nodes für Triangulation - jetzt triangulate_devices ausführen',
      '📰 triangulate_devices - Wenn alle Nodes gesetzt',
    ]);
  }

  private async handleGetConnectionStability(
    macAddress?: string,
    hours?: number
  ): Promise<SkillResponse> {
    if (!macAddress) {
      // Return overall network stability summary
      const devices = this.meshState?.devices ?? [];
      const reports = devices.slice(0, 10).map(d => {
        const events = this.meshAnalyzer.getConnectionEvents(d.macAddress);
        return {
          macAddress: d.macAddress,
          hostname: d.hostname,
          eventCount: events.length,
        };
      });
      return this.successResponse('get_connection_stability', {
        message: 'Gib macAddress an für detaillierten Report',
        deviceCount: devices.length,
        sampleDevices: reports,
      }, [
        '📋 get_device_list - Alle Geräte anzeigen',
        '📶 get_connection_stability {"macAddress":"XX:XX:XX:XX:XX:XX"} - Details',
      ]);
    }

    const events = this.meshAnalyzer.getConnectionEvents(macAddress);
    const report = this.problemDetector.generateStabilityReport(
      macAddress,
      events,
      hours ?? 24
    );

    return this.successResponse('get_connection_stability', report, [
      '📶 get_device_signal_history - Signal-Verlauf',
      '📈 get_roaming_analysis - Roaming-Analyse',
    ]);
  }

  private async handleRestartWireless(confirm: boolean): Promise<SkillResponse> {
    await this.ensureSshConnected();
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
    }, ['⏱️ Warte 30 Sekunden, dann scan_network für Verifikation']);
  }

  private async handleGetChannelScan(
    band?: '2.4GHz' | '5GHz' | 'both'
  ): Promise<SkillResponse> {
    await this.ensureSshConnected();
    const results = [];

    if (!band || band === 'both' || band === '2.4GHz') {
      results.push(...await this.frequencyOptimizer.scanChannels('2g'));
    }
    if (!band || band === 'both' || band === '5GHz') {
      results.push(...await this.frequencyOptimizer.scanChannels('5g'));
    }

    const suggestions: string[] = [
      '💡 get_optimization_suggestions - Beste Kanäle berechnen',
      '📊 get_network_health - Gesundheits-Score prüfen',
    ];

    return this.successResponse('get_channel_scan', {
      channels: results,
    }, suggestions);
  }

  private async handleScanRogueIot(): Promise<SkillResponse> {
    await this.ensureSshConnected();
    const result = await this.iotDetector.scanForRogueIoTNetworks();

    const suggestions: string[] = [
      '🛡️ Unbekannte IoT-Netze können Sicherheitsrisiken sein',
      '🔍 get_device_list - Alle Netzwerk-Geräte prüfen',
    ];

    return this.successResponse('scan_rogue_iot', {
      rogueNetworks: result.rogueNetworks.length,
      networks: result.rogueNetworks,
      suggestedActions: result.suggestedActions,
    }, suggestions);
  }

  private async handleGetHeatmap(floor?: number): Promise<SkillResponse> {
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    // Inject node placements from real triangulation engine
    const nodePositions = this.realTriangulation.getNodePositions();
    if (nodePositions.length > 0) {
      this.heatmapGenerator.setNodePlacements(nodePositions);
    }

    const heatmap = this.heatmapGenerator.generateFloorHeatmap(floor ?? 0);

    const deviceCount = this.meshState?.devices?.length ?? 0;
    const devicesWithSignal = this.meshState?.devices?.filter(d => d.signalStrength !== undefined).length ?? 0;
    const telemetryQuality = deviceCount > 0 ? Math.round((devicesWithSignal / deviceCount) * 100) : 0;

    const suggestions: string[] = [];
    if (telemetryQuality < 50) {
      suggestions.push('⚠️ Wenig Signal-Telemetrie verfügbar - führe scan_network durch für bessere Daten');
    }
    if (deviceCount < 5) {
      suggestions.push('📶 Mehr Geräte-Messungen verbessern die Heatmap-Genauigkeit');
    }
    suggestions.push('📍 Für räumliche Analyse: get_placement_recommendations');
    suggestions.push('🗺️ get_auto_map - ASCII-Karte der Geräte-Positionen');
    suggestions.push('🖼️ set_floor_plan - Grundriss-JPG hochladen für visuelle Karte');

    return this.successResponse('get_heatmap', {
      ...heatmap,
      telemetryStats: {
        totalDevices: deviceCount,
        devicesWithSignalData: devicesWithSignal,
        telemetryQuality: `${telemetryQuality}%`,
        recommendation: telemetryQuality < 70 
          ? 'Mehr Signal-Messungen sammeln für genauere Heatmap'
          : 'Gute Telemetrie-Abdeckung',
      },
    }, suggestions);
  }

  private async handleRunBenchmark(): Promise<SkillResponse> {
    await this.ensureSshConnected();
    const result = await this.benchmarkEngine.runFullBenchmark();

    const suggestions: string[] = [
      '📊 get_network_health - Vergleiche mit Gesundheits-Score',
      '📈 get_optimization_suggestions - Weitere Verbesserungen',
    ];

    return this.successResponse('run_benchmark', {
      id: result.id,
      duration: result.duration,
      tests: result.tests,
      timestamp: result.timestamp,
    }, suggestions);
  }

  private async handleSyncMeshSettings(
    channel2g?: number,
    channel5g?: number
  ): Promise<SkillResponse> {
    await this.ensureSshConnected();
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

    const suggestions = changes.length > 0 
      ? ['🔄 restart_wireless(confirm=true) - Änderungen anwenden']
      : [];

    return this.successResponse('sync_mesh_settings', {
      changes,
      message: changes.length > 0 
        ? 'Settings synced. Restart wireless to apply.' 
        : 'No changes specified',
    }, suggestions);
  }

  private async handleAnalyzeNetworkTopology(): Promise<SkillResponse> {
    await this.ensureSshConnected();
    const topology = await this.topologyAnalyzer.discoverTopology();

    const suggestions: string[] = [
      '📊 get_switch_status - Switch-Details abrufen',
      '🔌 get_port_traffic - Port-Traffic analysieren',
    ];

    return this.successResponse('analyze_network_topology', {
      devices: topology.devices.length,
      links: topology.links.length,
      bottlenecks: topology.bottlenecks,
      problemDevices: topology.problemDevices,
      overallHealth: topology.overallHealthScore,
      recommendations: topology.recommendations,
    }, suggestions);
  }

  private async handleFullIntelligenceScan(
    targets?: Array<'minimize_interference' | 'maximize_throughput' | 'balance_coverage' | 'protect_zigbee' | 'reduce_neighbor_overlap' | 'improve_roaming'>
  ): Promise<SkillResponse> {
    await this.ensureSshConnected();
    await this.ensureHassConnected();
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

    const suggestions: string[] = [
      '📊 get_optimization_suggestions - Optimierungen abrufen',
      '✅ apply_optimization - Empfehlungen anwenden',
    ];

    return this.successResponse('get_environment_summary', {
      summary,
      lastScanTime: lastResult?.endTime?.toISOString() ?? null,
      phase: this.networkIntelligence.getCurrentPhase(),
    }, suggestions);
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

  private errorResponse(action: string, error: string, suggestions?: string[]): SkillResponse {
    this.errorCount++;
    
    // Generate helpful suggestions based on error type
    const autoSuggestions: string[] = suggestions ?? [];
    
    if (error.includes('not found')) {
      autoSuggestions.push('🔄 scan_network - Netzwerk neu scannen');
      autoSuggestions.push('📋 get_device_list - Verfügbare Geräte auflisten');
    }
    if (error.includes('not configured') || error.includes('not initialized')) {
      autoSuggestions.push('⚙️ Konfiguration prüfen (Env-Variablen)');
      autoSuggestions.push('📖 README.md für Setup-Anleitung');
    }
    if (error.includes('SNMP')) {
      autoSuggestions.push('📡 SNMP_DEVICES Umgebungsvariable setzen');
    }
    if (error.includes('Home Assistant')) {
      autoSuggestions.push('🏠 HASS_URL und HASS_TOKEN Umgebungsvariablen setzen');
    }
    if (error.includes('SSH') || error.includes('circuit breaker')) {
      autoSuggestions.push('🔌 Router-Verbindung prüfen');
      autoSuggestions.push('🔄 reset_circuit_breaker - SSH-Verbindung zurücksetzen');
    }
    
    return {
      success: false,
      action,
      error,
      suggestions: autoSuggestions.length > 0 ? autoSuggestions : undefined,
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
    await this.ensureSshConnected();
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
      // Ohne Bild: Erstelle leeren Grundriss mit Dimensionen
      result = this.floorPlanManager.setFloorPlanEmpty({
        floor: params.floor,
        name: params.name,
        widthMeters: params.widthMeters,
        heightMeters: params.heightMeters,
      });
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
      return this.successResponse('get_floor_visualization', {
        configured: false,
        floor,
        message: 'Keine Grundrisse konfiguriert',
        hint: 'Nutze set_floor_plan um einen Grundriss anzulegen',
      }, [
        '📐 set_floor_plan {"floor":0,"name":"EG","widthMeters":10,"heightMeters":8}',
        '🗺️ get_svg_map - Alternative Visualisierung ohne Grundriss',
      ]);
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
    await this.ensureSshConnected();
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
      return this.successResponse('get_switch_status', {
        configured: false,
        message: 'Keine SNMP-Geräte konfiguriert',
        hint: 'Füge Switches in der Config hinzu um Switch-Status abzufragen',
        configExample: {
          snmp: {
            devices: [
              { host: '192.168.178.10', community: 'public', port: 161 }
            ]
          }
        }
      }, [
        '⚙️ SNMP-Config in ~/.openclaw/config.json hinzufügen',
        '📋 get_device_list - Netzwerkgeräte ohne SNMP anzeigen',
      ]);
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
      return this.successResponse('get_port_traffic', {
        configured: false,
        message: 'Keine SNMP-Geräte konfiguriert',
        hint: 'Füge Switches in der Config hinzu um Port-Traffic abzufragen',
      }, [
        '⚙️ SNMP-Config in ~/.openclaw/config.json hinzufügen',
        '📊 get_network_health - Netzwerk-Status ohne SNMP',
      ]);
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

  private async handleGetRoamingAnalysis(macAddress?: string): Promise<SkillResponse> {
    if (!macAddress) {
      // Return roaming summary for all devices
      const devices = this.meshState?.devices ?? [];
      return this.successResponse('get_roaming_analysis', {
        message: 'Gib macAddress an für detaillierte Roaming-Analyse',
        deviceCount: devices.length,
        hint: 'get_roaming_analysis {"macAddress":"XX:XX:XX:XX:XX:XX"}',
      }, [
        '📋 get_device_list - Alle Geräte anzeigen',
      ]);
    }

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

  private handleGetKnowledgeStats(): SkillResponse {
    const stats = this.knowledgeBase.getStats();

    return this.successResponse('get_knowledge_stats', {
      ...stats,
      suggestions: stats.totalDevices > 0 && stats.knownDevices === 0
        ? ['Markiere bekannte Geräte mit mark_device_known für bessere Übersicht']
        : [],
    });
  }

  private handleGetKnownDevices(filter?: 'all' | 'known' | 'unknown'): SkillResponse {
    let devices;
    switch (filter) {
      case 'known':
        devices = this.knowledgeBase.getKnownDevices();
        break;
      case 'unknown':
        devices = this.knowledgeBase.getUnknownDevices();
        break;
      default:
        devices = this.knowledgeBase.getAllDevices();
    }

    return this.successResponse('get_known_devices', {
      count: devices.length,
      devices: devices.map(d => ({
        mac: d.macAddress,
        name: d.customName ?? d.hostnames[0] ?? d.macAddress,
        type: d.deviceType ?? 'unknown',
        vendor: d.vendor,
        isKnown: d.isKnown,
        firstSeen: d.firstSeen,
        lastSeen: d.lastSeen,
        avgSignal: d.avgSignalStrength,
        tags: d.tags,
        notes: d.notes,
      })),
    });
  }

  private handleMarkDeviceKnown(
    macAddress: string,
    customName?: string,
    deviceType?: 'router' | 'switch' | 'ap' | 'computer' | 'phone' | 'tablet' | 'iot' | 'smart_home' | 'media' | 'gaming' | 'unknown',
    notes?: string
  ): SkillResponse {
    const success = this.knowledgeBase.markDeviceAsKnown(macAddress, customName, deviceType, notes);

    if (!success) {
      return this.errorResponse('mark_device_known', `Device ${macAddress} not found in knowledge base`);
    }

    return this.successResponse('mark_device_known', {
      macAddress,
      customName,
      deviceType,
      marked: true,
    }, ['📝 get_known_devices - Alle bekannten Geräte anzeigen']);
  }

  private handleGetNetworkHistory(limit?: number): SkillResponse {
    const snapshots = this.knowledgeBase.getSnapshots(limit ?? 10);

    return this.successResponse('get_network_history', {
      count: snapshots.length,
      snapshots: snapshots.map(s => ({
        timestamp: s.timestamp,
        deviceCount: s.deviceCount,
        onlineDevices: s.onlineDevices,
        healthScore: s.healthScore,
        meshNodes: s.meshNodes.length,
        zigbeeChannel: s.zigbeeChannel,
        zigbeeDevices: s.zigbeeDeviceCount,
      })),
    });
  }

  private handleExportKnowledge(): SkillResponse {
    const knowledge = this.knowledgeBase.exportKnowledge();

    if (!knowledge) {
      return this.errorResponse('export_knowledge', 'Knowledge base not initialized');
    }

    return this.successResponse('export_knowledge', {
      networkId: knowledge.networkId,
      networkName: knowledge.networkName,
      createdAt: knowledge.createdAt,
      updatedAt: knowledge.updatedAt,
      stats: {
        devices: Object.keys(knowledge.devices).length,
        meshNodes: Object.keys(knowledge.meshNodes).length,
        snmpDevices: Object.keys(knowledge.snmpDevices).length,
        zigbeeDevices: Object.keys(knowledge.zigbeeDevices).length,
        snapshots: knowledge.snapshots.length,
        optimizations: knowledge.optimizationHistory.length,
      },
      devices: knowledge.devices,
      meshNodes: knowledge.meshNodes,
      snmpDevices: knowledge.snmpDevices,
      zigbeeDevices: knowledge.zigbeeDevices,
    });
  }

  private async handleCheckRouterTweaks(): Promise<SkillResponse> {
    await this.ensureSshConnected();
    const report = await this.tweaksChecker.checkAllTweaks();

    const suggestions = report.topRecommendations.map(r => 
      `[${r.tweak.category}] ${r.tweak.name}: ${r.recommendation}`
    );

    if (report.recommendedScripts.length > 0) {
      suggestions.push(
        `Empfohlene Merlin Scripts: ${report.recommendedScripts.map(s => s.name).join(', ')}`
      );
    }

    return this.successResponse('check_router_tweaks', {
      overallScore: report.overallScore,
      firmwareVersion: report.firmwareVersion,
      isMerlin: report.isMerlin,
      isAiMesh: report.isAiMesh,
      nodeCount: report.nodeCount,
      categories: report.categories,
      tweaksChecked: report.results.length,
      optimalCount: report.results.filter(r => r.status === 'optimal').length,
      suboptimalCount: report.results.filter(r => r.status === 'suboptimal').length,
      topRecommendations: report.topRecommendations.map(r => ({
        id: r.tweak.id,
        name: r.tweak.name,
        category: r.tweak.category,
        risk: r.tweak.risk,
        status: r.status,
        currentValues: r.currentValues,
        optimalValues: r.optimalValues,
        recommendation: r.recommendation,
        canAutoApply: r.canAutoApply,
        impact: r.impactDescription,
        source: r.tweak.source,
      })),
      installedScripts: report.installedScripts,
      recommendedScripts: report.recommendedScripts,
    }, suggestions);
  }

  private async handleApplyRouterTweak(tweakId: string, confirm: boolean): Promise<SkillResponse> {
    const result = await this.tweaksChecker.applyTweak(tweakId, confirm);

    if (!result.success) {
      return this.errorResponse('apply_router_tweak', result.message);
    }

    const suggestions: string[] = [
      '🔄 Netzwerk-Scan durchführen um Auswirkungen zu prüfen (scan_network)',
      '📊 Health Score neu berechnen (get_network_health)',
      '⚡ Speed/Latency Benchmark mit iPerf3 ausführen (run_benchmark)',
      '📶 Signal-Telemetrie aller Geräte sammeln (get_device_list)',
      '🗺️ Heatmap generieren für Signal-Visualisierung (get_heatmap)',
      '📍 Räumliche Platzierungsempfehlungen abrufen (get_placement_recommendations)',
    ];
    
    if (result.requiresReboot) {
      suggestions.unshift('⚠️ Router-Neustart erforderlich für volle Wirkung');
    }

    return this.successResponse('apply_router_tweak', {
      tweakId,
      applied: true,
      requiresReboot: result.requiresReboot,
      message: result.message,
      nextSteps: {
        recommended: [
          { action: 'scan_network', reason: 'Verify tweak impact on network' },
          { action: 'get_network_health', reason: 'Check health score improvement' },
          { action: 'run_benchmark', reason: 'Measure speed/latency with iPerf3' },
        ],
        telemetry: [
          { action: 'get_device_list', reason: 'Collect signal strength for all devices' },
          { action: 'get_channel_scan', reason: 'Analyze channel congestion' },
          { action: 'get_frequency_conflicts', reason: 'Check interference levels' },
        ],
        visualization: [
          { action: 'get_heatmap', reason: 'Visualize signal changes' },
          { action: 'get_floor_visualization', reason: 'See coverage on floor plan' },
        ],
        spatial: [
          { action: 'get_placement_recommendations', reason: 'Optimize device positioning' },
          { action: 'get_roaming_analysis', reason: 'Analyze client handoff behavior' },
        ],
        askUser: [
          'Soll ich einen Verification-Scan durchführen?',
          'Möchtest du einen Speed-Test (iPerf3) ausführen?',
          'Soll ich Signal-Telemetrie für alle Geräte sammeln?',
          'Möchtest du weitere Tweaks anwenden?',
          'Soll ich eine Heatmap erstellen?',
          'Möchtest du Triangulationsdaten für räumliche Empfehlungen sammeln?',
        ],
      },
    }, suggestions);
  }

  private async handleGetRecommendedScripts(): Promise<SkillResponse> {
    await this.ensureSshConnected();
    const report = await this.tweaksChecker.checkAllTweaks();

    const allScripts = this.tweaksChecker.getMerlinScripts();

    return this.successResponse('get_recommended_scripts', {
      isMerlin: report.isMerlin,
      installedScripts: report.installedScripts,
      recommendedScripts: report.recommendedScripts,
      allAvailableScripts: allScripts.map(s => ({
        name: s.name,
        description: s.description,
        benefit: s.benefit,
        category: s.category,
        installed: report.installedScripts.includes(s.name),
      })),
    }, report.isMerlin
      ? [`${report.installedScripts.length} Scripts installiert, ${report.recommendedScripts.length} empfohlen`]
      : ['Merlin Firmware wird empfohlen für Script-Support']
    );
  }

  private handleSetHouseConfig(params: {
    name: string;
    floors: Array<{
      floorNumber: number;
      floorType: FloorType;
      name: string;
      heightMeters?: number;
      widthMeters?: number;
      lengthMeters?: number;
    }>;
    hasGarden?: boolean;
    gardenWidthMeters?: number;
    gardenLengthMeters?: number;
    constructionType?: 'wood_frame' | 'concrete' | 'brick' | 'mixed';
    wallThicknessCm?: number;
  }): SkillResponse {
    const floors: HouseConfig['floors'] = params.floors.map(f => {
      const floor: HouseConfig['floors'][number] = {
        floorNumber: f.floorNumber,
        floorType: f.floorType,
        name: f.name,
        heightMeters: f.heightMeters ?? 2.8,
      };
      if (f.widthMeters !== undefined && f.lengthMeters !== undefined) {
        floor.dimensions = {
          widthMeters: f.widthMeters,
          lengthMeters: f.lengthMeters,
        };
      }
      return floor;
    });

    const houseConfig: HouseConfig = {
      name: params.name,
      floors,
      hasGarden: params.hasGarden ?? false,
      constructionType: params.constructionType ?? 'mixed',
      wallThicknessCm: params.wallThicknessCm ?? 20,
    };
    
    if (params.gardenWidthMeters !== undefined && params.gardenLengthMeters !== undefined) {
      houseConfig.gardenDimensions = {
        widthMeters: params.gardenWidthMeters,
        lengthMeters: params.gardenLengthMeters,
      };
    }

    this.realTriangulation.setHouseConfig(houseConfig);

    logger.info({ 
      name: houseConfig.name, 
      floors: houseConfig.floors.length 
    }, 'House config set');

    return this.successResponse('set_house_config', {
      configured: true,
      name: houseConfig.name,
      floors: houseConfig.floors.map(f => ({
        number: f.floorNumber,
        type: f.floorType,
        name: f.name,
      })),
      hasGarden: houseConfig.hasGarden,
      constructionType: houseConfig.constructionType,
    }, [
      '📍 Setze Node-Positionen mit set_node_position_3d',
      '📐 Trianguliere Geräte mit triangulate_devices',
      '🗺️ Generiere Auto-Map mit get_auto_map',
    ]);
  }

  private handleGetHouseConfig(): SkillResponse {
    const config = this.realTriangulation.getHouseConfig();
    
    if (!config) {
      return this.successResponse('get_house_config', {
        configured: false,
        message: 'Keine Hauskonfiguration gesetzt. Nutze set_house_config.',
      });
    }

    return this.successResponse('get_house_config', {
      configured: true,
      config,
    });
  }

  private async handleTriangulateDevices(deviceMac?: string): Promise<SkillResponse> {
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    const devices = deviceMac 
      ? this.meshState.devices.filter(d => d.macAddress === deviceMac)
      : this.meshState.devices;

    if (devices.length === 0) {
      return this.errorResponse('triangulate_devices', 
        deviceMac ? `Device ${deviceMac} nicht gefunden` : 'Keine Geräte gefunden'
      );
    }

    const results = [];
    for (const device of devices) {
      const position = this.realTriangulation.triangulateDevice(device, this.meshState.nodes);
      if (position) {
        results.push(position);
      }
    }

    const methodCounts = {
      trilateration: results.filter(r => r.method === 'trilateration').length,
      bilateration: results.filter(r => r.method === 'bilateration').length,
      single_node: results.filter(r => r.method === 'single_node').length,
    };

    const avgConfidence = results.length > 0
      ? results.reduce((s, r) => s + r.confidence, 0) / results.length
      : 0;

    const nodePositions = this.realTriangulation.getNodePositions();
    const suggestions: string[] = [];
    
    if (nodePositions.length < 3) {
      suggestions.push(`⚠️ Nur ${nodePositions.length} Node-Positionen bekannt. Für echte Triangulation mindestens 3 Nodes mit set_node_position_3d setzen.`);
    }
    if (methodCounts.trilateration === 0 && results.length > 0) {
      suggestions.push('📡 Für bessere Genauigkeit: Signal-Messungen von allen 3 Nodes sammeln (record_signal_measurement)');
    }
    if (avgConfidence < 0.5) {
      suggestions.push('📶 Niedrige Konfidenz. Mehr Signal-Daten sammeln für bessere Positionierung.');
    }
    
    if (results.length > 0) {
      suggestions.push('🗺️ get_auto_map - ASCII-Karte mit Geräte-Positionen anzeigen');
      suggestions.push('🖼️ get_floor_visualization - Grundriss mit Overlay (wenn set_floor_plan gesetzt)');
      suggestions.push('🗺️ fetch_map_image - Echtes Kartenbild von OpenStreetMap laden');
    }

    return this.successResponse('triangulate_devices', {
      totalDevices: devices.length,
      triangulatedDevices: results.length,
      methods: methodCounts,
      averageConfidence: Math.round(avgConfidence * 100) / 100,
      nodePositionsKnown: nodePositions.length,
      positions: results.map(r => ({
        deviceMac: r.deviceMac,
        deviceName: r.deviceName,
        position: r.position,
        floor: r.floor,
        floorNumber: r.floorNumber,
        confidence: r.confidence,
        method: r.method,
        signalReadings: r.signalReadings,
      })),
    }, suggestions);
  }

  private async handleGetAutoMap(floorNumber?: number): Promise<SkillResponse> {
    // Check if location is set - important for accurate mapping
    const propertyData = this.geoLocationService.getPropertyData();
    
    if (!this.meshState) {
      this.meshState = await this.meshAnalyzer.scan();
    }

    const autoMap = this.realTriangulation.generateAutoMap(
      this.meshState.nodes,
      this.meshState.devices
    );

    let floorAscii: string | undefined;
    if (floorNumber !== undefined) {
      floorAscii = this.realTriangulation.generateFloorAscii(floorNumber);
    }

    const suggestions: string[] = [];
    
    // Location hint - ask user for address if not set
    if (!propertyData) {
      suggestions.push('📍 WICHTIG: Adresse nicht gesetzt! Für korrekte Kartendarstellung bitte zuerst: set_location {"address":"Deine Straße 123, Stadt"}');
    }
    
    if (autoMap.confidence < 0.5) {
      suggestions.push('📡 Mehr Signal-Daten sammeln für genauere Map');
    }
    if (autoMap.floors.length === 0) {
      suggestions.push('⚠️ Keine Positionen berechnet. Erst triangulate_devices ausführen.');
    }

    return this.successResponse('get_auto_map', {
      mapId: autoMap.id,
      generatedAt: autoMap.generatedAt,
      floorsDetected: autoMap.floors.length,
      totalArea: Math.round(autoMap.totalArea * 100) / 100,
      confidence: Math.round(autoMap.confidence * 100) / 100,
      floors: autoMap.floors.map(f => ({
        floorNumber: f.floorNumber,
        floorType: f.floorType,
        dimensions: f.estimatedDimensions,
        nodeCount: f.nodePositions.length,
        deviceCount: f.devicePositions.length,
        bounds: f.bounds,
      })),
      floorAscii,
    }, suggestions);
  }

  private handleGetSvgMap(floorNumber?: number): SkillResponse {
    // Check if location is set for accurate geo-mapping
    const propertyData = this.geoLocationService.getPropertyData();
    
    const svgContent = this.realTriangulation.generateSvgMap(floorNumber);
    const stats = this.realTriangulation.getSignalMeasurementCount();
    const nodePositions = this.realTriangulation.getNodePositions();
    const cachedPositions = this.realTriangulation.getCachedPositions();
    
    const suggestions: string[] = [];
    if (!propertyData) {
      suggestions.push('📍 WICHTIG: Für korrekte Geo-Referenzierung bitte Adresse setzen: set_location {"address":"Deine Straße 123, Stadt"}');
    }

    suggestions.push('💾 SVG kann als Datei gespeichert werden (svgBase64 → file.svg)');
    suggestions.push('🖼️ Für Grundriss-Overlay: set_floor_plan + get_floor_visualization');
    suggestions.push('🗺️ Für OpenStreetMap: fetch_map_image');

    return this.successResponse('get_svg_map', {
      svg: svgContent,
      svgBase64: Buffer.from(svgContent).toString('base64'),
      mimeType: 'image/svg+xml',
      nodeCount: nodePositions.length,
      deviceCount: cachedPositions.length,
      signalMeasurements: stats.measurements,
      floorNumber: floorNumber ?? 'all',
      locationSet: !!propertyData,
      location: propertyData ? {
        coordinates: propertyData.coordinates,
        address: propertyData.address,
      } : null,
    }, suggestions);
  }

  private async handleGenerateFullHouseMap(params?: {
    includeBasement?: boolean | undefined;
    includeAttic?: boolean | undefined;
    includeGarden?: boolean | undefined;
    detectWalls?: boolean | undefined;
    fetchOsmMap?: boolean | undefined;
  }): Promise<SkillResponse> {
    const includeBasement = params?.includeBasement ?? true;
    const includeAttic = params?.includeAttic ?? true;
    const includeGarden = params?.includeGarden ?? true;
    const detectWalls = params?.detectWalls ?? true;
    const fetchOsmMap = params?.fetchOsmMap ?? true;

    // 1. Scan network if no mesh state
    if (!this.meshState) {
      await this.ensureSshConnected();
      this.meshState = await this.meshAnalyzer.scan();
    }

    // 2. Triangulate all devices
    const triangulatedDevices: Array<{ mac: string; name: string; floor: number; position: { x: number; y: number; z: number }; confidence: number }> = [];
    for (const device of this.meshState.devices) {
      const pos = this.realTriangulation.triangulateDevice(device, this.meshState.nodes);
      if (pos) {
        triangulatedDevices.push({
          mac: pos.deviceMac,
          name: pos.deviceName,
          floor: pos.floorNumber,
          position: pos.position,
          confidence: pos.confidence,
        });
      }
    }

    // 3. Detect floors from node positions and triangulated devices
    const nodePositions = this.realTriangulation.getNodePositions();
    const allFloorNumbers = new Set<number>();
    
    for (const node of nodePositions) {
      allFloorNumbers.add(node.floorNumber);
    }
    for (const device of triangulatedDevices) {
      allFloorNumbers.add(device.floor);
    }

    // Add basement/attic if requested and not already present
    if (includeBasement && !allFloorNumbers.has(-1)) {
      allFloorNumbers.add(-1);
    }
    if (includeAttic && Math.max(...allFloorNumbers) < 3) {
      allFloorNumbers.add(Math.max(...allFloorNumbers) + 1);
    }

    const floors = Array.from(allFloorNumbers).sort((a, b) => a - b);

    // 4. Detect walls per floor
    const wallResults: Array<{ floor: number; wallCount: number; roomCount: number; ascii: string }> = [];
    
    if (detectWalls) {
      for (const floorNum of floors) {
        // Add signal measurements to wall detector
        const cachedPositions = this.realTriangulation.getCachedPositions();
        for (const pos of cachedPositions.filter(p => p.floorNumber === floorNum)) {
          for (const reading of pos.signalReadings) {
            const nodePos = nodePositions.find(n => n.nodeMac === reading.nodeMac);
            if (nodePos) {
              this.wallDetector.addSignalMeasurement({
                deviceMac: pos.deviceMac,
                devicePosition: pos.position,
                nodeMac: reading.nodeMac,
                nodePosition: nodePos.position,
                rssi: reading.rssi,
                floorNumber: floorNum,
              });
            }
          }
        }

        const wallResult = this.wallDetector.detectWalls(floorNum);
        const ascii = this.wallDetector.generateWallAscii(floorNum);
        
        wallResults.push({
          floor: floorNum,
          wallCount: wallResult.detectedWalls.length,
          roomCount: wallResult.roomBoundaries.length,
          ascii,
        });
      }
    }

    // 5. Fetch OSM map if location is set
    let osmMap: { url: string; base64: string } | null = null;
    if (fetchOsmMap) {
      const mapImage = await this.geoLocationService.fetchMapImage(18);
      if (mapImage) {
        osmMap = { url: mapImage.url, base64: mapImage.base64 };
      }
    }

    // 6. Generate SVG for each floor
    const floorMaps: Array<{ floor: number; floorName: string; svg: string; nodeCount: number; deviceCount: number }> = [];
    
    for (const floorNum of floors) {
      const floorName = this.getFloorName(floorNum, includeBasement, includeAttic);
      const svg = this.realTriangulation.generateSvgMap(floorNum);
      const nodesOnFloor = nodePositions.filter(n => n.floorNumber === floorNum).length;
      const devicesOnFloor = triangulatedDevices.filter(d => d.floor === floorNum).length;
      
      floorMaps.push({
        floor: floorNum,
        floorName,
        svg,
        nodeCount: nodesOnFloor,
        deviceCount: devicesOnFloor,
      });
    }

    // 7. Garden area (outdoor devices)
    let gardenInfo: { deviceCount: number; nodes: string[] } | null = null;
    if (includeGarden) {
      const outdoorNodes = nodePositions.filter(n => n.isOutdoor);
      gardenInfo = {
        deviceCount: 0,
        nodes: outdoorNodes.map(n => n.nodeId),
      };
    }

    const propertyData = this.geoLocationService.getPropertyData();

    return this.successResponse('generate_full_house_map', {
      totalFloors: floors.length,
      floors: floorMaps.map(f => ({
        floorNumber: f.floor,
        floorName: f.floorName,
        nodeCount: f.nodeCount,
        deviceCount: f.deviceCount,
        svgBase64: Buffer.from(f.svg).toString('base64'),
      })),
      wallDetection: wallResults.length > 0 ? {
        enabled: true,
        floors: wallResults,
      } : { enabled: false },
      osmMap: osmMap ? {
        available: true,
        url: osmMap.url,
        imageBase64: osmMap.base64,
      } : { available: false },
      location: propertyData ? {
        coordinates: propertyData.coordinates,
        address: propertyData.address,
        dimensions: propertyData.estimatedDimensions,
      } : null,
      garden: gardenInfo,
      totalDevices: this.meshState.devices.length,
      triangulatedDevices: triangulatedDevices.length,
      signalMeasurements: this.realTriangulation.getSignalMeasurementCount(),
      locationSet: !!propertyData,
    }, propertyData ? [
      '💾 SVGs können als Dateien gespeichert werden (svgBase64 dekodieren)',
      '🖼️ OSM-Karte kann als Hintergrund verwendet werden',
      '📐 Wand-Erkennung verbessert sich mit mehr Signal-Daten',
      '📍 Für genauere Karte: Mehr Node-Positionen setzen',
    ] : [
      '📍 WICHTIG: Adresse nicht gesetzt! Für korrekte Kartendarstellung: set_location {"address":"Deine Straße 123, Stadt"}',
      '💾 SVGs können als Dateien gespeichert werden (svgBase64 dekodieren)',
      '📐 Wand-Erkennung verbessert sich mit mehr Signal-Daten',
    ]);
  }

  private getFloorName(floorNumber: number, _hasBasement: boolean, _hasAttic: boolean): string {
    if (floorNumber < 0) return 'Keller';
    if (floorNumber === 0) return 'Erdgeschoss';
    if (floorNumber === 1) return '1. Stock';
    if (floorNumber === 2) return '2. Stock';
    if (floorNumber === 3) return 'Dachgeschoss';
    return `${floorNumber}. Etage`;
  }

  private handleSetNodePosition3D(params: {
    nodeMac: string;
    nodeId: string;
    floorNumber: number;
    floorType: FloorType;
    x: number;
    y: number;
    z?: number;
    roomId?: string;
  }): SkillResponse {
    const zCoord = params.z ?? (params.floorNumber * 3);

    this.realTriangulation.setNodePosition({
      nodeId: params.nodeId,
      nodeMac: params.nodeMac,
      floor: params.floorType,
      floorNumber: params.floorNumber,
      roomId: params.roomId,
      position: {
        x: params.x,
        y: params.y,
        z: zCoord,
      },
      coverageRadius2g: 15,
      coverageRadius5g: 10,
      isOutdoor: params.floorType === 'garden' || params.floorType === 'outdoor',
    });

    const allPositions = this.realTriangulation.getNodePositions();
    const suggestions: string[] = [];
    
    if (allPositions.length < 3) {
      suggestions.push(`📍 ${3 - allPositions.length} weitere Node-Position(en) für Triangulation erforderlich`);
    } else {
      suggestions.push('✅ 3+ Nodes positioniert - echte Triangulation möglich');
      suggestions.push('📐 Jetzt triangulate_devices ausführen');
    }

    return this.successResponse('set_node_position_3d', {
      nodeMac: params.nodeMac,
      nodeId: params.nodeId,
      position: { x: params.x, y: params.y, z: zCoord },
      floor: params.floorType,
      floorNumber: params.floorNumber,
      totalNodesPositioned: allPositions.length,
      triangulationReady: allPositions.length >= 3,
    }, suggestions);
  }

  private handleRecordSignalMeasurement(params: {
    deviceMac: string;
    nodeMac: string;
    rssi: number;
  }): SkillResponse {
    this.realTriangulation.recordSignalMeasurement(
      params.deviceMac,
      params.nodeMac,
      params.rssi
    );

    return this.successResponse('record_signal_measurement', {
      recorded: true,
      deviceMac: params.deviceMac,
      nodeMac: params.nodeMac,
      rssi: params.rssi,
      timestamp: new Date().toISOString(),
    }, [
      'Signal-Messung gespeichert. Für beste Triangulation: Messungen von allen 3 Nodes sammeln.',
    ]);
  }

  private handleGetLogInfo(): SkillResponse {
    const logFile = getCurrentLogFile();
    const logDir = process.env['OPENCLAW_LOG_DIR'] ?? './logs';
    
    return this.successResponse('get_log_info', {
      logFile,
      logDir,
      logLevel: process.env['LOG_LEVEL'] ?? 'info',
      fileLoggingEnabled: process.env['OPENCLAW_LOG_FILE'] !== 'false',
      nodeVersion: process.version,
      pid: process.pid,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      _proof: 'TypeScript skill is running and logging to file',
    }, [
      `📄 Log-Datei: ${logFile}`,
      '💡 Setze OPENCLAW_LOG_DIR um Log-Verzeichnis zu ändern',
      '💡 Setze LOG_LEVEL=debug für detaillierte Logs',
    ]);
  }

  private handleGetMetrics(): SkillResponse {
    const summary = metrics.getSummary();
    const circuitState = this.sshClient.getCircuitState();
    
    return this.successResponse('get_metrics', {
      ...summary,
      circuitBreaker: circuitState,
      meshState: this.meshState ? {
        nodes: this.meshState.nodes.length,
        devices: this.meshState.devices.length,
      } : null,
    }, [
      '📊 Metriken zeigen Skill-Performance',
      '🔄 reset_circuit_breaker um SSH-Fehler zurückzusetzen',
    ]);
  }

  private handleResetCircuitBreaker(): SkillResponse {
    this.sshClient.resetCircuit();
    const newState = this.sshClient.getCircuitState();
    
    return this.successResponse('reset_circuit_breaker', {
      message: 'Circuit breaker reset successfully',
      newState,
    }, [
      '✅ SSH-Verbindung kann jetzt wieder versucht werden',
      '📡 scan_network um Verbindung zu testen',
    ]);
  }

  private async handleSetLocation(params: {
    address?: string | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
    widthMeters?: number | undefined;
    heightMeters?: number | undefined;
  }): Promise<SkillResponse> {
    let result;

    if (params.address) {
      result = await this.geoLocationService.setLocationByAddress(params.address);
      if (!result) {
        return this.errorResponse('set_location', `Adresse nicht gefunden: ${params.address}`);
      }
    } else if (params.latitude !== undefined && params.longitude !== undefined) {
      result = this.geoLocationService.setLocationByCoordinates(
        params.latitude,
        params.longitude,
        params.widthMeters ?? 20,
        params.heightMeters ?? 15
      );
    } else {
      return this.errorResponse('set_location', 'Entweder address ODER latitude+longitude angeben');
    }

    return this.successResponse('set_location', {
      coordinates: result.coordinates,
      address: result.address,
      estimatedDimensions: result.estimatedDimensions,
      source: result.source,
    }, [
      '🗺️ fetch_map_image - Kartenbild von OpenStreetMap laden',
      '🏠 generate_floor_plans - Grundrisse für alle Stockwerke generieren',
      '📐 Dimensionen können mit widthMeters/heightMeters überschrieben werden',
    ]);
  }

  private handleGenerateFloorPlans(params?: {
    floorCount?: number;
    hasBasement?: boolean;
    hasAttic?: boolean;
  }): SkillResponse {
    const floorCount = params?.floorCount ?? 2;
    const hasBasement = params?.hasBasement ?? false;
    const hasAttic = params?.hasAttic ?? false;

    const floors = this.geoLocationService.generateFloorPlans(floorCount, hasBasement, hasAttic);

    if (floors.length === 0) {
      return this.errorResponse('generate_floor_plans', 'Keine Grundrisse generiert. Erst set_location aufrufen.');
    }

    // Formatierte Ausgabe für bessere Lesbarkeit
    const formattedOutput = floors.map(f => 
      `\n═══════════════════════════════════════════════════════════\n` +
      `  📍 ${f.floorName.toUpperCase()} (Etage ${f.floorNumber})\n` +
      `  📐 Größe: ${f.widthMeters}m × ${f.heightMeters}m\n` +
      `  🚪 Räume: ${f.placeholderRooms.map(r => r.name).join(', ')}\n` +
      `═══════════════════════════════════════════════════════════\n` +
      f.asciiPreview
    ).join('\n');

    return this.successResponse('generate_floor_plans', {
      generatedFloors: floors.length,
      hinweis: 'Jedes Stockwerk ist separat dargestellt. Für ein echtes Kartenbild: fetch_map_image verwenden.',
      floors: floors.map(f => ({
        floorNumber: f.floorNumber,
        floorName: f.floorName,
        dimensions: `${f.widthMeters}m × ${f.heightMeters}m`,
        rooms: f.placeholderRooms.map(r => r.name),
        hasSvg: true,
      })),
      kartenAnsicht: formattedOutput,
    }, [
      '🗺️ fetch_map_image - Echtes Kartenbild von OpenStreetMap laden',
      '🗺️ get_property_info - Grundstücks- und Stockwerk-Details anzeigen',
      '📍 set_node_position_3d - Mesh-Nodes auf Grundrissen positionieren',
      '📐 triangulate_devices - Geräte auf Karte lokalisieren',
    ]);
  }

  private handleGetPropertyInfo(): SkillResponse {
    const propertyData = this.geoLocationService.getPropertyData();
    const floors = this.geoLocationService.getAllGeneratedFloors();

    if (!propertyData) {
      return this.errorResponse('get_property_info', 'Keine Location gesetzt. Erst set_location aufrufen.');
    }

    return this.successResponse('get_property_info', {
      location: {
        coordinates: propertyData.coordinates,
        address: propertyData.address,
        source: propertyData.source,
      },
      property: {
        dimensions: propertyData.estimatedDimensions,
        boundingBox: propertyData.boundingBox,
      },
      floors: floors.map(f => ({
        floorNumber: f.floorNumber,
        floorName: f.floorName,
        widthMeters: f.widthMeters,
        heightMeters: f.heightMeters,
        rooms: f.placeholderRooms.map(r => r.name),
        svgAvailable: true,
      })),
      floorCount: floors.length,
    }, [
      '🗺️ fetch_map_image - Echtes Kartenbild von OpenStreetMap',
      '📐 triangulate_devices - Geräte auf Karte positionieren',
      '🗺️ get_auto_map - ASCII-Karte mit Geräten anzeigen',
      '📍 set_node_position_3d - Mesh-Nodes manuell positionieren',
    ]);
  }

  private async handleFetchMapImage(zoom?: number | undefined): Promise<SkillResponse> {
    const mapImage = await this.geoLocationService.fetchMapImage(zoom ?? 18);

    if (!mapImage) {
      return this.errorResponse('fetch_map_image', 'Kartenbild konnte nicht geladen werden. Erst set_location aufrufen.');
    }

    return this.successResponse('fetch_map_image', {
      imageBase64: mapImage.base64,
      imageUrl: mapImage.url,
      dimensions: {
        width: mapImage.width,
        height: mapImage.height,
      },
      zoom: mapImage.zoom,
      source: mapImage.source,
      usage: 'Das Base64-Bild kann als Hintergrund für Geräte-Overlay verwendet werden',
    }, [
      '🗺️ Kartenbild von OpenStreetMap geladen',
      '📍 set_node_position_3d - Nodes auf Karte positionieren',
      '📐 triangulate_devices - Geräte auf Karte anzeigen',
      '🖼️ imageBase64 kann direkt als <img src="..."> verwendet werden',
    ]);
  }

  private handleDetectWalls(floorNumber?: number | undefined): SkillResponse {
    const floor = floorNumber ?? 0;

    // Feed triangulation data to wall detector
    const positions = this.realTriangulation.getCachedPositions();
    const nodePositions = this.realTriangulation.getNodePositions();

    for (const pos of positions) {
      for (const reading of pos.signalReadings) {
        const nodePos = nodePositions.find(n => n.nodeMac === reading.nodeMac);
        if (nodePos) {
          this.wallDetector.addSignalMeasurement({
            deviceMac: pos.deviceMac,
            devicePosition: pos.position,
            nodeMac: reading.nodeMac,
            nodePosition: nodePos.position,
            rssi: reading.rssi,
            floorNumber: pos.floorNumber,
          });
        }
      }
    }

    const result = this.wallDetector.detectWalls(floor);
    const asciiMap = this.wallDetector.generateWallAscii(floor);

    if (result.detectedWalls.length === 0) {
      return this.successResponse('detect_walls', {
        floorNumber: floor,
        wallsDetected: 0,
        hinweis: 'Keine Wände erkannt. Mehr Signal-Daten nötig.',
        requirements: [
          '1. Mindestens 3 Mesh-Nodes positioniert (set_node_position_3d)',
          '2. Geräte trianguliert (triangulate_devices)',
          '3. Signal-Messungen aus verschiedenen Räumen',
        ],
      }, [
        '📍 set_node_position_3d - Mesh-Nodes positionieren',
        '📐 triangulate_devices - Geräte lokalisieren',
        '📡 record_signal_measurement - Manuelle Messung hinzufügen',
      ]);
    }

    return this.successResponse('detect_walls', {
      floorNumber: floor,
      wallsDetected: result.detectedWalls.length,
      roomsInferred: result.roomBoundaries.length,
      anomalies: result.signalAnomalies.length,
      walls: result.detectedWalls.map(w => ({
        material: w.material,
        attenuation: `${Math.round(w.estimatedAttenuation)} dB`,
        confidence: `${Math.round(w.confidence * 100)}%`,
        detections: w.detectedFrom.length,
      })),
      rooms: result.roomBoundaries.map(r => ({
        name: r.name,
        bounds: r.bounds,
        confidence: `${Math.round(r.confidence * 100)}%`,
      })),
      asciiMap,
    }, [
      '🏠 Wände aus Signal-Dämpfung erkannt',
      '🗺️ get_auto_map - Geräte-Karte mit Wänden anzeigen',
      '📐 generate_floor_plans - Grundrisse aktualisieren',
    ]);
  }
}
