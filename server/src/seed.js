// CLI wrapper: npm run seed
import { connectDb, disconnectDb } from './db.js';
import { seedDatabase } from './seed-data.js';

try {
  await connectDb();
  await seedDatabase();
  console.log('\nSeeded. Sign in as Admin with PIN 1234 (Radha / Sourya / Venkat use 1234 too).\n');
  await disconnectDb();
  process.exit(0);
} catch (err) {
  console.error('[seed] failed:', err.message);
  process.exit(1);
}
