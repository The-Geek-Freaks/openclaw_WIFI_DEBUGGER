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
    '001A2B': 'Apple',
    '00155D': 'Microsoft',
    '08002B': 'DEC',
    'F8FFFA': 'Apple',
    '3C7A8A': 'Apple',
    '60F262': 'Intel',
    '001CC0': 'Intel',
    '0026C6': 'Intel',
    '00269E': 'Quanta',
    'ACDE48': 'Askey',
    '9C8CD8': 'Apple',
    'D8A25E': 'Apple',
    'BC0FAA': 'Google',
    '94E979': 'Espressif',
    'C44F33': 'Espressif',
    '607EDD': 'Microsoft',
    'B40EDC': 'Raspberry Pi',
    'DC56E7': 'Amazon',
    '50F520': 'Espressif',
    'A4CF12': 'Espressif',
    '10C37B': 'ASUS',
    '2CFDA1': 'ASUS',
    '04D4C4': 'ASUS',
  };
  
  return vendors[oui];
}
