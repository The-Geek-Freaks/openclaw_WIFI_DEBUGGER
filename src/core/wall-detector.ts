import { createChildLogger } from '../utils/logger.js';
import { rssiToDistance } from '../utils/frequency.js';

const logger = createChildLogger('wall-detector');

export interface DetectedWall {
  id: string;
  floorNumber: number;
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  material: 'drywall' | 'concrete' | 'brick' | 'glass' | 'unknown';
  estimatedAttenuation: number;
  confidence: number;
  detectedFrom: Array<{
    deviceMac: string;
    nodeMac: string;
    expectedRssi: number;
    actualRssi: number;
    attenuationDelta: number;
  }>;
}

export interface WallDetectionResult {
  floorNumber: number;
  detectedWalls: DetectedWall[];
  roomBoundaries: Array<{
    id: string;
    name: string;
    bounds: { x: number; y: number; width: number; height: number };
    confidence: number;
  }>;
  signalAnomalies: Array<{
    location: { x: number; y: number };
    type: 'high_attenuation' | 'reflection' | 'interference';
    severity: number;
  }>;
}

interface SignalDataPoint {
  deviceMac: string;
  devicePosition: { x: number; y: number; z: number };
  nodeMac: string;
  nodePosition: { x: number; y: number; z: number };
  rssi: number;
  distance: number;
  floorNumber: number;
}

export class WallDetector {
  private signalData: SignalDataPoint[] = [];
  private detectedWalls: Map<number, DetectedWall[]> = new Map();

  // Material attenuation values (dB per wall)
  private readonly WALL_ATTENUATION = {
    drywall: { min: 3, max: 8, avg: 5 },
    wood: { min: 4, max: 10, avg: 6 },
    glass: { min: 2, max: 4, avg: 3 },
    brick: { min: 8, max: 15, avg: 12 },
    concrete: { min: 15, max: 30, avg: 22 },
  };

  addSignalMeasurement(data: {
    deviceMac: string;
    devicePosition: { x: number; y: number; z: number };
    nodeMac: string;
    nodePosition: { x: number; y: number; z: number };
    rssi: number;
    floorNumber: number;
  }): void {
    const distance = this.calculateDistance(data.devicePosition, data.nodePosition);
    
    this.signalData.push({
      ...data,
      distance,
    });

    logger.debug({ 
      deviceMac: data.deviceMac, 
      nodeMac: data.nodeMac, 
      rssi: data.rssi, 
      distance 
    }, 'Signal measurement added');
  }

