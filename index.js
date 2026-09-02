require('dotenv').config();
const { Client, GatewayIntentBits, Collection, MessageFlags } = require('discord.js');
const { connectDB, getBotState } = require('./lib/db');
const { startServer } = require('./lib/webhookServer');
const botConfigs = require('./bots.config');
const cogRegistry = require('./lib/cogRegistry');
const { shouldStartBot, attachShutdownHandlers } = require('./lib/botManager');
const { startGateway } = require('./lib/snsGateway');

function buildClient(config) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers
    ]
  });

  client.config = config;

  client.commands = new Collection();
  for (const cogName of config.cogs || []) {
    const cog = cogRegistry[cogName];
    if (!cog) {
      console.warn(`[${config.id}] Unknown cog "${cogName}" in bots.config.js, skipping.`);
      continue;
    }
    for (const cmd of cog.commands) {
      client.commands.set(cmd.data.name, cmd);
    }
  }

  client.once('clientReady', async () => {
    console.log(`[${config.id}] Logged in as ${client.user.tag}`);

    if (config.primary) {
      try {
        const state = await getBotState();
        if (state.maintenance?.active) {
          await client.user.setPresence({ activities: [{ name: 'maintenance mode' }], status: 'dnd' });
        } else {
          await client.user.setPresence({ activities: [{ name: 'SNS systems' }], status: 'online' });
        }
      } catch {
        console.warn(`[${config.id}] Could not restore presence from DB (maintenance state).`);
      }

      const guildId = config.guildIdEnv ? process.env[config.guildIdEnv] : process.env.DISCORD_GUILD_ID;
      startServer(client, guildId);
    }
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`[${config.id}] Error executing /${interaction.commandName}:`, err);
      const payload = { content: 'Something went wrong running that command.', flags: MessageFlags.Ephemeral };
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      } catch (replyErr) {
        console.error(`[${config.id}] Could not send error reply for /${interaction.commandName}:`, replyErr.message);
      }
    }
  });

  client.on('error', (err) => {
    console.error(`[${config.id}] Client error:`, err);
  });

  return client;
}

(async () => {
  try {
    await connectDB();
  } catch {
    console.warn('[core] Continuing without DB connection.');
  }

  const startedClients = [];
  let startedAny = false;

  for (const config of botConfigs) {
    if (!shouldStartBot(config)) {
      console.warn(`[${config.id}] Disabled in bots.config.js — skipping startup.`);
      continue;
    }

    const token = process.env[config.tokenEnv];
    if (!token) {
      console.warn(`[${config.id}] Skipping — ${config.tokenEnv} not set in .env.`);
      continue;
    }

    const client = buildClient(config);
    try {
      await client.login(token);
      client.gatewayCleanup = startGateway(client);
      startedClients.push(client);
      startedAny = true;
    } catch (err) {
      console.error(`[${config.id}] Failed to log in:`, err.message);
    }
  }

  attachShutdownHandlers(startedClients);

  if (!startedAny) {
    console.error('No bots started — check bots.config.js and your .env tokens.');
    process.exit(1);
  }
})();
