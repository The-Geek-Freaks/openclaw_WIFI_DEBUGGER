import { createChildLogger } from '../utils/logger.js';
import type { MeshNetworkState, NetworkDevice, MeshNode, ConnectionEvent } from '../types/network.js';

const _logger = createChildLogger('spatial-recommendations');

interface RoamingHistoryEntry {
  timestamp: Date;
  deviceMac: string;
  fromNode: string;
  toNode: string;
  signalBefore: number;
  signalAfter: number;
}

export interface PlacementRecommendation {
  id: string;
  type: 'move_device' | 'move_node' | 'add_node' | 'change_floor' | 'reposition';
  target: {
    type: 'device' | 'node';
    identifier: string;
    name: string;
    currentLocation?: {
      description: string;
      floor?: number;
      room?: string;
      signalStrength: number;
    };
  };
  recommendation: {
    direction: 'left' | 'right' | 'forward' | 'backward' | 'up' | 'down' | 'closer_to_node' | 'away_from_interference';
    distance?: string;
    floor?: number;
    reason: string;
    expectedImprovement: string;
  };
  priority: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  humanReadable: string;
  asciiVisualization?: string;
}

export interface SpatialAnalysisResult {
  recommendations: PlacementRecommendation[];
  deadZones: Array<{
    location: string;
    signalStrength: number;
    nearestNode: string;
    suggestedFix: string;
  }>;
  overlapZones: Array<{
    location: string;
    overlappingNodes: string[];
    suggestion: string;
  }>;
  summary: {
    totalRecommendations: number;
    criticalIssues: number;
    estimatedImprovementPotential: string;
  };
}

export class SpatialRecommendationEngine {
  private readonly signalThresholds = {
    excellent: -50,
    good: -60,
    fair: -70,
    poor: -80,
    critical: -85,
  };

  private roamingHistory: RoamingHistoryEntry[] = [];
  private connectionEvents: ConnectionEvent[] = [];

  recordConnectionEvent(event: ConnectionEvent): void {
    this.connectionEvents.push(event);
    if (this.connectionEvents.length > 10000) {
      this.connectionEvents = this.connectionEvents.slice(-5000);
    }
  }

  recordRoamingEvent(entry: RoamingHistoryEntry): void {
    this.roamingHistory.push(entry);
    if (this.roamingHistory.length > 5000) {
      this.roamingHistory = this.roamingHistory.slice(-2500);
    }
  }

  analyzeAndRecommend(
    meshState: MeshNetworkState,
    heatmapData?: { deadZones: Array<{ x: number; y: number; signalStrength: number }> }
  ): SpatialAnalysisResult {
    const recommendations: PlacementRecommendation[] = [];
    const deadZones: SpatialAnalysisResult['deadZones'] = [];
    const overlapZones: SpatialAnalysisResult['overlapZones'] = [];

    for (const device of meshState.devices) {
      const deviceRecommendations = this.analyzeDevice(device, meshState.nodes);
      recommendations.push(...deviceRecommendations);
    }

    for (const node of meshState.nodes) {
      const nodeRecommendations = this.analyzeNode(node, meshState.nodes, meshState.devices);
      recommendations.push(...nodeRecommendations);
    }

    if (heatmapData?.deadZones) {
      for (const zone of heatmapData.deadZones) {
        const nearestNode = this.findNearestNode(zone.x, zone.y, meshState.nodes);
        deadZones.push({
          location: `Position (${zone.x}, ${zone.y})`,
          signalStrength: zone.signalStrength,
          nearestNode: nearestNode?.name ?? 'Unbekannt',
          suggestedFix: this.suggestDeadZoneFix(zone, nearestNode),
        });
      }
    }

    const nodeOverlap = this.detectNodeOverlap(meshState.nodes);
    overlapZones.push(...nodeOverlap);

    recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const criticalCount = recommendations.filter(r => r.priority === 'critical').length;
    const highCount = recommendations.filter(r => r.priority === 'high').length;

    return {
      recommendations,
      deadZones,
      overlapZones,
      summary: {
        totalRecommendations: recommendations.length,
        criticalIssues: criticalCount,
        estimatedImprovementPotential: this.estimateImprovement(criticalCount, highCount),
      },
    };
  }

