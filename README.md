<div align="center">

```
     ___                    _____ _                
    / _ \ _ __   ___ _ __  / ____| | __ ___      __
   | | | | '_ \ / _ \ '_ \| |    | |/ _` \ \ /\ / /
   | |_| | |_) |  __/ | | | |____| | (_| |\ V  V / 
    \___/| .__/ \___|_| |_|\_____|_|\__,_| \_/\_/  
         |_|                                       
    ╔═══════════════════════════════════════════════════════════╗
    ║     🌐 ASUS MESH WIFI ANALYZER - OpenClaw Skill 🌐        ║
    ╚═══════════════════════════════════════════════════════════╝
```

<h3>🚀 Intelligente Mesh-Netzwerk Analyse & Optimierung für ASUS Router</h3>

<p>
  <strong>39 Actions</strong> • <strong>18 Core Modules</strong> • <strong>100+ Vendor OUIs</strong> • <strong>64 Tests</strong>
</p>

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?style=for-the-badge&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?style=for-the-badge&logo=typescript)
![OpenClaw](https://img.shields.io/badge/OpenClaw-2.0%2B-purple?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)
![Tests](https://img.shields.io/badge/Tests-64%20passed-brightgreen?style=for-the-badge)

</div>

---

## 📊 Projekt-Qualität

<div align="center">

| Metrik | Score | Status |
|--------|-------|--------|
| **TypeScript Strict** | 100% | ✅ Keine Fehler |
| **Test Coverage** | 64 Tests | ✅ Bestanden |
| **ESLint** | Clean | ✅ Keine Errors |
| **Memory Leaks** | 0 | ✅ Geprüft |
| **OpenClaw Ready** | v2.0+ | ✅ Kompatibel |

**18 Core Modules** • **5 Infra Clients** • **10 Type Definitions** • **100% Reversible**

</div>

---

## 📑 Inhaltsverzeichnis

- [✨ Features](#-features)
- [📦 Installation](#-installation)
- [🎯 Verfügbare Actions](#-verfügbare-actions)
- [🏗️ Architektur](#️-architektur)
- [📡 Netzwerk-Topologie](#-netzwerk-topologie)
- [🔧 Konfiguration](#-konfiguration)
- [🛠️ Entwicklung](#️-entwicklung)
- [📄 Lizenz](#-lizenz)

---

## ✨ Features

### 🌐 Netzwerk-Analyse

```
┌─────────────────────────────────────────────────────────────┐
│                    MESH NETWORK SCAN                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐     ┌──────────┐     ┌──────────┐            │
│  │  MAIN    │────▶│  NODE 1  │────▶│  NODE 2  │            │
│  │ RT-AX88U │     │  XT8     │     │  XT8     │            │
│  └────┬─────┘     └────┬─────┘     └────┬─────┘            │
│       │                │                │                   │
│    [28 Clients]    [12 Clients]    [8 Clients]             │
└─────────────────────────────────────────────────────────────┘
```

- **Mesh Node Scanning** - Erkennung aller AiMesh-Knoten und Status
- **Device Discovery** - Automatische Erkennung aller Geräte
- **Signal Mapping** - Kontinuierliche Signalstärke-Messung
- **Triangulation** - Räumliche Positionsschätzung
- **SNMP Topologie** - MikroTik, OPNsense, Cisco Support

### 🔍 Problem-Erkennung

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️  DETECTED ISSUES                                        │
├─────────────────────────────────────────────────────────────┤
│  🔴 CRITICAL  │ Channel Interference on 2.4GHz (Ch 6)      │
│  🟡 WARNING   │ Weak signal: iPhone-Max (-78 dBm)          │
│  🟡 WARNING   │ Zigbee/WiFi overlap: Ch 11 ↔ Zigbee 15     │
│  🟢 INFO      │ 3 IoT devices in Setup-AP mode             │
└─────────────────────────────────────────────────────────────┘
```

- **Signal Weakness Detection** - Geräte mit schwachem Signal
- **Connection Stability** - Analyse von Verbindungsabbrüchen
- **Roaming Issues** - Exzessives Roaming erkennen
- **WiFi/Zigbee Konflikte** - Frequenzüberlappungen
- **Rogue IoT Detection** - Setup-APs von Smart Home Geräten

### ⚡ Optimierung

```
┌─────────────────────────────────────────────────────────────┐
│  📊 OPTIMIZATION SUGGESTIONS                                │
├─────────────────────────────────────────────────────────────┤
│  #1  Change 2.4GHz channel: 6 → 1     [+15% less overlap]  │
│  #2  Change 5GHz channel: 36 → 149    [DFS-free, less busy]│
│  #3  Enable Band Steering             [Better roaming]     │
│  #4  Move Zigbee to Channel 25        [No WiFi overlap]    │
└─────────────────────────────────────────────────────────────┘
```

- **Channel Optimization** - Beste Kanäle für 2.4/5GHz
- **Zigbee Coordination** - WiFi/Zigbee Abstimmung
- **Multi-Node Sync** - Einstellungen synchronisieren
- **Auto-Apply** - Änderungen mit Bestätigung anwenden

### 🧠 Network Intelligence Engine (NEU!)

```
┌─────────────────────────────────────────────────────────────┐
│  🧠 FULL INTELLIGENCE SCAN FLOW                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1️⃣ COLLECT ──────────────────────────────────────────────  │
│     ├─ Router Data (SSH)     ✅ Mesh Nodes, Clients         │
│     ├─ Neighbor Scan         ✅ 12 networks found           │
│     ├─ Zigbee (Home Asst.)   ✅ Channel 15, 28 devices      │
│     └─ SNMP Topology         ⚠️ Not configured              │
│                                                              │
│  2️⃣ ANALYZE ──────────────────────────────────────────────  │
│     ├─ Build Spectrum Maps   2.4GHz: 65% congestion         │
│     ├─ Detect Conflicts      WiFi Ch6 ↔ Zigbee Ch15 ⚠️      │
│     └─ Calculate Scores      Environment: 72/100            │
│                                                              │
│  3️⃣ RECOMMEND ────────────────────────────────────────────  │
│     ├─ #1 Change 2.4GHz → Ch1  (protect Zigbee)  [90%]     │
│     ├─ #2 Increase 5GHz width  (throughput)      [70%]     │
│     └─ #3 Enable MU-MIMO       (multi-device)    [65%]     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

Die **NetworkIntelligence Engine** sammelt Daten aus allen verfügbaren Quellen und generiert kontextbezogene Optimierungsempfehlungen:

| Datenquelle | Informationen | Priorität |
|-------------|---------------|-----------|
| **Router SSH** | Mesh-Nodes, Clients, WiFi-Settings | Kritisch |
| **Neighbor Scan** | Nachbar-Netzwerke, Kanalnutzung | Hoch |
| **Home Assistant** | Zigbee-Kanal, Geräte, LQI | Hoch |
| **SNMP** | Switch-Topologie, Bottlenecks | Optional |

**Optimization Targets:**
- `minimize_interference` - Weniger Störungen von Nachbarn
- `protect_zigbee` - Zigbee-Kanal vor WiFi-Overlap schützen
- `maximize_throughput` - Höhere Geschwindigkeit
- `reduce_neighbor_overlap` - Nachbar-Konflikte vermeiden

### 🏠 Home Assistant Integration

- **ZHA Support** - Zigbee Home Automation
- **Zigbee2MQTT** - Alternative Zigbee-Bridge
- **Device Correlation** - Geräte-Matching mit HA-Entities

---

## 📦 Installation

### Als OpenClaw Skill

```bash
# Via OpenClaw CLI
openclaw skill install https://github.com/openclaw/asus-mesh-wifi-analyzer

# Via npm
npm install openclaw-asus-mesh-skill
```

### Lokale Entwicklung

```bash
git clone https://github.com/openclaw/asus-mesh-wifi-analyzer.git
cd asus-mesh-wifi-analyzer
npm install
npm run build
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

## 🎯 Verfügbare Actions

### Basis-Actions

| Action | Beschreibung | Parameter |
|--------|-------------|-----------|
| `scan_network` | Scannt das gesamte Mesh-Netzwerk | - |
| `get_network_health` | Berechnet Network Health Score | - |
| `get_device_list` | Liste aller Geräte | `filter?: 'all' \| 'wireless' \| 'wired' \| 'problematic'` |
| `get_optimization_suggestions` | Optimierungsvorschläge | - |
| `apply_optimization` | Optimierung anwenden | `suggestionId: string, confirm: boolean` |

### Zigbee & Frequenz

| Action | Beschreibung | Parameter |
|--------|-------------|-----------|
| `scan_zigbee` | Zigbee-Netzwerk scannen | - |
| `get_frequency_conflicts` | WiFi/Zigbee Konflikte | - |
| `get_channel_scan` | Kanalauslastung scannen | `band?: '2.4GHz' \| '5GHz' \| 'both'` |

### Erweiterte Features

| Action | Beschreibung | Parameter |
|--------|-------------|-----------|
| `scan_rogue_iot` | Rogue IoT WiFi-Netzwerke erkennen | - |
| `get_heatmap` | Signal-Heatmap generieren | `floor?: number` |
| `run_benchmark` | Netzwerk-Benchmark (iPerf3) | - |
| `sync_mesh_settings` | Mesh-Einstellungen synchronisieren | `channel2g?, channel5g?` |
| `analyze_network_topology` | SNMP Netzwerk-Topologie | - |
| `full_intelligence_scan` | Kompletter KI-gestützter Scan | `targets?: string[]` |
| `get_environment_summary` | Umgebungs-Zusammenfassung | - |
| `get_quick_diagnosis` | Schnelldiagnose mit Prioritäten | - |

### Platzierung & Visualisierung

| Action | Beschreibung | Parameter |
|--------|-------------|-----------|
| `get_placement_recommendations` | Node/Device-Platzierungsempfehlungen | - |
| `set_floor_plan` | Grundriss konfigurieren | `floor, name, imagePath?, widthMeters, heightMeters` |
| `get_floor_visualization` | Grundriss mit Overlays | `floor: number` |
| `get_roaming_analysis` | Roaming-Analyse pro Gerät | `macAddress: string` |

### Switch-Monitoring (SNMP)

| Action | Beschreibung | Parameter |
|--------|-------------|-----------|
| `get_switch_status` | Switch-Status abfragen | `host?: string` |
| `get_port_traffic` | Port-Traffic-Details | `host: string, port?: number` |
| `get_vlan_info` | VLAN-Konfiguration | `host: string` |
| `get_poe_status` | PoE-Status (MikroTik) | `host: string` |
| `set_poe_enabled` | PoE ein/ausschalten | `host, port, enabled` |

### Alerting

| Action | Beschreibung | Parameter |
|--------|-------------|-----------|
| `configure_alerts` | Webhook/MQTT konfigurieren | `webhookUrl?, mqttBroker?, minSeverity?` |
| `get_alerts` | Aktive Alerts abrufen | `hours?: number` |

### 🧠 Knowledge Base (NEU!)

> **Persistente Netzwerk-Datenbank** - Alle Scans werden automatisch gespeichert. Geräte, Nodes, SNMP-Devices und Zigbee-Geräte werden über Zeit getracked.

| Action | Beschreibung | Parameter |
|--------|-------------|-----------|
| `get_knowledge_stats` | Übersicht über gespeicherte Daten | - |
| `get_known_devices` | Alle bekannten Geräte abrufen | `filter?: 'all' \| 'known' \| 'unknown'` |
| `mark_device_known` | Gerät als "bekannt" markieren | `macAddress, customName?, deviceType?, notes?` |
| `get_network_history` | Historische Snapshots abrufen | `limit?: number` |
| `export_knowledge` | Komplette Knowledge Base exportieren | - |

**Device Types:** `router`, `switch`, `ap`, `computer`, `phone`, `tablet`, `iot`, `smart_home`, `media`, `gaming`, `unknown`

## 🏗️ Architektur

```
src/
├── config/              # Konfiguration & Zod Schemas
├── core/                # Kern-Logik (18 Module)
│   ├── mesh-analyzer.ts           # Mesh-Netzwerk Analyse
│   ├── triangulation.ts           # Räumliche Positionsberechnung
│   ├── problem-detector.ts        # Problem-Erkennung
│   ├── frequency-optimizer.ts     # Frequenz-Optimierung
│   ├── zigbee-analyzer.ts         # Zigbee-Analyse
│   ├── heatmap-generator.ts       # Multi-Floor Heatmap
│   ├── benchmark-engine.ts        # iPerf3/Latency Tests
│   ├── auto-debugger.ts           # Log-Analyse & Auto-Fix
│   ├── neighbor-monitor.ts        # Nachbarnetz-Scanning
│   ├── multi-node-coordinator.ts  # Multi-Node Mesh Management
│   ├── iot-wifi-detector.ts       # Rogue IoT WiFi Detection
│   ├── multi-gen-coordinator.ts   # WiFi 5/6/6E/7 Support
│   ├── network-topology-analyzer.ts # SNMP Topologie
│   ├── network-intelligence.ts    # KI-gestützte Analyse
│   ├── spatial-recommendations.ts # Platzierungsempfehlungen
│   ├── floor-plan-manager.ts      # Grundriss-Verwaltung
│   └── alerting-service.ts        # Webhook/MQTT Alerts
├── infra/               # Infrastruktur (6 Clients)
│   ├── asus-ssh-client.ts         # SSH zum Router
│   ├── homeassistant-client.ts    # Home Assistant WebSocket
│   ├── mesh-node-pool.ts          # Multi-Node SSH Pool
│   ├── snmp-client.ts             # SNMP Client
│   ├── opensensemap-client.ts     # OpenSenseMap API
│   └── network-knowledge-base.ts  # Persistente Netzwerk-Datenbank (NEU)
├── skill/               # OpenClaw Interface
│   ├── actions.ts                 # Zod Action Schemas
│   └── openclaw-skill.ts          # Hauptklasse (39 Actions)
├── types/               # TypeScript Types (10 Module)
│   ├── network.ts, zigbee.ts, building.ts
│   ├── benchmark.ts, debugging.ts, analysis.ts
│   ├── iot-device.ts, router-models.ts
│   ├── homeassistant.ts
│   └── knowledge-base.ts            # Knowledge Base Types (NEU)
└── utils/               # Utilities
    ├── logger.ts, mac.ts, frequency.ts
    ├── async-helpers.ts           # Semaphore, CircularBuffer
    └── errors.ts                  # Structured Errors (NEU)
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
| ------ | ------------ | -------------- |
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
| ------ | ------------ | -------------------- |
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

## 🛠️ Entwicklung

```bash
# Development Mode
npm run dev

# Build
npm run build

# Tests
npm run test:run

# Lint
npm run lint

# Clean Build
npm run clean && npm run build
```

## ✅ Voraussetzungen

- **ASUS Router** mit Merlin Firmware (SSH aktiviert)
- **Node.js 18+**
- **Optional**: Home Assistant mit ZHA oder Zigbee2MQTT
- **Optional**: SNMP-fähige Geräte (MikroTik, OPNsense, etc.)

## 📊 Unterstützte Geräte

### ASUS Router (via SSH)

- RT-AX88U, RT-AX86U, GT-AX11000
- ZenWiFi AX (XT8), ZenWiFi Pro (ET12)
- Alle Merlin-kompatiblen Modelle

### SNMP Devices

| Vendor | Unterstützte OIDs |
|--------|-------------------|
| MikroTik SwOS/RouterOS | Health, Temperatur, CPU, PoE, Neighbor |
| OPNsense/pfSense | Firewall States, Interface Counter |
| Cisco | Standard MIBs |
| Ubiquiti | Standard MIBs |

### IoT Vendor Detection (100+ OUIs)

| Kategorie | Vendors |
|-----------|---------|
| Smart Home | Tuya, Shelly, Sonoff, Meross, LIFX, Govee |
| Voice | Amazon Alexa, Google Home |
| Zigbee | Philips Hue, IKEA, Aqara |
| Network | MikroTik, TP-Link, ASUS |
| Generic | Espressif (ESP8266/ESP32) |

---

## 📝 Changelog

### v1.0.2 (2026-02-11)

```
┌─────────────────────────────────────────────────────────────┐
│  🚀 FEATURE: AP-Mode Detection & Optimizations              │
├─────────────────────────────────────────────────────────────┤
│  ✅ AP-Mode Detection via nvram sw_mode                     │
│  ✅ AP-Mode Empfehlungen:                                   │
│     • QoS deaktivieren (OPNsense übernimmt)                │
│     • AIProtection deaktivieren (CPU-Last -15-25%)         │
│     • Traffic Analyzer, Adaptive QoS, DDNS, UPnP           │
│     • MU-MIMO/OFDMA Hinweise für wenig Clients             │
│  ✅ Batch Signal Collection (getAllClientSignals)           │
│  ✅ SNMP Config aus Environment (SNMP_DEVICES)              │
│  ✅ Mesh Node Firmware Parsing aus cfg_device_list          │
│  ✅ getRouterFeatureStatus() für Feature-Erkennung          │
└─────────────────────────────────────────────────────────────┘
```

### v1.0.1 (2026-02-11)

```
┌─────────────────────────────────────────────────────────────┐
│  🔧 BUGFIX: SSH/Dropbear Compatibility                      │
├─────────────────────────────────────────────────────────────┤
│  ✅ Fixed SSH connection issues with ASUS router dropbear   │
│  ✅ Added legacy algorithm support for older dropbear       │
│  ✅ KEX: curve25519, diffie-hellman-group14-sha1, etc.      │
│  ✅ Cipher: chacha20-poly1305, aes128-ctr, aes256-cbc      │
│  ✅ HMAC: hmac-sha2-256, hmac-sha1                          │
│  ✅ Applied to both asus-ssh-client and mesh-node-pool      │
└─────────────────────────────────────────────────────────────┘
```

### v1.0.0 (2026-02-11)

```
┌─────────────────────────────────────────────────────────────┐
│  🎉 INITIAL RELEASE                                         │
├─────────────────────────────────────────────────────────────┤
│  ✅ 12 OpenClaw Actions                                     │
│  ✅ 13 Core Modules                                         │
│  ✅ 5 Infrastructure Clients                                │
│  ✅ 100+ Vendor OUI Patterns                                │
│  ✅ 56 Unit Tests                                           │
│  ✅ SNMP Netzwerk-Topologie                                 │
│  ✅ Graceful Shutdown (SIGINT/SIGTERM)                      │
│  ✅ Connection Pooling + Auto-Reconnect                     │
│  ✅ Structured Error Handling                               │
│  ✅ Health Check & Stats API                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 🤝 Contributing

Contributions sind willkommen! Bitte lies die [Contributing Guidelines](CONTRIBUTING.md) bevor du einen PR erstellst.

```
┌─────────────────────────────────────────────────────────────┐
│  🛠️  DEVELOPMENT WORKFLOW                                   │
├─────────────────────────────────────────────────────────────┤
│  1. Fork & Clone                                            │
│  2. npm install                                             │
│  3. npm run dev                                             │
│  4. Make changes                                            │
│  5. npm run test:run                                        │
│  6. npm run lint                                            │
│  7. Create PR                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 📄 Lizenz

MIT - siehe [LICENSE](LICENSE)

---

<div align="center">

**Made with ❤️ for the OpenClaw Community**

```
    ╔═══════════════════════════════════════════════════════════╗
    ║  🌐  ASUS MESH WIFI ANALYZER  •  OpenClaw Skill v1.0.0 🌐 ║
    ╚═══════════════════════════════════════════════════════════╝
```

</div>
