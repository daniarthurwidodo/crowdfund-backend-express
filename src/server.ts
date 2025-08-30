import dotenv from 'dotenv';
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import RedisStore from 'connect-redis';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import redisClient from './config/redis';
import { sequelize } from './models';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import projectRoutes from './routes/projects';
import donationRoutes from './routes/donations';
import uploadRoutes from './routes/uploads';
import paymentRoutes from './routes/payments';
import swaggerSpecs from './config/swagger';
import { ProjectScheduler } from './services/projectScheduler';
import { logger, httpLogger } from './config/logger';
import { initializeUploadDirectories } from './utils/imageUpload';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});

app.use(httpLogger);
app.use(helmet());
app.use(limiter);
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images statically
app.use('/uploads', express.static('uploads'));

redisClient.connect().catch((error) => logger.error('Redis connection error:', error));

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24
  }
}));

app.get('/health', async (req: Request, res: Response) => {
  try {
    await sequelize.authenticate();
    await redisClient.ping();
    
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      services: {
        database: 'Connected',
        redis: 'Connected'
      }
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'Error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

app.get('/health/ready', async (req: Request, res: Response) => {
  try {
    await sequelize.authenticate();
    res.status(200).json({ status: 'Ready' });
  } catch (error: any) {
    res.status(503).json({ status: 'Not Ready', error: error.message });
  }
});

app.get('/health/live', (req: Request, res: Response) => {
  res.status(200).json({ status: 'Live' });
});

app.post('/shutdown', (req: Request, res: Response) => {
  res.status(200).json({ 
    message: 'Shutdown initiated. Server will gracefully shutdown.' 
  });
  
  setTimeout(() => {
    gracefulShutdown('MANUAL_SHUTDOWN');
  }, 1000);
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/payments', paymentRoutes);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Crowdfund API Documentation'
}));

app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err: error, req }, 'Unhandled error');
  res.status(500).json({ 
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: error.message })
  });
});

let server: any;
let scheduler: ProjectScheduler;

const gracefulShutdown = async (signal: string): Promise<void> => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  
  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout. Forcing exit.');
    process.exit(1);
  }, 30000);

  try {
    if (server) {
      logger.info('Closing HTTP server...');
      await new Promise<void>((resolve, reject) => {
        server.close((err: any) => {
          if (err) {
            logger.error({ err }, 'Error closing server');
            reject(err);
          } else {
            logger.info('HTTP server closed.');
            resolve();
          }
        });
      });
    }

    if (scheduler) {
      logger.info('Stopping project scheduler...');
      scheduler.stop();
    }

    logger.info('Closing Redis connection...');
    if (redisClient.isOpen) {
      await redisClient.quit();
      logger.info('Redis connection closed.');
    }

    logger.info('Closing database connection...');
    await sequelize.close();
    logger.info('Database connection closed.');

    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown completed successfully.');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Error during graceful shutdown');
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR1', () => gracefulShutdown('SIGUSR1'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2'));

process.on('uncaughtException', (error: Error) => {
  logger.fatal({ err: error }, 'Uncaught Exception');
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.fatal({ reason, promise }, 'Unhandled Rejection');
  gracefulShutdown('UNHANDLED_REJECTION');
});

const startServer = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully.');
    
    if (process.env.NODE_ENV !== 'production') {
      await sequelize.sync();
      logger.info('Database synchronized.');
    }
    
    // Initialize upload directories
    initializeUploadDirectories();
    
    scheduler = ProjectScheduler.getInstance();
    scheduler.start();
    
    server = app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`Health check available at: http://localhost:${PORT}/health`);
      logger.info(`API Documentation available at: http://localhost:${PORT}/api-docs`);
      logger.info('Press Ctrl+C for graceful shutdown');
    });

    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Please choose a different port.`);
      } else {
        logger.error({ err: error }, 'Server error');
      }
      process.exit(1);
    });

  } catch (error) {
    logger.fatal({ err: error }, 'Unable to start server');
    process.exit(1);
  }
};

startServer();