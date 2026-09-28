import helmet from "helmet";

/** Baseline HTTP security headers for the JSON API. */
export const securityMiddleware = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
});
