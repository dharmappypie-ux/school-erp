import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext → Cloudflare Workers adapter config.
 *
 * The app is overwhelmingly dynamic (every page is auth-scoped and tenant-
 * filtered), so no incremental/ISR cache override is needed to run correctly.
 * To persist Next's data/ISR cache across isolates later, add an R2 bucket
 * binding (see wrangler.jsonc) and enable the r2 override, e.g.:
 *
 *   import r2IncrementalCache from
 *     "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
 *   export default defineCloudflareConfig({ incrementalCache: r2IncrementalCache });
 */
export default defineCloudflareConfig({});
