---
name: asus-mesh-wifi-analyzer
description: Comprehensive ASUS Mesh WiFi network analysis, optimization, real triangulation, and debugging with Zigbee coordination and community-based tweaks
homepage: https://github.com/The-Geek-Freaks/openclaw_WIFI_DEBUGGER
user-invocable: true
metadata: { "openclaw": { "emoji": "📡", "homepage": "https://github.com/The-Geek-Freaks/openclaw_WIFI_DEBUGGER", "os": ["darwin", "linux", "win32"], "requires": { "bins": ["ssh"], "env": ["ASUS_ROUTER_HOST", "ASUS_ROUTER_SSH_USER", "ASUS_ROUTER_SSH_PASSWORD"] }, "primaryEnv": "ASUS_ROUTER_HOST", "install": [ { "id": "npm", "kind": "node", "package": "openclaw-asus-mesh-skill", "bins": [], "label": "Install via npm" } ] } }
---

# ASUS Mesh WiFi Analyzer

## 🧠 OpenClaw Instructions - READ THIS FIRST

**This skill requires ITERATIVE usage.** Most user requests need MULTIPLE actions in sequence.

### Response Structure

Every action returns:
```json
{
  "success": true,
  "action": "action_name",
  "data": { ... },
  "suggestions": ["Next action hint 1", "Next action hint 2"],
  "timestamp": "2026-02-12T..."
}
```

**IMPORTANT:** Always check `suggestions[]` in the response - it tells you what to do next!

### Core Workflow Principle

```
1. SCAN FIRST → Always start with scan_network or full_intelligence_scan
2. ANALYZE → Use data from scan to detect problems
3. OPTIMIZE → Generate and apply suggestions
4. VERIFY → Re-scan to confirm improvements
```

---

## 🔄 Iterative Flows by User Intent

### Flow 1: "How is my WiFi?" / General Health Check

```
Step 1: full_intelligence_scan
        → Returns: environmentScore, problems, recommendations
        → Check suggestions[] for next steps

Step 2: IF score < 70 → get_optimization_suggestions
        → Returns: prioritized list of fixes

Step 3: FOR each high-priority suggestion:
        → apply_optimization(suggestionId, confirm=true)
        → Wait for success

Step 4: scan_network (verify improvement)
Step 5: get_network_health (show new score)
```

### Flow 2: "My WiFi is slow" / Performance Issue

```
Step 1: scan_network
Step 2: get_channel_scan(band="both")
        → Returns: channel congestion, interference levels

Step 3: get_optimization_suggestions
        → Returns: channel change recommendations

Step 4: IF user confirms → apply_optimization(id, confirm=true)
Step 5: run_benchmark
        → Returns: throughput, latency, jitter scores

Step 6: Report before/after comparison
```

### Flow 3: "Check my router settings" / Optimization Audit

```
Step 1: check_router_tweaks
        → Returns: score, suboptimal settings, recommendations

Step 2: FOR each critical tweak:
        → Explain what it does
        → ASK user for confirmation

Step 3: IF confirmed → apply_router_tweak(tweakId, confirm=true)

Step 4: get_recommended_scripts
        → Returns: Merlin scripts (Diversion, Skynet, FlexQoS)
        → Explain each script's purpose
```

### Flow 4: "Where are my devices?" / Device Triangulation

**REQUIRES: 3 mesh nodes with known physical positions**

```
Step 1: get_mesh_nodes
        → Returns: list of nodes with MAC addresses
        → Note: Need 3+ nodes for triangulation

Step 2: ASK user about house layout:
        - How many floors?
        - Where is each mesh node located?

Step 3: set_house_config with floors array
        → Example: basement (-1), ground (0), first (1)

Step 4: FOR each node (need 3 minimum):
        → set_node_position_3d(nodeMac, nodeId, floorNumber, floorType, x, y)
        → x, y in meters from corner of floor

Step 5: triangulate_devices
        → Returns: estimated positions for all devices

Step 6: get_auto_map(floorNumber)
        → Returns: ASCII/text map of device positions
```

### Flow 5: "Zigbee interference" / Smart Home Conflicts

```
Step 1: scan_zigbee
        → Returns: Zigbee channel, device count, LQI

Step 2: get_frequency_conflicts
        → Returns: WiFi/Zigbee overlap analysis

Step 3: IF conflicts found:
        → full_intelligence_scan(targets=["protect_zigbee"])
        → Returns: recommendations to protect Zigbee

Step 4: apply_optimization with Zigbee-safe channel
Step 5: Re-scan Zigbee to verify LQI improvement
```

### Flow 6: "I have a new device" / Device Management

```
Step 1: scan_network
Step 2: get_device_list(filter="all")
        → Find the new device by MAC or name

Step 3: mark_device_known(macAddress, customName, deviceType, notes)
        → Persists to knowledge base

Step 4: IF device has weak signal:
        → get_connection_stability(macAddress)
        → get_roaming_analysis(macAddress)
        → Suggest better node placement
```

---

## ⚠️ Critical Rules for OpenClaw

