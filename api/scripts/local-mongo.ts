import { MongoMemoryReplSet } from 'mongodb-memory-server';

async function main() {
  console.log('🔄 Starting local single-node MongoDB replica set (rs0) on port 27017...');
  try {
    const replSet = await MongoMemoryReplSet.create({
      replSet: {
        name: 'rs0',
        count: 1,
        storageEngine: 'wiredTiger',
      },
      instanceOpts: [
        {
          port: 27017,
        },
      ],
    });

    const uri = replSet.getUri('bloodstock');
    console.log('✅ Local MongoDB replica set is online and PRIMARY!');
    console.log('   URI:', uri);
    console.log('   Press Ctrl+C to terminate.');

    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down local MongoDB replica set...');
      await replSet.stop();
      process.exit(0);
    });
  } catch (err) {
    console.error('❌ Failed to start local MongoDB replica set:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
