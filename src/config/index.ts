import { z } from 'zod';

export const ConfigSchema = z.object({
  asus: z.object({
    host: z.string().default('192.168.1.1'),
    sshPort: z.number().default(22),
    sshUser: z.string().default('admin'),
    sshPassword: z.string().optional(),
    sshKeyPath: z.string().optional(),
    httpPort: z.number().default(80),
  }),
  homeAssistant: z.object({
    host: z.string().default('192.168.178.43'),
    port: z.number().default(8123),
    accessToken: z.string(),
    useSsl: z.boolean().default(false),
  }),
  zigbee: z.object({
    coordinatorType: z.enum(['zha', 'zigbee2mqtt']).default('zha'),
    preferredChannel: z.number().min(11).max(26).default(15),
  }),
  scan: z.object({
    intervalMs: z.number().default(30000),
    signalHistoryRetentionDays: z.number().default(7),
  }),
  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  }),
  snmp: z.object({
    devices: z.array(z.object({
      host: z.string(),
      port: z.number().default(161),
      community: z.string().default('public'),
      deviceType: z.enum(['generic', 'mikrotik', 'cisco', 'ubiquiti']).default('generic'),
    })).default([]),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfigFromEnv(): Config {
  return ConfigSchema.parse({
    asus: {
      host: process.env['ASUS_ROUTER_HOST'] ?? '192.168.1.1',
      sshPort: parseInt(process.env['ASUS_ROUTER_SSH_PORT'] ?? '22', 10),
      sshUser: process.env['ASUS_ROUTER_SSH_USER'] ?? 'admin',
      sshPassword: process.env['ASUS_ROUTER_SSH_PASSWORD'],
      sshKeyPath: process.env['ASUS_ROUTER_SSH_KEY_PATH'],
      httpPort: parseInt(process.env['ASUS_ROUTER_HTTP_PORT'] ?? '80', 10),
    },
    homeAssistant: {
      host: process.env['HASS_HOST'] ?? '192.168.178.43',
      port: parseInt(process.env['HASS_PORT'] ?? '8123', 10),
      accessToken: process.env['HASS_ACCESS_TOKEN'] ?? '',
      useSsl: process.env['HASS_USE_SSL'] === 'true',
    },
    zigbee: {
      coordinatorType: (process.env['ZIGBEE_COORDINATOR_TYPE'] as 'zha' | 'zigbee2mqtt') ?? 'zha',
      preferredChannel: parseInt(process.env['ZIGBEE_CHANNEL'] ?? '15', 10),
    },
    scan: {
      intervalMs: parseInt(process.env['SCAN_INTERVAL_MS'] ?? '30000', 10),
      signalHistoryRetentionDays: parseInt(process.env['SIGNAL_HISTORY_RETENTION_DAYS'] ?? '7', 10),
    },
    logging: {
      level: (process.env['LOG_LEVEL'] as Config['logging']['level']) ?? 'info',
    },
    snmp: {
      devices: parseSnmpDevices(process.env['SNMP_DEVICES']),
    },
  });
}

function parseSnmpDevices(envValue: string | undefined): Array<{ host: string; port: number; community: string; deviceType: 'generic' | 'mikrotik' | 'cisco' | 'ubiquiti' }> {
  if (!envValue || envValue.trim() === '') return [];
  
  return envValue.split(',').map(entry => {
    const parts = entry.trim().split(':');
    const host = parts[0] ?? '';
    const port = parseInt(parts[1] ?? '161', 10);
    const community = parts[2] ?? 'public';
    const deviceType = (parts[3] as 'generic' | 'mikrotik' | 'cisco' | 'ubiquiti') ?? 'generic';
    return { host, port, community, deviceType };
  }).filter(d => d.host !== '');
}
