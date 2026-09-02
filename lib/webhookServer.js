const express = require('express');
const { EmbedBuilder, ChannelType } = require('discord.js');
const { EventLog, getBotState } = require('./db');

function verifyWebhookSecret(req) {
  if (!process.env.WEBHOOK_SECRET) return true; // no secret configured, skip check
  const provided = req.headers['x-webhook-secret'];
  return provided === process.env.WEBHOOK_SECRET;
}

// API endpoints are control/read surfaces for the website — deny by default if no
// key is configured, rather than the webhook pattern's fail-open default. These
// are more sensitive (maintenance toggle, lockdown, kepler) than inbound event posts.
function requireApiKey(req, res, next) {
  if (!process.env.API_KEY) {
    return res.status(503).json({ error: 'API_KEY not configured on the bot — set it in .env to enable this endpoint.' });
  }
  const provided = req.headers['x-api-key'];
  if (provided !== process.env.API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

async function alertsAreMuted() {
  try {
    const state = await getBotState();
    if (!state.alertsMuted?.active) return false;
    if (state.alertsMuted.until && state.alertsMuted.until.getTime() < Date.now()) {
      state.alertsMuted = { active: false, until: null, mutedBy: null };
      await state.save();
      return false;
    }
    return true;
  } catch {
    return false; // fail open on DB errors, don't silently swallow real alerts
  }
}

/**
 * Starts the webhook receiver + REST API, bound to the primary bot's client.
 * @param {import('discord.js').Client} client
 * @param {string} defaultGuildId - guild the API acts on for lockdown/kepler/member lookups
 */
function startServer(client, defaultGuildId) {
  const app = express();
  app.use(express.json());

  // ---------------------------------------------------------------------
  // Inbound webhooks (Netlify deploys, Arcjet security events, site inquiries)
  // ---------------------------------------------------------------------

  app.post('/webhooks/netlify', async (req, res) => {
    if (!verifyWebhookSecret(req)) return res.status(401).send('unauthorized');

    const { state, name, url, deploy_url, branch, error_message } = req.body || {};

    const embed = new EmbedBuilder()
      .setTitle(`Deploy: ${name || 'unknown site'}`)
      .setDescription(`Branch: \`${branch || 'n/a'}\`\nState: **${state || 'unknown'}**`)
      .setColor(state === 'ready' ? 0x2ecc71 : state === 'error' ? 0xe74c3c : 0xf1c40f)
      .setURL(deploy_url || url || null)
      .setTimestamp(new Date());

    if (error_message) embed.addFields({ name: 'Error', value: String(error_message).slice(0, 1000) });

    try {
      const muted = await alertsAreMuted();
      const channelId = process.env.DEPLOYS_CHANNEL_ID;
      if (channelId && !muted) {
        const channel = await client.channels.fetch(channelId);
        await channel.send({ embeds: [embed] });
      }
      await EventLog.create({ type: 'deploy', source: 'netlify', payload: req.body });
    } catch (err) {
      console.error('[webhook:netlify] failed to post:', err.message);
    }

    res.status(200).send('ok');
  });

  app.post('/webhooks/arcjet', async (req, res) => {
    if (!verifyWebhookSecret(req)) return res.status(401).send('unauthorized');

    const { reason, ip, path, rule, decision } = req.body || {};

    const embed = new EmbedBuilder()
      .setTitle('Security Event')
      .setDescription(`Rule: **${rule || 'unknown'}**\nDecision: **${decision || 'unknown'}**`)
      .addFields(
        { name: 'IP', value: ip || 'n/a', inline: true },
        { name: 'Path', value: path || 'n/a', inline: true },
        { name: 'Reason', value: reason || 'n/a', inline: true }
      )
      .setColor(0xe67e22)
      .setTimestamp(new Date());

    try {
      const muted = await alertsAreMuted();
      const channelId = process.env.ALERTS_CHANNEL_ID;
      if (channelId && !muted) {
        const channel = await client.channels.fetch(channelId);
        await channel.send({ embeds: [embed] });
      }
      await EventLog.create({ type: 'security', source: 'arcjet', payload: req.body });
    } catch (err) {
      console.error('[webhook:arcjet] failed to post:', err.message);
    }

    res.status(200).send('ok');
  });

  app.post('/webhooks/inquiry', async (req, res) => {
    if (!verifyWebhookSecret(req)) return res.status(401).send('unauthorized');

    const { name, email, company, message, source } = req.body || {};

    const embed = new EmbedBuilder()
      .setTitle('📩 New Inquiry')
      .addFields(
        { name: 'Name', value: name || 'n/a', inline: true },
        { name: 'Email', value: email || 'n/a', inline: true },
        { name: 'Company', value: company || 'n/a', inline: true }
      )
      .setDescription(message ? String(message).slice(0, 1500) : 'No message provided')
      .setColor(0x9b59b6)
      .setFooter({ text: source ? `Source: ${source}` : 'SNS-web contact form' })
      .setTimestamp(new Date());

    try {
      const muted = await alertsAreMuted();
      const channelId = process.env.INQUIRIES_CHANNEL_ID;
      if (channelId && !muted) {
        const channel = await client.channels.fetch(channelId);
        await channel.send({ embeds: [embed] });
      }
      await EventLog.create({ type: 'inquiry', source: 'sns-web', payload: req.body });
    } catch (err) {
      console.error('[webhook:inquiry] failed to post:', err.message);
    }

    res.status(200).send('ok');
  });

  // ---------------------------------------------------------------------
  // Outbound REST API — for SNS-web to read status and trigger bot actions.
  // Call these from a server-side Netlify Function, never directly from the
  // browser — API_KEY would be exposed in client-side JS otherwise.
  // ---------------------------------------------------------------------

  app.get('/api/status', requireApiKey, async (req, res) => {
    try {
      const guild = defaultGuildId ? await client.guilds.fetch(defaultGuildId) : client.guilds.cache.first();
      const state = await getBotState().catch(() => null);

      res.json({
        botTag: client.user?.tag || null,
        uptimeSec: Math.floor(process.uptime()),
        ping: client.ws.ping,
        guildName: guild?.name || null,
        memberCount: guild?.memberCount ?? null,
        maintenance: state?.maintenance || null,
        kepler: state?.kepler ? { active: state.kepler.active, reason: state.kepler.reason } : null,
        alertsMuted: state?.alertsMuted || null
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/maintenance', requireApiKey, async (req, res) => {
    const { action, message } = req.body || {};
    if (!['on', 'off'].includes(action)) {
      return res.status(400).json({ error: 'action must be "on" or "off"' });
    }

    try {
      const state = await getBotState();

      if (action === 'on') {
        state.maintenance = {
          active: true,
          message: message || 'Scheduled maintenance in progress',
          setBy: 'website-api',
          setAt: new Date()
        };
        await client.user.setPresence({ activities: [{ name: 'maintenance mode' }], status: 'dnd' });
      } else {
        state.maintenance = { active: false, message: null, setBy: 'website-api', setAt: new Date() };
        await client.user.setPresence({ activities: [{ name: 'SNS systems' }], status: 'online' });
      }

      await state.save();
      res.json({ ok: true, maintenance: state.maintenance });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/lockdown', requireApiKey, async (req, res) => {
    const { action, channelId, reason } = req.body || {};
    if (!defaultGuildId) return res.status(400).json({ error: 'no default guild configured on the bot' });

    try {
      const guild = await client.guilds.fetch(defaultGuildId);

      if (action === 'lock' || action === 'unlock') {
        if (!channelId) return res.status(400).json({ error: 'channelId required' });

        const channel = await guild.channels.fetch(channelId);
        await channel.permissionOverwrites.edit(
          guild.roles.everyone,
          { SendMessages: action === 'lock' ? false : null },
          { reason: `${action} via website API: ${reason || 'no reason given'}` }
        );

        return res.json({ ok: true, action, channelId });
      }

      if (action === 'lockdown-all') {
        const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText);
        let locked = 0;

        for (const [, channel] of textChannels) {
          try {
            await channel.permissionOverwrites.edit(
              guild.roles.everyone,
              { SendMessages: false },
              { reason: `Lockdown via website API: ${reason || 'no reason given'}` }
            );
            locked++;
          } catch {}
        }

        return res.json({ ok: true, action, locked, total: textChannels.size });
      }

      res.status(400).json({ error: 'action must be "lock", "unlock", or "lockdown-all"' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/kepler', requireApiKey, async (req, res) => {
    const { action, reason } = req.body || {};
    if (!defaultGuildId) return res.status(400).json({ error: 'no default guild configured on the bot' });

    try {
      const guild = await client.guilds.fetch(defaultGuildId);
      const state = await getBotState();

      if (action === 'activate') {
        if (state.kepler?.active) return res.status(409).json({ error: 'already active' });

        const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText);
        const lockedChannels = [];

        for (const [id, channel] of textChannels) {
          try {
            await channel.permissionOverwrites.edit(
              guild.roles.everyone,
              { SendMessages: false },
              { reason: `Kepler Protocol via website API: ${reason || 'no reason given'}` }
            );
            lockedChannels.push(id);
          } catch {}
        }

        state.kepler = {
          active: true,
          activatedBy: 'website-api',
          activatedAt: new Date(),
          reason: reason || 'Activated via website',
          lockedChannels
        };
        state.maintenance = {
          active: true,
          message: `Kepler Protocol active: ${reason || 'incident'}`,
          setBy: 'website-api',
          setAt: new Date()
        };
        await state.save();
        await client.user.setPresence({ activities: [{ name: 'Kepler Protocol — LOCKDOWN' }], status: 'dnd' });

        return res.json({ ok: true, locked: lockedChannels.length, total: textChannels.size });
      }

      if (action === 'deactivate') {
        if (!state.kepler?.active) return res.status(409).json({ error: 'not active' });

        let restored = 0;
        for (const id of state.kepler.lockedChannels || []) {
          try {
            const channel = await guild.channels.fetch(id);
            if (channel) {
              await channel.permissionOverwrites.edit(
                guild.roles.everyone,
                { SendMessages: null },
                { reason: 'Kepler Protocol deactivated via website API' }
              );
              restored++;
            }
          } catch {}
        }

        state.kepler = { active: false, activatedBy: null, activatedAt: null, reason: null, lockedChannels: [] };
        state.maintenance = { active: false, message: null, setBy: 'website-api', setAt: new Date() };
        await state.save();
        await client.user.setPresence({ activities: [{ name: 'SNS systems' }], status: 'online' });

        return res.json({ ok: true, restored });
      }

      res.status(400).json({ error: 'action must be "activate" or "deactivate"' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Used by the website's Discord OAuth flow to check guild membership + roles
  // after exchanging the OAuth code for an identity (see integration examples).
  app.get('/api/member/:discordId', requireApiKey, async (req, res) => {
    if (!defaultGuildId) return res.status(400).json({ error: 'no default guild configured on the bot' });

    try {
      const guild = await client.guilds.fetch(defaultGuildId);
      const member = await guild.members.fetch(req.params.discordId).catch(() => null);

      if (!member) return res.json({ inGuild: false });

      res.json({
        inGuild: true,
        username: member.user.username,
        tag: member.user.tag,
        roles: member.roles.cache.map((r) => ({ id: r.id, name: r.name })),
        joinedAt: member.joinedAt
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/healthz', (req, res) => res.status(200).send('ok'));

  const port = process.env.WEBHOOK_PORT || 3001;
  app.listen(port, () => console.log(`[server] webhooks + API listening on :${port}`));
}

module.exports = { startServer };
