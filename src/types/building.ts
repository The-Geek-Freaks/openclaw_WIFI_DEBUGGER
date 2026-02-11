import { z } from 'zod';

export const FloorTypeSchema = z.enum([
  'basement',
  'ground',
  'first',
  'second',
  'third',
  'attic',
  'garden',
  'outdoor',
]);
export type FloorType = z.infer<typeof FloorTypeSchema>;

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  floor: FloorTypeSchema,
  floorNumber: z.number(),
  bounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  wallMaterial: z.enum(['drywall', 'concrete', 'brick', 'wood', 'glass', 'outdoor']).optional(),
  signalAttenuation: z.number().optional(),
});
export type Room = z.infer<typeof RoomSchema>;

export const FloorPlanSchema = z.object({
  id: z.string(),
  floor: FloorTypeSchema,
  floorNumber: z.number(),
  heightMeters: z.number().default(2.8),
  rooms: z.array(RoomSchema),
  imageUrl: z.string().optional(),
  dimensions: z.object({
    width: z.number(),
    height: z.number(),
    scale: z.number().default(1),
  }),
});
export type FloorPlan = z.infer<typeof FloorPlanSchema>;

export const BuildingSchema = z.object({
  id: z.string(),
  name: z.string(),
  floors: z.array(FloorPlanSchema),
  hasGarden: z.boolean().default(false),
  hasBasement: z.boolean().default(false),
  constructionType: z.enum(['wood_frame', 'concrete', 'brick', 'mixed']).default('mixed'),
  neighborNetworks: z.array(z.object({
    ssid: z.string(),
    bssid: z.string(),
    channel: z.number(),
    band: z.string(),
    signalStrength: z.number(),
    lastSeen: z.date(),
  })),
});
export type Building = z.infer<typeof BuildingSchema>;

export const NodePlacementSchema = z.object({
  nodeId: z.string(),
  nodeMac: z.string(),
  floor: FloorTypeSchema,
  floorNumber: z.number(),
  roomId: z.string().optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  coverageRadius2g: z.number(),
  coverageRadius5g: z.number(),
  isOutdoor: z.boolean().default(false),
});
export type NodePlacement = z.infer<typeof NodePlacementSchema>;

export const HeatmapPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  floor: FloorTypeSchema,
  floorNumber: z.number(),
  signal2g: z.number(),
  signal5g: z.number(),
  quality: z.number(),
  primaryNode: z.string(),
  interferenceLevel: z.number(),
});
export type HeatmapPoint = z.infer<typeof HeatmapPointSchema>;

export const FloorHeatmapSchema = z.object({
  floor: FloorTypeSchema,
  floorNumber: z.number(),
  resolution: z.number(),
  points: z.array(HeatmapPointSchema),
  deadZones: z.array(z.object({
    x: z.number(),
    y: z.number(),
    radius: z.number(),
    severity: z.enum(['mild', 'moderate', 'severe']),
  })),
  recommendations: z.array(z.string()),
});
export type FloorHeatmap = z.infer<typeof FloorHeatmapSchema>;

export const MaterialAttenuationDb: Record<string, { db2g: number; db5g: number }> = {
  drywall: { db2g: 3, db5g: 4 },
  concrete: { db2g: 10, db5g: 15 },
  brick: { db2g: 8, db5g: 12 },
  wood: { db2g: 4, db5g: 6 },
  glass: { db2g: 2, db5g: 3 },
  floor_wood: { db2g: 6, db5g: 10 },
  floor_concrete: { db2g: 15, db5g: 25 },
  outdoor: { db2g: 0, db5g: 0 },
};
