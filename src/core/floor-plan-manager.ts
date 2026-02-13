import { createChildLogger } from '../utils/logger.js';
import type { MeshNode, NetworkDevice } from '../types/network.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = createChildLogger('floor-plan-manager');

export interface FloorPlanConfig {
  floor: number;
  name: string;
  imagePath: string;
  imageBase64?: string;
  dimensions: {
    widthMeters: number;
    heightMeters: number;
    widthPixels: number;
    heightPixels: number;
  };
  origin: {
    x: number;
    y: number;
  };
  rotation: number;
}

export interface NodeMarker {
  id: string;
  name: string;
  type: 'router' | 'node' | 'extender';
  position: { x: number; y: number };
  pixelPosition: { x: number; y: number };
  signalRadius: number;
  status: 'online' | 'offline' | 'warning';
  connectedDevices: number;
}

export interface DeviceMarker {
  mac: string;
  name: string;
  type: 'phone' | 'laptop' | 'tv' | 'iot' | 'unknown';
  position: { x: number; y: number };
  pixelPosition: { x: number; y: number };
  signalStrength: number;
  signalQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  connectedTo: string;
}

export interface SignalZone {
  type: 'excellent' | 'good' | 'fair' | 'poor' | 'dead';
  polygon: Array<{ x: number; y: number }>;
  color: string;
  opacity: number;
}

export interface FloorVisualization {
  floor: number;
  floorName: string;
  imagePath: string;
  imageBase64: string | undefined;
  nodes: NodeMarker[];
  devices: DeviceMarker[];
  signalZones: SignalZone[];
  recommendations: Array<{
    type: 'add_node' | 'move_node' | 'move_device';
    position: { x: number; y: number };
    description: string;
  }>;
  legend: {
    signalColors: Record<string, string>;
    iconMeanings: Record<string, string>;
  };
  svgOverlay: string;
  asciiPreview: string;
}

export interface BuildingConfig {
  name: string;
  floors: FloorPlanConfig[];
  nodePositions: Array<{
    nodeId: string;
    floor: number;
    x: number;
    y: number;
  }>;
}

export class FloorPlanManager {
  private buildingConfig: BuildingConfig | null = null;
  private floorPlans: Map<number, FloorPlanConfig> = new Map();

