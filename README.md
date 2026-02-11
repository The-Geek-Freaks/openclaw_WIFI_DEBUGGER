# OpenClaw ASUS Mesh WiFi Skill

Ein OpenClaw Skill zur Analyse und Optimierung von ASUS Mesh WiFi-Netzwerken mit Merlin Firmware und Home Assistant Zigbee Integration.

## Features

### Netzwerk-Analyse
- **Mesh Node Scanning**: Erkennung aller AiMesh-Knoten und deren Status
- **Device Discovery**: Automatische Erkennung aller verbundenen Geräte
- **Signal Mapping**: Kontinuierliche Signalstärke-Messung und Historie
- **Triangulation**: Räumliche Positionsschätzung von Geräten basierend auf Signalstärke

### Problem-Erkennung
- **Signal Weakness Detection**: Erkennung von Geräten mit schwachem Signal
- **Connection Stability Analysis**: Analyse von Verbindungsabbrüchen
- **Roaming Issues**: Erkennung von exzessivem Roaming zwischen Mesh-Knoten
- **Interference Detection**: Erkennung von Kanalstörungen durch Nachbarnetzwerke
- **WiFi/Zigbee Konflikt-Analyse**: Erkennung von Frequenzüberlappungen

### Optimierung
- **Channel Optimization**: Automatische Kanalempfehlungen für 2.4GHz und 5GHz
- **Zigbee Frequency Coordination**: Abstimmung von Zigbee- und WiFi-Kanälen
- **Roaming Settings**: Optimierung der Roaming-Einstellungen

### Home Assistant Integration
- **ZHA Support**: Integration mit Zigbee Home Automation
- **Zigbee2MQTT Support**: Integration mit Zigbee2MQTT
- **Device Health Monitoring**: Überwachung der Zigbee-Geräte-Gesundheit

## Installation

```bash
npm install
```

## Konfiguration

Erstelle eine `.env` Datei basierend auf `.env.example`:

```env
# ASUS Router (Merlin Firmware)
ASUS_ROUTER_HOST=192.168.1.1
ASUS_ROUTER_SSH_PORT=22
ASUS_ROUTER_SSH_USER=admin
ASUS_ROUTER_SSH_PASSWORD=your_password

# Home Assistant
HASS_HOST=192.168.178.43
HASS_PORT=8123
HASS_ACCESS_TOKEN=your_long_lived_access_token

# Logging
LOG_LEVEL=info
```

### SSH-Zugang aktivieren (Merlin Firmware)

1. Router-Webinterface öffnen
2. Administration → System
3. SSH-Daemon aktivieren
4. SSH-Port konfigurieren (Standard: 22)

### Home Assistant Access Token

1. Home Assistant öffnen
2. Profil → Sicherheit → Langlebige Zugangstoken
3. Neuen Token erstellen

## Verwendung

### Als OpenClaw Skill

```typescript
import { OpenClawAsusMeshSkill } from 'openclaw-asus-mesh-skill';

const skill = new OpenClawAsusMeshSkill();
await skill.initialize();

// Netzwerk scannen
const scanResult = await skill.execute({ action: 'scan_network' });

// Netzwerk-Gesundheit abrufen
const health = await skill.execute({ action: 'get_network_health' });

// Probleme abrufen
const problems = await skill.execute({ action: 'get_problems' });

// Optimierungsvorschläge
const suggestions = await skill.execute({ action: 'get_optimization_suggestions' });

// Zigbee-Status
const zigbee = await skill.execute({ action: 'scan_zigbee' });

// Frequenzkonflikte
const conflicts = await skill.execute({ action: 'get_frequency_conflicts' });

await skill.shutdown();
```

## Verfügbare Actions

