import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { runSeed } from '../scripts/seed';
import { config } from '../src/config';

let replSet: MongoMemoryReplSet | null = null;

export async function setupTestDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  // Use memory replica set or existing local mongo
  try {
    await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 1500 });
  } catch {
    replSet = await MongoMemoryReplSet.create({
      replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
    });
    const uri = replSet.getUri('bloodstock-test');
    await mongoose.connect(uri);
  }

  // Seed baseline data
  await runSeed();
}

export async function teardownTestDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (replSet) {
    await replSet.stop();
  }
}
