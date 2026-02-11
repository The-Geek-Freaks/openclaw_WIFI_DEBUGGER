import { createChildLogger } from '../utils/logger.js';
import { rssiToDistance } from '../utils/frequency.js';
import type { MeshNode, NetworkDevice } from '../types/network.js';
import type { DeviceLocation, SpatialMap } from '../types/analysis.js';

const logger = createChildLogger('triangulation');

interface NodePosition {
  id: string;
  macAddress: string;
  x: number;
  y: number;
  z: number;
}

interface SignalReading {
  nodeMac: string;
  rssi: number;
}

export class TriangulationEngine {
  private nodePositions: Map<string, NodePosition> = new Map();
  private readonly defaultTxPower: number = -59;
  private readonly pathLossExponent: number = 2.5;

  setNodePosition(nodeId: string, macAddress: string, x: number, y: number, z: number = 0): void {
    this.nodePositions.set(nodeId, { id: nodeId, macAddress, x, y, z });
    logger.info({ nodeId, x, y, z }, 'Node position set');
  }

  setNodePositions(positions: Array<{ id: string; macAddress: string; x: number; y: number; z?: number }>): void {
    for (const pos of positions) {
      this.setNodePosition(pos.id, pos.macAddress, pos.x, pos.y, pos.z ?? 0);
    }
  }

  estimateDevicePosition(
    deviceMac: string,
    signalReadings: SignalReading[]
  ): DeviceLocation | null {
    if (signalReadings.length < 1) {
      logger.warn({ deviceMac }, 'Not enough signal readings for triangulation');
      return null;
    }

    const validReadings = signalReadings.filter(r => {
      const node = Array.from(this.nodePositions.values()).find(n => n.macAddress === r.nodeMac);
      return node !== undefined;
    });

    if (validReadings.length === 0) {
      logger.warn({ deviceMac }, 'No valid node positions for signal readings');
      return null;
    }

    const signalVectors = validReadings.map(reading => {
      const node = Array.from(this.nodePositions.values()).find(n => n.macAddress === reading.nodeMac)!;
      const distance = rssiToDistance(reading.rssi, this.defaultTxPower, this.pathLossExponent);
      return {
        nodeMac: reading.nodeMac,
        rssi: reading.rssi,
        distance,
        nodePosition: node,
      };
    });

    let estimatedPosition: { x: number; y: number; z: number };
    let confidence: number;

    if (signalVectors.length === 1) {
      const sv = signalVectors[0]!;
      estimatedPosition = {
        x: sv.nodePosition.x,
        y: sv.nodePosition.y,
        z: sv.nodePosition.z,
      };
      confidence = 0.3;
    } else if (signalVectors.length === 2) {
      estimatedPosition = this.bilaterate(signalVectors);
      confidence = 0.5;
    } else {
      estimatedPosition = this.trilaterate(signalVectors);
      confidence = Math.min(0.9, 0.5 + signalVectors.length * 0.1);
    }

    return {
      macAddress: deviceMac,
      estimatedPosition: {
        ...estimatedPosition,
        confidence,
      },
      signalVectors: signalVectors.map(sv => ({
        nodeMac: sv.nodeMac,
        rssi: sv.rssi,
        distance: sv.distance,
      })),
    };
  }

  private bilaterate(
    vectors: Array<{ nodePosition: NodePosition; distance: number }>
  ): { x: number; y: number; z: number } {
    const n1 = vectors[0]!;
    const n2 = vectors[1]!;

    const totalWeight = 1 / n1.distance + 1 / n2.distance;
    const w1 = (1 / n1.distance) / totalWeight;
    const w2 = (1 / n2.distance) / totalWeight;

    return {
      x: n1.nodePosition.x * w1 + n2.nodePosition.x * w2,
      y: n1.nodePosition.y * w1 + n2.nodePosition.y * w2,
      z: n1.nodePosition.z * w1 + n2.nodePosition.z * w2,
    };
  }

  private trilaterate(
    vectors: Array<{ nodePosition: NodePosition; distance: number }>
  ): { x: number; y: number; z: number } {
    let totalWeight = 0;
    let weightedX = 0;
    let weightedY = 0;
    let weightedZ = 0;

    for (const v of vectors) {
      const weight = 1 / (v.distance * v.distance);
      totalWeight += weight;
      weightedX += v.nodePosition.x * weight;
      weightedY += v.nodePosition.y * weight;
      weightedZ += v.nodePosition.z * weight;
    }

    return {
      x: weightedX / totalWeight,
      y: weightedY / totalWeight,
      z: weightedZ / totalWeight,
    };
  }