  private analyzeDevice(device: NetworkDevice, nodes: MeshNode[]): PlacementRecommendation[] {
    const recommendations: PlacementRecommendation[] = [];
    const signal = device.signalStrength ?? -100;

    if (signal < this.signalThresholds.critical) {
      const connectedNode = nodes.find(n => n.macAddress === device.connectedToNode);
      const nearerNode = this.findBetterNode(device, nodes);

      recommendations.push({
        id: `move_device_${device.macAddress}`,
        type: 'move_device',
        target: {
          type: 'device',
          identifier: device.macAddress,
          name: device.hostname ?? device.macAddress,
          currentLocation: {
            description: connectedNode ? `Verbunden mit ${connectedNode.name}` : 'Unbekannt',
            signalStrength: signal,
          },
        },
        recommendation: {
          direction: nearerNode ? 'closer_to_node' : 'closer_to_node',
          distance: '1-2 Meter',
          reason: `Signal kritisch schwach (${signal} dBm)`,
          expectedImprovement: '+15-25 dBm',
        },
        priority: 'critical',
        confidence: 0.9,
        humanReadable: this.generateDeviceMoveText(device, signal, connectedNode ?? undefined, nearerNode ?? undefined),
        asciiVisualization: this.generateMoveVisualization(device, connectedNode ?? undefined, nearerNode ?? undefined),
      });
    } else if (signal < this.signalThresholds.poor) {
      const connectedNode = nodes.find(n => n.macAddress === device.connectedToNode);
      
      recommendations.push({
        id: `improve_device_${device.macAddress}`,
        type: 'reposition',
        target: {
          type: 'device',
          identifier: device.macAddress,
          name: device.hostname ?? device.macAddress,
          currentLocation: {
            description: connectedNode ? `Verbunden mit ${connectedNode.name}` : 'Unbekannt',
            signalStrength: signal,
          },
        },
        recommendation: {
          direction: 'closer_to_node',
          distance: '0.5-1 Meter',
          reason: `Signal schwach (${signal} dBm)`,
          expectedImprovement: '+10-15 dBm',
        },
        priority: 'high',
        confidence: 0.8,
        humanReadable: `**${device.hostname ?? device.macAddress}** hat schwaches Signal. Verschiebe es näher zum Router/Node oder entferne Hindernisse dazwischen.`,
      });
    }

    if (this.detectPingPongRoaming(device)) {
      recommendations.push({
        id: `stabilize_device_${device.macAddress}`,
        type: 'reposition',
        target: {
          type: 'device',
          identifier: device.macAddress,
          name: device.hostname ?? device.macAddress,
        },
        recommendation: {
          direction: 'closer_to_node',
          reason: 'Gerät springt zwischen Nodes (Ping-Pong Roaming)',
          expectedImprovement: 'Stabile Verbindung ohne Roaming-Unterbrechungen',
        },
        priority: 'medium',
        confidence: 0.7,
        humanReadable: `**${device.hostname ?? device.macAddress}** wechselt ständig zwischen Nodes. Positioniere es näher an einem Node oder weiter weg von der Überlappungszone.`,
      });
    }

    return recommendations;
  }

