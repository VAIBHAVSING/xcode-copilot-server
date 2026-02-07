export const LEVEL_PRIORITY = {
  none: 0,
  error: 1,
  warning: 2,
  info: 3,
  debug: 4,
  all: 5,
} as const;

export type LogLevel = keyof typeof LEVEL_PRIORITY;

export function truncate(value: unknown, maxLen = 200): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "…";
}

export class Logger {
  readonly level: LogLevel;
  private threshold: number;

  constructor(level: LogLevel = "info") {
    this.level = level;
    this.threshold = LEVEL_PRIORITY[level];
  }

  error(msg: string, ...args: unknown[]): void {
    if (this.threshold >= LEVEL_PRIORITY.error) {
      console.error(`[ERROR] ${msg}`, ...args);
    }
  }

  warn(msg: string, ...args: unknown[]): void {
    if (this.threshold >= LEVEL_PRIORITY.warning) {
      console.warn(`[WARN] ${msg}`, ...args);
    }
  }

  info(msg: string, ...args: unknown[]): void {
    if (this.threshold >= LEVEL_PRIORITY.info) {
      console.log(`[INFO] ${msg}`, ...args);
    }
  }

  debug(msg: string, ...args: unknown[]): void {
    if (this.threshold >= LEVEL_PRIORITY.debug) {
      console.log(`[DEBUG] ${msg}`, ...args);
    }
  }
}
