---
name: asus-mesh-wifi-analyzer
description: ASUS Mesh WiFi analysis, optimization, triangulation, Zigbee coordination
homepage: https://github.com/The-Geek-Freaks/openclaw_WIFI_DEBUGGER
user-invocable: true
metadata: { "openclaw": { "emoji": "📡", "homepage": "https://github.com/The-Geek-Freaks/openclaw_WIFI_DEBUGGER", "os": ["darwin", "linux"], "requires": { "bins": ["openclaw-wifi", "ssh"], "env": ["ASUS_ROUTER_HOST", "ASUS_ROUTER_SSH_USER", "ASUS_ROUTER_SSH_PASSWORD"] }, "primaryEnv": "ASUS_ROUTER_HOST", "install": [ { "id": "npm", "kind": "node", "package": "openclaw-asus-mesh-skill", "bins": ["openclaw-wifi"], "label": "Install WiFi Analyzer CLI" } ] } }
---

# ASUS Mesh WiFi Analyzer

CLI tool for ASUS Mesh WiFi network analysis and optimization via SSH.
All commands output JSON. Parse it and summarize for the user.

## Quick Start (always begin here)

```bash
openclaw-wifi get_quick_diagnosis
```

## Network Scan

```bash
openclaw-wifi scan_network
```

## Device List

```bash
openclaw-wifi get_device_list
openclaw-wifi get_device_list '{"filter":"problematic"}'
openclaw-wifi get_device_list '{"filter":"wireless"}'
```

## Health & Problems

```bash
openclaw-wifi get_network_health
openclaw-wifi get_problems
openclaw-wifi get_problems '{"severity":"critical"}'
```

## Optimization

```bash
openclaw-wifi get_optimization_suggestions
openclaw-wifi apply_optimization '{"suggestionId":"<ID>","confirm":true}'
```

## Channel Analysis

```bash
openclaw-wifi get_channel_scan
openclaw-wifi get_channel_scan '{"band":"5GHz"}'
```

## Zigbee Integration

```bash
openclaw-wifi scan_zigbee
openclaw-wifi get_frequency_conflicts
```

## Router Tweaks

```bash
openclaw-wifi check_router_tweaks
openclaw-wifi apply_router_tweak '{"tweakId":"<ID>","confirm":true}'
```

## Full Intelligence Scan

```bash
openclaw-wifi full_intelligence_scan
openclaw-wifi full_intelligence_scan '{"targets":["minimize_interference","protect_zigbee"]}'
```

## Triangulation & Location

```bash
openclaw-wifi get_mesh_nodes
openclaw-wifi set_house_config '{"name":"My House","floors":[{"number":0,"name":"Ground"}]}'
openclaw-wifi set_node_position_3d '{"nodeMac":"AA:BB:CC:DD:EE:FF","nodeId":"node1","floorNumber":0,"floorType":"ground","x":5,"y":3}'
openclaw-wifi triangulate_devices
openclaw-wifi get_auto_map
```

## Debug & Metrics

```bash
openclaw-wifi get_log_info
openclaw-wifi get_metrics
openclaw-wifi reset_circuit_breaker
```

## Workflow

1. `get_quick_diagnosis` — Start here
2. If problems: `get_optimization_suggestions`
3. Ask user before applying → `apply_optimization`
4. Verify with `scan_network`

## Important

- **ALWAYS ask user** before `apply_optimization` or `restart_wireless`
- `restart_wireless` disconnects all WiFi clients — confirm first
- All output is JSON — parse and summarize for humans

## Environment Variables

**Required:** `ASUS_ROUTER_HOST`, `ASUS_ROUTER_SSH_USER`, `ASUS_ROUTER_SSH_PASSWORD`

**Optional:** `HASS_URL`, `HASS_TOKEN` (for Zigbee via Home Assistant)
