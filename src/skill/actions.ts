import { z } from 'zod';

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
      macAddress: z.string(),
    }),
  }),
  z.object({
    action: z.literal('get_device_signal_history'),
    params: z.object({
      macAddress: z.string(),
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
