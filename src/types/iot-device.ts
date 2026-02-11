import { z } from 'zod';

export const IoTVendorSchema = z.enum([
  'tuya',
  'shelly',
  'tasmota',
  'espressif',
  'xiaomi',
  'ikea',
  'philips_hue',
  'sonoff',
  'meross',
  'wemo',
  'tp_link_kasa',
  'tp_link_tapo',
  'ring',
  'nest',
  'aqara',
  'lifx',
  'broadlink',
  'govee',
  'amazon_alexa',
  'google_home',
  'samsung_smartthings',
  'netatmo',
  'dexatek',
  'ai_link',
  'tcl',
  'gaoshengda',
  'unknown',
]);
export type IoTVendor = z.infer<typeof IoTVendorSchema>;

export const RogueWifiTypeSchema = z.enum([
  'setup_ap',
  'config_portal',
  'fallback_ap',
  'permanent_ap',
  'mesh_extender',
  'hotspot',
  'unknown',
]);
export type RogueWifiType = z.infer<typeof RogueWifiTypeSchema>;

export const RogueWifiNetworkSchema = z.object({
  ssid: z.string(),
  bssid: z.string(),
  channel: z.number(),
  band: z.enum(['2.4GHz', '5GHz']),
  signalStrength: z.number(),
  vendor: IoTVendorSchema,
  deviceType: z.string().optional(),
  rogueType: RogueWifiTypeSchema,
  interferenceLevel: z.enum(['low', 'medium', 'high']),
  firstSeen: z.date(),
  lastSeen: z.date(),
  isActive: z.boolean(),
  recommendedAction: z.string(),
  homeAssistantEntityId: z.string().optional(),
  canBeControlled: z.boolean(),
});
export type RogueWifiNetwork = z.infer<typeof RogueWifiNetworkSchema>;

export const IoTDeviceInfoSchema = z.object({
  macAddress: z.string(),
  ipAddress: z.string().optional(),
  vendor: IoTVendorSchema,
  deviceType: z.string(),
  friendlyName: z.string().optional(),
  homeAssistantEntityId: z.string().optional(),
  hasRogueWifi: z.boolean(),
  rogueWifiSsid: z.string().optional(),
  connectedToNetwork: z.string().optional(),
  signalStrength: z.number().optional(),
  lastSeen: z.date(),
  capabilities: z.array(z.string()),
});
export type IoTDeviceInfo = z.infer<typeof IoTDeviceInfoSchema>;

export const OpenClawActionSchema = z.object({
  actionId: z.string(),
  actionType: z.enum([
    'disable_ap',
    'restart_device',
    'reconfigure_wifi',
    'change_channel',
    'update_firmware',
    'factory_reset',
    'notify_user',
  ]),
  targetDevice: z.object({
    macAddress: z.string(),
    vendor: IoTVendorSchema,
    entityId: z.string().optional(),
  }),
  parameters: z.record(z.unknown()).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  estimatedImpact: z.string(),
  requiresConfirmation: z.boolean(),
});
export type OpenClawAction = z.infer<typeof OpenClawActionSchema>;

