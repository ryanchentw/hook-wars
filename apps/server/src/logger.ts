import type { LogLevel } from './config';

/** Numbers, flags and short labels only: no names, no addresses, no room codes, no message bodies. */
export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

export type Logger = {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
};

const RANK: Readonly<Record<LogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

/** One JSON object per line, which is what a hosting platform's log view expects. */
export function createLogger(level: LogLevel, write: (line: string) => void = (line) => process.stdout.write(`${line}\n`)): Logger {
  const at = (name: Exclude<LogLevel, 'silent'>) => (event: string, fields: LogFields = {}): void => {
    if (RANK[name] < RANK[level]) return;
    write(JSON.stringify({ time: new Date().toISOString(), level: name, event, ...fields }));
  };
  return { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
}
