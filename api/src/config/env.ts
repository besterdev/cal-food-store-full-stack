export interface AppConfig {
  databaseUrl: string;
  allowedOrigins: string[];
  port: number;
  databaseTimeoutMs: number;
}

/** Load process env once at the process boundary. */
export const loadConfig = (
  env: NodeJS.ProcessEnv = process.env,
): AppConfig => {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return {
    databaseUrl,
    allowedOrigins: (env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    port: positiveInt("PORT", env.PORT, 8080),
    databaseTimeoutMs: positiveInt("DATABASE_TIMEOUT_MS", env.DATABASE_TIMEOUT_MS, 3000),
  };
};

const positiveInt = (
  name: string,
  raw: string | undefined,
  fallback: number,
): number => {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, got ${raw}`);
  }
  return value;
};
