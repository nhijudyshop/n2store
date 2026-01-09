export { walletService, deposit, withdraw, issueVirtualCredit, getWallet, getBalance } from './wallet.service.js';
export { walletController } from './wallet.controller.js';
export { default as walletRoutes } from './wallet.routes.js';
export { WalletError, WALLET_ERROR_CODES } from './wallet.errors.js';
export * from './wallet.types.js';
export * from './wallet.schema.js';