  private analyzeNode(
    node: MeshNode,
    allNodes: MeshNode[],
    devices: NetworkDevice[]
  ): PlacementRecommendation[] {
    const recommendations: PlacementRecommendation[] = [];
    const connectedDevices = devices.filter(d => d.connectedToNode === node.macAddress);
    
    const weakDevices = connectedDevices.filter(d => (d.signalStrength ?? -100) < this.signalThresholds.poor);
    const weakPercentage = connectedDevices.length > 0 
      ? (weakDevices.length / connectedDevices.length) * 100 
      : 0;

    if (weakPercentage > 50 && connectedDevices.length >= 3) {
      recommendations.push({
        id: `reposition_node_${node.macAddress}`,
        type: 'move_node',
        target: {
          type: 'node',
          identifier: node.macAddress,
          name: node.name,
        },
        recommendation: {
          direction: 'forward',
          distance: '1-2 Meter',
          reason: `${Math.round(weakPercentage)}% der verbundenen Geräte haben schwaches Signal`,
          expectedImprovement: 'Bessere Abdeckung für alle verbundenen Geräte',
        },
        priority: 'high',
        confidence: 0.75,
        humanReadable: `**${node.name}** sollte näher zu den Geräten mit schwachem Signal verschoben werden. ${weakDevices.length} von ${connectedDevices.length} Geräten haben schlechten Empfang.`,
        asciiVisualization: this.generateNodeRepositionVisualization(node, weakDevices),
      });
    }

    if (!node.isMainRouter) {
      const mainRouter = allNodes.find(n => n.isMainRouter);
      if (mainRouter && node.backhaulType !== 'wired') {
        const backhaulStrength = this.estimateBackhaulStrength(node, mainRouter);
        
        if (backhaulStrength < this.signalThresholds.fair) {
          recommendations.push({
            id: `improve_backhaul_${node.macAddress}`,
            type: 'move_node',
            target: {
              type: 'node',
              identifier: node.macAddress,
              name: node.name,
            },
            recommendation: {
              direction: 'closer_to_node',
              distance: '2-3 Meter näher zum Router',
              reason: 'Wireless Backhaul zum Hauptrouter ist schwach',
              expectedImprovement: '+20-30% Durchsatz im gesamten Mesh',
            },
            priority: 'high',
            confidence: 0.8,
            humanReadable: `**${node.name}** hat schwache Verbindung zum Hauptrouter. Verschiebe ihn 2-3 Meter näher zu **${mainRouter.name}**, oder nutze Ethernet-Backhaul.`,
          });
        }
      }
    }

    return recommendations;
  }

  private generateDeviceMoveText(
    device: NetworkDevice,
    signal: number,
    connectedNode?: MeshNode,
    nearerNode?: MeshNode
  ): string {
    const deviceName = device.hostname ?? device.macAddress;
    let text = `**${deviceName}** hat kritisch schwaches Signal (${signal} dBm).\n\n`;

    if (connectedNode && nearerNode && nearerNode.macAddress !== connectedNode.macAddress) {
      text += `📍 Aktuell verbunden mit: ${connectedNode.name}\n`;
      text += `🎯 Empfehlung: Verschiebe das Gerät näher zu **${nearerNode.name}**\n`;
      text += `📏 Geschätzte Distanz: 1-2 Meter Richtung ${nearerNode.name}\n`;
    } else if (connectedNode) {
      text += `📍 Verbunden mit: ${connectedNode.name}\n`;
      text += `🎯 Empfehlung:\n`;
      text += `  • Verschiebe das Gerät 1-2 Meter näher zum Node\n`;
      text += `  • Oder: Entferne Hindernisse (Wände, Metall, Spiegel)\n`;
      text += `  • Oder: Erhöhe das Gerät (nicht auf dem Boden)\n`;
    }

    text += `\n✅ Erwartete Verbesserung: +15-25 dBm Signalstärke`;

    return text;
  }

