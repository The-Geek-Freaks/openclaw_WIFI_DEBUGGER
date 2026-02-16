#!/usr/bin/env node
import { OpenClawAsusMeshSkill } from './skill/openclaw-skill.js';
import { SkillActionSchema, type SkillAction } from './skill/actions.js';

// Actions that work without SSH connection (local state only)
const LOCAL_ONLY_ACTIONS = new Set([
  'set_house_config',
  'get_house_config',
  'set_node_position',
  'set_node_position_3d',
  'record_signal_measurement',
  'set_floor_plan',
  'get_floor_visualization',
  'generate_floor_plans',
  'get_property_info',
  'detect_walls',
  'get_log_info',
  'get_metrics',
  'reset_circuit_breaker',
  'configure_alerts',
  'get_alerts',
  'get_knowledge_stats',
  'get_known_devices',
  'mark_device_known',
  'get_network_history',
  'export_knowledge',
  'cleanup_state',
  'get_state_stats',
]);

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

  // Validate required env vars - SSH creds only required for non-local actions
  const isLocalAction = LOCAL_ONLY_ACTIONS.has(action);
  const requiredEnv = isLocalAction 
    ? [] // Local actions don't need any env vars
    : ['ASUS_ROUTER_HOST', 'ASUS_ROUTER_SSH_USER'];
  
  // SSH password OR key path required for SSH actions
  const hasSshAuth = process.env['ASUS_ROUTER_SSH_PASSWORD'] || process.env['ASUS_ROUTER_SSH_KEY_PATH'];
  if (!isLocalAction && !hasSshAuth) {
    requiredEnv.push('ASUS_ROUTER_SSH_PASSWORD or ASUS_ROUTER_SSH_KEY_PATH');
  }
  
  const missing = requiredEnv.filter(e => !e.includes(' or ') && !process.env[e]);
  if (missing.length > 0 || (!isLocalAction && !hasSshAuth)) {
    console.error(JSON.stringify({
      success: false,
      error: `Missing required environment variables: ${missing.length > 0 ? missing.join(', ') : 'SSH authentication'}`,
      hint: isLocalAction 
        ? 'This action should work without env vars - this is a bug'
        : 'Set ASUS_ROUTER_HOST, ASUS_ROUTER_SSH_USER, and either ASUS_ROUTER_SSH_PASSWORD or ASUS_ROUTER_SSH_KEY_PATH',
      isLocalAction,
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

    // Execute action - Skill manages its own state via SkillStateStore
    const result = await skill.execute(parsed);

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
