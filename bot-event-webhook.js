// netlify/functions/bot-event-webhook.js
// POST /api/webhooks/bot-event
// SNS Core (the bot process) pushes heartbeats + events here.
// Authenticated via HMAC-SHA256 signature, NOT an open endpoint —
// this controls what shows up publicly on /status, so treat the secret
// with the same care as your other API keys.
//
// Required env var: BOT_WEBHOOK_SECRET
//
// Expected header:  x-sns-signature: <hex hmac of raw body using BOT_WEBHOOK_SECRET>
//
// Expected body shapes —
//
// Heartbeat / stats update:
// {
//   "type": "heartbeat",
//   "online": true,
//   "guilds": 12,
//   "uptimeSeconds": 48213,
//   "latencyMs": 42,
//   "activeIncidents": 0,
//   "incidentsHandledTotal": 137,
//   "keplerStatus": "armed"
// }
//
// Discrete event (incident, kepler trigger, mod action):
// {
//   "type": "event",
//   "guildId": "1234567890",
//   "event": "kepler_triggered",
//   "message": "Kepler Protocol activated for your server.",
//   "sentBy": "system"
// }

const crypto = require('crypto');
const { getDb } = require('./utils/db');

function isValidSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // timing-safe compare
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const secret = process.env.BOT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BOT_WEBHOOK_SECRET is not set');
    return { statusCode: 500, body: 'Server misconfigured' };
  }

  const signature = event.headers['x-sns-signature'];
  const rawBody = event.body || '';

  if (!isValidSignature(rawBody, signature, secret)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  try {
    const db = await getDb();

    if (payload.type === 'heartbeat') {
      await db.collection('bot_status').updateOne(
        { _id: 'global' },
        {
          $set: {
            online: payload.online ?? true,
            guilds: payload.guilds ?? 0,
            uptimeSeconds: payload.uptimeSeconds ?? 0,
            latencyMs: payload.latencyMs ?? null,
            activeIncidents: payload.activeIncidents ?? 0,
            incidentsHandledTotal: payload.incidentsHandledTotal ?? 0,
            keplerStatus: payload.keplerStatus ?? 'unknown',
            lastDeploy: payload.lastDeploy ?? null,
            updatedAt: new Date().toISOString(),
          },
        },
        { upsert: true }
      );
      return { statusCode: 200, body: JSON.stringify({ ok: true, type: 'heartbeat' }) };
    }

    if (payload.type === 'event') {
      if (!payload.guildId || !payload.event) {
        return { statusCode: 400, body: JSON.stringify({ error: 'guildId and event are required' }) };
      }

      await db.collection('guild_events').insertOne({
        guildId: payload.guildId,
        event: payload.event, // e.g. "kepler_triggered", "kepler_disarmed", "mod_action", "incident"
        message: payload.message || null,
        sentBy: payload.sentBy || 'system', // "system" | watchdog user id
        channels: payload.channels || ['dashboard'], // dashboard | discord_dm | email
        timestamp: new Date().toISOString(),
      });

      // Kepler state changes also update the global/guild-facing status.
      if (payload.event === 'kepler_triggered' || payload.event === 'kepler_disarmed') {
        await db.collection('guild_status').updateOne(
          { guildId: payload.guildId },
          {
            $set: {
              keplerStatus: payload.event === 'kepler_triggered' ? 'triggered' : 'disarmed',
              updatedAt: new Date().toISOString(),
            },
          },
          { upsert: true }
        );
      }

      return { statusCode: 200, body: JSON.stringify({ ok: true, type: 'event' }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown payload type' }) };
  } catch (err) {
    console.error('bot-event-webhook error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to process event' }) };
  }
};
