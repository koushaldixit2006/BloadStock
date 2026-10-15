import mongoose from 'mongoose';
import { app } from './app';
import { config } from './config';
import { logger } from './utils/logger';

async function startServer() {
  logger.info({ uri: config.mongodbUri }, 'Connecting to MongoDB...');

  try {
    await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 5000,
    });
    logger.info('Connected to MongoDB Replica Set successfully.');
  } catch (err) {
    logger.warn({ err }, 'Initial MongoDB connection failed. Retrying in background...');
  }

  app.listen(config.port, () => {
    logger.info(`BloodStock API service listening on http://localhost:${config.port}`);
  });
}

if (require.main === module) {
  startServer();
}

export default app;