### ALWAYS DO:
1. **Start with a scan** - Most actions need network state
2. **Check suggestions[]** - The skill tells you what to do next
3. **Confirm destructive actions** - Always set `confirm: true` only after user approval
4. **Report changes** - After apply_*, run scan to show improvement
5. **Use the right flow** - Match user intent to workflow above

### NEVER DO:
1. **Skip scanning** - Don't run get_problems without scan_network first
2. **Auto-confirm** - Never set confirm=true without user consent
3. **Ignore errors** - If success=false, explain the error and retry
4. **Single action** - Most user requests need 3-5 actions in sequence

### Dependencies Map

```
scan_network ──────────────┬─→ get_network_health
                           ├─→ get_device_list
                           ├─→ get_problems
                           ├─→ get_optimization_suggestions
                           └─→ get_heatmap

scan_zigbee ───────────────┬─→ get_frequency_conflicts
                           └─→ get_zigbee_devices

get_optimization_suggestions ─→ apply_optimization (needs suggestionId from response)

check_router_tweaks ─────────→ apply_router_tweak (needs tweakId from response)

get_mesh_nodes ──────────────→ set_node_position_3d (needs nodeMac)
set_house_config ────────────→ triangulate_devices
set_node_position_3d (x3) ───→ triangulate_devices
triangulate_devices ─────────→ get_auto_map
```

---

## 📋 Available Actions Reference

### Scan & Health (Start Here)
| Action | Use When | Returns |
|--------|----------|---------|
| `scan_network` | First action for any request | nodes, devices, wifiSettings |
| `full_intelligence_scan` | Comprehensive analysis | environmentScore, recommendations |
| `get_network_health` | After scan, for health score | score 0-100, categories |
| `get_quick_diagnosis` | Fast overview | top 3 issues with priority |

### Analysis
| Action | Use When | Returns |
|--------|----------|---------|
| `get_device_list` | List all devices | devices with signal, connection |
| `get_problems` | Find issues | problems by severity |
| `get_channel_scan` | Check interference | channel congestion scores |
| `get_frequency_conflicts` | WiFi/Zigbee check | conflict severity |

### Optimization
| Action | Use When | Returns |
|--------|----------|---------|
| `get_optimization_suggestions` | Get fix recommendations | prioritized suggestions |
| `apply_optimization` | Apply a fix | success/failure + follow-ups |
| `check_router_tweaks` | Audit NVRAM settings | score + tweaks list |
| `apply_router_tweak` | Apply NVRAM tweak | success/failure |

### Triangulation (NEW - requires setup)
| Action | Use When | Returns |
|--------|----------|---------|
| `set_house_config` | Define building layout | confirmation |
| `get_house_config` | Check current config | floors, dimensions |
| `set_node_position_3d` | Position a mesh node | confirmation |
| `triangulate_devices` | Calculate device positions | x,y,z estimates |
| `get_auto_map` | Visualize positions | text-based floor map |

### Knowledge Base
| Action | Use When | Returns |
|--------|----------|---------|
| `get_known_devices` | List labeled devices | devices with custom names |
| `mark_device_known` | Label a device | confirmation |
| `get_network_history` | Historical data | past scans, trends |

### Logging
| Action | Use When | Returns |
|--------|----------|---------|
| `get_log_info` | Debug/verify TypeScript runs | log file path, PID |

---

## 🔧 Configuration

**Required:**
- `ASUS_ROUTER_HOST` - Router IP (e.g., 192.168.178.3)
- `ASUS_ROUTER_SSH_USER` - SSH user (usually "admin")
- `ASUS_ROUTER_SSH_PASSWORD` - SSH password

**Optional:**
- `HASS_URL` - Home Assistant URL for Zigbee
- `HASS_TOKEN` - Home Assistant access token
- `SNMP_DEVICES` - JSON array for switch monitoring
- `OPENCLAW_LOG_DIR` - Custom log directory (default: `~/.openclaw/logs/`)
- `LOG_LEVEL` - debug, info, warn, error (default: info)

**Log File Location:**
```
Default: ~/.openclaw/logs/openclaw-skill-YYYY-MM-DD.log
Windows: C:\Users\<user>\.openclaw\logs\openclaw-skill-YYYY-MM-DD.log
Linux:   /home/<user>/.openclaw/logs/openclaw-skill-YYYY-MM-DD.log
macOS:   /Users/<user>/.openclaw/logs/openclaw-skill-YYYY-MM-DD.log
```

Logging starts **immediately** when the skill module is loaded - before initialize() is called.

---

## 📊 Example Conversation

```
User: "Mein WLAN ist langsam, was kann ich tun?"

OpenClaw:
1. scan_network → "Found 3 nodes, 28 devices"
2. get_channel_scan(band="5GHz") → "Channel 36 has 65% congestion"
3. get_optimization_suggestions → "Suggestion #1: Change to Channel 149"
4. "Soll ich auf Kanal 149 wechseln? Das reduziert Interferenz um ~40%"

User: "Ja, mach das"

OpenClaw:
5. apply_optimization(id="ch_5g_149", confirm=true) → "Channel changed"
6. run_benchmark → "Throughput: 450 Mbps (+35% vs. before)"
7. "Fertig! 5GHz läuft jetzt auf Kanal 149. Benchmark zeigt 35% mehr Durchsatz."
```
