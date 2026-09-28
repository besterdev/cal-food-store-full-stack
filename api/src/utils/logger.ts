export type LogFields = Record<string, unknown>;

export interface Logger {
  info: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
}

export const jsonLogger: Logger = {
  info: (message, fields) => {
    console.log(JSON.stringify({ level: "info", msg: message, ...fields }));
  },
  error: (message, fields) => {
    console.error(JSON.stringify({ level: "error", msg: message, ...fields }));
  },
};

export const silentLogger: Logger = {
  info: () => undefined,
  error: () => undefined,
};

export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
