export interface AppConfig {
  databaseUrl: string;
  allowedOrigins: string[];
  listenPort: number;
  requestTimeoutMs: number;
  readinessTimeoutMs: number;
}

/** Load process env once at the process boundary. */
export const loadConfig = (
  env: NodeJS.ProcessEnv = process.env,
): AppConfig => {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const address = env.API_ADDRESS?.trim();
  const fallbackPort = Number(env.PORT ?? "8080");
  const listenPort = address?.startsWith(":")
    ? Number(address.slice(1) || fallbackPort)
    : fallbackPort;

  if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) {
    throw new Error(`invalid listen port: ${listenPort}`);
  }

  return {
    databaseUrl,
    allowedOrigins: (env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    listenPort,
    requestTimeoutMs: positiveInt(env.REQUEST_TIMEOUT_MS, 3000),
    readinessTimeoutMs: positiveInt(env.READINESS_TIMEOUT_MS, 2000),
  };
};

const positiveInt = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`invalid positive integer: ${raw}`);
  }
  return value;
};
