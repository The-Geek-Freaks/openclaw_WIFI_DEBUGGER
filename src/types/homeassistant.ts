import { z } from 'zod';

export const HassEntityStateSchema = z.object({
  entity_id: z.string(),
  state: z.string(),
  attributes: z.record(z.unknown()),
  last_changed: z.string(),
  last_updated: z.string(),
});
export type HassEntityState = z.infer<typeof HassEntityStateSchema>;

export const HassServiceSchema = z.object({
  domain: z.string(),
  service: z.string(),
  data: z.record(z.unknown()).optional(),
  target: z.object({
    entity_id: z.union([z.string(), z.array(z.string())]).optional(),
    device_id: z.union([z.string(), z.array(z.string())]).optional(),
    area_id: z.union([z.string(), z.array(z.string())]).optional(),
  }).optional(),
});
export type HassService = z.infer<typeof HassServiceSchema>;

export const HassEventSchema = z.object({
  event_type: z.string(),
  data: z.record(z.unknown()),
  origin: z.string(),
  time_fired: z.string(),
});
export type HassEvent = z.infer<typeof HassEventSchema>;

export const ZhaDeviceSchema = z.object({
  ieee: z.string(),
  nwk: z.number(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  name: z.string(),
  quirk_applied: z.boolean(),
  quirk_class: z.string().optional(),
  power_source: z.string(),
  lqi: z.number().optional(),
  rssi: z.number().optional(),
  last_seen: z.string().optional(),
  available: z.boolean(),
  device_type: z.string(),
  signature: z.record(z.unknown()).optional(),
});
export type ZhaDevice = z.infer<typeof ZhaDeviceSchema>;

export const Zigbee2MqttDeviceSchema = z.object({
  ieee_address: z.string(),
  friendly_name: z.string(),
  type: z.string(),
  network_address: z.number(),
  supported: z.boolean(),
  disabled: z.boolean(),
  definition: z.object({
    model: z.string(),
    vendor: z.string(),
    description: z.string(),
  }).optional(),
  power_source: z.string().optional(),
  interviewing: z.boolean(),
  interview_completed: z.boolean(),
});
export type Zigbee2MqttDevice = z.infer<typeof Zigbee2MqttDeviceSchema>;

export const HassConfigSchema = z.object({
  host: z.string(),
  port: z.number().default(8123),
  accessToken: z.string(),
  useSsl: z.boolean().default(false),
});
export type HassConfig = z.infer<typeof HassConfigSchema>;
