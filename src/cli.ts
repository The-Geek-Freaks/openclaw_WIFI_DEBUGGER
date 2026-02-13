#!/usr/bin/env node
import { OpenClawAsusMeshSkill } from './skill/openclaw-skill.js';
import { SkillActionSchema, type SkillAction } from './skill/actions.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const STATE_DIR = join(homedir(), '.openclaw', 'skills', 'asus-mesh-wifi-analyzer');
const STATE_FILE = join(STATE_DIR, 'session-state.json');
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface SessionState {
  timestamp: number;
  meshState: unknown;
  zigbeeState: unknown;
  pendingOptimizations: Record<string, unknown>;
}

function loadState(): SessionState | null {
  try {
    if (!existsSync(STATE_FILE)) return null;
    const raw = readFileSync(STATE_FILE, 'utf-8');
    const state = JSON.parse(raw) as SessionState;
    if (Date.now() - state.timestamp > STATE_TTL_MS) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

function saveState(state: Omit<SessionState, 'timestamp'>): void {
  try {
    if (!existsSync(STATE_DIR)) {
      mkdirSync(STATE_DIR, { recursive: true });
    }
    const fullState: SessionState = {
      ...state,
      timestamp: Date.now(),
    };
    writeFileSync(STATE_FILE, JSON.stringify(fullState, null, 2));
  } catch (err) {
    console.error(`Warning: Failed to save state: ${err}`);
  }
}

function printUsage(): void {
  console.log(`
Usage: openclaw-wifi <action> [params-json]

Actions:
  scan_network                    Scan mesh network
  get_network_health              Get health score
  get_device_list [filter]        List devices (filter: all|wireless|wired|problematic)
  get_optimization_suggestions    Get optimization suggestions
  apply_optimization <json>       Apply optimization (needs suggestionId, confirm)
  get_quick_diagnosis             Quick network diagnosis
  get_channel_scan [band]         Scan channels (band: 2.4GHz|5GHz|both)
  full_intelligence_scan [json]   Full scan with targets
  scan_zigbee                     Scan Zigbee network
  get_frequency_conflicts         Get WiFi/Zigbee conflicts
  check_router_tweaks             Check router tweaks
  get_mesh_nodes                  List mesh nodes
  get_problems [severity]         Get problems (severity: all|critical|error|warning)
  get_metrics                     Get skill metrics
  get_log_info                    Get log file info

Examples:
  openclaw-wifi scan_network
  openclaw-wifi get_device_list '{"filter":"problematic"}'
  openclaw-wifi apply_optimization '{"suggestionId":"ch-5g-36","confirm":true}'

Environment:
  ASUS_ROUTER_HOST         Router IP (required)
  ASUS_ROUTER_SSH_USER     SSH user (required)
  ASUS_ROUTER_SSH_PASSWORD SSH password (required)
  HASS_URL                 Home Assistant URL (optional)
  HASS_TOKEN               Home Assistant token (optional)
`);
}

async function main(): Promise<void> {
  const action = process.argv[2];
  const paramsRaw = process.argv[3];

  if (!action || action === '--help' || action === '-h') {
    printUsage();
    process.exit(action ? 0 : 1);
  }

  // Validate required env vars
  const requiredEnv = ['ASUS_ROUTER_HOST', 'ASUS_ROUTER_SSH_USER', 'ASUS_ROUTER_SSH_PASSWORD'];
  const missing = requiredEnv.filter(e => !process.env[e]);
  if (missing.length > 0) {
    console.error(JSON.stringify({
      success: false,
      error: `Missing required environment variables: ${missing.join(', ')}`,
      hint: 'Set ASUS_ROUTER_HOST, ASUS_ROUTER_SSH_USER, ASUS_ROUTER_SSH_PASSWORD',
    }, null, 2));
    process.exit(1);
  }

  // Parse params
  let params: Record<string, unknown> = {};
  if (paramsRaw) {
    try {
      params = JSON.parse(paramsRaw);
    } catch {
      console.error(JSON.stringify({
        success: false,
        error: `Invalid JSON params: ${paramsRaw}`,
      }, null, 2));
      process.exit(1);
    }
  }

  // Validate action
  let parsed: SkillAction;
  try {
    parsed = SkillActionSchema.parse({ action, params });
  } catch (err) {
    console.error(JSON.stringify({
      success: false,
      error: `Invalid action or params: ${err instanceof Error ? err.message : String(err)}`,
      action,
      params,
    }, null, 2));
    process.exit(1);
  }

  // Initialize skill
  const skill = new OpenClawAsusMeshSkill();
  
  // Register shutdown handlers
  skill.registerShutdownHandlers();

  try {
    await skill.initialize();
    
    // Load cached state if available
    const cachedState = loadState();
    if (cachedState && cachedState.meshState) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      skill.importState(cachedState as any);
    }

    // Execute action
    const result = await skill.execute(parsed);
    
    // Save state for next call
    const exportedState = skill.exportState();
    saveState({
      meshState: exportedState.meshState,
      zigbeeState: exportedState.zigbeeState,
      pendingOptimizations: Object.fromEntries(exportedState.pendingOptimizations),
    });

    // Output result
    console.log(JSON.stringify(result, null, 2));
    
    await skill.shutdown();
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      action: parsed.action,
    }, null, 2));
    
    try {
      await skill.shutdown();
    } catch {
      // Ignore shutdown errors
    }
    
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(JSON.stringify({
    success: false,
    error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
  }, null, 2));
  process.exit(1);
});