  async setFloorPlan(config: {
    floor: number;
    name: string;
    imagePath: string;
    widthMeters: number;
    heightMeters: number;
  }): Promise<{ success: boolean; message: string }> {
    try {
      const stats = await fs.stat(config.imagePath);
      if (!stats.isFile()) {
        return { success: false, message: `${config.imagePath} ist keine Datei` };
      }

      const ext = path.extname(config.imagePath).toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) {
        return { success: false, message: `Nicht unterstütztes Bildformat: ${ext}` };
      }

      const imageBuffer = await fs.readFile(config.imagePath);
      const base64 = imageBuffer.toString('base64');
      const mimeType = ext === '.png' ? 'image/png' : 
                       ext === '.svg' ? 'image/svg+xml' : 
                       ext === '.gif' ? 'image/gif' : 
                       ext === '.webp' ? 'image/webp' : 'image/jpeg';

      const floorConfig: FloorPlanConfig = {
        floor: config.floor,
        name: config.name,
        imagePath: config.imagePath,
        imageBase64: `data:${mimeType};base64,${base64}`,
        dimensions: {
          widthMeters: config.widthMeters,
          heightMeters: config.heightMeters,
          widthPixels: 1000,
          heightPixels: Math.round(1000 * (config.heightMeters / config.widthMeters)),
        },
        origin: { x: 0, y: 0 },
        rotation: 0,
      };

      this.floorPlans.set(config.floor, floorConfig);
      
      logger.info({ floor: config.floor, name: config.name }, 'Floor plan configured');
      
      return { 
        success: true, 
        message: `Grundriss für ${config.name} (Etage ${config.floor}) erfolgreich geladen` 
      };
    } catch (err) {
      logger.error({ err, path: config.imagePath }, 'Failed to load floor plan');
      return { 
        success: false, 
        message: `Fehler beim Laden: ${err instanceof Error ? err.message : 'Unbekannt'}` 
      };
    }
  }

  async setFloorPlanFromBase64(config: {
    floor: number;
    name: string;
    imageBase64: string;
    widthMeters: number;
    heightMeters: number;
  }): Promise<{ success: boolean; message: string }> {
    const floorConfig: FloorPlanConfig = {
      floor: config.floor,
      name: config.name,
      imagePath: '',
      imageBase64: config.imageBase64,
      dimensions: {
        widthMeters: config.widthMeters,
        heightMeters: config.heightMeters,
        widthPixels: 1000,
        heightPixels: Math.round(1000 * (config.heightMeters / config.widthMeters)),
      },
      origin: { x: 0, y: 0 },
      rotation: 0,
    };

    this.floorPlans.set(config.floor, floorConfig);
    
    logger.info({ floor: config.floor, name: config.name }, 'Floor plan configured from base64');
    
    return { 
      success: true, 
      message: `Grundriss für ${config.name} (Etage ${config.floor}) erfolgreich geladen` 
    };
  }

  setFloorPlanEmpty(config: {
    floor: number;
    name: string;
    widthMeters: number;
    heightMeters: number;
  }): { success: boolean; message: string } {
    const floorConfig: FloorPlanConfig = {
      floor: config.floor,
      name: config.name,
      imagePath: '',
      imageBase64: '',
      dimensions: {
        widthMeters: config.widthMeters,
        heightMeters: config.heightMeters,
        widthPixels: 1000,
        heightPixels: Math.round(1000 * (config.heightMeters / config.widthMeters)),
      },
      origin: { x: 0, y: 0 },
      rotation: 0,
    };

    this.floorPlans.set(config.floor, floorConfig);
    
    logger.info({ floor: config.floor, name: config.name }, 'Empty floor plan configured');
    
    return { 
      success: true, 
      message: `Leerer Grundriss für ${config.name} (Etage ${config.floor}) erstellt` 
    };
  }

  getFloorPlan(floor: number): FloorPlanConfig | null {
    return this.floorPlans.get(floor) ?? null;
  }

  getAllFloors(): number[] {
    return Array.from(this.floorPlans.keys()).sort((a, b) => a - b);
  }

  generateVisualization(
    floor: number,
    nodes: MeshNode[],
    devices: NetworkDevice[]
  ): FloorVisualization | null {
    const floorPlan = this.floorPlans.get(floor);
    if (!floorPlan) {
      return null;
    }

    const floorNodes = nodes.filter(n => n.location?.z === floor);
    const nodeMarkers: NodeMarker[] = floorNodes.map(node => {
      const pixelPos = this.metersToPixels(
        node.location?.x ?? 0,
        node.location?.y ?? 0,
        floorPlan
      );
      
      return {
        id: node.id,
        name: node.name,
        type: node.isMainRouter ? 'router' : 'node',
        position: { x: node.location?.x ?? 0, y: node.location?.y ?? 0 },
        pixelPosition: pixelPos,
        signalRadius: 150,
        status: 'online',
        connectedDevices: node.connectedClients,
      };
    });

    const deviceMarkers: DeviceMarker[] = devices
      .filter(d => {
        const connectedNode = nodes.find(n => n.macAddress === d.connectedToNode);
        return connectedNode?.location?.z === floor;
      })
      .map(device => {
        const connectedNode = nodes.find(n => n.macAddress === device.connectedToNode);
        const nodePos = connectedNode?.location ?? { x: 0, y: 0 };
        
        const signal = device.signalStrength ?? -70;
        const estimatedDistance = this.rssiToDistance(signal);
        
        const angle = this.calculateDeterministicAngle(device.macAddress, nodes, connectedNode);
        const devicePos = {
          x: nodePos.x + Math.cos(angle) * estimatedDistance,
          y: nodePos.y + Math.sin(angle) * estimatedDistance,
        };
        
        const pixelPos = this.metersToPixels(devicePos.x, devicePos.y, floorPlan);
        
        return {
          mac: device.macAddress,
          name: device.hostname ?? device.macAddress,
          type: this.guessDeviceType(device.hostname, device.vendor),
          position: devicePos,
          pixelPosition: pixelPos,
          signalStrength: signal,
          signalQuality: this.getSignalQuality(signal),
          connectedTo: connectedNode?.name ?? 'Unknown',
        };
      });

    const signalZones = this.generateSignalZones(nodeMarkers, floorPlan);
    const svgOverlay = this.generateSvgOverlay(nodeMarkers, deviceMarkers, signalZones, floorPlan);
    const asciiPreview = this.generateAsciiPreview(floor, nodeMarkers, deviceMarkers);

    return {
      floor,
      floorName: floorPlan.name,
      imagePath: floorPlan.imagePath,
      imageBase64: floorPlan.imageBase64,
      nodes: nodeMarkers,
      devices: deviceMarkers,
      signalZones,
      recommendations: [],
      legend: {
        signalColors: {
          excellent: '#00ff00',
          good: '#7fff00',
          fair: '#ffff00',
          poor: '#ff7f00',
          dead: '#ff0000',
        },
        iconMeanings: {
          '📡': 'Router/Node',
          '📱': 'Smartphone',
          '💻': 'Laptop/PC',
          '📺': 'TV/Streaming',
          '🔌': 'IoT-Gerät',
        },
      },
      svgOverlay,
      asciiPreview,
    };
  }

  private metersToPixels(
    x: number,
    y: number,
    floorPlan: FloorPlanConfig
  ): { x: number; y: number } {
    const pixelsPerMeterX = floorPlan.dimensions.widthPixels / floorPlan.dimensions.widthMeters;
    const pixelsPerMeterY = floorPlan.dimensions.heightPixels / floorPlan.dimensions.heightMeters;
    
    return {
      x: Math.round((x - floorPlan.origin.x) * pixelsPerMeterX),
      y: Math.round((y - floorPlan.origin.y) * pixelsPerMeterY),
    };
  }

  private getSignalQuality(rssi: number): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
    if (rssi >= -50) return 'excellent';
    if (rssi >= -60) return 'good';
    if (rssi >= -70) return 'fair';
    if (rssi >= -80) return 'poor';
    return 'critical';
  }

  private rssiToDistance(rssi: number): number {
    const txPower = -59;
    const pathLossExponent = 2.5;
    const ratio = (txPower - rssi) / (10 * pathLossExponent);
    return Math.pow(10, ratio);
  }

  private calculateDeterministicAngle(
    macAddress: string,
    nodes: MeshNode[],
    connectedNode?: MeshNode
  ): number {
    let hash = 0;
    for (let i = 0; i < macAddress.length; i++) {
      hash = ((hash << 5) - hash) + macAddress.charCodeAt(i);
      hash = hash & hash;
    }
    
    if (connectedNode?.location && nodes.length > 1) {
      const otherNodes = nodes.filter(n => n.macAddress !== connectedNode.macAddress);
      if (otherNodes.length > 0) {
        const nearest = otherNodes.reduce((closest, node) => {
          if (!node.location || !connectedNode.location) return closest;
          const dist = Math.sqrt(
            Math.pow(node.location.x - connectedNode.location.x, 2) +
            Math.pow(node.location.y - connectedNode.location.y, 2)
          );
          const closestDist = closest.location ? Math.sqrt(
            Math.pow(closest.location.x - connectedNode.location.x, 2) +
            Math.pow(closest.location.y - connectedNode.location.y, 2)
          ) : Infinity;
          return dist < closestDist ? node : closest;
        });
        
        if (nearest.location && connectedNode.location) {
          const awayAngle = Math.atan2(
            connectedNode.location.y - nearest.location.y,
            connectedNode.location.x - nearest.location.x
          );
          const spread = Math.PI / 2;
          const offset = ((hash % 100) / 100 - 0.5) * spread;
          return awayAngle + offset;
        }
      }
    }
    
    return ((hash % 1000) / 1000) * 2 * Math.PI;
  }

  private guessDeviceType(
    hostname?: string,
    vendor?: string
  ): 'phone' | 'laptop' | 'tv' | 'iot' | 'unknown' {
    const name = (hostname ?? '').toLowerCase();
    const v = (vendor ?? '').toLowerCase();
    
    if (name.includes('iphone') || name.includes('android') || name.includes('galaxy') || 
        name.includes('pixel') || v.includes('apple') && name.includes('phone')) {
      return 'phone';
    }
    if (name.includes('macbook') || name.includes('laptop') || name.includes('notebook') ||
        name.includes('desktop') || name.includes('-pc')) {
      return 'laptop';
    }
    if (name.includes('tv') || name.includes('roku') || name.includes('fire') ||
        name.includes('chromecast') || name.includes('appletv')) {
      return 'tv';
    }
    if (name.includes('esp') || name.includes('shelly') || name.includes('tasmota') ||
        name.includes('sonoff') || name.includes('tuya') || name.includes('sensor')) {
      return 'iot';
    }
    return 'unknown';
  }

  private generateSignalZones(
    nodes: NodeMarker[],
    floorPlan: FloorPlanConfig
  ): SignalZone[] {
    const zones: SignalZone[] = [];
    
    const pixelsPerMeter = floorPlan.dimensions.widthPixels / floorPlan.dimensions.widthMeters;
    
    const excellentRadiusMeters = 3;
    const goodRadiusMeters = 7;
    const fairRadiusMeters = 12;
    
    for (const node of nodes) {
      const baseRadius = node.signalRadius > 0 ? node.signalRadius / pixelsPerMeter : 10;
      
      const excellentRadius = Math.min(baseRadius * 0.3, excellentRadiusMeters) * pixelsPerMeter;
      const goodRadius = Math.min(baseRadius * 0.6, goodRadiusMeters) * pixelsPerMeter;
      const fairRadius = Math.min(baseRadius, fairRadiusMeters) * pixelsPerMeter;
      
      zones.push({
        type: 'excellent',
        polygon: this.generateCirclePolygon(node.pixelPosition, excellentRadius),
        color: '#00ff00',
        opacity: 0.2,
      });
      
      zones.push({
        type: 'good',
        polygon: this.generateCirclePolygon(node.pixelPosition, goodRadius),
        color: '#7fff00',
        opacity: 0.15,
      });
      
      zones.push({
        type: 'fair',
        polygon: this.generateCirclePolygon(node.pixelPosition, fairRadius),
        color: '#ffff00',
        opacity: 0.1,
      });
    }
    
    return zones;
  }

  private generateCirclePolygon(
    center: { x: number; y: number },
    radius: number,
    segments: number = 16
  ): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * 2 * Math.PI;
      points.push({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
    }
    
    return points;
  }

  private generateSvgOverlay(
    nodes: NodeMarker[],
    devices: DeviceMarker[],
    zones: SignalZone[],
    floorPlan: FloorPlanConfig
  ): string {
    const { widthPixels, heightPixels } = floorPlan.dimensions;
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPixels} ${heightPixels}">\n`;
    svg += `  <style>\n`;
    svg += `    .node { fill: #2563eb; stroke: white; stroke-width: 2; }\n`;
    svg += `    .router { fill: #dc2626; stroke: white; stroke-width: 2; }\n`;
    svg += `    .device-excellent { fill: #22c55e; }\n`;
    svg += `    .device-good { fill: #84cc16; }\n`;
    svg += `    .device-fair { fill: #eab308; }\n`;
    svg += `    .device-poor { fill: #f97316; }\n`;
    svg += `    .device-critical { fill: #ef4444; }\n`;
    svg += `    .label { font-family: sans-serif; font-size: 12px; fill: white; }\n`;
    svg += `  </style>\n`;

    for (const zone of zones) {
      const points = zone.polygon.map(p => `${p.x},${p.y}`).join(' ');
      svg += `  <polygon points="${points}" fill="${zone.color}" opacity="${zone.opacity}"/>\n`;
    }

    for (const node of nodes) {
      const className = node.type === 'router' ? 'router' : 'node';
      svg += `  <circle cx="${node.pixelPosition.x}" cy="${node.pixelPosition.y}" r="20" class="${className}"/>\n`;
      svg += `  <text x="${node.pixelPosition.x}" y="${node.pixelPosition.y + 35}" text-anchor="middle" class="label" fill="black">${node.name}</text>\n`;
    }

    for (const device of devices) {
      const className = `device-${device.signalQuality}`;
      svg += `  <circle cx="${device.pixelPosition.x}" cy="${device.pixelPosition.y}" r="8" class="${className}"/>\n`;
    }

    svg += `</svg>`;
    
    return svg;
  }

  private generateAsciiPreview(
    floor: number,
    nodes: NodeMarker[],
    devices: DeviceMarker[]
  ): string {
    const width = 60;
    const height = 30;
    const grid: string[][] = Array(height).fill(null).map(() => Array(width).fill('·'));

    for (const node of nodes) {
      const x = Math.min(width - 1, Math.max(0, Math.round(node.pixelPosition.x / 20)));
      const y = Math.min(height - 1, Math.max(0, Math.round(node.pixelPosition.y / 20)));
      grid[y][x] = node.type === 'router' ? '◉' : '○';
    }

    for (const device of devices) {
      const x = Math.min(width - 1, Math.max(0, Math.round(device.pixelPosition.x / 20)));
      const y = Math.min(height - 1, Math.max(0, Math.round(device.pixelPosition.y / 20)));
      const icon = device.signalQuality === 'excellent' ? '●' :
                   device.signalQuality === 'good' ? '◐' :
                   device.signalQuality === 'fair' ? '◔' :
                   device.signalQuality === 'poor' ? '○' : '✗';
      if (grid[y][x] === '·') {
        grid[y][x] = icon;
      }
    }

    let ascii = `┌${'─'.repeat(width)}┐\n`;
    ascii += `│ Etage ${floor}: ${nodes.length} Nodes, ${devices.length} Geräte${' '.repeat(width - 30)}│\n`;
    ascii += `├${'─'.repeat(width)}┤\n`;
    
    for (const row of grid) {
      ascii += `│${row.join('')}│\n`;
    }
    
    ascii += `├${'─'.repeat(width)}┤\n`;
    ascii += `│ ◉=Router ○=Node ●=Excellent ◐=Good ◔=Fair ✗=Critical${' '.repeat(width - 54)}│\n`;
    ascii += `└${'─'.repeat(width)}┘`;
    
    return ascii;
  }

  hasFloorPlans(): boolean {
    return this.floorPlans.size > 0;
  }

  clearFloorPlans(): void {
    this.floorPlans.clear();
    this.buildingConfig = null;
    logger.info('Floor plans cleared');
  }
}
