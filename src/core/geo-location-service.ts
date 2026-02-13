import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger('geo-location-service');

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface PropertyOutline {
  coordinates: GeoCoordinates;
  address?: string;
  boundingBox: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  estimatedDimensions: {
    widthMeters: number;
    heightMeters: number;
    areaSquareMeters: number;
  };
  buildingFootprint?: Array<{ x: number; y: number }>;
  source: 'openstreetmap' | 'nominatim' | 'manual';
}

export interface GeneratedFloorPlan {
  floorNumber: number;
  floorName: string;
  widthMeters: number;
  heightMeters: number;
  svgContent: string;
  asciiPreview: string;
  mapImageBase64?: string;
  mapImageUrl?: string;
  placeholderRooms: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export interface MapImage {
  base64: string;
  url: string;
  width: number;
  height: number;
  zoom: number;
  source: 'openstreetmap' | 'carto';
}

export class GeoLocationService {
  private propertyData: PropertyOutline | null = null;
  private generatedFloors: Map<number, GeneratedFloorPlan> = new Map();
  private cachedMapImage: MapImage | null = null;

  async setLocationByAddress(address: string): Promise<PropertyOutline | null> {
    logger.info({ address }, 'Resolving address to coordinates');
    
    try {
      const encoded = encodeURIComponent(address);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&addressdetails=1&limit=1`,
        {
          headers: {
            'User-Agent': 'OpenClaw-WiFi-Skill/1.5.1',
          },
        }
      );

      if (!response.ok) {
        logger.warn({ status: response.status }, 'Nominatim API error');
        return null;
      }

      const results = await response.json() as Array<{
        lat: string;
        lon: string;
        display_name: string;
        boundingbox: [string, string, string, string];
      }>;

      if (results.length === 0) {
        logger.warn({ address }, 'No results found for address');
        return null;
      }

      const result = results[0]!;
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);
      const bbox = result.boundingbox.map(parseFloat);

      const widthMeters = this.calculateDistance(
        lat, bbox[2]!, lat, bbox[3]!
      );
      const heightMeters = this.calculateDistance(
        bbox[0]!, lon, bbox[1]!, lon
      );

      this.propertyData = {
        coordinates: { latitude: lat, longitude: lon },
        address: result.display_name,
        boundingBox: {
          south: bbox[0]!,
          north: bbox[1]!,
          west: bbox[2]!,
          east: bbox[3]!,
        },
        estimatedDimensions: {
          widthMeters: Math.max(10, Math.min(100, widthMeters)),
          heightMeters: Math.max(10, Math.min(100, heightMeters)),
          areaSquareMeters: widthMeters * heightMeters,
        },
        source: 'nominatim',
      };

      logger.info({ 
        lat, 
        lon, 
        dimensions: this.propertyData.estimatedDimensions 
      }, 'Location resolved');

      return this.propertyData;
    } catch (error) {
      logger.error({ error, address }, 'Failed to resolve address');
      return null;
    }
  }

  setLocationByCoordinates(lat: number, lon: number, widthMeters: number = 20, heightMeters: number = 15): PropertyOutline {
    this.propertyData = {
      coordinates: { latitude: lat, longitude: lon },
      boundingBox: {
        north: lat + 0.0001,
        south: lat - 0.0001,
        east: lon + 0.0001,
        west: lon - 0.0001,
      },
      estimatedDimensions: {
        widthMeters,
        heightMeters,
        areaSquareMeters: widthMeters * heightMeters,
      },
      source: 'manual',
    };

    logger.info({ lat, lon, widthMeters, heightMeters }, 'Manual coordinates set');
    return this.propertyData;
  }

  generateFloorPlans(floorCount: number = 2, hasBasement: boolean = false, hasAttic: boolean = false): GeneratedFloorPlan[] {
    if (!this.propertyData) {
      logger.warn('No property data set - using defaults');
      this.setLocationByCoordinates(0, 0, 15, 12);
    }

    const floors: GeneratedFloorPlan[] = [];
    const { widthMeters, heightMeters } = this.propertyData!.estimatedDimensions;

    let floorNumber = hasBasement ? -1 : 0;
    const totalFloors = floorCount + (hasBasement ? 1 : 0) + (hasAttic ? 1 : 0);

    for (let i = 0; i < totalFloors; i++) {
      const floorName = this.getFloorName(floorNumber, hasBasement, hasAttic, floorCount);
      const floorWidth = floorNumber < 0 ? widthMeters * 0.8 : 
                         floorNumber > floorCount - 1 ? widthMeters * 0.6 : 
                         widthMeters;
      const floorHeight = floorNumber < 0 ? heightMeters * 0.8 :
                          floorNumber > floorCount - 1 ? heightMeters * 0.5 :
                          heightMeters;

      const floor: GeneratedFloorPlan = {
        floorNumber,
        floorName,
        widthMeters: Math.round(floorWidth * 10) / 10,
        heightMeters: Math.round(floorHeight * 10) / 10,
        svgContent: this.generateFloorSvg(floorNumber, floorWidth, floorHeight, floorName),
        asciiPreview: this.generateFloorAscii(floorNumber, floorWidth, floorHeight, floorName),
        placeholderRooms: this.generatePlaceholderRooms(floorNumber, floorWidth, floorHeight),
      };

      floors.push(floor);
      this.generatedFloors.set(floorNumber, floor);
      floorNumber++;
    }

    logger.info({ floorCount: floors.length }, 'Floor plans generated');
    return floors;
  }

  private getFloorName(floorNumber: number, _hasBasement: boolean, hasAttic: boolean, totalRegularFloors: number): string {
    if (floorNumber < 0) return 'Keller';
    if (floorNumber === 0) return 'Erdgeschoss';
    if (floorNumber === 1) return '1. Stock';
    if (floorNumber === 2) return '2. Stock';
    if (floorNumber === 3) return '3. Stock';
    if (hasAttic && floorNumber >= totalRegularFloors) return 'Dachgeschoss';
    return `${floorNumber}. Stock`;
  }

  private generateFloorSvg(floorNumber: number, width: number, height: number, name: string): string {
    const scale = 20;
    const svgWidth = width * scale;
    const svgHeight = height * scale;
    const padding = 10;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth + padding * 2} ${svgHeight + padding * 2}">`;
    svg += `<style>`;
    svg += `.wall { fill: none; stroke: #333; stroke-width: 3; }`;
    svg += `.room { fill: #f5f5f5; stroke: #666; stroke-width: 1; }`;
    svg += `.label { font-family: Arial, sans-serif; font-size: 12px; fill: #333; }`;
    svg += `.title { font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; fill: #000; }`;
    svg += `.node-zone { fill: rgba(0, 150, 0, 0.1); stroke: #0a0; stroke-dasharray: 5,5; }`;
    svg += `</style>`;
    
    svg += `<rect class="wall" x="${padding}" y="${padding}" width="${svgWidth}" height="${svgHeight}" rx="2"/>`;
    svg += `<text class="title" x="${padding + 5}" y="${padding - 3}">${name}</text>`;
    
    const rooms = this.generatePlaceholderRooms(floorNumber, width, height);
    for (const room of rooms) {
      const rx = padding + room.x * scale;
      const ry = padding + room.y * scale;
      const rw = room.width * scale;
      const rh = room.height * scale;
      svg += `<rect class="room" x="${rx}" y="${ry}" width="${rw}" height="${rh}"/>`;
      svg += `<text class="label" x="${rx + rw/2}" y="${ry + rh/2}" text-anchor="middle" dominant-baseline="middle">${room.name}</text>`;
    }

    svg += `</svg>`;
    return svg;
  }

  private generateFloorAscii(_floorNumber: number, width: number, height: number, name: string): string {
    const cols = Math.min(60, Math.round(width * 3));
    const rows = Math.min(25, Math.round(height * 2));

    let ascii = `┌${'─'.repeat(cols)}┐\n`;
    ascii += `│ ${name.padEnd(cols - 2)} │\n`;
    ascii += `│ ${`${width}m × ${height}m`.padEnd(cols - 2)} │\n`;
    ascii += `├${'─'.repeat(cols)}┤\n`;

    for (let y = 0; y < rows - 6; y++) {
      ascii += `│${' '.repeat(cols)}│\n`;
    }

    ascii += `│ ${'[Platzhalter für Geräte-Positionen]'.padEnd(cols - 2)} │\n`;
    ascii += `│ ${'Nutze triangulate_devices für echte Positionen'.padEnd(cols - 2)} │\n`;
    ascii += `└${'─'.repeat(cols)}┘\n`;

    return ascii;
  }

  private generatePlaceholderRooms(floorNumber: number, width: number, height: number): GeneratedFloorPlan['placeholderRooms'] {
    const rooms: GeneratedFloorPlan['placeholderRooms'] = [];
    
    if (floorNumber < 0) {
      rooms.push({ id: 'basement-main', name: 'Keller', x: 0.5, y: 0.5, width: width - 1, height: height - 1 });
    } else if (floorNumber === 0) {
      const halfWidth = (width - 1) / 2;
      rooms.push({ id: 'living', name: 'Wohnzimmer', x: 0.5, y: 0.5, width: halfWidth, height: height * 0.6 });
      rooms.push({ id: 'kitchen', name: 'Küche', x: 0.5 + halfWidth, y: 0.5, width: halfWidth, height: height * 0.6 });
      rooms.push({ id: 'hallway', name: 'Flur', x: 0.5, y: height * 0.6 + 0.5, width: width - 1, height: height * 0.35 });
    } else {
      const thirdWidth = (width - 1) / 3;
      rooms.push({ id: `bedroom-${floorNumber}-1`, name: 'Schlafzimmer', x: 0.5, y: 0.5, width: thirdWidth * 2, height: height * 0.5 });
      rooms.push({ id: `bath-${floorNumber}`, name: 'Bad', x: 0.5 + thirdWidth * 2, y: 0.5, width: thirdWidth, height: height * 0.5 });
      rooms.push({ id: `bedroom-${floorNumber}-2`, name: 'Kinderzimmer', x: 0.5, y: height * 0.5 + 0.5, width: thirdWidth, height: height * 0.45 });
      rooms.push({ id: `office-${floorNumber}`, name: 'Büro', x: 0.5 + thirdWidth, y: height * 0.5 + 0.5, width: thirdWidth * 2, height: height * 0.45 });
    }

    return rooms;
  }

  getPropertyData(): PropertyOutline | null {
    return this.propertyData;
  }

  getGeneratedFloor(floorNumber: number): GeneratedFloorPlan | null {
    return this.generatedFloors.get(floorNumber) ?? null;
  }

  getAllGeneratedFloors(): GeneratedFloorPlan[] {
    return Array.from(this.generatedFloors.values()).sort((a, b) => a.floorNumber - b.floorNumber);
  }

  async fetchMapImage(zoom: number = 18): Promise<MapImage | null> {
    if (!this.propertyData) {
      logger.warn('No property data set - cannot fetch map');
      return null;
    }

    const { latitude, longitude } = this.propertyData.coordinates;
    const width = 600;
    const height = 400;

    // Use OpenStreetMap tiles via multiple tile servers (free, no API key required)
    const tileX = this.lonToTileX(longitude, zoom);
    const tileY = this.latToTileY(latitude, zoom);
    
    // Primary: Carto Voyager tiles (reliable, good quality)
    const staticMapUrl = `https://a.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${tileX}/${tileY}.png`;
    
    // Alternative tile URL for reference
    const _alternativeUrl = `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`;

    try {
      logger.info({ lat: latitude, lon: longitude, zoom }, 'Fetching map image');
      
      const response = await fetch(staticMapUrl, {
        headers: {
          'User-Agent': 'OpenClaw-WiFi-Skill/1.6.0',
        },
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, 'Failed to fetch map image');
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = response.headers.get('content-type') ?? 'image/png';

      this.cachedMapImage = {
        base64: `data:${mimeType};base64,${base64}`,
        url: staticMapUrl,
        width,
        height,
        zoom,
        source: 'openstreetmap',
      };

      logger.info({ size: base64.length, zoom }, 'Map image fetched successfully');
      return this.cachedMapImage;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch map image');
      return null;
    }
  }

  getCachedMapImage(): MapImage | null {
    return this.cachedMapImage;
  }

  exportPropertyData(): PropertyOutline | null {
    return this.propertyData;
  }

  importPropertyData(data: PropertyOutline | null): void {
    if (data) {
      this.propertyData = data;
      logger.info({ coordinates: data.coordinates }, 'Property data imported');
    }
  }

  private lonToTileX(lon: number, zoom: number): number {
    return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
  }

  private latToTileY(lat: number, zoom: number): number {
    return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }
}
