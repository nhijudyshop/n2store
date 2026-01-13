/**
 * Shared Browser Modules
 * Browser-only utilities (localStorage, Firebase, DOM)
 *
 * @module shared/browser
 */

// Token managers
export { TokenManager, default as TposTokenManager } from './token-manager.js';
export { PancakeTokenManager } from './pancake-token-manager.js';

// Re-export universal modules for convenience
export * from '../universal/index.js';
