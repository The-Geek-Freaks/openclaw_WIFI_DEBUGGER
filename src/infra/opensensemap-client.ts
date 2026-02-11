import axios, { AxiosInstance } from 'axios';
import { createChildLogger } from '../utils/logger.js';
import { withTimeout } from '../utils/async-helpers.js';

const logger = createChildLogger('opensensemap');

const OPENSENSEMAP_API = 'https://api.opensensemap.org';
const API_TIMEOUT = 10000;

export interface SenseBoxSensor {
  _id: string;
  title: string;
  unit: string;
  sensorType: string;
  lastMeasurement?: {
    value: string;
    createdAt: string;
  };
}

export interface SenseBox {
  _id: string;
  name: string;
  description?: string;
  exposure: 'indoor' | 'outdoor' | 'mobile';
  gropiusApiKey?: string;
  model?: string;
  currentLocation: {
    type: string;
    coordinates: [number, number, number?];
    timestamp: string;
  };
  sensors: SenseBoxSensor[];
  createdAt: string;
  updatedAt: string;
  lastMeasurementAt?: string;
}

export interface EnvironmentData {
  temperature?: number;
  humidity?: number;
  pressure?: number;
  pm25?: number;
  pm10?: number;
  noise?: number;
  uvIndex?: number;
  windSpeed?: number;
  timestamp: Date;
  source: string;
}

export interface LocalEnvironmentAnalysis {
  timestamp: Date;
  senseBoxes: SenseBox[];
  environmentData: EnvironmentData[];
  wifiImpactFactors: {
    factor: string;
    value: number;
    impact: 'positive' | 'neutral' | 'negative';
    recommendation?: string | undefined;
  }[];
  overallEnvironmentScore: number;
}

export class OpenSenseMapClient {
  private readonly api: AxiosInstance;
  private readonly localBoxIds: string[];
  private cachedBoxes: Map<string, SenseBox> = new Map();
  private lastFetch: Date | null = null;
  private readonly cacheTimeout = 5 * 60 * 1000;

