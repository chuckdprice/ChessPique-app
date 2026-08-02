/// <reference types="vite/client" />

/**
 * Major.minor from package.json, with a build number derived from the commit's
 * timestamp. Injected by vite.config.ts at build time.
 */
declare const __APP_VERSION__: string
