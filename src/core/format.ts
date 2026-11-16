const UNITS = ['KB', 'MB', 'GB', 'TB'];

export function formatBytes(n: number): string {
  if (n < 1024) {
    return `${n} B`;
  }
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${UNITS[unit]}`;
}
