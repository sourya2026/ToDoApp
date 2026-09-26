// =============================================================================
// Demo mode: run the whole API against an in-memory MongoDB.
//
//   npm run dev:demo
//
// Nothing is installed and nothing is written to disk - the database lives in
// this process and disappears when it stops. Use it to try the app before
// setting up a real mongod; for anything you want to keep, run `npm run dev`
// against MONGO_URL instead.
// =============================================================================
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from './db.js';
import { seedDatabase } from './seed-data.js';
import { createApp } from './index.js';
import config from './config.js';

console.log('[demo] starting an in-memory MongoDB (first run downloads it once)...');
const mongo = await MongoMemoryServer.create();
const url = mongo.getUri('todo_tracker');

await connectDb(url);
await seedDatabase({ log: (...args) => console.log(...args) });

const app = createApp();
const server = app.listen(config.port, () => {
  console.log('');
  console.log('  API   http://localhost:' + config.port + '  (in-memory database)');
  console.log('  Web   http://localhost:5173');
  console.log('  Sign in as Admin / Radha / Sourya / Venkat, PIN 1234');
  console.log('');
  console.log('  Data is NOT saved when this process stops.');
  console.log('');
});

// Shut the in-memory server down cleanly, or the mongod child process lingers.
const stop = async () => {
  console.log('\n[demo] shutting down');
  server.close();
  await disconnectDb();
  await mongo.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