| Action | Beschreibung | Parameter |
|--------|-------------|-----------|
| `scan_network` | Scannt das gesamte Mesh-Netzwerk | - |
| `get_network_health` | Berechnet Network Health Score | - |
| `get_device_list` | Liste aller Geräte | `filter?: 'all' \| 'wireless' \| 'wired' \| 'problematic'` |
| `get_device_details` | Details eines Geräts | `macAddress: string` |
| `get_device_signal_history` | Signalverlauf | `macAddress: string, hours?: number` |
| `get_mesh_nodes` | Liste aller Mesh-Knoten | - |
| `get_wifi_settings` | Aktuelle WiFi-Einstellungen | - |
| `set_wifi_channel` | Kanal ändern | `band: '2.4GHz' \| '5GHz', channel: number` |
| `get_problems` | Erkannte Probleme | `severity?: 'all' \| 'critical' \| 'error' \| 'warning'` |
| `get_optimization_suggestions` | Optimierungsvorschläge | - |
| `apply_optimization` | Optimierung anwenden | `suggestionId: string, confirm: boolean` |
| `scan_zigbee` | Zigbee-Netzwerk scannen | - |
| `get_zigbee_devices` | Zigbee-Geräte auflisten | - |
| `get_frequency_conflicts` | WiFi/Zigbee Konflikte | - |
| `get_spatial_map` | Räumliche Gerätekarte | - |
| `set_node_position` | Mesh-Knoten Position setzen | `nodeId, x, y, z?, room?` |
| `get_connection_stability` | Verbindungsstabilität | `macAddress: string, hours?: number` |
| `restart_wireless` | WLAN neu starten | `confirm: boolean` |
| `get_channel_scan` | Kanalauslastung scannen | `band?: '2.4GHz' \| '5GHz' \| 'both'` |

## Architektur

```
src/
├── config/          # Konfiguration
├── core/            # Kern-Logik
│   ├── mesh-analyzer.ts      # Mesh-Netzwerk Analyse
│   ├── triangulation.ts      # Räumliche Positionsberechnung
│   ├── problem-detector.ts   # Problem-Erkennung
│   ├── frequency-optimizer.ts # Frequenz-Optimierung
│   ├── zigbee-analyzer.ts    # Zigbee-Analyse
│   ├── heatmap-generator.ts  # Multi-Floor Heatmap
│   ├── benchmark-engine.ts   # iPerf3/Latency Tests
│   ├── auto-debugger.ts      # Log-Analyse & Auto-Fix
│   └── neighbor-monitor.ts   # Nachbarnetz-Scanning
├── infra/           # Infrastruktur
│   ├── asus-ssh-client.ts    # SSH-Verbindung zum Router
│   └── homeassistant-client.ts # Home Assistant API
├── skill/           # OpenClaw Skill Interface
│   ├── actions.ts            # Action Definitionen
│   └── openclaw-skill.ts     # Hauptklasse
├── types/           # TypeScript Typen
│   ├── network.ts            # Netzwerk-Typen
│   ├── zigbee.ts             # Zigbee-Typen
│   ├── building.ts           # Gebäude/Floor/Heatmap-Typen
│   ├── benchmark.ts          # Benchmark-Typen
│   └── debugging.ts          # Log-Analyse-Typen
└── utils/           # Hilfsfunktionen
```

## Erweiterte Features (Phase 2)

### Multi-Floor Heatmap

Unterstützt Gebäude mit mehreren Stockwerken:

- **Keller** - Mit erhöhter Signaldämpfung durch Beton
- **Erdgeschoss bis 3. Stock** - Vertikale Signal-Propagation
- **Garten/Outdoor** - Outdoor-Node-Unterstützung

```typescript
import { HeatmapGenerator } from './src/core/heatmap-generator.js';

const generator = new HeatmapGenerator();
generator.setBuilding({
  id: 'home',
  name: 'Mein Haus',
  floors: [
    { id: 'basement', floor: 'basement', floorNumber: -1, ... },
    { id: 'ground', floor: 'ground', floorNumber: 0, ... },
    { id: 'first', floor: 'first', floorNumber: 1, ... },
  ],
  ...
});

const heatmap = generator.generateFloorHeatmap(0, 1); // Erdgeschoss, 1m Auflösung
```

### Benchmark-Engine

- **Throughput-Tests** via iPerf3
- **Latenz-Tests** mit Jitter-Messung
- **Channel-Analyse** mit Score-System
- **Spektrum-Scan** für optimale Kanalwahl

