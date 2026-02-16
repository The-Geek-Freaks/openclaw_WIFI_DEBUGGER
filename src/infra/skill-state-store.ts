import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createChildLogger } from '../utils/logger.js';
import type { MeshNetworkState, ConnectionEvent } from '../types/network.js';
import type { ZigbeeNetworkState } from '../types/zigbee.js';
import type { OptimizationSuggestion } from '../types/analysis.js';
import type { NodePlacement } from '../types/building.js';
import type { HouseConfig } from '../core/real-triangulation.js';
import {
  type PersistedState,
  type SerializedConnectionEvent,
  type SerializedSignalMeasurement,
  createEmptyState,
  serializeDevice,
  deserializeDevice,
  serializeMeshNode,
  deserializeMeshNode,
  serializeConnectionEvent,
  deserializeConnectionEvent,
  serializeZigbeeState,
  deserializeZigbeeState,
} from './serialization.js';

const logger = createChildLogger('skill-state-store');

const STATE_DIR = path.join(os.homedir(), '.openclaw', 'skills', 'asus-mesh-wifi-analyzer');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

export class SkillStateStore {
  private state: PersistedState;
  private dirty = false;
  private autoSaveInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.state = this.load();
    this.startAutoSave();
  }

  private load(): PersistedState {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as PersistedState;
        
        if (parsed.version !== 2) {
          logger.info({ oldVersion: parsed.version }, 'Migrating state to version 2');
          return this.migrate(parsed);
        }
        
        logger.info('State loaded from disk');
        return parsed;
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to load state, starting fresh');
    }
    
    return createEmptyState();
  }

  private migrate(_old: unknown): PersistedState {
    const fresh = createEmptyState();
    fresh.updatedAt = new Date().toISOString();
    return fresh;
  }

  private save(): void {
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      this.state.updatedAt = new Date().toISOString();
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
      this.dirty = false;
      logger.debug('State saved to disk');
    } catch (err) {
      logger.error({ err }, 'Failed to save state');
    }
  }

  private startAutoSave(): void {
    this.autoSaveInterval = setInterval(() => {
      if (this.dirty) {
        this.save();
      }
    }, 30000);
  }

  public shutdown(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    if (this.dirty) {
      this.save();
    }
  }

  public forceSave(): void {
    this.save();
  }

  public getLastScanTime(): Date | null {
    if (!this.state.lastScan) return null;
    return new Date(this.state.lastScan.timestamp);
  }

  public isScanStale(): boolean {
    const lastScan = this.getLastScanTime();
    if (!lastScan) return true;
    
    const staleMs = this.state.settings.scanStalenessMinutes * 60 * 1000;
    return Date.now() - lastScan.getTime() > staleMs;
  }

  public getMeshState(): MeshNetworkState | null {
    if (!this.state.lastScan) return null;
    
    return {
      nodes: this.state.lastScan.nodes.map(deserializeMeshNode),
      devices: this.state.lastScan.devices.map(deserializeDevice),
      wifiSettings: this.state.lastScan.wifiSettings,
      lastUpdated: new Date(this.state.lastScan.timestamp),
    };
  }

  public setMeshState(meshState: MeshNetworkState): void {
    this.state.lastScan = {
      timestamp: new Date().toISOString(),
      nodes: meshState.nodes.map(serializeMeshNode),
      devices: meshState.devices.map(serializeDevice),
      wifiSettings: meshState.wifiSettings,
    };
    this.dirty = true;
  }

  public getZigbeeState(): ZigbeeNetworkState | null {
    if (!this.state.lastZigbeeScan) return null;
    return deserializeZigbeeState(this.state.lastZigbeeScan.state);
  }

  public setZigbeeState(zigbeeState: ZigbeeNetworkState): void {
    this.state.lastZigbeeScan = {
      timestamp: new Date().toISOString(),
      state: serializeZigbeeState(zigbeeState),
    };
    this.dirty = true;
  }

  public getConnectionEvents(): ConnectionEvent[] {
    return this.state.connectionEvents.map(deserializeConnectionEvent);
  }

  public addConnectionEvent(event: ConnectionEvent): void {
    this.state.connectionEvents.push(serializeConnectionEvent(event));
    
    const maxEvents = 1000;
    if (this.state.connectionEvents.length > maxEvents) {
      this.state.connectionEvents = this.state.connectionEvents.slice(-maxEvents);
    }
    
    this.dirty = true;
  }

  public getSignalHistory(): Map<string, Array<{ nodeMac: string; rssi: number; timestamp: Date }>> {
    const result = new Map<string, Array<{ nodeMac: string; rssi: number; timestamp: Date }>>();
    
    for (const [deviceMac, measurements] of Object.entries(this.state.signalHistory)) {
      result.set(deviceMac, measurements.map(m => ({
        nodeMac: m.nodeMac,
        rssi: m.rssi,
        timestamp: new Date(m.timestamp),
      })));
    }
    
    return result;
  }

  public addSignalMeasurement(deviceMac: string, nodeMac: string, rssi: number): void {
    if (!this.state.signalHistory[deviceMac]) {
      this.state.signalHistory[deviceMac] = [];
    }
    
    this.state.signalHistory[deviceMac].push({
      nodeMac,
      rssi,
      timestamp: new Date().toISOString(),
    });
    
    const maxMeasurements = 100;
    if (this.state.signalHistory[deviceMac].length > maxMeasurements) {
      this.state.signalHistory[deviceMac] = this.state.signalHistory[deviceMac].slice(-maxMeasurements);
    }
    
    this.dirty = true;
  }

  public getNodePositions(): NodePlacement[] {
    return this.state.triangulation.nodePositions;
  }

  public setNodePosition(placement: NodePlacement): void {
    const idx = this.state.triangulation.nodePositions.findIndex(
      p => p.nodeId === placement.nodeId
    );
    
    if (idx >= 0) {
      this.state.triangulation.nodePositions[idx] = placement;
    } else {
      this.state.triangulation.nodePositions.push(placement);
    }
    
    this.dirty = true;
  }

  public getHouseConfig(): HouseConfig | null {
    return this.state.triangulation.houseConfig;
  }

  public setHouseConfig(config: HouseConfig): void {
    this.state.triangulation.houseConfig = config;
    this.dirty = true;
  }

  public getPendingOptimizations(): Array<{ id: string; suggestion: OptimizationSuggestion }> {
    return this.state.pendingOptimizations;
  }

  public addPendingOptimization(id: string, suggestion: OptimizationSuggestion): void {
    this.state.pendingOptimizations.push({ id, suggestion });
    this.dirty = true;
  }

  public removePendingOptimization(id: string): void {
    this.state.pendingOptimizations = this.state.pendingOptimizations.filter(o => o.id !== id);
    this.dirty = true;
  }

  public getGeoLocation(): unknown | null {
    return this.state.geoLocation;
  }

  public setGeoLocation(data: unknown): void {
    this.state.geoLocation = data;
    this.dirty = true;
  }

  public getTriangulationSignalMeasurements(): Record<string, SerializedSignalMeasurement[]> {
    return this.state.triangulation.signalMeasurements;
  }

  public setTriangulationSignalMeasurements(measurements: Record<string, SerializedSignalMeasurement[]>): void {
    this.state.triangulation.signalMeasurements = measurements;
    this.dirty = true;
  }

  public cleanup(): { deletedEvents: number; deletedMeasurements: number } {
    const now = Date.now();
    const eventCutoff = now - (this.state.settings.eventRetentionDays * 24 * 60 * 60 * 1000);
    
    const eventsBefore = this.state.connectionEvents.length;
    this.state.connectionEvents = this.state.connectionEvents.filter(
      e => new Date(e.timestamp).getTime() > eventCutoff
    );
    const deletedEvents = eventsBefore - this.state.connectionEvents.length;
    
    let deletedMeasurements = 0;
    for (const deviceMac of Object.keys(this.state.signalHistory)) {
      const before = this.state.signalHistory[deviceMac].length;
      this.state.signalHistory[deviceMac] = this.state.signalHistory[deviceMac].filter(
        m => new Date(m.timestamp).getTime() > eventCutoff
      );
      deletedMeasurements += before - this.state.signalHistory[deviceMac].length;
      
      if (this.state.signalHistory[deviceMac].length === 0) {
        delete this.state.signalHistory[deviceMac];
      }
    }
    
    this.dirty = true;
    this.save();
    
    logger.info({ deletedEvents, deletedMeasurements }, 'State cleanup complete');
    return { deletedEvents, deletedMeasurements };
  }

  public getStats(): {
    lastScan: string | null;
    nodeCount: number;
    deviceCount: number;
    eventCount: number;
    signalMeasurementCount: number;
    nodePositionCount: number;
    hasHouseConfig: boolean;
    hasZigbeeState: boolean;
  } {
    const measurementCount = Object.values(this.state.signalHistory)
      .reduce((sum, arr) => sum + arr.length, 0);
    
    return {
      lastScan: this.state.lastScan?.timestamp ?? null,
      nodeCount: this.state.lastScan?.nodes.length ?? 0,
      deviceCount: this.state.lastScan?.devices.length ?? 0,
      eventCount: this.state.connectionEvents.length,
      signalMeasurementCount: measurementCount,
      nodePositionCount: this.state.triangulation.nodePositions.length,
      hasHouseConfig: this.state.triangulation.houseConfig !== null,
      hasZigbeeState: this.state.lastZigbeeScan !== null,
    };
  }

  public exportState(): PersistedState {
    return JSON.parse(JSON.stringify(this.state));
  }

  public importState(state: PersistedState): void {
    this.state = state;
    this.dirty = true;
    this.save();
  }
}
