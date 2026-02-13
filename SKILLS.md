# OpenClaw ASUS Mesh WiFi Analyzer - Skill Guide

## 🎯 Verfügbare Actions (50+)

### 📡 Netzwerk-Scanning

| Action | Beschreibung | Parameter |
|--------|--------------|-----------|
| `scan_network` | Vollständiger Netzwerk-Scan | - |
| `get_mesh_nodes` | Alle Mesh-Nodes abrufen | - |
| `get_device_list` | Alle Geräte im Netzwerk | `sortBy?`, `filterBy?` |
| `get_network_health` | Netzwerk-Gesundheitsscore | - |

### 🗺️ Karten & Triangulation

| Action | Beschreibung | Parameter |
|--------|--------------|-----------|
| `set_location` | Standort setzen (GPS/Adresse) | `address?`, `latitude?`, `longitude?` |
| `fetch_map_image` | OSM-Karte laden | `zoom?` |
| `generate_floor_plans` | Grundrisse generieren | `floorCount?`, `hasBasement?`, `hasAttic?` |
| `generate_full_house_map` | **Komplette Hauskarte** | `includeBasement?`, `includeAttic?`, `includeGarden?`, `detectWalls?`, `fetchOsmMap?` |
| `get_svg_map` | SVG-Vektor-Karte | `floorNumber?` |
| `get_auto_map` | Auto-generierte ASCII-Karte | `floorNumber?` |
| `set_node_position_3d` | Node-Position setzen | `nodeMac`, `nodeId`, `x`, `y`, `z?`, `floorNumber`, `floorType` |
| `triangulate_devices` | Geräte-Positionen berechnen | `deviceMac?` |
| `detect_walls` | Wände aus Signal-Dämpfung erkennen | `floorNumber?` |

### ⚠️ Problem-Erkennung

| Action | Beschreibung | Parameter |
|--------|--------------|-----------|
| `detect_problems` | Alle Probleme finden | - |
| `get_frequency_conflicts` | WiFi/Zigbee Konflikte | - |
| `get_recommendations` | Optimierungsvorschläge | - |

### 📊 Analyse

| Action | Beschreibung | Parameter |
|--------|--------------|-----------|
| `get_wifi_settings` | WLAN-Einstellungen | - |
| `get_channel_info` | Kanal-Informationen | - |
| `get_heatmap` | Signal-Heatmap | `floor?` |
| `run_benchmark` | Performance-Benchmark | `targetDevice?` |

### 🏠 Smart Home

| Action | Beschreibung | Parameter |
|--------|--------------|-----------|
| `get_zigbee_network` | Zigbee-Netzwerk scannen | - |
| `get_iot_devices` | IoT-Geräte auflisten | - |
| `check_device_security` | Sicherheits-Check | `deviceMac` |

### 🔧 Router-Konfiguration

| Action | Beschreibung | Parameter |
|--------|--------------|-----------|
| `check_router_tweaks` | Best Practices prüfen | - |
| `apply_optimization` | Optimierung anwenden | `optimizationId`, `confirm` |
| `set_wifi_channel` | WLAN-Kanal ändern | `band`, `channel` |

---

## 🚀 Quick Start

### 1. Netzwerk scannen
```bash
node dist/cli.js scan_network
```

### 2. Standort setzen
```bash
node dist/cli.js set_location '{"address":"Musterstraße 42, Berlin"}'
```

### 3. Komplette Hauskarte generieren
```bash
node dist/cli.js generate_full_house_map
```

### 4. Mesh-Nodes positionieren
```bash
node dist/cli.js set_node_position_3d '{"nodeMac":"c8:7f:54:bf:0e:a0","nodeId":"main","x":5,"y":4,"z":1.5,"floorNumber":0,"floorType":"ground"}'
```

### 5. Geräte triangulieren
```bash
node dist/cli.js triangulate_devices
```

---

## 🔧 Umgebungsvariablen

```bash
# Pflicht
ASUS_ROUTER_HOST=192.168.1.1
ASUS_ROUTER_SSH_USER=admin
ASUS_ROUTER_SSH_PASSWORD=yourpassword

# Optional
ASUS_ROUTER_SSH_KEY_PATH=/path/to/key
HOMEASSISTANT_URL=http://homeassistant.local:8123
HOMEASSISTANT_TOKEN=your_long_lived_token
```

---

## 📁 State Persistence

Der Skill speichert seinen Zustand in:
```
~/.openclaw/skills/asus-mesh-wifi-analyzer/session-state.json
```

Persistierte Daten:
- `meshState` - Letzte Netzwerk-Scan Ergebnisse
- `nodePositions` - Mesh-Node Positionen
- `signalMeasurements` - Signal-Messungen für Triangulation
- `propertyData` - GPS/Location Daten
- `houseConfig` - Haus-Konfiguration

---

## 🐛 Bekannte Einschränkungen

1. **SSH erforderlich** - Die meisten Actions benötigen SSH-Zugang zum Router
2. **AiMesh** - Nur ASUS Router mit AiMesh werden unterstützt
3. **Zigbee** - Erfordert Home Assistant mit ZHA/Z2M
4. **Triangulation** - Mindestens 2-3 Node-Positionen für genaue Ergebnisse

---

## 📝 Changelog

### v1.7.0 (aktuell)
- ✅ `generate_full_house_map` - Automatische komplette Hauskarte
- ✅ `get_svg_map` - SVG-Vektor-Karten
- ✅ Signal-Messungen Persistenz
- ✅ Location Persistenz
- ✅ Multi-NVRAM-Keys für AiMesh-Discovery
- ✅ Band-Erkennung (2.4/5/6 GHz)
- ✅ Bulk RSSI Fetching (Performance)

### v1.6.0
- Geo-Location Features
- Floor Plan Generation
- OSM Map Integration

### v1.5.0
- Real Triangulation Engine
- Wall Detection
- 3D Node Positioning
