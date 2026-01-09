import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

// Import routes
import walletRoutes from './modules/wallet/wallet.routes.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Express Application Setup
// ═══════════════════════════════════════════════════════════════════════════════

const app: Express = express();

// ═══════════════════════════════════════════════════════════════════════════════
// Security Middleware
// ═══════════════════════════════════════════════════════════════════════════════

// Helmet for security headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: 'Too many requests',
    message: 'Vui lòng thử lại sau',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// ═══════════════════════════════════════════════════════════════════════════════
// Body Parsing
// ═══════════════════════════════════════════════════════════════════════════════

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ═══════════════════════════════════════════════════════════════════════════════
// Request ID & Logging Middleware
// ═══════════════════════════════════════════════════════════════════════════════

app.use((req: Request, res: Response, next: NextFunction) => {
  // Generate or use existing request ID
  req.requestId = (req.get('X-Request-ID') as string) || uuidv4();
  res.setHeader('X-Request-ID', req.requestId);

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
    });
  });

  next();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Temporary Auth Middleware (for development/testing)
// TODO: Replace with proper JWT authentication in production
// ═══════════════════════════════════════════════════════════════════════════════

app.use(`${env.API_PREFIX}`, (req: Request, _res: Response, next: NextFunction) => {
  // For development: inject mock user
  // In production, this should be replaced with proper JWT verification
  if (env.isDevelopment || env.isTest) {
    req.user = {
      id: 1,
      username: 'dev_user',
      email: 'dev@example.com',
      fullName: 'Development User',
      roleId: 1,
      roleName: 'ADMIN',
      permissions: {
        customer: ['create', 'read', 'update', 'delete'],
        wallet: ['deposit', 'withdraw', 'adjust', 'view_audit', 'freeze'],
        ticket: ['create', 'read', 'update', 'delete', 'complete', 'cancel'],
        report: ['view', 'export'],
        system: ['config', 'user_management', 'audit'],
      },
    };
  }
  next();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Health Check Endpoint
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/health', async (_req: Request, res: Response) => {
  const { healthCheck } = await import('./config/database.js');
  const dbHealthy = await healthCheck();

  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    database: dbHealthy ? 'connected' : 'disconnected',
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// API Routes
// ═══════════════════════════════════════════════════════════════════════════════

// API Info
app.get(`${env.API_PREFIX}`, (_req: Request, res: Response) => {
  res.json({
    message: 'Unified Customer 360 & Financial Hub API',
    version: '1.0.0',
    endpoints: {
      auth: `${env.API_PREFIX}/auth`,
      customers: `${env.API_PREFIX}/customers`,
      wallets: `${env.API_PREFIX}/wallets`,
      tickets: `${env.API_PREFIX}/tickets`,
      bankTransactions: `${env.API_PREFIX}/bank-transactions`,
      activities: `${env.API_PREFIX}/activities`,
      audit: `${env.API_PREFIX}/audit`,
    },
  });
});

// Wallet Routes (PHASE 1 - Core Wallet Engine)
app.use(`${env.API_PREFIX}/wallets`, walletRoutes);

// TODO: Add more routes in future phases
// app.use(`${env.API_PREFIX}/auth`, authRoutes);
// app.use(`${env.API_PREFIX}/customers`, customerRoutes);
// app.use(`${env.API_PREFIX}/tickets`, ticketRoutes);
// app.use(`${env.API_PREFIX}/bank-transactions`, bankTxRoutes);
// app.use(`${env.API_PREFIX}/activities`, activityRoutes);
// app.use(`${env.API_PREFIX}/audit`, auditRoutes);

// ═══════════════════════════════════════════════════════════════════════════════
// 404 Handler
// ═══════════════════════════════════════════════════════════════════════════════

app.use(notFoundHandler);

// ═══════════════════════════════════════════════════════════════════════════════
// Global Error Handler
// ═══════════════════════════════════════════════════════════════════════════════

app.use(errorHandler);

export default app;