export const VENDOR_OUI_PATTERNS: Record<string, IoTVendor> = {
  // Tuya Smart
  '10:d0:7a': 'tuya', '7c:f6:66': 'tuya', '50:8a:06': 'tuya', '70:89:76': 'tuya',
  '84:e3:42': 'tuya', '4c:a9:19': 'tuya', '10:5a:17': 'tuya', 'a0:92:08': 'tuya',
  
  // Espressif (ESP8266/ESP32)
  'a4:cf:12': 'espressif', 'ac:0b:fb': 'espressif', '24:0a:c4': 'espressif',
  '30:ae:a4': 'espressif', 'cc:50:e3': 'espressif', '84:cc:a8': 'espressif',
  '9c:9c:1f': 'espressif', '48:e7:29': 'espressif', 'd8:f1:5b': 'espressif',
  '60:01:94': 'espressif', '5c:cf:7f': 'espressif', '24:ec:4a': 'espressif',
  '24:62:ab': 'espressif', 'e8:06:90': 'espressif', 'f4:cf:a2': 'espressif',
  '10:06:1c': 'espressif', '7c:87:ce': 'espressif', '8c:ce:4e': 'espressif',
  'e4:65:b8': 'espressif', 'd4:8a:fc': 'espressif', '94:54:c5': 'espressif',
  '1c:69:20': 'espressif', 'c4:4f:33': 'espressif', '80:64:6f': 'espressif',
  'ac:67:b2': 'espressif', '40:22:d8': 'espressif', 'bc:ff:4d': 'espressif',
  'f0:24:f9': 'espressif', '48:3f:da': 'espressif', '10:52:1c': 'espressif',
  'ec:fa:bc': 'espressif', 'c4:d8:d5': 'espressif',
  
  // Shelly
  'c8:c9:a3': 'shelly', 'e8:db:84': 'shelly', '98:cd:ac': 'shelly',
  'c8:2e:18': 'shelly', '8c:aa:b5': 'shelly', 'e8:68:e7': 'shelly',
  
  // Xiaomi
  '34:94:54': 'xiaomi', '64:90:c1': 'xiaomi', '78:11:dc': 'xiaomi',
  '88:46:04': 'xiaomi',
  
  // Philips Hue
  '00:17:88': 'philips_hue', 'ec:b5:fa': 'philips_hue',
  
  // IKEA
  '00:0b:57': 'ikea',
  
  // Sonoff
  '94:b9:7e': 'sonoff', 'd8:bf:c0': 'sonoff',
  
  // Meross
  '48:e1:e9': 'meross',
  
  // TP-Link Kasa/Tapo
  '68:ff:7b': 'tp_link_kasa', '50:c7:bf': 'tp_link_kasa', 'b0:be:76': 'tp_link_kasa',
  'b0:95:75': 'tp_link_tapo', '70:4f:57': 'tp_link_tapo',
  
  // Wemo/Belkin
  'f0:9f:c2': 'wemo', 'b4:75:0e': 'wemo',
  
  // Ring
  '24:f5:a2': 'ring', 'b0:09:da': 'ring', '54:e0:19': 'ring', '34:3e:a4': 'ring',
  
  // Nest/Google
  '18:b4:30': 'nest', '7c:d9:5c': 'google_home',
  
  // Aqara/Lumi
  '54:ef:44': 'aqara',
  
  // LIFX
  'd0:73:d5': 'lifx',
  
  // BroadLink
  'a0:43:b0': 'broadlink',
  
  // Govee (Fantasia Trading)
  'f4:9d:8a': 'govee', 'e8:ee:cc': 'govee',
  
  // Amazon (Echo, Fire TV)
  'a8:ca:77': 'amazon_alexa', '10:09:f9': 'amazon_alexa', 'd8:fb:d6': 'amazon_alexa',
  '78:e1:03': 'amazon_alexa', '78:a0:3f': 'amazon_alexa', 'a8:e6:21': 'amazon_alexa',
  '40:f6:bc': 'amazon_alexa', '90:f8:2e': 'amazon_alexa',
  
  // Samsung SmartThings
  'd0:c2:4e': 'samsung_smartthings',
  
  // Netatmo
  '70:ee:50': 'netatmo',
  
  // Dexatek (Zigbee dongles)
  '3c:6a:9d': 'dexatek',
  
  // AI-Link
  '70:c9:12': 'ai_link',
  
  // TCL
  '4c:49:29': 'tcl',
  
  // Gaoshengda (Generic Chinese IoT)
  '14:ea:63': 'gaoshengda',
};

