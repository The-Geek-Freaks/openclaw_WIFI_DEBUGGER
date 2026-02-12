export const WIFI_2G_CHANNELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
export const WIFI_5G_CHANNELS = [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165] as const;
export const ZIGBEE_CHANNELS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26] as const;

/**
 * Default noise floor estimate in dBm.
 * 
 * Typical values:
 * - Clean environment: -95 to -100 dBm
 * - Urban environment: -90 to -95 dBm
 * - High interference: -85 to -90 dBm
 * 
 * This is used when actual noise floor measurement is not available.
 * Real noise floor should be measured via `wl noise` command on router.
 */
export const DEFAULT_NOISE_FLOOR_DBM = -95;

export function wifiChannelToFrequency(channel: number, band: '2.4GHz' | '5GHz' | '6GHz'): number {
  if (band === '2.4GHz') {
    if (channel >= 1 && channel <= 13) {
      return 2412 + (channel - 1) * 5;
    }
    if (channel === 14) {
      return 2484;
    }
  }
  if (band === '5GHz') {
    return 5000 + channel * 5;
  }
  if (band === '6GHz') {
    return 5950 + channel * 5;
  }
  throw new Error(`Invalid channel ${channel} for band ${band}`);
}

export function zigbeeChannelToFrequency(channel: number): number {
  if (channel < 11 || channel > 26) {
    throw new Error(`Invalid Zigbee channel: ${channel}. Must be 11-26.`);
  }
  return 2405 + (channel - 11) * 5;
}

export function getWifi2gZigbeeOverlap(wifiChannel: number, zigbeeChannel: number): number {
  const wifiFreq = wifiChannelToFrequency(wifiChannel, '2.4GHz');
  const zigbeeFreq = zigbeeChannelToFrequency(zigbeeChannel);
  
  const wifiStart = wifiFreq - 11;
  const wifiEnd = wifiFreq + 11;
  const zigbeeStart = zigbeeFreq - 1;
  const zigbeeEnd = zigbeeFreq + 1;
  
  const overlapStart = Math.max(wifiStart, zigbeeStart);
  const overlapEnd = Math.min(wifiEnd, zigbeeEnd);
  
  if (overlapStart >= overlapEnd) {
    return 0;
  }
  
  const overlapWidth = overlapEnd - overlapStart;
  const zigbeeWidth = 2;
  return Math.min(1, overlapWidth / zigbeeWidth);
}

export function findNonOverlappingZigbeeChannels(wifiChannels: number[]): number[] {
  const result: number[] = [];
  
  for (const zigbeeChannel of ZIGBEE_CHANNELS) {
    let maxOverlap = 0;
    for (const wifiChannel of wifiChannels) {
      const overlap = getWifi2gZigbeeOverlap(wifiChannel, zigbeeChannel);
      maxOverlap = Math.max(maxOverlap, overlap);
    }
    if (maxOverlap < 0.1) {
      result.push(zigbeeChannel);
    }
  }
  
  return result;
}

export function findBestZigbeeChannel(wifi2gChannels: number[], currentZigbeeChannel: number): {
  channel: number;
  improvement: number;
  reason: string;
} {
  const nonOverlapping = findNonOverlappingZigbeeChannels(wifi2gChannels);
  
  if (nonOverlapping.length === 0) {
    return {
      channel: currentZigbeeChannel,
      improvement: 0,
      reason: 'No non-overlapping channels available',
    };
  }
  
  const currentOverlap = Math.max(
    ...wifi2gChannels.map(wc => getWifi2gZigbeeOverlap(wc, currentZigbeeChannel))
  );
  
  if (currentOverlap < 0.1) {
    return {
      channel: currentZigbeeChannel,
      improvement: 0,
      reason: 'Current channel has minimal overlap',
    };
  }
  
  const preferredChannels = [15, 20, 25, 11, 26];
  const bestChannel = preferredChannels.find(ch => nonOverlapping.includes(ch)) ?? nonOverlapping[0];
  
  if (bestChannel === undefined) {
    return {
      channel: currentZigbeeChannel,
      improvement: 0,
      reason: 'No suitable channel found',
    };
  }
  
  return {
    channel: bestChannel,
    improvement: currentOverlap * 100,
    reason: `Channel ${bestChannel} has no WiFi overlap (current has ${(currentOverlap * 100).toFixed(1)}% overlap)`,
  };
}

export function rssiToDistance(rssi: number, txPower: number = -59, pathLossExponent: number = 2.5): number {
  return Math.pow(10, (txPower - rssi) / (10 * pathLossExponent));
}

export function rssiToQuality(rssi: number): number {
  if (rssi >= -50) return 100;
  if (rssi <= -100) return 0;
  return 2 * (rssi + 100);
}
