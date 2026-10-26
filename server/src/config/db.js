// MongoDB connection (Mongoose). No data is seeded here.
//
// One-click mode: if MONGO_URI is NOT set in server/.env, the backend starts
// its own in-memory MongoDB (mongodb-memory-server) on first run — it
// downloads a MongoDB binary once (needs internet the first time only) and
// caches it afterwards. That means: no Docker, no Atlas, no .env editing is
// needed to run the demo. Data in this mode is temporary and disappears when
// the server stops, which is exactly what a fresh-install demo wants.
// Set MONGO_URI (local mongod, Docker, or Atlas) for persistent data.
const mongoose = require('mongoose');

let memoryServer = null;

async function connectDB() {
  const uri = (process.env.MONGO_URI || '').trim();
  mongoose.set('strictQuery', true);
  // Give a slow first connection (e.g. the in-memory MongoDB binary download
  // on a cold serverless start) longer than Mongoose's 10s default before
  // any buffered operation can time out.
  mongoose.set('bufferTimeoutMS', 120000);
  if (uri) {
    try {
      await mongoose.connect(uri);
    } catch (err) {
      console.error('\nMongoDB connection failed. The app cannot start without a database.');
      console.error('If you use MongoDB Atlas, check in server/.env:');
      console.error('  1. MONGO_URI is the full Atlas string, with <password> replaced by your');
      console.error('     database user password (URL-encode special characters, e.g. @ -> %40).');
      console.error('  2. Atlas > Network Access allows your IP (for testing: 0.0.0.0/0).');
      console.error('  3. The database user exists in Atlas > Database Access and has read/write access.');
      console.error('  4. No Docker is needed for Atlas — only this MONGO_URI in server/.env.');
      console.error(`Original error: ${err.message}\n`);
      throw err;
    }
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return;
  }
  // No MONGO_URI: one-click in-memory mode.
  console.log('No MONGO_URI set — starting built-in in-memory MongoDB (first run downloads a MongoDB binary once)…');
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    const memoryUri = memoryServer.getUri();
    await mongoose.connect(memoryUri);
    console.log(`MongoDB connected (in-memory, temporary): ${mongoose.connection.name}`);
    console.log('Tip: set MONGO_URI in server/.env for data that survives a restart.');
  } catch (err) {
    console.error('\nCould not start the built-in in-memory MongoDB (it needs internet on first run to download the MongoDB binary).');
    console.error('Fix: set MONGO_URI in server/.env to a local mongod, Docker MongoDB, or Atlas cluster, then restart.');
    console.error(`Original error: ${err.message}\n`);
    throw err;
  }
}

module.exports = { connectDB };
