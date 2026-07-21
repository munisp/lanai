/**
 * Backward-compatible server entry point.
 *
 * The canonical portal bootstrap lives in `_core/index.ts`. Keeping this thin
 * forwarding module prevents development and production invocations from
 * diverging in middleware, service registration, health checks, security
 * policy, or Express-version compatibility.
 */
import "dotenv/config";
import "./_core/index";
