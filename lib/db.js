const mongoose = require('mongoose');

// Fail fast on queries instead of buffering silently for 10s when disconnected
mongoose.set('bufferCommands', false);

let connected = false;

async function connectDB() {
  if (connected) return mongoose.connection;
  if (!process.env.MONGODB_URI) {
    console.warn('[db] MONGODB_URI not set, skipping DB connection.');
    return null;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    connected = true;
    console.log('[db] Connected to MongoDB');
    return mongoose.connection;
  } catch (err) {
    console.error('[db] Connection failed:', err.message);
    throw err;
  }
}

// Log of every deploy/security/inquiry event pushed via webhook
const eventLogSchema = new mongoose.Schema({
  type: { type: String, required: true }, // 'deploy' | 'security' | 'inquiry'
  source: { type: String },               // e.g. 'netlify', 'arcjet', 'sns-web'
  payload: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
});

const EventLog = mongoose.models.EventLog || mongoose.model('EventLog', eventLogSchema);

// Singleton document holding runtime bot state: maintenance mode, alert muting, Kepler Protocol
const botStateSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'singleton' },
  maintenance: {
    active: { type: Boolean, default: false },
    message: { type: String, default: null },
    setBy: { type: String, default: null },
    setAt: { type: Date, default: null }
  },
  alertsMuted: {
    active: { type: Boolean, default: false },
    until: { type: Date, default: null },
    mutedBy: { type: String, default: null }
  },
  kepler: {
    active: { type: Boolean, default: false },
    activatedBy: { type: String, default: null },
    activatedAt: { type: Date, default: null },
    reason: { type: String, default: null },
    lockedChannels: { type: [String], default: [] }
  }
});

const BotState = mongoose.models.BotState || mongoose.model('BotState', botStateSchema);

const warningSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  userTag: { type: String },
  reason: { type: String },
  moderator: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const Warning = mongoose.models.Warning || mongoose.model('Warning', warningSchema);

async function getBotState() {
  let state = await BotState.findOne({ key: 'singleton' });
  if (!state) state = await BotState.create({ key: 'singleton' });
  return state;
}

module.exports = { connectDB, EventLog, BotState, Warning, getBotState };