```typescript
import { BenchmarkEngine } from './src/core/benchmark-engine.js';

const benchmark = new BenchmarkEngine(sshClient);
const result = await benchmark.runFullBenchmark();
// { scores: { overall: 85, throughput: 90, latency: 80, ... } }

const spectrum = await benchmark.runSpectrumScan('5g');
// { bestChannel: 149, currentChannel: 36, recommendedAction: '...' }
```

### Auto-Debugging

Automatische Log-Analyse mit bekannten Issue-Patterns:

- **Deauth Floods** - Sicherheits-Erkennung
- **Channel Interference** - Interferenz-Erkennung
- **Client Disconnect Loops** - Verbindungsprobleme
- **DFS/Radar Events** - Regulatorische Events
- **Memory Pressure** - System-Überlastung
- **Zigbee Interference** - WiFi/Zigbee Konflikte

```typescript
import { AutoDebugger } from './src/core/auto-debugger.js';

const debugger = new AutoDebugger(sshClient, hassClient);
await debugger.startSession();
const issues = await debugger.analyzeLogs(500);
// Auto-Fix verfügbar für einige Issues
await debugger.applyAutoFix(issues[0].id);
const session = await debugger.endSession();
```

### Nachbarnetz-Monitor

Kontinuierliches Monitoring der WiFi-Umgebung:

- **Scan aller Nachbar-APs** auf 2.4GHz und 5GHz
- **Kanal-Kongestions-Analyse**
- **Konflikt-Erkennung** mit aktuellen Einstellungen
- **Beste Kanal-Empfehlungen**

```typescript
import { NeighborMonitor } from './src/core/neighbor-monitor.js';

const monitor = new NeighborMonitor(sshClient);
const analysis = await monitor.analyzeNeighbors(currentSettings);
// { networks: [...], bestChannels: [...], recommendations: [...] }
```

### Multi-Node Mesh Management

Automatische Erkennung und SSH-Zugang zu allen AiMesh-Nodes:

- **Auto-Discovery** aller Mesh Access Points via Main Router
- **SSH-Pool** mit Verbindungen zu allen erreichbaren Nodes
- **Koordinierte Konfiguration** über alle Nodes hinweg
- **Konflikt-Erkennung** zwischen Node-Einstellungen
- **Synchronisierte Einstellungen** für konsistentes Roaming

```typescript
import { MeshNodePool } from './src/infra/mesh-node-pool.js';
import { MultiNodeCoordinator } from './src/core/multi-node-coordinator.js';

// Pool initialisieren - Auto-Discovery aller Nodes
const nodePool = new MeshNodePool(config);
await nodePool.initialize();

// Alle erkannten Nodes
const nodes = nodePool.getDiscoveredNodes();
// [{ id: 'main', name: 'RT-AX88U', ip: '192.168.1.1', sshAvailable: true, ... },
//  { id: 'node_aabbcc', name: 'ZenWiFi Node', ip: '192.168.1.2', ... }]

// Koordinator für Multi-Node Settings
const coordinator = new MultiNodeCoordinator(nodePool);

// Alle Node-Konfigurationen scannen
const config = await coordinator.scanAllNodeConfigs();
// { nodes: [...], conflicts: [...], recommendations: [...], overallScore: 85 }

// Optimierte Einstellungen berechnen (mit Zigbee-Kanal-Berücksichtigung)
const optimized = await coordinator.optimizeChannelAllocation(15); // Zigbee Kanal 15

// Einstellungen auf alle Nodes anwenden
await coordinator.applyOptimizedSettings(optimized);

// Oder uniforme Einstellungen manuell setzen
await coordinator.applyUniformSettings({
  channel2g: 1,
  channel5g: 36,
});

// Wireless auf allen Nodes neu starten
await nodePool.restartWirelessOnAllNodes();

// Aufräumen
await nodePool.shutdown();
```

#### MeshNodeInfo Struktur

```typescript
interface MeshNodeInfo {
  id: string;              // 'main' oder 'node_macaddress'
  name: string;            // Router-Name
  macAddress: string;
  ipAddress: string;
  isMainRouter: boolean;
  firmwareVersion: string;
  model: string;           // z.B. 'RT-AX88U'
  role: 'router' | 'node';
  status: 'online' | 'offline' | 'unreachable';
  sshAvailable: boolean;   // SSH erreichbar?
  lastSeen: Date;
  uptime: number;
  cpuUsage: number;
  memoryUsage: number;
  connectedClients: number;
}
```

