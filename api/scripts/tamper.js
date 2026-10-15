const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/bloodstock?replicaSet=rs0');
  const coll = mongoose.connection.collection('auditlogs');
  await coll.updateOne({ seq: 1 }, { $set: { action: 'MALICIOUS_UNAUTHORIZED_MUTATION' } });
  await mongoose.disconnect();
  console.log('Tampered seq 1 in auditlogs');
}

run();
