import helmet from "helmet";

/**
 * Baseline HTTP security headers for the JSON API. The API never serves HTML,
 * scripts, or other subresources, so the CSP denies everything.
 */
export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
});