  constructor(senseBoxIds?: string[]) {
    this.localBoxIds = senseBoxIds ?? [];
    this.api = axios.create({
      baseURL: OPENSENSEMAP_API,
      timeout: API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async getSenseBox(boxId: string): Promise<SenseBox | null> {
    try {
      const response = await withTimeout(
        this.api.get<SenseBox>(`/boxes/${boxId}`),
        API_TIMEOUT,
        'OpenSenseMap API timeout'
      );
      return response.data;
    } catch (err) {
      logger.warn({ err, boxId }, 'Failed to fetch SenseBox');
      return null;
    }
  }

  async getLocalSenseBoxes(): Promise<SenseBox[]> {
    const boxes: SenseBox[] = [];

    for (const boxId of this.localBoxIds) {
      const box = await this.getSenseBox(boxId);
      if (box) {
        boxes.push(box);
        this.cachedBoxes.set(boxId, box);
      }
    }

    this.lastFetch = new Date();
    return boxes;
  }

  async findNearbyBoxes(
    latitude: number,
    longitude: number,
    radiusKm: number = 1
  ): Promise<SenseBox[]> {
    try {
      const response = await withTimeout(
        this.api.get<SenseBox[]>('/boxes', {
          params: {
            near: `${longitude},${latitude}`,
            maxDistance: radiusKm * 1000,
            limit: 10,
          },
        }),
        API_TIMEOUT,
        'OpenSenseMap nearby search timeout'
      );
      return response.data;
    } catch (err) {
      logger.warn({ err }, 'Failed to find nearby SenseBoxes');
      return [];
    }
  }

  async getEnvironmentData(): Promise<EnvironmentData[]> {
    const boxes = this.shouldRefetch() 
      ? await this.getLocalSenseBoxes() 
      : Array.from(this.cachedBoxes.values());

    const envData: EnvironmentData[] = [];

    for (const box of boxes) {
      const data = this.extractEnvironmentData(box);
      if (data) {
        envData.push(data);
      }
    }

    return envData;
  }

  private shouldRefetch(): boolean {
    if (!this.lastFetch) return true;
    return Date.now() - this.lastFetch.getTime() > this.cacheTimeout;
  }

  private extractEnvironmentData(box: SenseBox): EnvironmentData | null {
    const data: EnvironmentData = {
      timestamp: new Date(),
      source: box.name,
    };

    for (const sensor of box.sensors) {
      if (!sensor.lastMeasurement) continue;

      const value = parseFloat(sensor.lastMeasurement.value);
      if (isNaN(value)) continue;

      const title = sensor.title.toLowerCase();
      const type = sensor.sensorType.toLowerCase();

      if (title.includes('temperatur') || type.includes('hdc1080') || type.includes('bme')) {
        if (title.includes('temperatur') || !data.temperature) {
          data.temperature = value;
        }
      }

      if (title.includes('feucht') || title.includes('humid')) {
        data.humidity = value;
      }

      if (title.includes('druck') || title.includes('pressure') || title.includes('luftdruck')) {
        data.pressure = value;
      }

      if (title.includes('pm2.5') || title.includes('pm25') || title.includes('feinstaub')) {
        data.pm25 = value;
      }

      if (title.includes('pm10')) {
        data.pm10 = value;
      }

      if (title.includes('lärm') || title.includes('noise') || title.includes('laut')) {
        data.noise = value;
      }

      if (title.includes('uv')) {
        data.uvIndex = value;
      }

      if (title.includes('wind')) {
        data.windSpeed = value;
      }
    }

    const hasData = data.temperature !== undefined || 
                    data.humidity !== undefined || 
                    data.pressure !== undefined;

    return hasData ? data : null;
  }

  async analyzeEnvironmentImpact(): Promise<LocalEnvironmentAnalysis> {
    const boxes = await this.getLocalSenseBoxes();
    const environmentData = await this.getEnvironmentData();
    const wifiImpactFactors = this.calculateWifiImpactFactors(environmentData);
    const overallScore = this.calculateEnvironmentScore(wifiImpactFactors);

    return {
      timestamp: new Date(),
      senseBoxes: boxes,
      environmentData,
      wifiImpactFactors,
      overallEnvironmentScore: overallScore,
    };
  }

  private calculateWifiImpactFactors(
    envData: EnvironmentData[]
  ): LocalEnvironmentAnalysis['wifiImpactFactors'] {
    const factors: LocalEnvironmentAnalysis['wifiImpactFactors'] = [];

    const avgTemp = this.average(envData.map(d => d.temperature).filter((t): t is number => t !== undefined));
    if (avgTemp !== null) {
      let impact: 'positive' | 'neutral' | 'negative';
      let recommendation: string | undefined;

      if (avgTemp < 10 || avgTemp > 35) {
        impact = 'negative';
        recommendation = avgTemp < 10 
          ? 'Niedrige Temperaturen können Router-Performance beeinträchtigen'
          : 'Hohe Temperaturen können zu Überhitzung und Throttling führen';
      } else if (avgTemp >= 18 && avgTemp <= 25) {
        impact = 'positive';
      } else {
        impact = 'neutral';
      }

      const tempFactor: LocalEnvironmentAnalysis['wifiImpactFactors'][0] = {
        factor: 'Temperatur',
        value: avgTemp,
        impact,
      };
      if (recommendation) tempFactor.recommendation = recommendation;
      factors.push(tempFactor);
    }

    const avgHumidity = this.average(envData.map(d => d.humidity).filter((h): h is number => h !== undefined));
    if (avgHumidity !== null) {
      let impact: 'positive' | 'neutral' | 'negative';
      let recommendation: string | undefined;

      if (avgHumidity > 80) {
        impact = 'negative';
        recommendation = 'Hohe Luftfeuchtigkeit kann Signal-Dämpfung verursachen';
      } else if (avgHumidity < 30) {
        impact = 'neutral';
        recommendation = 'Sehr niedrige Luftfeuchtigkeit - statische Aufladung möglich';
      } else {
        impact = 'positive';
      }

      const humidFactor: LocalEnvironmentAnalysis['wifiImpactFactors'][0] = {
        factor: 'Luftfeuchtigkeit',
        value: avgHumidity,
        impact,
      };
      if (recommendation) humidFactor.recommendation = recommendation;
      factors.push(humidFactor);
    }

    const avgPressure = this.average(envData.map(d => d.pressure).filter((p): p is number => p !== undefined));
    if (avgPressure !== null) {
      factors.push({
        factor: 'Luftdruck',
        value: avgPressure,
        impact: 'neutral',
      });
    }

    return factors;
  }

  private calculateEnvironmentScore(
    factors: LocalEnvironmentAnalysis['wifiImpactFactors']
  ): number {
    if (factors.length === 0) return 100;

    let score = 100;
    for (const factor of factors) {
      if (factor.impact === 'negative') score -= 15;
      else if (factor.impact === 'neutral') score -= 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  private average(values: number[]): number | null {
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  addSenseBox(boxId: string): void {
    if (!this.localBoxIds.includes(boxId)) {
      this.localBoxIds.push(boxId);
      logger.info({ boxId }, 'SenseBox added');
    }
  }

  removeSenseBox(boxId: string): void {
    const index = this.localBoxIds.indexOf(boxId);
    if (index > -1) {
      this.localBoxIds.splice(index, 1);
      this.cachedBoxes.delete(boxId);
      logger.info({ boxId }, 'SenseBox removed');
    }
  }

  getConfiguredBoxIds(): string[] {
    return [...this.localBoxIds];
  }

  clearCache(): void {
    this.cachedBoxes.clear();
    this.lastFetch = null;
  }
}
