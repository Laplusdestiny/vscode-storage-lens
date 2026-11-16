import { describe, expect, it } from 'vitest';
import { formatBytes } from '../../src/core/format';

describe('formatBytes', () => {
  it('formats bytes with 1024-based units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(620 * 1024 ** 2)).toBe('620.0 MB');
    expect(formatBytes(8.2 * 1024 ** 3)).toBe('8.2 GB');
  });
});