  private generateMoveVisualization(
    device: NetworkDevice,
    connectedNode?: MeshNode,
    nearerNode?: MeshNode
  ): string {
    const deviceName = (device.hostname ?? 'Gerät').substring(0, 10);
    
    if (nearerNode && connectedNode && nearerNode.macAddress !== connectedNode.macAddress) {
      return `
┌────────────────────────────────────────┐
│                                        │
│    [${connectedNode.name.substring(0, 8).padEnd(8)}]                     │
│         ↑                              │
│         │ schwach                      │
│         │                              │
│    📱 ${deviceName.padEnd(10)} ─────→ ✅ hierhin    │
│                     │                  │
│                     ↓                  │
│              [${(nearerNode.name.substring(0, 8)).padEnd(8)}]           │
│                  (näher)               │
│                                        │
└────────────────────────────────────────┘`;
    }

    return `
┌────────────────────────────────────────┐
│                                        │
│         [Router/Node]                  │
│              ↑                         │
│              │                         │
│         ─────┼─────                    │
│              │ 1-2m näher              │
│              ↓                         │
│         📱 ${deviceName.padEnd(10)} (aktuell)        │
│                                        │
│    Empfehlung: Nach oben verschieben   │
│                                        │
└────────────────────────────────────────┘`;
  }

  private generateNodeRepositionVisualization(node: MeshNode, weakDevices: NetworkDevice[]): string {
    const deviceList = weakDevices.slice(0, 3).map(d => d.hostname ?? d.macAddress.substring(0, 8)).join(', ');
    
    return `
┌────────────────────────────────────────┐
│  AKTUELLE SITUATION:                   │
│                                        │
│     📱📱📱 (schwaches Signal)          │
│        ↑                               │
│        │ zu weit                       │
│        │                               │
│    [${node.name.substring(0, 12).padEnd(12)}]                    │
│                                        │
├────────────────────────────────────────┤
│  EMPFEHLUNG:                           │
│                                        │
│     📱📱📱                             │
│        ↑                               │
│    [${node.name.substring(0, 12).padEnd(12)}] ←── hierhin     │
│        (1-2m näher)                    │
│                                        │
│  Betroffene Geräte: ${deviceList.substring(0, 20)}     │
└────────────────────────────────────────┘`;
  }

  private findNearestNode(x: number, y: number, nodes: MeshNode[]): MeshNode | null {
    if (nodes.length === 0) return null;

    let nearestNode: MeshNode | null = null;
    let minDistance = Infinity;

    for (const node of nodes) {
      if (node.location) {
        const distance = this.calculateDistance(
          x, y,
          node.location.x, node.location.y
        );
        if (distance < minDistance) {
          minDistance = distance;
          nearestNode = node;
        }
      }
    }

    if (!nearestNode) {
      return nodes[0] ?? null;
    }

    return nearestNode;
  }

  private calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  private calculate3DDistance(
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number
  ): number {
    return Math.sqrt(
      Math.pow(x2 - x1, 2) + 
      Math.pow(y2 - y1, 2) + 
      Math.pow(z2 - z1, 2)
    );
  }

  private estimateSignalAtDistance(distance: number, txPower: number = 20): number {
    const pathLossExponent = 3.5;
    const referenceDistance = 1;
    const referencePathLoss = 40;
    
    if (distance <= 0) return txPower - referencePathLoss;
    
    const pathLoss = referencePathLoss + 10 * pathLossExponent * Math.log10(distance / referenceDistance);
    return txPower - pathLoss;
  }

  private suggestDeadZoneFix(
    zone: { x: number; y: number; signalStrength: number },
    nearestNode: MeshNode | null
  ): string {
    if (zone.signalStrength < -90) {
      return 'Zusätzlichen Mesh-Node in diesem Bereich platzieren';
    }
    if (nearestNode) {
      return `${nearestNode.name} 1-2 Meter in diese Richtung verschieben`;
    }
    return 'Mesh-Node näher an diesen Bereich platzieren';
  }

