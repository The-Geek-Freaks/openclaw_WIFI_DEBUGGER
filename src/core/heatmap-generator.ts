import { createChildLogger } from '../utils/logger.js';
import { rssiToQuality } from '../utils/frequency.js';
import type { 
  Building, 
  FloorPlan, 
  FloorHeatmap, 
  HeatmapPoint, 
  NodePlacement,
} from '../types/building.js';

const logger = createChildLogger('heatmap-generator');

const MATERIAL_ATTENUATION: Record<string, { db2g: number; db5g: number }> = {
  drywall: { db2g: 3, db5g: 4 },
  concrete: { db2g: 10, db5g: 15 },
  brick: { db2g: 8, db5g: 12 },
  wood: { db2g: 4, db5g: 6 },
  glass: { db2g: 2, db5g: 3 },
  floor_wood: { db2g: 6, db5g: 10 },
  floor_concrete: { db2g: 15, db5g: 25 },
  outdoor: { db2g: 0, db5g: 0 },
};

export class HeatmapGenerator {
  private building: Building | null = null;
  private nodePlacements: Map<string, NodePlacement> = new Map();
  private readonly txPower2g: number = -30;
  private readonly txPower5g: number = -35;
  private readonly pathLossExponent: number = 3.0;

  setBuilding(building: Building): void {
    this.building = building;
    logger.info({ floors: building.floors.length }, 'Building configuration set');
  }

  setNodePlacement(placement: NodePlacement): void {
    this.nodePlacements.set(placement.nodeId, placement);
    logger.info({ nodeId: placement.nodeId, floor: placement.floor }, 'Node placement set');
  }

  setNodePlacements(placements: NodePlacement[]): void {
    for (const p of placements) {
      this.setNodePlacement(p);
    }
  }

  private generatePlaceholderHeatmap(floorNumber: number): FloorHeatmap {
    const floorName = floorNumber === 0 ? 'ground_floor' : floorNumber > 0 ? 'upper_floor' : 'basement';
    return {
      floor: floorName as FloorHeatmap['floor'],
      floorNumber,
      resolution: 1,
      points: [],
      deadZones: [],
      recommendations: [
        'Keine Gebäudekonfiguration vorhanden. Bitte Building Config setzen für detaillierte Heatmap.',
        'Nutze set_node_position um Mesh-Nodes zu positionieren.',
        'Ohne Gebäudeplan kann keine Signal-Simulation durchgeführt werden.',
      ],
    };
  }

  generateFloorHeatmap(floorNumber: number, resolution: number = 1): FloorHeatmap | null {
    if (!this.building) {
      logger.warn('No building configuration set - returning placeholder heatmap');
      return this.generatePlaceholderHeatmap(floorNumber);
    }

    const floor = this.building.floors.find(f => f.floorNumber === floorNumber);
    if (!floor) {
      logger.warn({ floorNumber }, 'Floor not found - returning placeholder heatmap');
      return this.generatePlaceholderHeatmap(floorNumber);
    }

    const points: HeatmapPoint[] = [];
    const nodesOnFloor = Array.from(this.nodePlacements.values()).filter(
      n => n.floorNumber === floorNumber
    );
    const nodesOnOtherFloors = Array.from(this.nodePlacements.values()).filter(
      n => n.floorNumber !== floorNumber
    );

    for (let x = 0; x < floor.dimensions.width; x += resolution) {
      for (let y = 0; y < floor.dimensions.height; y += resolution) {
        let bestSignal2g = -100;
        let bestSignal5g = -100;
        let primaryNode = '';
        let totalInterference = 0;

        for (const node of nodesOnFloor) {
          const distance = Math.sqrt(
            Math.pow(x - node.position.x, 2) + Math.pow(y - node.position.y, 2)
          );

          const signal2g = this.calculateSignal(distance, this.txPower2g, 0, 0);
          const signal5g = this.calculateSignal(distance, this.txPower5g, 0, 0);

          if (signal2g > bestSignal2g) {
            bestSignal2g = signal2g;
            primaryNode = node.nodeId;
          }
          if (signal5g > bestSignal5g) {
            bestSignal5g = signal5g;
          }
        }

        for (const node of nodesOnOtherFloors) {
          const floorDiff = Math.abs(node.floorNumber - floorNumber);
          const distance = Math.sqrt(
            Math.pow(x - node.position.x, 2) + 
            Math.pow(y - node.position.y, 2) +
            Math.pow(floorDiff * floor.heightMeters, 2)
          );

          const floorAttenuation2g = floorDiff * MATERIAL_ATTENUATION['floor_concrete']!.db2g;
          const floorAttenuation5g = floorDiff * MATERIAL_ATTENUATION['floor_concrete']!.db5g;

          const signal2g = this.calculateSignal(distance, this.txPower2g, floorAttenuation2g, 0);
          const signal5g = this.calculateSignal(distance, this.txPower5g, floorAttenuation5g, 0);

          if (signal2g > bestSignal2g) {
            bestSignal2g = signal2g;
            primaryNode = node.nodeId;
          }
          if (signal5g > bestSignal5g) {
            bestSignal5g = signal5g;
          }
        }

        if (this.building.neighborNetworks) {
          for (const neighbor of this.building.neighborNetworks) {
            if (neighbor.signalStrength > -70) {
              totalInterference += Math.pow(10, neighbor.signalStrength / 10);
            }
          }
        }

        const quality = this.calculateQuality(bestSignal2g, bestSignal5g, totalInterference);

        points.push({
          x,
          y,
          floor: floor.floor,
          floorNumber,
          signal2g: bestSignal2g,
          signal5g: bestSignal5g,
          quality,
          primaryNode,
          interferenceLevel: totalInterference > 0 ? 10 * Math.log10(totalInterference) : -100,
        });
      }
    }

    const deadZones = this.findDeadZones(points, resolution);
    const recommendations = this.generateRecommendations(floor, points, deadZones);

    logger.info({ 
      floorNumber, 
      pointCount: points.length, 
      deadZoneCount: deadZones.length 
    }, 'Heatmap generated');

    return {
      floor: floor.floor,
      floorNumber,
      resolution,
      points,
      deadZones,
      recommendations,
    };
  }