### IoT Rogue WiFi Detection

Erkennung von Smart Home Geräten die störende WLANs aufmachen:

- **Setup-APs** (Tuya, Shelly, Tasmota, etc. im Einrichtungsmodus)
- **Fallback-APs** (ESP-Geräte die sich nicht verbinden können)
- **Config-Portals** (Tasmota Web-Konfiguration)
- **Vendor-Erkennung** via SSID-Pattern und OUI-Datenbank
- **Home Assistant Korrelation** für Device-Identifikation
- **OpenClaw Actions** für automatische Problemlösung

```typescript
import { IoTWifiDetector } from './src/core/iot-wifi-detector.js';

const detector = new IoTWifiDetector(sshClient, hassClient);
const result = await detector.scanForRogueIoTNetworks();

// Erkannte störende Netzwerke
result.rogueNetworks.forEach(rogue => {
  console.log(`${rogue.vendor} ${rogue.deviceType}: ${rogue.ssid}`);
  console.log(`  Typ: ${rogue.rogueType}, Interferenz: ${rogue.interferenceLevel}`);
  console.log(`  Empfehlung: ${rogue.recommendedAction}`);
});

// Vorgeschlagene Aktionen für OpenClaw
result.suggestedActions.forEach(action => {
  console.log(`Action: ${action.actionType} für ${action.targetDevice.vendor}`);
  console.log(`  Priorität: ${action.priority}`);
});

// Action ausführen
await detector.executeOpenClawAction(result.suggestedActions[0]);

// Export für OpenClaw
const openclawData = detector.exportForOpenClaw();
```

#### Unterstützte Vendors

| Vendor | SSID-Pattern | Erkannte Typen |
|--------|-------------|----------------|
| Tuya | `SmartLife-*`, `TUYA*` | Setup-AP |
| Shelly | `shelly*`, `ShellyPlus*` | Setup-AP |
| Tasmota | `Tasmota-*`, `tasmota_*` | Config-Portal |
| ESP/ESPHome | `ESP_*`, `ESP32*`, `ESPHOME*` | Fallback-AP |
| Sonoff | `Sonoff*`, `eWeLink*` | Setup-AP |
| Meross | `Meross*`, `MSS*` | Setup-AP |
| TP-Link Kasa | `TP-Link*`, `Kasa*` | Setup-AP |
| Philips Hue | `Philips*`, `Hue-*` | Setup-AP |
| IKEA | `IKEA*`, `TRADFRI*` | Setup-AP |
| Xiaomi | `xiaomi*`, `yeelink*` | Setup-AP |
| Aqara | `Aqara*`, `lumi-gateway*` | Setup-AP |

#### OpenClaw Action Types

| Action | Beschreibung | Unterstützte Vendors |
|--------|-------------|---------------------|
| `restart_device` | Gerät neustarten | Shelly, alle mit HA-Entity |
| `disable_ap` | AP-Modus deaktivieren | Tasmota |
| `reconfigure_wifi` | WiFi neu konfigurieren | Alle (manuell) |
| `notify_user` | User benachrichtigen | Alle |

## WiFi/Zigbee Frequenz-Koordination

### 2.4GHz Kanal-Mapping

| WiFi Kanal | Frequenz (MHz) | Beste Zigbee Kanäle |
|------------|---------------|---------------------|
| 1 | 2412 | 21-26 |
| 6 | 2437 | 11-14, 25-26 |
| 11 | 2462 | 11-17 |

### Empfohlene Konfiguration

Für minimale Interferenz:
- **WiFi 2.4GHz**: Kanal 1 oder 11
- **Zigbee**: Kanal 25 (bei WiFi 1) oder Kanal 15 (bei WiFi 11)

## Entwicklung

```bash
# Development Mode
npm run dev

# Build
npm run build

# Tests
npm test

# Lint
npm run lint
```

## Voraussetzungen

- ASUS Router mit Merlin Firmware
- SSH-Zugang zum Router aktiviert
- Node.js 18+
- Optional: Home Assistant mit ZHA oder Zigbee2MQTT

## Lizenz

MIT