  private detectNodeOverlap(nodes: MeshNode[]): SpatialAnalysisResult['overlapZones'] {
    const overlaps: SpatialAnalysisResult['overlapZones'] = [];
    
    if (nodes.length < 2) return overlaps;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].location && nodes[j].location) {
          const dist = Math.sqrt(
            Math.pow((nodes[i].location?.x ?? 0) - (nodes[j].location?.x ?? 0), 2) +
            Math.pow((nodes[i].location?.y ?? 0) - (nodes[j].location?.y ?? 0), 2)
          );
          
          if (dist < 3) {
            overlaps.push({
              location: `Zwischen ${nodes[i].name} und ${nodes[j].name}`,
              overlappingNodes: [nodes[i].name, nodes[j].name],
              suggestion: `Nodes weiter auseinander platzieren (aktuell ~${dist.toFixed(1)}m, empfohlen >5m)`,
            });
          }
        }
      }
    }

    return overlaps;
  }

  private findBetterNode(device: NetworkDevice, nodes: MeshNode[]): MeshNode | null {
    const currentNode = nodes.find(n => n.macAddress === device.connectedToNode);
    if (!currentNode) return nodes[0] ?? null;

    const otherNodes = nodes.filter(n => n.macAddress !== currentNode.macAddress);
    return otherNodes[0] ?? null;
  }

  private detectPingPongRoaming(device: NetworkDevice): boolean {
    const recentHistory = this.roamingHistory
      .filter(h => h.deviceMac === device.macAddress)
      .filter(h => h.timestamp.getTime() > Date.now() - 300000)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (recentHistory.length < 3) return false;

    const nodeSequence = recentHistory.map(h => h.toNode);
    
    for (let i = 0; i < nodeSequence.length - 2; i++) {
      if (nodeSequence[i] === nodeSequence[i + 2] && nodeSequence[i] !== nodeSequence[i + 1]) {
        return true;
      }
    }

    const uniqueNodes = new Set(nodeSequence);
    if (uniqueNodes.size <= 2 && recentHistory.length >= 4) {
      return true;
    }

    return false;
  }

  getRoamingAnalysis(deviceMac: string): {
    totalRoams: number;
    pingPongCount: number;
    avgTimeBetweenRoams: number;
    mostFrequentTransition: { from: string; to: string; count: number } | null;
    recommendation: string;
  } {
    const deviceHistory = this.roamingHistory
      .filter(h => h.deviceMac === deviceMac)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (deviceHistory.length === 0) {
      return {
        totalRoams: 0,
        pingPongCount: 0,
        avgTimeBetweenRoams: 0,
        mostFrequentTransition: null,
        recommendation: 'Keine Roaming-Daten verfügbar',
      };
    }

    const transitions = new Map<string, number>();
    let pingPongCount = 0;
    const timeDiffs: number[] = [];

    for (let i = 0; i < deviceHistory.length; i++) {
      const entry = deviceHistory[i]!;
      const key = `${entry.fromNode}->${entry.toNode}`;
      transitions.set(key, (transitions.get(key) ?? 0) + 1);

      if (i > 0) {
        timeDiffs.push(entry.timestamp.getTime() - deviceHistory[i - 1]!.timestamp.getTime());
      }

      if (i >= 2) {
        const prev2 = deviceHistory[i - 2]!;
        const prev1 = deviceHistory[i - 1]!;
        if (prev2.toNode === entry.fromNode && prev1.fromNode === entry.toNode) {
          pingPongCount++;
        }
      }
    }

    let mostFrequent: { from: string; to: string; count: number } | null = null;
    for (const [key, count] of transitions) {
      const [from, to] = key.split('->');
      if (!mostFrequent || count > mostFrequent.count) {
        mostFrequent = { from: from!, to: to!, count };
      }
    }

    const avgTime = timeDiffs.length > 0 
      ? timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length 
      : 0;

    let recommendation = 'Roaming-Verhalten ist normal';
    if (pingPongCount > 2) {
      recommendation = 'Ping-Pong-Roaming erkannt. Roaming-Threshold erhöhen oder Node-Positionen anpassen.';
    } else if (avgTime < 60000 && deviceHistory.length > 5) {
      recommendation = 'Häufiges Roaming. Signalstärke an Node-Übergängen prüfen.';
    }

    return {
      totalRoams: deviceHistory.length,
      pingPongCount,
      avgTimeBetweenRoams: Math.round(avgTime / 1000),
      mostFrequentTransition: mostFrequent,
      recommendation,
    };
  }

  private estimateBackhaulStrength(node: MeshNode, mainRouter: MeshNode): number {
    if (node.backhaulSignalStrength !== undefined) {
      return node.backhaulSignalStrength;
    }

    if (node.backhaulType === 'wired' || node.backhaulType === 'mesh_backhaul') {
      return 0;
    }

    if (node.location && mainRouter.location) {
      const distance = this.calculate3DDistance(
        node.location.x, node.location.y, node.location.z,
        mainRouter.location.x, mainRouter.location.y, mainRouter.location.z
      );
      return this.estimateSignalAtDistance(distance);
    }

    const connectedClients = node.connectedClients;
    if (connectedClients > 15) {
      return -75;
    } else if (connectedClients > 10) {
      return -70;
    } else if (connectedClients > 5) {
      return -65;
    }
    
    return -60;
  }

  private estimateImprovement(critical: number, high: number): string {
    if (critical > 2) return '+30-50% Netzwerk-Performance möglich';
    if (critical > 0 || high > 2) return '+15-30% Netzwerk-Performance möglich';
    if (high > 0) return '+5-15% Netzwerk-Performance möglich';
    return 'Netzwerk ist gut optimiert';
  }

  generateFloorChangeRecommendation(
    deviceName: string,
    currentFloor: number,
    targetFloor: number,
    reason: string
  ): PlacementRecommendation {
    const direction = targetFloor > currentFloor ? 'up' : 'down';
    const floorDiff = Math.abs(targetFloor - currentFloor);

    return {
      id: `floor_change_${deviceName.replace(/\s/g, '_')}`,
      type: 'change_floor',
      target: {
        type: 'node',
        identifier: deviceName,
        name: deviceName,
        currentLocation: {
          description: `Stockwerk ${currentFloor}`,
          floor: currentFloor,
          signalStrength: -75,
        },
      },
      recommendation: {
        direction,
        floor: targetFloor,
        reason,
        expectedImprovement: `Bessere Abdeckung für Stockwerk ${targetFloor}`,
      },
      priority: 'medium',
      confidence: 0.7,
      humanReadable: `**${deviceName}** sollte ${floorDiff} Stockwerk${floorDiff > 1 ? 'e' : ''} ${direction === 'up' ? 'höher' : 'tiefer'} platziert werden (von Etage ${currentFloor} auf Etage ${targetFloor}). ${reason}`,
      asciiVisualization: this.generateFloorVisualization(currentFloor, targetFloor, deviceName),
    };
  }

  private generateFloorVisualization(currentFloor: number, targetFloor: number, nodeName: string): string {
    const maxFloor = Math.max(currentFloor, targetFloor);
    const minFloor = Math.min(currentFloor, targetFloor);
    
    let viz = '┌────────────────────────────┐\n';
    
    for (let f = maxFloor; f >= minFloor; f--) {
      const isCurrent = f === currentFloor;
      const isTarget = f === targetFloor;
      
      if (isCurrent && !isTarget) {
        viz += `│ Etage ${f}: [${nodeName.substring(0, 8).padEnd(8)}] ❌   │\n`;
      } else if (isTarget && !isCurrent) {
        viz += `│ Etage ${f}: [${nodeName.substring(0, 8).padEnd(8)}] ✅   │\n`;
      } else if (isCurrent && isTarget) {
        viz += `│ Etage ${f}: [${nodeName.substring(0, 8).padEnd(8)}] 📍   │\n`;
      } else {
        viz += `│ Etage ${f}: ────────────────   │\n`;
      }
    }
    
    viz += '└────────────────────────────┘';
    return viz;
  }
}
