const crypto = require('crypto');

function requiredConfig(config) {
  const commandUrl = process.env.SNS_CORE_COMMAND_URL;
  const webhookUrl = process.env.SNS_CORE_WEBHOOK_URL;
  const botId = process.env[config.snsBotIdEnv || 'SNS_CORE_BOT_ID'];
  const botToken = process.env[config.snsBotTokenEnv || 'SNS_CORE_BOT_TOKEN'];
  const webhookSecret = process.env.BOT_WEBHOOK_SECRET;
  if (!commandUrl || !webhookUrl || !botId || !botToken || !webhookSecret) return null;
  return { commandUrl, webhookUrl, botId, botToken, webhookSecret };
}

function sign(rawBody, secret) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

async function request(url, options, config) {
  const rawBody = options.body || '';
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'x-sns-bot-id': config.botId,
      'x-sns-bot-token': config.botToken,
      'x-sns-signature': sign(rawBody, config.webhookSecret),
    },
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const detail = typeof body === 'string' ? body : body?.error;
    throw new Error(`SNS Core request failed (${response.status})${detail ? `: ${String(detail).slice(0, 180)}` : ''}`);
  }
  return body;
}

async function sendHeartbeat(client, config) {
  return request(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'heartbeat',
      botId: config.botId,
      online: client.isReady(),
      guilds: client.guilds.cache.size,
      uptimeSeconds: Math.floor((client.uptime || 0) / 1000),
      latencyMs: client.ws.ping,
      activeIncidents: 0,
      incidentsHandledTotal: 0,
      keplerStatus: 'armed',
    }),
  }, config);
}

async function claimCommand(config) {
  return request(config.commandUrl, { method: 'GET' }, config);
}

async function reportCommand(config, commandId, status, result = null, error = null) {
  return request(config.commandUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId, status, result, error }),
  }, config);
}

async function executeCommand(client, config, command) {
  if (command.command === 'enable') {
    if (!client.isReady()) await client.login(process.env[client.config.tokenEnv]);
    await client.user.setPresence({ activities: [{ name: 'SNS systems' }], status: 'online' });
    return 'Bot enabled';
  }

  if (command.command === 'disable' || command.command === 'shutdown') {
    if (client.isReady()) await client.destroy();
    return command.command === 'shutdown' ? 'Bot disconnected' : 'Bot disabled';
  }

  if (command.command === 'restart') {
    if (client.isReady()) await client.destroy();
    await client.login(process.env[client.config.tokenEnv]);
    return 'Bot restarted';
  }

  if (command.command === 'trigger_lockdown') {
    const guild = client.guilds.cache.first();
    if (!guild) throw new Error('Bot is not connected to a guild');
    return `Lockdown requested for ${guild.id}; execute guild policy in the bot supervisor`;
  }

  if (command.command === 'broadcast_notice') {
    if (!command.message) throw new Error('Notification message is required');
    if (command.channel === 'External webhook') {
      const webhookUrl = process.env[client.config.notificationWebhookEnv || 'SNS_NOTIFICATION_WEBHOOK_URL'];
      if (!webhookUrl) throw new Error('SNS_NOTIFICATION_WEBHOOK_URL is not configured');
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: command.message,
          username: `${client.user.username} Alerts`,
        }),
      });
      if (!response.ok) throw new Error(`External webhook returned ${response.status}`);
      return 'Notification delivered to external webhook';
    }

    if (command.channel === 'Discord DM') {
      const guilds = command.audience === 'Bot owner only' ? [client.guilds.cache.first()] : [...client.guilds.cache.values()];
      let delivered = 0;
      for (const guild of guilds.filter(Boolean)) {
        const user = await client.users.fetch(guild.ownerId).catch(() => null);
        if (user) {
          await user.send(command.message);
          delivered += 1;
        }
      }
      if (!delivered) throw new Error('No Discord DM recipients found');
      return `Notification sent by DM to ${delivered} guild owner${delivered === 1 ? '' : 's'}`;
    }

    const guilds = [...client.guilds.cache.values()];
    let delivered = 0;
    for (const guild of guilds.filter(Boolean)) {
      const channel = guild.systemChannel || guild.channels.cache.find((candidate) => candidate.isTextBased() && candidate.permissionsFor(client.user)?.has('SendMessages'));
      if (channel) {
        await channel.send(command.message);
        delivered += 1;
      }
    }
    if (!delivered) throw new Error('No writable system channel found');
    return `Notification delivered to ${delivered} guild${delivered === 1 ? '' : 's'}`;
  }

  throw new Error(`Unsupported command: ${command.command}`);
}

function startGateway(client) {
  const config = requiredConfig(client.config);
  if (!config) {
    console.warn(`[${client.config.id}] SNS Core gateway disabled; configure SNS_CORE_COMMAND_URL, SNS_CORE_WEBHOOK_URL, bot credentials, and BOT_WEBHOOK_SECRET.`);
    return () => {};
  }

  let polling = false;
  const heartbeat = async () => {
    try { await sendHeartbeat(client, config); } catch (error) { console.warn(`[${client.config.id}] SNS heartbeat failed:`, error.message); }
  };
  const poll = async () => {
    if (polling) return;
    polling = true;
    try {
      const response = await claimCommand(config);
      if (response?.command) {
        const command = response.command;
        await reportCommand(config, command.commandId, 'running');
        try {
          const result = await executeCommand(client, config, command);
          await reportCommand(config, command.commandId, 'completed', result);
        } catch (error) {
          await reportCommand(config, command.commandId, 'failed', null, error.message);
        }
      }
    } catch (error) {
      console.warn(`[${client.config.id}] SNS command poll failed:`, error.message);
    } finally {
      polling = false;
    }
  };

  const heartbeatTimer = setInterval(heartbeat, 30000);
  const pollTimer = setInterval(poll, 5000);
  heartbeat();
  console.log(`[${client.config.id}] SNS Core gateway connected as ${config.botId}.`);
  return () => { clearInterval(heartbeatTimer); clearInterval(pollTimer); };
}

module.exports = { startGateway };
