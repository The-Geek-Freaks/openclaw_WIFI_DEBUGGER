import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

console.log('📋 Generating JSON Schema for OpenClaw Actions...');

// Action definitions based on the Zod schema
const actionSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/The-Geek-Freaks/openclaw_WIFI_DEBUGGER/actions.schema.json',
  title: 'OpenClaw ASUS Mesh Skill Actions',
  description: 'JSON Schema for all available skill actions',
  type: 'object',
  oneOf: [
    // Scan & Health
    {
      title: 'scan_network',
      properties: {
        action: { const: 'scan_network' },
      },
      required: ['action'],
    },
    {
      title: 'get_network_health',
      properties: {
        action: { const: 'get_network_health' },
      },
      required: ['action'],
    },
    {
      title: 'get_mesh_nodes',
      properties: {
        action: { const: 'get_mesh_nodes' },
      },
      required: ['action'],
    },
    {
      title: 'full_intelligence_scan',
      properties: {
        action: { const: 'full_intelligence_scan' },
        params: {
          type: 'object',
          properties: {
            targets: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional targets like "protect_zigbee"',
            },
          },
        },
      },
      required: ['action'],
    },
    // Analysis
    {
      title: 'get_device_list',
      properties: {
        action: { const: 'get_device_list' },
        params: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              enum: ['all', 'wireless', 'wired', 'problematic'],
            },
          },
        },
      },
      required: ['action'],
    },
    {
      title: 'get_device_details',
      properties: {
        action: { const: 'get_device_details' },
        params: {
          type: 'object',
          properties: {
            macAddress: { type: 'string', description: 'MAC address of device' },
          },
          required: ['macAddress'],
        },
      },
      required: ['action', 'params'],
    },
    {
      title: 'get_problems',
      properties: {
        action: { const: 'get_problems' },
      },
      required: ['action'],
    },
    {
      title: 'get_channel_scan',
      properties: {
        action: { const: 'get_channel_scan' },
        params: {
          type: 'object',
          properties: {
            band: { type: 'string', enum: ['2.4GHz', '5GHz', 'both'] },
          },
        },
      },
      required: ['action'],
    },
    // Optimization
    {
      title: 'get_optimization_suggestions',
      properties: {
        action: { const: 'get_optimization_suggestions' },
      },
      required: ['action'],
    },
    {
      title: 'apply_optimization',
      properties: {
        action: { const: 'apply_optimization' },
        params: {
          type: 'object',
          properties: {
            suggestionId: { type: 'string', description: 'ID from get_optimization_suggestions' },
            confirm: { type: 'boolean', description: 'Must be true to apply' },
          },
          required: ['suggestionId', 'confirm'],
        },
      },
      required: ['action', 'params'],
    },
    {
      title: 'check_router_tweaks',
      properties: {
        action: { const: 'check_router_tweaks' },
      },
      required: ['action'],
    },
    {
      title: 'apply_router_tweak',
      properties: {
        action: { const: 'apply_router_tweak' },
        params: {
          type: 'object',
          properties: {
            tweakId: { type: 'string', description: 'ID from check_router_tweaks' },
            confirm: { type: 'boolean', description: 'Must be true to apply' },
          },
          required: ['tweakId', 'confirm'],
        },
      },
      required: ['action', 'params'],
    },
    // Zigbee
    {
      title: 'scan_zigbee',
      properties: {
        action: { const: 'scan_zigbee' },
      },
      required: ['action'],
    },
    {
      title: 'get_frequency_conflicts',
      properties: {
        action: { const: 'get_frequency_conflicts' },
      },
      required: ['action'],
    },
    // Triangulation
    {
      title: 'set_house_config',
      properties: {
        action: { const: 'set_house_config' },
        params: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            floors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  floorNumber: { type: 'integer' },
                  floorType: { type: 'string', enum: ['basement', 'ground_floor', 'upper_floor', 'attic'] },
                  name: { type: 'string' },
                  dimensions: {
                    type: 'object',
                    properties: {
                      width: { type: 'number' },
                      height: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
          required: ['name', 'floors'],
        },
      },
      required: ['action', 'params'],
    },
    {
      title: 'set_node_position_3d',
      properties: {
        action: { const: 'set_node_position_3d' },
        params: {
          type: 'object',
          properties: {
            nodeMac: { type: 'string', description: 'MAC address of mesh node' },
            nodeId: { type: 'string' },
            floorNumber: { type: 'integer' },
            floorType: { type: 'string' },
            x: { type: 'number', description: 'X position in meters' },
            y: { type: 'number', description: 'Y position in meters' },
          },
          required: ['nodeMac', 'nodeId', 'floorNumber', 'floorType', 'x', 'y'],
        },
      },
      required: ['action', 'params'],
    },
    {
      title: 'triangulate_devices',
      properties: {
        action: { const: 'triangulate_devices' },
      },
      required: ['action'],
    },
    {
      title: 'get_auto_map',
      properties: {
        action: { const: 'get_auto_map' },
        params: {
          type: 'object',
          properties: {
            floorNumber: { type: 'integer', default: 0 },
          },
        },
      },
      required: ['action'],
    },
    // Benchmark
    {
      title: 'run_benchmark',
      properties: {
        action: { const: 'run_benchmark' },
        params: {
          type: 'object',
          properties: {
            targetHost: { type: 'string' },
            duration: { type: 'integer' },
          },
        },
      },
      required: ['action'],
    },
    // Knowledge
    {
      title: 'mark_device_known',
      properties: {
        action: { const: 'mark_device_known' },
        params: {
          type: 'object',
          properties: {
            macAddress: { type: 'string' },
            customName: { type: 'string' },
            deviceType: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['macAddress'],
        },
      },
      required: ['action', 'params'],
    },
    {
      title: 'get_known_devices',
      properties: {
        action: { const: 'get_known_devices' },
      },
      required: ['action'],
    },
    // Logging
    {
      title: 'get_log_info',
      properties: {
        action: { const: 'get_log_info' },
      },
      required: ['action'],
    },
  ],
};

// Response schema
const responseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/The-Geek-Freaks/openclaw_WIFI_DEBUGGER/response.schema.json',
  title: 'OpenClaw Skill Response',
  description: 'JSON Schema for skill responses',
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    action: { type: 'string' },
    data: { type: 'object', additionalProperties: true },
    error: { type: 'string' },
    suggestions: { type: 'array', items: { type: 'string' } },
    timestamp: { type: 'string', format: 'date-time' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    dataQuality: { type: 'string', enum: ['complete', 'partial', 'estimated'] },
  },
  required: ['success', 'action', 'timestamp'],
};

// Ensure dist directory exists
const distDir = join(rootDir, 'dist');
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Write schemas
writeFileSync(
  join(distDir, 'actions.schema.json'),
  JSON.stringify(actionSchema, null, 2)
);
console.log('✓ Generated dist/actions.schema.json');

writeFileSync(
  join(distDir, 'response.schema.json'),
  JSON.stringify(responseSchema, null, 2)
);
console.log('✓ Generated dist/response.schema.json');

// Also write to root for easy access
writeFileSync(
  join(rootDir, 'actions.schema.json'),
  JSON.stringify(actionSchema, null, 2)
);
console.log('✓ Generated actions.schema.json (root)');

console.log('\n📋 Schema generation complete!');
console.log('   Use these schemas for AI tool integration (Cursor, Claude, etc.)');
