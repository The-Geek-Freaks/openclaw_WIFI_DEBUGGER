import { z } from 'zod';
import { normalizeMac } from '../utils/mac.js';

// MAC address validation regex (AA:BB:CC:DD:EE:FF or aa:bb:cc:dd:ee:ff)
// Also normalizes to lowercase for consistent comparison
const macAddressSchema = z.string().regex(
  /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/,
  'Invalid MAC address format. Expected: AA:BB:CC:DD:EE:FF'
).transform(normalizeMac);

export const SkillActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('scan_network'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('get_network_health'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('get_device_list'),
    params: z.object({
      filter: z.enum(['all', 'wireless', 'wired', 'problematic']).optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('get_device_details'),
    params: z.object({
      macAddress: macAddressSchema,
    }),
  }),
  z.object({
    action: z.literal('get_device_signal_history'),
    params: z.object({
      macAddress: macAddressSchema,
      hours: z.number().optional(),
    }),
  }),
  z.object({
    action: z.literal('get_mesh_nodes'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('get_wifi_settings'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('set_wifi_channel'),
    params: z.object({
      band: z.enum(['2.4GHz', '5GHz']),
      channel: z.number(),
    }),
  }),
  z.object({
    action: z.literal('get_problems'),
    params: z.object({
      severity: z.enum(['all', 'critical', 'error', 'warning']).optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('get_optimization_suggestions'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('apply_optimization'),
    params: z.object({
      suggestionId: z.string(),
      confirm: z.boolean(),
    }),
  }),
  z.object({
    action: z.literal('scan_zigbee'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('get_zigbee_devices'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('get_frequency_conflicts'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('get_spatial_map'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('set_node_position'),
    params: z.object({
      nodeId: z.string(),
      x: z.number(),
      y: z.number(),
      z: z.number().optional(),
      room: z.string().optional(),
    }),
  }),
  z.object({
    action: z.literal('get_connection_stability'),
    params: z.object({
      macAddress: z.string(),
      hours: z.number().optional(),
    }),
  }),
  z.object({
    action: z.literal('restart_wireless'),
    params: z.object({
      confirm: z.boolean(),
    }),
  }),
  z.object({
    action: z.literal('get_channel_scan'),
    params: z.object({
      band: z.enum(['2.4GHz', '5GHz', 'both']).optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('scan_rogue_iot'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('get_heatmap'),
    params: z.object({
      floor: z.number().optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('run_benchmark'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('sync_mesh_settings'),
    params: z.object({
      channel2g: z.number().optional(),
      channel5g: z.number().optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('analyze_network_topology'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('full_intelligence_scan'),
    params: z.object({
      targets: z.array(z.enum([
        'minimize_interference',
        'maximize_throughput',
        'balance_coverage',
        'protect_zigbee',
        'reduce_neighbor_overlap',
        'improve_roaming',
      ])).optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('get_environment_summary'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('get_homeassistant_data'),
    params: z.object({
      include: z.array(z.enum([
        'zigbee',
        'bluetooth',
        'snmp',
        'device_trackers',
        'router_entities',
        'all',
      ])).optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('get_placement_recommendations'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('set_floor_plan'),
    params: z.object({
      floor: z.number(),
      name: z.string(),
      imagePath: z.string().optional(),
      imageBase64: z.string().optional(),
      widthMeters: z.number(),
      heightMeters: z.number(),
    }),
  }),
  z.object({
    action: z.literal('get_floor_visualization'),
    params: z.object({
      floor: z.number(),
    }),
  }),
  z.object({
    action: z.literal('get_quick_diagnosis'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('get_switch_status'),
    params: z.object({
      host: z.string().optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('get_port_traffic'),
    params: z.object({
      host: z.string(),
      port: z.number().optional(),
    }),
  }),
  z.object({
    action: z.literal('get_vlan_info'),
    params: z.object({
      host: z.string(),
    }),
  }),
  z.object({
    action: z.literal('get_poe_status'),
    params: z.object({
      host: z.string(),
    }),
  }),
  z.object({
    action: z.literal('set_poe_enabled'),
    params: z.object({
      host: z.string(),
      port: z.number(),
      enabled: z.boolean(),
    }),
  }),
  z.object({
    action: z.literal('get_roaming_analysis'),
    params: z.object({
      macAddress: z.string(),
    }),
  }),
  z.object({
    action: z.literal('configure_alerts'),
    params: z.object({
      webhookUrl: z.string().optional(),
      mqttBroker: z.string().optional(),
      mqttTopic: z.string().optional(),
      minSeverity: z.enum(['info', 'warning', 'critical']).optional(),
      cooldownMinutes: z.number().optional(),
      enabled: z.boolean().optional(),
    }),
  }),
  z.object({
    action: z.literal('get_alerts'),
    params: z.object({
      hours: z.number().optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('get_knowledge_stats'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('get_known_devices'),
    params: z.object({
      filter: z.enum(['all', 'known', 'unknown']).optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('mark_device_known'),
    params: z.object({
      macAddress: z.string(),
      customName: z.string().optional(),
      deviceType: z.enum(['router', 'switch', 'ap', 'computer', 'phone', 'tablet', 'iot', 'smart_home', 'media', 'gaming', 'unknown']).optional(),
      notes: z.string().optional(),
    }),
  }),
  z.object({
    action: z.literal('get_network_history'),
    params: z.object({
      limit: z.number().optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('export_knowledge'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('check_router_tweaks'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('apply_router_tweak'),
    params: z.object({
      tweakId: z.string(),
      confirm: z.boolean(),
    }),
  }),
  z.object({
    action: z.literal('get_recommended_scripts'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('set_house_config'),
    params: z.object({
      name: z.string(),
      floors: z.array(z.object({
        floorNumber: z.number(),
        floorType: z.enum(['basement', 'ground', 'first', 'second', 'third', 'attic', 'garden', 'outdoor']),
        name: z.string(),
        heightMeters: z.number().optional(),
        widthMeters: z.number().optional(),
        lengthMeters: z.number().optional(),
      })),
      hasGarden: z.boolean().optional(),
      gardenWidthMeters: z.number().optional(),
      gardenLengthMeters: z.number().optional(),
      constructionType: z.enum(['wood_frame', 'concrete', 'brick', 'mixed']).optional(),
      wallThicknessCm: z.number().optional(),
    }),
  }),
  z.object({
    action: z.literal('get_house_config'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('triangulate_devices'),
    params: z.object({
      deviceMac: z.string().optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('get_auto_map'),
    params: z.object({
      floorNumber: z.number().optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('set_node_position_3d'),
    params: z.object({
      nodeMac: z.string(),
      nodeId: z.string(),
      floorNumber: z.number(),
      floorType: z.enum(['basement', 'ground', 'first', 'second', 'third', 'attic', 'garden', 'outdoor']),
      x: z.number(),
      y: z.number(),
      z: z.number().optional(),
      roomId: z.string().optional(),
    }),
  }),
  z.object({
    action: z.literal('record_signal_measurement'),
    params: z.object({
      deviceMac: z.string(),
      nodeMac: z.string(),
      rssi: z.number(),
    }),
  }),
  z.object({
    action: z.literal('get_log_info'),
  }),
  z.object({
    action: z.literal('get_metrics'),
  }),
  z.object({
    action: z.literal('reset_circuit_breaker'),
  }),
  z.object({
    action: z.literal('set_location'),
    params: z.object({
      address: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      widthMeters: z.number().optional(),
      heightMeters: z.number().optional(),
    }),
  }),
  z.object({
    action: z.literal('generate_floor_plans'),
    params: z.object({
      floorCount: z.number().default(2),
      hasBasement: z.boolean().default(false),
      hasAttic: z.boolean().default(false),
    }).optional(),
  }),
  z.object({
    action: z.literal('get_property_info'),
    params: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('fetch_map_image'),
    params: z.object({
      zoom: z.number().min(1).max(20).default(18),
    }).optional(),
  }),
  z.object({
    action: z.literal('detect_walls'),
    params: z.object({
      floorNumber: z.number().default(0),
    }).optional(),
  }),
]);

export type SkillAction = z.infer<typeof SkillActionSchema>;

export const SkillResponseSchema = z.object({
  success: z.boolean(),
  action: z.string(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
  timestamp: z.string(),
});

export type SkillResponse = z.infer<typeof SkillResponseSchema>;
