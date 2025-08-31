import Xendit from 'xendit-node';
import { createChildLogger } from './logger';

const logger = createChildLogger('XenditConfig');

// Validate required environment variables
const requiredEnvVars = {
  XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY,
  XENDIT_CALLBACK_URL: process.env.XENDIT_CALLBACK_URL,
  XENDIT_WEBHOOK_TOKEN: process.env.XENDIT_WEBHOOK_TOKEN,
};

// Check if all required environment variables are present
const missingVars = Object.entries(requiredEnvVars)
  .filter(([key, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  logger.fatal(
    `Missing required environment variables: ${missingVars.join(', ')}`
  );
  throw new Error(
    `Missing required Xendit environment variables: ${missingVars.join(', ')}`
  );
}

// Initialize Xendit client
const xendit = new Xendit({
  secretKey: process.env.XENDIT_SECRET_KEY!,
});

// Xendit configuration constants
export const XENDIT_CONFIG = {
  secretKey: process.env.XENDIT_SECRET_KEY!,
  publicKey: process.env.XENDIT_PUBLIC_KEY || '',
  callbackUrl: process.env.XENDIT_CALLBACK_URL!,
  webhookToken: process.env.XENDIT_WEBHOOK_TOKEN!,
  defaultCurrency: 'IDR',
  defaultInvoiceDuration: parseInt(
    process.env.DEFAULT_INVOICE_DURATION_SECONDS || '86400'
  ),
  defaultExpiryHours: parseInt(
    process.env.DEFAULT_PAYMENT_EXPIRY_HOURS || '24'
  ),
  isProduction: process.env.NODE_ENV === 'production',
};

// Bank codes for Virtual Accounts
export const SUPPORTED_VA_BANKS = {
  BCA: 'BCA',
  BNI: 'BNI',
  BRI: 'BRI',
  PERMATA: 'PERMATA',
  MANDIRI: 'MANDIRI',
} as const;

// E-wallet types
export const SUPPORTED_EWALLETS = {
  DANA: 'DANA',
  OVO: 'OVO',
  LINKAJA: 'LINKAJA',
  SHOPEEPAY: 'SHOPEEPAY',
} as const;

// Payment method mappings
export const PAYMENT_METHOD_CONFIG = {
  INVOICE: {
    paymentMethods: [
      'BANK_TRANSFER',
      'CREDIT_CARD',
      'EWALLET',
      'RETAIL_OUTLET',
    ],
  },
  VIRTUAL_ACCOUNT: {
    supportedBanks: Object.values(SUPPORTED_VA_BANKS),
  },
  EWALLET: {
    supportedTypes: Object.values(SUPPORTED_EWALLETS),
  },
};

logger.info('Xendit configuration initialized successfully', {
  isProduction: XENDIT_CONFIG.isProduction,
  callbackUrl: XENDIT_CONFIG.callbackUrl,
});

export { xendit };
export default xendit;
