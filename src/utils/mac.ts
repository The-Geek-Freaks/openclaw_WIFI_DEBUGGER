export function normalizeMac(mac: string): string {
  return mac.toLowerCase().replace(/[^a-f0-9]/g, '').replace(/(.{2})/g, '$1:').slice(0, 17);
}

export function compareMac(mac1: string, mac2: string): boolean {
  return normalizeMac(mac1) === normalizeMac(mac2);
}

export function isValidMac(mac: string): boolean {
  const normalized = mac.replace(/[^a-fA-F0-9]/g, '');
  return normalized.length === 12 && /^[a-fA-F0-9]+$/.test(normalized);
}

export function getVendorFromMac(mac: string): string | undefined {
  const oui = normalizeMac(mac).substring(0, 8).toUpperCase().replace(/:/g, '');
  
  const vendors: Record<string, string> = {
    // Apple
    '001A2B': 'Apple', 'F8FFFA': 'Apple', '3C7A8A': 'Apple', '9C8CD8': 'Apple', 'D8A25E': 'Apple',
    
    // Microsoft
    '00155D': 'Microsoft', '607EDD': 'Microsoft',
    
    // Google
    '7CD95C': 'Google', 'BC0FAA': 'Google',
    
    // ASUS
    '10C37B': 'ASUS', '2CFDA1': 'ASUS', '04D4C4': 'ASUS', '7C10C9': 'ASUS',
    'E89C25': 'ASUS', 'C87F54': 'ASUS', '244BFE': 'ASUS',
    
    // Intel
    '60F262': 'Intel', '001CC0': 'Intel', '0026C6': 'Intel', 'F4C88A': 'Intel',
    
    // MikroTik/Routerboard
    '2CC81B': 'MikroTik', 'D401C3': 'MikroTik', 'E4AD81': 'MikroTik',
    '6C3B6B': 'MikroTik', 'B8693C': 'MikroTik', 'C4AD34': 'MikroTik',
    
    // Espressif (ESP8266/ESP32)
    '94E979': 'Espressif', 'C44F33': 'Espressif', '50F520': 'Espressif', 'A4CF12': 'Espressif',
    '9C9C1F': 'Espressif', '48E729': 'Espressif', 'E8DB84': 'Espressif', 'D8F15B': 'Espressif',
    '600194': 'Espressif', '5CCF7F': 'Espressif', '24EC4A': 'Espressif', '2462AB': 'Espressif',
    'E80690': 'Espressif', 'F4CFA2': 'Espressif', '100610': 'Espressif', '7C87CE': 'Espressif',
    '8CCE4E': 'Espressif', 'E465B8': 'Espressif', 'D48AFC': 'Espressif', '9454C5': 'Espressif',
    '1C6920': 'Espressif', '84CCA8': 'Espressif', '80646F': 'Espressif', 'AC67B2': 'Espressif',
    '4022D8': 'Espressif', 'BCFF4D': 'Espressif', 'F024F9': 'Espressif', '483FDA': 'Espressif',
    '10521C': 'Espressif', 'ECFABC': 'Espressif', 'C4D8D5': 'Espressif',
    
    // Tuya Smart
    '508A06': 'Tuya', '708976': 'Tuya', '84E342': 'Tuya', '4CA919': 'Tuya',
    '105A17': 'Tuya', 'A09208': 'Tuya',
    
    // Amazon (Echo, Fire, Ring)
    'DC56E7': 'Amazon', 'A8CA77': 'Amazon', '1009F9': 'Amazon', 'D8FBD6': 'Amazon',
    '78E103': 'Amazon', '78A03F': 'Amazon', 'A8E621': 'Amazon', '40F6BC': 'Amazon',
    '90F82E': 'Amazon',
    
    // Ring
    'B009DA': 'Ring', '54E019': 'Ring', '343EA4': 'Ring',
    
    // Philips Hue
    'ECB5FA': 'Philips Hue', '0017880': 'Philips Hue',
    
    // TP-Link (Kasa, Tapo)
    'B09575': 'TP-Link', '704F57': 'TP-Link', '1C3BF3': 'TP-Link',
    '60A4B7': 'TP-Link', 'B0A7B9': 'TP-Link',
    
    // LIFX
    'D073D5': 'LIFX',
    
    // BroadLink
    'A043B0': 'BroadLink',
    
    // Lumi/Aqara
    '54EF44': 'Aqara',
    
    // Samsung
    'D0C24E': 'Samsung', '8C71F8': 'Samsung',
    
    // Xiaomi
    '884604': 'Xiaomi', '6490C1': 'Xiaomi', '78114E': 'Xiaomi',
    
    // Netatmo
    '70EE50': 'Netatmo',
    
    // Nintendo
    '7CBB8A': 'Nintendo', '002659': 'Nintendo',
    
    // Shelly (Allterco)
    'C82E18': 'Shelly', '8CAAB5': 'Shelly', 'E868E7': 'Shelly',
    
    // Sonoff
    'D8BFC0': 'Sonoff', '6001941': 'Sonoff',
    
    // Meross
    '48E1E9': 'Meross',
    
    // Belkin/Wemo
    'B4750E': 'Belkin',
    
    // Fantasia Trading (Govee, etc)
    'F49D8A': 'Govee', 'E8EECC': 'Govee',
    
    // Dexatek (Zigbee dongles)
    '3C6A9D': 'Dexatek',
    
    // Texas Instruments (Zigbee)
    '6C79B8': 'Texas Instruments',
    
    // TCL
    '4C4929': 'TCL',
    
    // Gaoshengda (Generic IoT)
    '14EA63': 'Gaoshengda',
    
    // Sichuan AI-Link
    '70C912': 'AI-Link',
    
    // HP
    '40B034': 'HP',
    
    // Raspberry Pi
    'B40EDC': 'Raspberry Pi', 'B827EB': 'Raspberry Pi', 'DC44D3': 'Raspberry Pi',
    
    // Other
    '00269E': 'Quanta', 'ACDE48': 'Askey', '08002B': 'DEC',
  };
  
  return vendors[oui];
}
