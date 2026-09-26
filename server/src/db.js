// =============================================================================
// DATA LAYER  -  database connection
// =============================================================================
import mongoose from 'mongoose';
import config from './config.js';

export async function connectDb(url = config.mongoUrl) {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(url, { serverSelectionTimeoutMS: 5000 });
    console.log(`[db] connected to ${url.replace(/\/\/[^@]*@/, '//***@')}`);
    return mongoose.connection;
  } catch (err) {
    console.error('\n[db] could not reach MongoDB at', url);
    console.error('[db]', err.message);
    console.error('\n  Is mongod running?  Windows:  net start MongoDB');
    console.error('  Or point MONGO_URL in server/.env at another instance.\n');
    throw err;
  }
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