  detectWalls(floorNumber: number): WallDetectionResult {
    const floorData = this.signalData.filter(d => d.floorNumber === floorNumber);
    
    if (floorData.length < 3) {
      logger.warn({ floorNumber, dataPoints: floorData.length }, 'Insufficient data for wall detection');
      return {
        floorNumber,
        detectedWalls: [],
        roomBoundaries: [],
        signalAnomalies: [],
      };
    }

    const walls: DetectedWall[] = [];
    const anomalies: WallDetectionResult['signalAnomalies'] = [];

    // Group by device to analyze signal patterns
    const deviceGroups = this.groupByDevice(floorData);

    for (const [deviceMac, measurements] of deviceGroups) {
      if (measurements.length < 2) continue;

      // Compare expected vs actual RSSI for each node
      for (const m of measurements) {
        const expectedRssi = this.calculateExpectedRssi(m.distance);
        const actualRssi = m.rssi;
        const attenuationDelta = expectedRssi - actualRssi;

        // If attenuation is significantly higher than free-space, there's likely a wall
        if (attenuationDelta > 5) {
          const wallMaterial = this.estimateWallMaterial(attenuationDelta);
          const wallId = `wall_${floorNumber}_${deviceMac}_${m.nodeMac}`;

          // Calculate wall position (midpoint between device and node)
          const wallPoint = {
            x: (m.devicePosition.x + m.nodePosition.x) / 2,
            y: (m.devicePosition.y + m.nodePosition.y) / 2,
          };

          // Check if wall already exists nearby
          const existingWall = walls.find(w => 
            this.distanceBetween2D(w.startPoint, wallPoint) < 2 ||
            this.distanceBetween2D(w.endPoint, wallPoint) < 2
          );

          if (existingWall) {
            existingWall.detectedFrom.push({
              deviceMac,
              nodeMac: m.nodeMac,
              expectedRssi,
              actualRssi,
              attenuationDelta,
            });
            existingWall.confidence = Math.min(1, existingWall.confidence + 0.1);
          } else {
            walls.push({
              id: wallId,
              floorNumber,
              startPoint: { x: m.devicePosition.x, y: m.devicePosition.y },
              endPoint: { x: m.nodePosition.x, y: m.nodePosition.y },
              material: wallMaterial,
              estimatedAttenuation: attenuationDelta,
              confidence: Math.min(1, attenuationDelta / 30),
              detectedFrom: [{
                deviceMac,
                nodeMac: m.nodeMac,
                expectedRssi,
                actualRssi,
                attenuationDelta,
              }],
            });
          }

          // Mark as anomaly if very high attenuation
          if (attenuationDelta > 20) {
            anomalies.push({
              location: wallPoint,
              type: 'high_attenuation',
              severity: Math.min(1, attenuationDelta / 40),
            });
          }
        }
      }
    }

    // Store results
    this.detectedWalls.set(floorNumber, walls);

    // Generate room boundaries from wall intersections
    const roomBoundaries = this.inferRoomBoundaries(walls, floorNumber);

    logger.info({ 
      floorNumber, 
      wallsDetected: walls.length,
      roomsInferred: roomBoundaries.length,
      anomalies: anomalies.length,
    }, 'Wall detection complete');

    return {
      floorNumber,
      detectedWalls: walls,
      roomBoundaries,
      signalAnomalies: anomalies,
    };
  }

  private calculateExpectedRssi(distanceMeters: number): number {
    // Free Space Path Loss at 2.4 GHz
    // RSSI = TxPower - FSPL
    // FSPL = 20 * log10(d) + 20 * log10(f) + 20 * log10(4π/c)
    // Simplified for 2.4 GHz: RSSI ≈ -40 - 20 * log10(d)
    const txPower = -40; // Typical reference at 1 meter
    return txPower - 20 * Math.log10(Math.max(1, distanceMeters));
  }

  private estimateWallMaterial(attenuationDb: number): DetectedWall['material'] {
    if (attenuationDb < 5) return 'glass';
    if (attenuationDb < 10) return 'drywall';
    if (attenuationDb < 18) return 'brick';
    if (attenuationDb < 30) return 'concrete';
    return 'unknown';
  }