  private calculateSignal(
    distance: number,
    txPower: number,
    wallAttenuation: number,
    floorAttenuation: number
  ): number {
    if (distance < 1) distance = 1;
    
    const pathLoss = 10 * this.pathLossExponent * Math.log10(distance);
    return txPower - pathLoss - wallAttenuation - floorAttenuation;
  }

  private calculateQuality(signal2g: number, signal5g: number, interference: number): number {
    const bestSignal = Math.max(signal2g, signal5g);
    let quality = rssiToQuality(bestSignal);

    if (interference > 0) {
      const snr = bestSignal - 10 * Math.log10(interference);
      if (snr < 20) {
        quality *= snr / 20;
      }
    }

    return Math.max(0, Math.min(100, Math.round(quality)));
  }

  private findDeadZones(
    points: HeatmapPoint[],
    resolution: number
  ): Array<{ x: number; y: number; radius: number; severity: 'mild' | 'moderate' | 'severe' }> {
    const deadZones: Array<{ x: number; y: number; radius: number; severity: 'mild' | 'moderate' | 'severe' }> = [];
    const weakPoints = points.filter(p => p.quality < 30);

    const clusters: HeatmapPoint[][] = [];
    const assigned = new Set<number>();

    for (let i = 0; i < weakPoints.length; i++) {
      if (assigned.has(i)) continue;

      const cluster: HeatmapPoint[] = [weakPoints[i]!];
      assigned.add(i);

      for (let j = i + 1; j < weakPoints.length; j++) {
        if (assigned.has(j)) continue;

        const dist = Math.sqrt(
          Math.pow(weakPoints[i]!.x - weakPoints[j]!.x, 2) +
          Math.pow(weakPoints[i]!.y - weakPoints[j]!.y, 2)
        );

        if (dist <= resolution * 3) {
          cluster.push(weakPoints[j]!);
          assigned.add(j);
        }
      }

      if (cluster.length >= 2) {
        clusters.push(cluster);
      }
    }

    for (const cluster of clusters) {
      const centerX = cluster.reduce((sum, p) => sum + p.x, 0) / cluster.length;
      const centerY = cluster.reduce((sum, p) => sum + p.y, 0) / cluster.length;
      const avgQuality = cluster.reduce((sum, p) => sum + p.quality, 0) / cluster.length;

      const maxDist = Math.max(
        ...cluster.map(p => Math.sqrt(Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2)))
      );

      let severity: 'mild' | 'moderate' | 'severe';
      if (avgQuality < 10) {
        severity = 'severe';
      } else if (avgQuality < 20) {
        severity = 'moderate';
      } else {
        severity = 'mild';
      }

      deadZones.push({
        x: centerX,
        y: centerY,
        radius: maxDist + resolution,
        severity,
      });
    }

