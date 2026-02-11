---
name: asus-mesh-wifi-analyzer
description: Comprehensive ASUS Mesh WiFi network analysis, optimization, and debugging with Zigbee coordination and community-based tweaks
homepage: https://github.com/The-Geek-Freaks/openclaw_WIFI_DEBUGGER
user-invocable: true
metadata: { "openclaw": { "emoji": "📡", "homepage": "https://github.com/The-Geek-Freaks/openclaw_WIFI_DEBUGGER", "os": ["darwin", "linux", "win32"], "requires": { "bins": ["ssh"], "env": ["ASUS_HOST", "ASUS_USER", "ASUS_PASSWORD"] }, "primaryEnv": "ASUS_HOST", "install": [ { "id": "npm", "kind": "node", "package": "openclaw-asus-mesh-skill", "bins": [], "label": "Install via npm" } ] } }
---

# ASUS Mesh WiFi Analyzer

## Overview

This skill provides comprehensive network analysis and optimization for ASUS routers running stock or Merlin firmware. It connects via SSH to analyze your mesh network, detect problems, and suggest optimizations.

## Capabilities

- **Network Scanning** - Discover all mesh nodes and connected devices
- **Health Monitoring** - Real-time health score with problem detection
- **Optimization** - AI-powered suggestions for channel, bandwidth, and settings
- **Zigbee Coordination** - Avoid WiFi/Zigbee interference via Home Assistant
- **Router Tweaks** - Community-based NVRAM optimizations from SNBForums/Reddit
- **Persistent Knowledge** - Saves device history and network profiles over time

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

### Advanced
- `full_intelligence_scan` - Complete AI-powered network analysis
- `run_benchmark` - Network speed and latency benchmark
- `get_heatmap` - Signal strength heatmap
- `analyze_network_topology` - SNMP-based topology discovery

## Configuration

Required environment variables:
- `ASUS_HOST` - Router IP address (e.g., 192.168.1.1)
- `ASUS_USER` - SSH username (usually "admin")
- `ASUS_PASSWORD` - SSH password

Optional:
- `HASS_URL` - Home Assistant URL for Zigbee integration
- `HASS_TOKEN` - Home Assistant long-lived access token
- `SNMP_DEVICES` - JSON array of SNMP devices for topology

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