export const ROGUE_SSID_PATTERNS: { pattern: RegExp; vendor: IoTVendor; type: RogueWifiType }[] = [
  // Tasmota
  { pattern: /^Tasmota-\w+$/i, vendor: 'tasmota', type: 'config_portal' },
  { pattern: /^tasmota_\w+$/i, vendor: 'tasmota', type: 'config_portal' },
  
  // Shelly
  { pattern: /^shelly.*$/i, vendor: 'shelly', type: 'setup_ap' },
  { pattern: /^ShellyPlus.*$/i, vendor: 'shelly', type: 'setup_ap' },
  { pattern: /^ShellyPro.*$/i, vendor: 'shelly', type: 'setup_ap' },
  
  // Tuya
  { pattern: /^SmartLife-\w+$/i, vendor: 'tuya', type: 'setup_ap' },
  { pattern: /^Smart Life-\w+$/i, vendor: 'tuya', type: 'setup_ap' },
  { pattern: /^TUYA.*$/i, vendor: 'tuya', type: 'setup_ap' },
  
  // Espressif/ESPHome
  { pattern: /^ESP_\w+$/i, vendor: 'espressif', type: 'fallback_ap' },
  { pattern: /^ESP32.*$/i, vendor: 'espressif', type: 'fallback_ap' },
  { pattern: /^ESP8266.*$/i, vendor: 'espressif', type: 'fallback_ap' },
  { pattern: /^ESPHOME.*$/i, vendor: 'espressif', type: 'fallback_ap' },
  
  // Sonoff
  { pattern: /^Sonoff.*$/i, vendor: 'sonoff', type: 'setup_ap' },
  { pattern: /^ITEAD-\w+$/i, vendor: 'sonoff', type: 'setup_ap' },
  { pattern: /^eWeLink.*$/i, vendor: 'sonoff', type: 'setup_ap' },
  
  // Meross
  { pattern: /^Meross.*$/i, vendor: 'meross', type: 'setup_ap' },
  { pattern: /^MSS\d+.*$/i, vendor: 'meross', type: 'setup_ap' },
  
  // TP-Link Kasa/Tapo
  { pattern: /^TP-Link.*$/i, vendor: 'tp_link_kasa', type: 'setup_ap' },
  { pattern: /^Kasa.*$/i, vendor: 'tp_link_kasa', type: 'setup_ap' },
  { pattern: /^Tapo.*$/i, vendor: 'tp_link_tapo', type: 'setup_ap' },
  
  // Wemo/Belkin
  { pattern: /^Wemo.*$/i, vendor: 'wemo', type: 'setup_ap' },
  { pattern: /^Belkin.*$/i, vendor: 'wemo', type: 'setup_ap' },
  
  // Ring
  { pattern: /^Ring-\w+$/i, vendor: 'ring', type: 'setup_ap' },
  { pattern: /^Ring Setup.*$/i, vendor: 'ring', type: 'setup_ap' },
  
  // Nest/Google
  { pattern: /^Nest-\w+$/i, vendor: 'nest', type: 'setup_ap' },
  { pattern: /^Google.*$/i, vendor: 'google_home', type: 'setup_ap' },
  
  // Philips Hue
  { pattern: /^Philips.*$/i, vendor: 'philips_hue', type: 'setup_ap' },
  { pattern: /^Hue-\w+$/i, vendor: 'philips_hue', type: 'setup_ap' },
  
  // IKEA
  { pattern: /^IKEA.*$/i, vendor: 'ikea', type: 'setup_ap' },
  { pattern: /^TRADFRI.*$/i, vendor: 'ikea', type: 'setup_ap' },
  
  // Aqara/Lumi
  { pattern: /^lumi-gateway.*$/i, vendor: 'aqara', type: 'setup_ap' },
  { pattern: /^Aqara.*$/i, vendor: 'aqara', type: 'setup_ap' },
  
  // Xiaomi
  { pattern: /^xiaomi.*$/i, vendor: 'xiaomi', type: 'setup_ap' },
  { pattern: /^yeelink.*$/i, vendor: 'xiaomi', type: 'setup_ap' },
  { pattern: /^Roborock.*$/i, vendor: 'xiaomi', type: 'setup_ap' },
  
  // LIFX
  { pattern: /^LIFX.*$/i, vendor: 'lifx', type: 'setup_ap' },
  
  // BroadLink
  { pattern: /^BroadLink.*$/i, vendor: 'broadlink', type: 'setup_ap' },
  { pattern: /^BroadlinkProv.*$/i, vendor: 'broadlink', type: 'setup_ap' },
  
  // Govee
  { pattern: /^Govee.*$/i, vendor: 'govee', type: 'setup_ap' },
  { pattern: /^ihoment.*$/i, vendor: 'govee', type: 'setup_ap' },
  
  // Amazon
  { pattern: /^Amazon-\w+$/i, vendor: 'amazon_alexa', type: 'setup_ap' },
  { pattern: /^Echo-\w+$/i, vendor: 'amazon_alexa', type: 'setup_ap' },
  
  // Samsung
  { pattern: /^SmartThings.*$/i, vendor: 'samsung_smartthings', type: 'setup_ap' },
  { pattern: /^Samsung.*$/i, vendor: 'samsung_smartthings', type: 'setup_ap' },
  
  // Netatmo
  { pattern: /^Netatmo.*$/i, vendor: 'netatmo', type: 'setup_ap' },
];
