---
name: asus-mesh-wifi-analyzer
description: Comprehensive ASUS Mesh WiFi network analysis, optimization, real triangulation, and debugging with Zigbee coordination and community-based tweaks
homepage: https://github.com/The-Geek-Freaks/openclaw_WIFI_DEBUGGER
user-invocable: true
metadata: { "openclaw": { "emoji": "📡", "homepage": "https://github.com/The-Geek-Freaks/openclaw_WIFI_DEBUGGER", "os": ["darwin", "linux", "win32"], "requires": { "bins": ["ssh"], "env": ["ASUS_ROUTER_HOST", "ASUS_ROUTER_SSH_USER", "ASUS_ROUTER_SSH_PASSWORD"] }, "primaryEnv": "ASUS_ROUTER_HOST", "install": [ { "id": "npm", "kind": "node", "package": "openclaw-asus-mesh-skill", "bins": [], "label": "Install via npm" } ] } }
---

# ASUS Mesh WiFi Analyzer

## Overview

This skill provides comprehensive network analysis and optimization for ASUS routers running stock or Merlin firmware. It connects via SSH to analyze your mesh network, detect problems, and suggest optimizations. **Now with real geometric triangulation using 3 mesh nodes!**

## Capabilities

- **Network Scanning** - Discover all mesh nodes and connected devices
- **Health Monitoring** - Real-time health score with problem detection
- **Optimization** - AI-powered suggestions for channel, bandwidth, and settings
- **Zigbee Coordination** - Avoid WiFi/Zigbee interference via Home Assistant
- **Router Tweaks** - Community-based NVRAM optimizations from SNBForums/Reddit
- **Persistent Knowledge** - Saves device history and network profiles over time
- **Real Triangulation** - 3D device positioning with 3 mesh nodes (NEW!)
- **Auto-Map Generation** - Create floor maps from device positions (NEW!)
- **Persistent Logging** - Daily log files proving TypeScript execution (NEW!)

## Available Actions

### Core Network Actions
- `scan_network` - Scan entire mesh network
- `get_network_health` - Calculate health score (0-100)
- `get_device_list` - List all connected devices
- `get_optimization_suggestions` - Get AI optimization recommendations
- `apply_optimization` - Apply a suggestion

### Zigbee & Frequency
- `scan_zigbee` - Scan Zigbee network via Home Assistant
- `get_frequency_conflicts` - Detect WiFi/Zigbee interference
- `get_channel_scan` - Analyze channel congestion

### Router Tweaks (Community-Based)
- `check_router_tweaks` - Check 16+ NVRAM optimizations
- `apply_router_tweak` - Apply a tweak with confirmation
- `get_recommended_scripts` - List Merlin scripts (Diversion, Skynet, FlexQoS, etc.)

### Knowledge Base
- `get_knowledge_stats` - Overview of stored network data
- `get_known_devices` - List known devices with custom names
- `mark_device_known` - Label a device with name, type, notes
- `get_network_history` - Historical snapshots and health scores
- `export_knowledge` - Export all data as JSON

### Real Triangulation & Building Config (NEW!)
- `set_house_config` - Configure building with floors (basement to attic)
- `get_house_config` - Get current building configuration
- `set_node_position_3d` - Set 3D position of mesh node
- `triangulate_devices` - Triangulate device positions using 3 nodes
- `get_auto_map` - Generate floor map from device positions
- `record_signal_measurement` - Record RSSI measurement for better accuracy

### Logging & Diagnostics (NEW!)
- `get_log_info` - Get log file path and status (proof of TypeScript execution)

### Advanced
- `full_intelligence_scan` - Complete AI-powered network analysis
- `run_benchmark` - Network speed and latency benchmark
- `get_heatmap` - Signal strength heatmap
- `analyze_network_topology` - SNMP-based topology discovery

## Configuration

Required environment variables:
- `ASUS_ROUTER_HOST` - Router IP address (e.g., 192.168.178.3)
- `ASUS_ROUTER_SSH_USER` - SSH username (usually "admin")
- `ASUS_ROUTER_SSH_PASSWORD` - SSH password

Optional:
- `HASS_URL` - Home Assistant URL for Zigbee integration
- `HASS_TOKEN` - Home Assistant long-lived access token
- `SNMP_DEVICES` - JSON array of SNMP devices for topology
- `OPENCLAW_LOG_DIR` - Directory for log files (default: ./logs)
- `LOG_LEVEL` - Log level: debug, info, warn, error (default: info)

## Example Usage

### Quick Health Check
```
User: "How is my WiFi network doing?"
Action: full_intelligence_scan
Response: Show environment score, top problems, recommendations
```

### Optimize Channel
```
User: "My 5GHz is slow"
Action: get_channel_scan with band="5GHz"
Action: get_optimization_suggestions
Action: apply_optimization with confirm=true
```

### Triangulate Devices (NEW!)
```
User: "Where are my devices located?"
Action: set_house_config with floors (basement, ground, first, attic)
Action: set_node_position_3d for each of 3 mesh nodes
Action: triangulate_devices
Action: get_auto_map
Response: Show device positions on auto-generated floor map
```

### Check Router Settings
```
User: "Are my router settings optimal?"
Action: check_router_tweaks
Response: Show score, suboptimal settings, recommended Merlin scripts
```

## Requirements

- ASUS router with SSH enabled (Administration → System → SSH Daemon)
- Merlin firmware recommended but not required
- Node.js >= 18.0.0
- Optional: Home Assistant with Zigbee integration (ZHA or Zigbee2MQTT)
- For triangulation: 3 mesh nodes with known positions
