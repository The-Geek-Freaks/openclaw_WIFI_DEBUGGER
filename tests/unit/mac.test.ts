import { describe, it, expect } from 'vitest';
import { normalizeMac, compareMac, isValidMac, getVendorFromMac } from '../../src/utils/mac.js';

describe('normalizeMac', () => {
  it('should normalize different MAC formats', () => {
    expect(normalizeMac('AA:BB:CC:DD:EE:FF')).toBe('aa:bb:cc:dd:ee:ff');
    expect(normalizeMac('aa-bb-cc-dd-ee-ff')).toBe('aa:bb:cc:dd:ee:ff');
    expect(normalizeMac('AABBCCDDEEFF')).toBe('aa:bb:cc:dd:ee:ff');
  });

  it('should handle mixed case', () => {
    expect(normalizeMac('Aa:Bb:Cc:Dd:Ee:Ff')).toBe('aa:bb:cc:dd:ee:ff');
  });
});

describe('compareMac', () => {
  it('should compare identical MACs', () => {
    expect(compareMac('AA:BB:CC:DD:EE:FF', 'aa:bb:cc:dd:ee:ff')).toBe(true);
  });

  it('should compare different formats', () => {
    expect(compareMac('AA-BB-CC-DD-EE-FF', 'AABBCCDDEEFF')).toBe(true);
  });

  it('should detect different MACs', () => {
    expect(compareMac('AA:BB:CC:DD:EE:FF', 'AA:BB:CC:DD:EE:00')).toBe(false);
  });
});

describe('isValidMac', () => {
  it('should validate correct MACs', () => {
    expect(isValidMac('AA:BB:CC:DD:EE:FF')).toBe(true);
    expect(isValidMac('aa:bb:cc:dd:ee:ff')).toBe(true);
    expect(isValidMac('AABBCCDDEEFF')).toBe(true);
  });

  it('should reject invalid MACs', () => {
    expect(isValidMac('AA:BB:CC:DD:EE')).toBe(false);
    expect(isValidMac('GG:HH:II:JJ:KK:LL')).toBe(false);
    expect(isValidMac('not-a-mac')).toBe(false);
  });
});

describe('getVendorFromMac', () => {
  it('should identify known vendors', () => {
    expect(getVendorFromMac('10:C3:7B:00:00:00')).toBe('ASUS');
    expect(getVendorFromMac('BC:0F:AA:00:00:00')).toBe('Google');
  });

  it('should return undefined for unknown OUI', () => {
    expect(getVendorFromMac('00:00:00:00:00:00')).toBeUndefined();
  });
});
