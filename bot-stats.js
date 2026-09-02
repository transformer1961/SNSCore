// netlify/functions/bot-stats.js
// Public endpoint: GET /api/bot/stats
// Serves aggregate, non-identifying bot stats for the homepage ticker and /status page.
// Data is written here by bot-event-webhook.js whenever SNS Core pushes an update —
// this function only reads.

const { getDb } = require('./utils/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const db = await getDb();
    const statsDoc = await db.collection('bot_status').findOne({ _id: 'global' });

    if (!statsDoc) {
      // No data yet — bot hasn't pushed a heartbeat/webhook event.
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15' },
        body: JSON.stringify({
          online: false,
          guilds: 0,
          uptimeSeconds: 0,
          latencyMs: null,
          activeIncidents: 0,
          incidentsHandledTotal: 0,
          keplerStatus: 'unknown',
          lastDeploy: null,
        }),
      };
    }

    // Only expose aggregate fields — never per-guild identifying data here.
    const publicStats = {
      online: statsDoc.online ?? false,
      guilds: statsDoc.guilds ?? 0,
      uptimeSeconds: statsDoc.uptimeSeconds ?? 0,
      latencyMs: statsDoc.latencyMs ?? null,
      activeIncidents: statsDoc.activeIncidents ?? 0,
      incidentsHandledTotal: statsDoc.incidentsHandledTotal ?? 0,
      keplerStatus: statsDoc.keplerStatus ?? 'unknown', // "armed" | "triggered" | "disarmed"
      lastDeploy: statsDoc.lastDeploy ?? null,
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15' },
      body: JSON.stringify(publicStats),
    };
  } catch (err) {
    console.error('bot-stats error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to load bot stats' }),
    };
  }
};