  private inferRoomBoundaries(walls: DetectedWall[], floorNumber: number): WallDetectionResult['roomBoundaries'] {
    if (walls.length < 2) return [];

    // Simple clustering: group walls that form enclosed areas
    const rooms: WallDetectionResult['roomBoundaries'] = [];
    const wallPoints = walls.flatMap(w => [w.startPoint, w.endPoint]);
    
    if (wallPoints.length < 4) return [];

    // Calculate bounding box
    const minX = Math.min(...wallPoints.map(p => p.x));
    const maxX = Math.max(...wallPoints.map(p => p.x));
    const minY = Math.min(...wallPoints.map(p => p.y));
    const maxY = Math.max(...wallPoints.map(p => p.y));

    // Divide into grid cells based on wall density
    const gridSize = 5; // 5 meter cells
    const cols = Math.ceil((maxX - minX) / gridSize);
    const rows = Math.ceil((maxY - minY) / gridSize);

    let roomId = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cellX = minX + col * gridSize;
        const cellY = minY + row * gridSize;
        
        // Check if this cell has walls around it
        const wallsInCell = walls.filter(w => 
          this.lineIntersectsCell(w.startPoint, w.endPoint, cellX, cellY, gridSize)
        );

        if (wallsInCell.length >= 2) {
          rooms.push({
            id: `room_${floorNumber}_${roomId++}`,
            name: `Raum ${roomId}`,
            bounds: { x: cellX, y: cellY, width: gridSize, height: gridSize },
            confidence: Math.min(1, wallsInCell.length / 4),
          });
        }
      }
    }

    return rooms;
  }

  private lineIntersectsCell(p1: { x: number; y: number }, p2: { x: number; y: number }, 
                              cellX: number, cellY: number, cellSize: number): boolean {
    const cellRight = cellX + cellSize;
    const cellBottom = cellY + cellSize;
    
    return (
      Math.min(p1.x, p2.x) <= cellRight &&
      Math.max(p1.x, p2.x) >= cellX &&
      Math.min(p1.y, p2.y) <= cellBottom &&
      Math.max(p1.y, p2.y) >= cellY
    );
  }

  private groupByDevice(data: SignalDataPoint[]): Map<string, SignalDataPoint[]> {
    const groups = new Map<string, SignalDataPoint[]>();
    for (const d of data) {
      const existing = groups.get(d.deviceMac) ?? [];
      existing.push(d);
      groups.set(d.deviceMac, existing);
    }
    return groups;
  }

  private calculateDistance(p1: { x: number; y: number; z: number }, p2: { x: number; y: number; z: number }): number {
    return Math.sqrt(
      Math.pow(p2.x - p1.x, 2) +
      Math.pow(p2.y - p1.y, 2) +
      Math.pow(p2.z - p1.z, 2)
    );
  }

  private distanceBetween2D(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  getDetectedWalls(floorNumber: number): DetectedWall[] {
    return this.detectedWalls.get(floorNumber) ?? [];
  }

  getAllDetectedWalls(): Map<number, DetectedWall[]> {
    return this.detectedWalls;
  }

  generateWallAscii(floorNumber: number, width: number = 60, height: number = 30): string {
    const walls = this.getDetectedWalls(floorNumber);
    
    if (walls.length === 0) {
      return `Keine Wände erkannt für Etage ${floorNumber}.\nMehr Signal-Daten sammeln mit record_signal_measurement.`;
    }

    // Calculate bounds
    const allPoints = walls.flatMap(w => [w.startPoint, w.endPoint]);
    const minX = Math.min(...allPoints.map(p => p.x)) - 1;
    const maxX = Math.max(...allPoints.map(p => p.x)) + 1;
    const minY = Math.min(...allPoints.map(p => p.y)) - 1;
    const maxY = Math.max(...allPoints.map(p => p.y)) + 1;

    const scaleX = width / (maxX - minX);
    const scaleY = height / (maxY - minY);

    // Create grid
    const grid: string[][] = Array(height).fill(null).map(() => Array(width).fill(' '));

    // Draw walls
    for (const wall of walls) {
      const x1 = Math.round((wall.startPoint.x - minX) * scaleX);
      const y1 = Math.round((wall.startPoint.y - minY) * scaleY);
      const x2 = Math.round((wall.endPoint.x - minX) * scaleX);
      const y2 = Math.round((wall.endPoint.y - minY) * scaleY);

      // Bresenham line
      this.drawLine(grid, x1, y1, x2, y2, this.getWallChar(wall.material));
    }

    // Render
    let ascii = `┌${'─'.repeat(width)}┐\n`;
    ascii += `│ Etage ${floorNumber} - ${walls.length} Wände erkannt${' '.repeat(width - 25 - String(floorNumber).length)}│\n`;
    ascii += `├${'─'.repeat(width)}┤\n`;
    
    for (const row of grid) {
      ascii += `│${row.join('')}│\n`;
    }
    
    ascii += `└${'─'.repeat(width)}┘\n`;
    ascii += `Legende: █=Beton ▓=Ziegel ▒=Rigips ░=Glas\n`;

    return ascii;
  }

  private getWallChar(material: DetectedWall['material']): string {
    switch (material) {
      case 'concrete': return '█';
      case 'brick': return '▓';
      case 'drywall': return '▒';
      case 'glass': return '░';
      default: return '▒';
    }
  }

  private drawLine(grid: string[][], x1: number, y1: number, x2: number, y2: number, char: string): void {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    let x = x1;
    let y = y1;

    while (true) {
      if (x >= 0 && x < grid[0]!.length && y >= 0 && y < grid.length) {
        grid[y]![x] = char;
      }
      if (x === x2 && y === y2) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  clearData(): void {
    this.signalData = [];
    this.detectedWalls.clear();
  }
}
