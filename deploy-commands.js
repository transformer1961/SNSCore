require('dotenv').config();
const { REST, Routes } = require('discord.js');
const botConfigs = require('./bots.config');
const cogRegistry = require('./lib/cogRegistry');

(async () => {
  for (const config of botConfigs) {
    const token = process.env[config.tokenEnv];
    const clientId = process.env[config.clientIdEnv];
    const guildIds = [...new Set([
      config.guildIdEnv ? process.env[config.guildIdEnv] : process.env.DISCORD_GUILD_ID,
      process.env.SNS_DEV_GUILD_ID,
    ].filter(Boolean))];

    if (!token || !clientId || !guildIds.length) {
      console.warn(`[${config.id}] Skipping — missing ${config.tokenEnv}, ${config.clientIdEnv}, or a guild ID in .env.`);
      continue;
    }

    const commands = (config.cogs || [])
      .flatMap((name) => {
        const cog = cogRegistry[name];
        if (!cog) {
          console.warn(`[${config.id}] Unknown cog "${name}" in bots.config.js, skipping.`);
          return [];
        }
        return cog.commands;
      })
      .map((c) => c.data.toJSON());

    const rest = new REST().setToken(token);

    for (const guildId of guildIds) {
      try {
        console.log(`[${config.id}] Registering ${commands.length} slash command(s) in ${guildId}...`);
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log(`[${config.id}] Done for ${guildId}.`);
      } catch (err) {
        console.error(`[${config.id}] Failed to register commands in ${guildId}:`, err);
      }
    }
  }
})();