    return deadZones;
  }

  private generateRecommendations(
    floor: FloorPlan,
    points: HeatmapPoint[],
    deadZones: Array<{ x: number; y: number; radius: number; severity: string }>
  ): string[] {
    const recommendations: string[] = [];

    const avgQuality = points.reduce((sum, p) => sum + p.quality, 0) / points.length;
    
    if (avgQuality < 50) {
      recommendations.push(`Durchschnittliche Signalqualität auf ${floor.floor} ist niedrig (${avgQuality.toFixed(0)}%). Zusätzlichen Mesh-Node empfohlen.`);
    }

    for (const zone of deadZones) {
      if (zone.severity === 'severe') {
        recommendations.push(`Kritische Totzzone bei Position (${zone.x.toFixed(0)}, ${zone.y.toFixed(0)}). Mesh-Node in der Nähe platzieren.`);
      }
    }

    const nodesOnFloor = Array.from(this.nodePlacements.values()).filter(
      n => n.floorNumber === floor.floorNumber
    );

    if (nodesOnFloor.length === 0) {
      recommendations.push(`Kein Mesh-Node auf ${floor.floor}. Mindestens einen Node pro Stockwerk empfohlen.`);
    }

    const highInterference = points.filter(p => p.interferenceLevel > -60);
    if (highInterference.length > points.length * 0.2) {
      recommendations.push('Hohe Interferenz von Nachbarnetzwerken erkannt. Kanalwechsel empfohlen.');
    }

    return recommendations;
  }

  generateFullBuildingHeatmap(resolution: number = 1): Map<number, FloorHeatmap> {
    const heatmaps = new Map<number, FloorHeatmap>();

    if (!this.building) {
      logger.error('No building configuration set');
      return heatmaps;
    }

    for (const floor of this.building.floors) {
      const heatmap = this.generateFloorHeatmap(floor.floorNumber, resolution);
      if (heatmap) {
        heatmaps.set(floor.floorNumber, heatmap);
      }
    }

    logger.info({ floorCount: heatmaps.size }, 'Full building heatmap generated');
    return heatmaps;
  }

  findOptimalNodePlacement(floorNumber: number): { x: number; y: number; improvement: number } | null {
    if (!this.building) return null;

    const floor = this.building.floors.find(f => f.floorNumber === floorNumber);
    if (!floor) return null;

    const currentHeatmap = this.generateFloorHeatmap(floorNumber, 2);
    if (!currentHeatmap) return null;

    const currentAvgQuality = currentHeatmap.points.reduce((s, p) => s + p.quality, 0) / currentHeatmap.points.length;

    let bestPosition = { x: 0, y: 0 };
    let bestImprovement = 0;

    for (let x = 5; x < floor.dimensions.width - 5; x += 5) {
      for (let y = 5; y < floor.dimensions.height - 5; y += 5) {
        const testPlacement: NodePlacement = {
          nodeId: 'test_node',
          nodeMac: '00:00:00:00:00:00',
          floor: floor.floor,
          floorNumber,
          position: { x, y, z: 1.5 },
          coverageRadius2g: 15,
          coverageRadius5g: 10,
          isOutdoor: false,
        };

        this.nodePlacements.set('test_node', testPlacement);
        const testHeatmap = this.generateFloorHeatmap(floorNumber, 2);
        this.nodePlacements.delete('test_node');

        if (testHeatmap) {
          const testAvgQuality = testHeatmap.points.reduce((s, p) => s + p.quality, 0) / testHeatmap.points.length;
          const improvement = testAvgQuality - currentAvgQuality;

          if (improvement > bestImprovement) {
            bestImprovement = improvement;
            bestPosition = { x, y };
          }
        }
      }
    }

    if (bestImprovement > 5) {
      return { ...bestPosition, improvement: bestImprovement };
    }

    return null;
  }

  exportHeatmapData(heatmap: FloorHeatmap): {
    floor: string;
    grid: number[][];
    legend: { min: number; max: number };
  } {
    const width = Math.max(...heatmap.points.map(p => p.x)) + 1;
    const height = Math.max(...heatmap.points.map(p => p.y)) + 1;
    
    const grid: number[][] = Array(Math.ceil(height / heatmap.resolution))
      .fill(null)
      .map(() => Array(Math.ceil(width / heatmap.resolution)).fill(0));

    for (const point of heatmap.points) {
      const gridX = Math.floor(point.x / heatmap.resolution);
      const gridY = Math.floor(point.y / heatmap.resolution);
      if (grid[gridY] && gridX < grid[gridY]!.length) {
        grid[gridY]![gridX] = point.quality;
      }
    }

    return {
      floor: heatmap.floor,
      grid,
      legend: { min: 0, max: 100 },
    };
  }
}
