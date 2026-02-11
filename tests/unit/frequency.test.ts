import { describe, it, expect } from 'vitest';
import { 
  wifiChannelToFrequency, 
  zigbeeChannelToFrequency,
  getWifi2gZigbeeOverlap,
  findNonOverlappingZigbeeChannels,
  findBestZigbeeChannel,
  rssiToDistance,
  rssiToQuality
} from '../../src/utils/frequency.js';

describe('wifiChannelToFrequency', () => {
  it('should convert 2.4GHz channels correctly', () => {
    expect(wifiChannelToFrequency(1, '2.4GHz')).toBe(2412);
    expect(wifiChannelToFrequency(6, '2.4GHz')).toBe(2437);
    expect(wifiChannelToFrequency(11, '2.4GHz')).toBe(2462);
  });

  it('should convert 5GHz channels correctly', () => {
    expect(wifiChannelToFrequency(36, '5GHz')).toBe(5180);
    expect(wifiChannelToFrequency(149, '5GHz')).toBe(5745);
  });
});

describe('zigbeeChannelToFrequency', () => {
  it('should convert Zigbee channels correctly', () => {
    expect(zigbeeChannelToFrequency(11)).toBe(2405);
    expect(zigbeeChannelToFrequency(15)).toBe(2425);
    expect(zigbeeChannelToFrequency(26)).toBe(2480);
  });

  it('should throw for invalid channels', () => {
    expect(() => zigbeeChannelToFrequency(10)).toThrow();
    expect(() => zigbeeChannelToFrequency(27)).toThrow();
  });
});

describe('getWifi2gZigbeeOverlap', () => {
  it('should detect high overlap for same frequency range', () => {
    const overlap = getWifi2gZigbeeOverlap(1, 11);
    expect(overlap).toBeGreaterThan(0.5);
  });

  it('should detect no overlap for distant channels', () => {
    const overlap = getWifi2gZigbeeOverlap(1, 26);
    expect(overlap).toBe(0);
  });

  it('should detect overlap for channel 6 and Zigbee 18', () => {
    const overlap = getWifi2gZigbeeOverlap(6, 18);
    expect(overlap).toBeGreaterThan(0);
  });
});

describe('findNonOverlappingZigbeeChannels', () => {
  it('should find channels with no WiFi overlap', () => {
    const channels = findNonOverlappingZigbeeChannels([1]);
    expect(channels).toContain(25);
    expect(channels).toContain(26);
  });

  it('should find fewer channels when multiple WiFi channels used', () => {
    const single = findNonOverlappingZigbeeChannels([1]);
    const multiple = findNonOverlappingZigbeeChannels([1, 6, 11]);
    expect(multiple.length).toBeLessThanOrEqual(single.length);
  });
});

describe('findBestZigbeeChannel', () => {
  it('should suggest a non-overlapping channel', () => {
    const result = findBestZigbeeChannel([6], 15);
    expect(result.improvement).toBeGreaterThanOrEqual(0);
  });

  it('should keep current channel if already optimal', () => {
    const result = findBestZigbeeChannel([1], 26);
    expect(result.channel).toBe(26);
    expect(result.improvement).toBe(0);
  });
});

describe('rssiToDistance', () => {
  it('should calculate distance from RSSI', () => {
    const nearDistance = rssiToDistance(-50);
    const farDistance = rssiToDistance(-80);
    expect(farDistance).toBeGreaterThan(nearDistance);
  });

  it('should return larger distance for weaker signal', () => {
    expect(rssiToDistance(-70)).toBeGreaterThan(rssiToDistance(-60));
  });
});

describe('rssiToQuality', () => {
  it('should return 100% for excellent signal', () => {
    expect(rssiToQuality(-40)).toBe(100);
    expect(rssiToQuality(-50)).toBe(100);
  });

  it('should return 0% for terrible signal', () => {
    expect(rssiToQuality(-100)).toBe(0);
    expect(rssiToQuality(-110)).toBe(0);
  });

  it('should return intermediate values', () => {
    const quality = rssiToQuality(-75);
    expect(quality).toBeGreaterThan(0);
    expect(quality).toBeLessThan(100);
  });
});
