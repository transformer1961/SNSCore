// Example connector pattern for external bots to send status and events
// This file is not the production server; it is a template for any bot service
// that needs to integrate with the SNS Core webhook layer.

const crypto = require('crypto');

function signPayload(rawBody, secret) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

async function sendHeartbeat({ url, botId, token, secret, payload }) {
  const raw = JSON.stringify(payload);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sns-bot-id': botId,
      'x-sns-bot-token': token,
      'x-sns-signature': signPayload(raw, secret),
    },
    body: raw,
  });

  return { ok: response.ok, status: response.status, body: await response.text() };
}

async function sendEvent({ url, botId, token, secret, payload }) {
  const raw = JSON.stringify(payload);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sns-bot-id': botId,
      'x-sns-bot-token': token,
      'x-sns-signature': signPayload(raw, secret),
    },
    body: raw,
  });

  return { ok: response.ok, status: response.status, body: await response.text() };
}

async function claimCommand({ url, botId, token, secret }) {
  const response = await fetch(url, {
    headers: {
      'x-sns-bot-id': botId,
      'x-sns-bot-token': token,
      'x-sns-signature': signPayload('', secret),
    },
  });

  return { ok: response.ok, status: response.status, body: await response.json() };
}

async function reportCommand({ url, botId, token, secret, commandId, status, result, error }) {
  const payload = { commandId, status, result, error };
  const raw = JSON.stringify(payload);
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-sns-bot-id': botId,
      'x-sns-bot-token': token,
      'x-sns-signature': signPayload(raw, secret),
    },
    body: raw,
  });

  return { ok: response.ok, status: response.status, body: await response.text() };
}

async function requestEnrollment({ url, enrollmentKey, botId, name }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sns-enrollment-key': enrollmentKey,
    },
    body: JSON.stringify({ botId, name }),
  });

  return { ok: response.ok, status: response.status, body: await response.json() };
}

module.exports = { sendHeartbeat, sendEvent, requestEnrollment, claimCommand, reportCommand };

// Example usage:
// const { sendHeartbeat } = require('./bot-connector.example');
// sendHeartbeat({
//   url: 'https://example.netlify.app/api/webhooks/bot-event',
//   secret: process.env.BOT_WEBHOOK_SECRET,
//   payload: {
//     type: 'heartbeat',
//     botId: 'kepler-production',
//     online: true,
//     guilds: 12,
//     uptimeSeconds: 600,
//     latencyMs: 42,
//     activeIncidents: 0,
//     incidentsHandledTotal: 7,
//     keplerStatus: 'armed'
//   }
// });
