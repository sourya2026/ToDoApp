// =============================================================================
// DATA LAYER  -  database connection
// =============================================================================
import mongoose from 'mongoose';
import config from './config.js';

/** Never print the password, wherever this log ends up. */
const redact = (url) => String(url).replace(/\/\/[^@/]*@/, '//***:***@');

/**
 * Turn the driver's generic failure into the one thing the reader should
 * actually go and change. Atlas failures are nearly always one of three
 * things, and the raw message names none of them.
 */
function explain(err, url) {
  const msg = err.message || '';
  if (/Authentication failed|bad auth/i.test(msg)) {
    return 'The username or password in MONGO_URL is wrong. Check Atlas > Database Access. '
      + 'If the password contains @ : / ? # or [ ], it must be percent-encoded.';
  }
  if (/IP that isn.t whitelisted|not allowed to access|ENOTFOUND|querySrv|ETIMEOUT|timed out/i.test(msg)) {
    return 'Atlas is refusing or not resolving the connection. Two usual causes: '
      + 'Network Access does not allow this host (Render free plans need 0.0.0.0/0), '
      + 'or the cluster hostname in MONGO_URL is wrong or the cluster is paused.';
  }
  if (/ECONNREFUSED/.test(msg) && /localhost|127\.0\.0\.1/.test(url)) {
    return 'Nothing is listening on localhost. Either start mongod, or set MONGO_URL '
      + 'to a real database (in production this usually means MONGO_URL was never set).';
  }
  return null;
}

export async function connectDb(url = config.mongoUrl) {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(url, { serverSelectionTimeoutMS: 10000 });
    console.log(`[db] connected to ${redact(url)}`);
    return mongoose.connection;
  } catch (err) {
    console.error('\n[db] could not reach MongoDB at ' + redact(url));
    console.error('[db] ' + err.message);
    const hint = explain(err, url);
    if (hint) console.error('\n  -> ' + hint + '\n');
    else if (!config.isProd) console.error('\n  Is mongod running?  Windows:  net start MongoDB\n');
    throw err;
  }
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
