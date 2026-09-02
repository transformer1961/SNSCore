// netlify/functions/utils/db.js
// Cached MongoDB connection so we don't reconnect on every invocation
// (reuses the connection across warm Lambda/Function instances).

const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || 'sns_core';

  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }

  if (!cachedClient) {
    cachedClient = new MongoClient(uri, {
      maxPoolSize: 5,
    });
    await cachedClient.connect();
  }

  cachedDb = cachedClient.db(dbName);
  return cachedDb;
}

module.exports = { getDb };