  generateSpatialMap(
    _nodes: MeshNode[],
    devices: NetworkDevice[],
    deviceSignals: Map<string, SignalReading[]>
  ): SpatialMap {
    const deviceLocations: DeviceLocation[] = [];
    
    for (const device of devices) {
      const signals = deviceSignals.get(device.macAddress);
      if (signals && signals.length > 0) {
        const location = this.estimateDevicePosition(device.macAddress, signals);
        if (location) {
          deviceLocations.push(location);
        }
      }
    }

    const problemZones = this.detectProblemZones(deviceLocations);

    return {
      timestamp: new Date(),
      nodes: Array.from(this.nodePositions.values()).map(n => ({
        id: n.id,
        position: { x: n.x, y: n.y, z: n.z },
        coverageRadius: 15,
      })),
      devices: deviceLocations,
      problemZones,
    };
  }

  private detectProblemZones(
    locations: DeviceLocation[]
  ): Array<{ center: { x: number; y: number; z: number }; radius: number; issue: string }> {
    const zones: Array<{ center: { x: number; y: number; z: number }; radius: number; issue: string }> = [];

    const weakSignalDevices = locations.filter(l => {
      const avgRssi = l.signalVectors.reduce((sum, v) => sum + v.rssi, 0) / l.signalVectors.length;
      return avgRssi < -75;
    });

    const clusters = this.clusterDevices(weakSignalDevices, 5);
    
    for (const cluster of clusters) {
      if (cluster.length >= 2) {
        const centerX = cluster.reduce((sum, d) => sum + d.estimatedPosition.x, 0) / cluster.length;
        const centerY = cluster.reduce((sum, d) => sum + d.estimatedPosition.y, 0) / cluster.length;
        const centerZ = cluster.reduce((sum, d) => sum + d.estimatedPosition.z, 0) / cluster.length;

        const maxDist = Math.max(
          ...cluster.map(d => 
            Math.sqrt(
              Math.pow(d.estimatedPosition.x - centerX, 2) +
              Math.pow(d.estimatedPosition.y - centerY, 2)
            )
          )
        );

        zones.push({
          center: { x: centerX, y: centerY, z: centerZ },
          radius: maxDist + 2,
          issue: 'Weak signal zone - consider adding mesh node',
        });
      }
    }

    return zones;
  }

  private clusterDevices(devices: DeviceLocation[], maxDistance: number): DeviceLocation[][] {
    const clusters: DeviceLocation[][] = [];
    const assigned = new Set<string>();

    for (const device of devices) {
      if (assigned.has(device.macAddress)) continue;

      const cluster: DeviceLocation[] = [device];
      assigned.add(device.macAddress);

      for (const other of devices) {
        if (assigned.has(other.macAddress)) continue;

        const dist = Math.sqrt(
          Math.pow(device.estimatedPosition.x - other.estimatedPosition.x, 2) +
          Math.pow(device.estimatedPosition.y - other.estimatedPosition.y, 2)
        );

        if (dist <= maxDistance) {
          cluster.push(other);
          assigned.add(other.macAddress);
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  getNodePositions(): NodePosition[] {
    return Array.from(this.nodePositions.values());
  }

  calculateCoverageMap(
    resolution: number = 1,
    width: number = 50,
    height: number = 50
  ): Array<{ x: number; y: number; signalStrength: number }> {
    const coverage: Array<{ x: number; y: number; signalStrength: number }> = [];
    const nodes = Array.from(this.nodePositions.values());

    for (let x = 0; x < width; x += resolution) {
      for (let y = 0; y < height; y += resolution) {
        let bestSignal = -100;

        for (const node of nodes) {
          const distance = Math.sqrt(
            Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2)
          );
          
          const estimatedRssi = this.defaultTxPower - 
            10 * this.pathLossExponent * Math.log10(Math.max(1, distance));
          
          bestSignal = Math.max(bestSignal, estimatedRssi);
        }

        coverage.push({ x, y, signalStrength: bestSignal });
      }
    }

    return coverage;
  }
}
