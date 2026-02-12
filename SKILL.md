---
name: asus-mesh-wifi-analyzer
description: ASUS Mesh WiFi analysis, optimization, triangulation, Zigbee coordination
homepage: https://github.com/The-Geek-Freaks/openclaw_WIFI_DEBUGGER
user-invocable: true
metadata: { "openclaw": { "emoji": "📡", "homepage": "https://github.com/The-Geek-Freaks/openclaw_WIFI_DEBUGGER", "os": ["darwin", "linux", "win32"], "requires": { "bins": ["ssh"], "env": ["ASUS_ROUTER_HOST", "ASUS_ROUTER_SSH_USER", "ASUS_ROUTER_SSH_PASSWORD"] }, "primaryEnv": "ASUS_ROUTER_HOST", "install": [ { "id": "npm", "kind": "node", "package": "openclaw-asus-mesh-skill", "bins": [], "label": "Install via npm" } ] } }
---

# ASUS Mesh WiFi Analyzer

## Intent Keywords (Match user words → Flow)

| User says | Use Flow |
|-----------|----------|
| "slow", "langsam", "speed", "Mbps" | Flow 2: Performance |
| "WiFi", "WLAN", "how is", "status" | Flow 1: Health Check |
| "settings", "optimal", "config" | Flow 3: Router Audit |
| "where", "location", "position" | Flow 4: Triangulation |
| "Zigbee", "smart home", "Hue" | Flow 5: Zigbee |
| "new device", "neues Gerät" | Flow 6: Device Mgmt |

## Core Principle

```text
SCAN → ANALYZE → OPTIMIZE → VERIFY
```

Always check `suggestions[]` in response for next action!

## Flows

**Flow 1 (Health):** `full_intelligence_scan` → `get_optimization_suggestions` → `apply_optimization` → `get_network_health`

**Flow 2 (Speed):** `scan_network` → `get_channel_scan` → `get_optimization_suggestions` → `apply_optimization` → `run_benchmark`

**Flow 3 (Settings):** `check_router_tweaks` → `apply_router_tweak` → `get_recommended_scripts`

**Flow 4 (Location):** `get_mesh_nodes` → `set_house_config` → `set_node_position_3d` (x3) → `triangulate_devices` → `get_auto_map`

**Flow 5 (Zigbee):** `scan_zigbee` → `get_frequency_conflicts` → `full_intelligence_scan(targets=["protect_zigbee"])` → `apply_optimization`

**Flow 6 (Device):** `scan_network` → `get_device_list` → `mark_device_known` → `get_connection_stability`

## Rules

**DO:** Start with scan · Check suggestions[] · Confirm before apply · Verify after changes

**DON'T:** Skip scan · Auto-confirm · Single action for complex requests

## Dependencies

```text
scan_network → get_network_health, get_device_list, get_problems, get_optimization_suggestions
scan_zigbee → get_frequency_conflicts, get_zigbee_devices
get_optimization_suggestions → apply_optimization (needs suggestionId)
check_router_tweaks → apply_router_tweak (needs tweakId)
set_node_position_3d (x3) → triangulate_devices → get_auto_map
```

## Actions Quick Reference

| Category | Actions |
|----------|---------|
| Scan | `scan_network`, `full_intelligence_scan`, `get_network_health` |
| Analyze | `get_device_list`, `get_problems`, `get_channel_scan` |
| Optimize | `get_optimization_suggestions`, `apply_optimization` |
| Tweaks | `check_router_tweaks`, `apply_router_tweak`, `get_recommended_scripts` |
| Zigbee | `scan_zigbee`, `get_frequency_conflicts` |
| Location | `set_house_config`, `set_node_position_3d`, `triangulate_devices`, `get_auto_map` |
| Knowledge | `get_known_devices`, `mark_device_known`, `get_network_history` |

## Config

**Required:** `ASUS_ROUTER_HOST`, `ASUS_ROUTER_SSH_USER`, `ASUS_ROUTER_SSH_PASSWORD`

**Optional:** `HASS_URL`, `HASS_TOKEN`, `SNMP_DEVICES`, `OPENCLAW_LOG_DIR`, `LOG_LEVEL`

**Logs:** `~/.openclaw/logs/openclaw-skill-YYYY-MM-DD.log`
