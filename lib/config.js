function getOptionalEnv(name, fallback = undefined) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return value;
}

function getRequiredEnv(name) {
  const value = getOptionalEnv(name);
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeBotConfig(config = {}) {
  return {
    id: config.id || 'bot',
    name: config.name || config.id || 'Unnamed Bot',
    enabled: config.enabled !== false,
    tokenEnv: config.tokenEnv || 'DISCORD_TOKEN',
    snsBotIdEnv: config.snsBotIdEnv || 'SNS_CORE_BOT_ID',
    snsBotTokenEnv: config.snsBotTokenEnv || 'SNS_CORE_BOT_TOKEN',
    notificationWebhookEnv: config.notificationWebhookEnv || 'SNS_NOTIFICATION_WEBHOOK_URL',
    deployHookEnv: config.deployHookEnv || 'SNS_RAILWAY_DEPLOY_HOOK_URL',
    clientIdEnv: config.clientIdEnv || 'DISCORD_CLIENT_ID',
    guildIdEnv: config.guildIdEnv || 'DISCORD_GUILD_ID',
    cogs: Array.isArray(config.cogs) ? config.cogs : [],
    primary: Boolean(config.primary)
  };
}

module.exports = { getOptionalEnv, getRequiredEnv, normalizeBotConfig };
