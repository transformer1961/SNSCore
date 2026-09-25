const { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags } = require('discord.js');
const { isAdmin } = require('../lib/permissions');
const { connectDB, getBotState, Incident } = require('../lib/db');
const { buildIncidentSummary, isValidTransition, normalizeIncidentState } = require('../lib/incidentLifecycle');

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('lockdown')
      .setDescription('Lock a channel (blocks @everyone from sending messages)')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('Channel to lock (default: current)').addChannelTypes(ChannelType.GuildText)
      )
      .addStringOption(opt => opt.setName('reason').setDescription('Reason for lockdown')),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const reason = interaction.options.getString('reason') || 'No reason provided';

      try {
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          { SendMessages: false },
          { reason: `Lockdown by ${interaction.user.tag}: ${reason}` }
        );

        const embed = new EmbedBuilder()
          .setTitle('🔒 Channel Locked')
          .setDescription(`${channel} has been locked.\n**Reason:** ${reason}`)
          .setColor(0xe74c3c)
          .setFooter({ text: `Locked by ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } catch (err) {
        await interaction.reply({ content: `Failed to lock channel: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('unlock')
      .setDescription('Unlock a previously locked channel')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('Channel to unlock (default: current)').addChannelTypes(ChannelType.GuildText)
      ),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      const channel = interaction.options.getChannel('channel') || interaction.channel;

      try {
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          { SendMessages: null },
          { reason: `Unlock by ${interaction.user.tag}` }
        );

        const embed = new EmbedBuilder()
          .setTitle('🔓 Channel Unlocked')
          .setDescription(`${channel} has been unlocked.`)
          .setColor(0x2ecc71)
          .setFooter({ text: `Unlocked by ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } catch (err) {
        await interaction.reply({ content: `Failed to unlock channel: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('lockdown-all')
      .setDescription('Lock ALL text channels in the server — use with caution')
      .addStringOption(opt => opt.setName('reason').setDescription('Reason for server-wide lockdown').setRequired(true))
      .addStringOption(opt => opt.setName('confirm').setDescription('Type CONFIRM exactly to proceed').setRequired(true)),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      const confirm = interaction.options.getString('confirm');
      if (confirm !== 'CONFIRM') {
        return interaction.reply({
          content: 'Aborted. Type `CONFIRM` exactly in the confirm field to proceed with a server-wide lockdown.',
          flags: MessageFlags.Ephemeral
        });
      }

      const reason = interaction.options.getString('reason');
      await interaction.deferReply();

      const textChannels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
      let locked = 0;

      for (const [, channel] of textChannels) {
        try {
          await channel.permissionOverwrites.edit(
            interaction.guild.roles.everyone,
            { SendMessages: false },
            { reason: `Server lockdown by ${interaction.user.tag}: ${reason}` }
          );
          locked++;
        } catch {
          // skip channels the bot lacks permission on, keep going
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('🚨 Server-Wide Lockdown')
        .setDescription(`Locked ${locked}/${textChannels.size} text channels.\n**Reason:** ${reason}`)
        .setColor(0xe74c3c)
        .setFooter({ text: `Initiated by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('maintenance')
      .setDescription('Manage maintenance mode status')
      .addSubcommand(sub =>
        sub.setName('on')
          .setDescription('Enable maintenance mode')
          .addStringOption(opt => opt.setName('message').setDescription('Status message to display'))
      )
      .addSubcommand(sub => sub.setName('off').setDescription('Disable maintenance mode'))
      .addSubcommand(sub => sub.setName('status').setDescription('Check current maintenance status')),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();

      if (sub === 'status') {
        let state;
        try {
          state = await getBotState();
        } catch (err) {
          return interaction.reply({
            content: 'Could not reach the database — check `MONGODB_URI` in the bot\'s `.env`.',
            flags: MessageFlags.Ephemeral
          });
        }

        const embed = new EmbedBuilder()
          .setTitle('Maintenance Status')
          .setDescription(
            state.maintenance?.active
              ? `🟠 **Active** — ${state.maintenance.message || 'no message set'}\nSet by ${state.maintenance.setBy} at ${state.maintenance.setAt?.toISOString()}`
              : '🟢 Not in maintenance'
          )
          .setColor(state.maintenance?.active ? 0xf1c40f : 0x2ecc71);

        return interaction.reply({ embeds: [embed] });
      }

      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      let state;
      try {
        state = await getBotState();
      } catch (err) {
        return interaction.reply({
          content: 'Could not reach the database — check `MONGODB_URI` in the bot\'s `.env`.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (sub === 'on') {
        const message = interaction.options.getString('message') || 'Scheduled maintenance in progress';
        state.maintenance = { active: true, message, setBy: interaction.user.tag, setAt: new Date() };
        await state.save();

        await interaction.client.user.setPresence({
          activities: [{ name: 'maintenance mode' }],
          status: 'dnd'
        });

        const embed = new EmbedBuilder()
          .setTitle('🟠 Maintenance Mode Enabled')
          .setDescription(message)
          .setColor(0xf1c40f)
          .setFooter({ text: `Set by ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }

      if (sub === 'off') {
        state.maintenance = { active: false, message: null, setBy: interaction.user.tag, setAt: new Date() };
        await state.save();

        await interaction.client.user.setPresence({
          activities: [{ name: 'SNS systems' }],
          status: 'online'
        });

        const embed = new EmbedBuilder()
          .setTitle('🟢 Maintenance Mode Disabled')
          .setColor(0x2ecc71)
          .setFooter({ text: `Cleared by ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('alerts-mute')
      .setDescription('Temporarily silence deploy/security webhook alerts')
      .addIntegerOption(opt =>
        opt.setName('minutes').setDescription('Minutes to mute for (default 60)').setMinValue(1).setMaxValue(1440)
      ),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      const minutes = interaction.options.getInteger('minutes') || 60;
      const until = new Date(Date.now() + minutes * 60000);

      let state;
      try {
        state = await getBotState();
        state.alertsMuted = { active: true, until, mutedBy: interaction.user.tag };
        await state.save();
      } catch (err) {
        return interaction.reply({
          content: 'Could not reach the database — check `MONGODB_URI` in the bot\'s `.env`.',
          flags: MessageFlags.Ephemeral
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('🔕 Alerts Muted')
        .setDescription(`Deploy and security alerts are muted until <t:${Math.floor(until.getTime() / 1000)}:t>.`)
        .setColor(0x95a5a6)
        .setFooter({ text: `Muted by ${interaction.user.tag}` });

      await interaction.reply({ embeds: [embed] });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('alerts-unmute')
      .setDescription('Re-enable deploy/security webhook alerts'),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      let state;
      try {
        state = await getBotState();
        state.alertsMuted = { active: false, until: null, mutedBy: interaction.user.tag };
        await state.save();
      } catch (err) {
        return interaction.reply({
          content: 'Could not reach the database — check `MONGODB_URI` in the bot\'s `.env`.',
          flags: MessageFlags.Ephemeral
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('🔔 Alerts Unmuted')
        .setColor(0x2ecc71)
        .setFooter({ text: `Unmuted by ${interaction.user.tag}` });

      await interaction.reply({ embeds: [embed] });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('incident')
      .setDescription('Create and manage SNS incidents')
      .addSubcommand(sub =>
        sub.setName('create')
          .setDescription('Create a new incident')
          .addStringOption(opt => opt.setName('title').setDescription('Short incident title').setRequired(true))
          .addStringOption(opt => opt.setName('severity').setDescription('Severity').addChoices(
            { name: 'Low', value: 'low' },
            { name: 'Medium', value: 'medium' },
            { name: 'High', value: 'high' },
            { name: 'Critical', value: 'critical' }
          ))
          .addStringOption(opt => opt.setName('reason').setDescription('Reason for the incident').setRequired(true))
          .addStringOption(opt => opt.setName('owner').setDescription('Assigned owner'))
      )
      .addSubcommand(sub =>
        sub.setName('status')
          .setDescription('Show an incident status')
          .addStringOption(opt => opt.setName('id').setDescription('Incident ID').setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName('assign')
          .setDescription('Assign an incident to an owner')
          .addStringOption(opt => opt.setName('id').setDescription('Incident ID').setRequired(true))
          .addStringOption(opt => opt.setName('owner').setDescription('New owner').setRequired(true))
          .addStringOption(opt => opt.setName('note').setDescription('Assignment note'))
      )
      .addSubcommand(sub =>
        sub.setName('resolve')
          .setDescription('Resolve an incident')
          .addStringOption(opt => opt.setName('id').setDescription('Incident ID').setRequired(true))
          .addStringOption(opt => opt.setName('resolution').setDescription('Resolution summary').setRequired(true))
      ),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      const subcommand = interaction.options.getSubcommand();
      const actor = interaction.user.tag;
      const guildId = interaction.guildId || 'unknown';

      try {
        await connectDB();
      } catch (err) {
        return interaction.reply({
          content: 'Could not reach the database — check `MONGODB_URI` in the bot\'s `.env`.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (subcommand === 'create') {
        const title = interaction.options.getString('title');
        const severity = interaction.options.getString('severity') || 'medium';
        const reason = interaction.options.getString('reason');
        const owner = interaction.options.getString('owner') || interaction.user.tag;

        const incidentId = `INC-${Date.now().toString(36).toUpperCase()}`;
        const incident = await Incident.create({
          incidentId,
          title,
          severity,
          status: 'open',
          owner,
          guildId,
          reason,
          createdBy: actor,
          timeline: [{ actor, action: 'created', note: reason }],
        });

        const summary = buildIncidentSummary({
          id: incident.incidentId,
          title: incident.title,
          severity: incident.severity,
          status: incident.status,
          owner: incident.owner,
          guildId: incident.guildId,
          reason: incident.reason,
        });

        const embed = new EmbedBuilder()
          .setTitle('🚨 Incident Created')
          .setDescription(`**ID:** ${summary.id}\n**Title:** ${summary.title}\n**Severity:** ${summary.severity}\n**Owner:** ${summary.owner}`)
          .addFields(
            { name: 'Reason', value: summary.reason || 'No reason provided', inline: false },
            { name: 'Guild', value: summary.guildId || 'unknown', inline: true },
            { name: 'Status', value: summary.status, inline: true }
          )
          .setColor(0xe74c3c)
          .setFooter({ text: `Created by ${actor}` })
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      if (subcommand === 'status') {
        const incidentId = interaction.options.getString('id');
        const incident = await Incident.findOne({ incidentId });

        if (!incident) {
          return interaction.reply({ content: `Incident ${incidentId} was not found.`, flags: MessageFlags.Ephemeral });
        }

        const summary = buildIncidentSummary({
          id: incident.incidentId,
          title: incident.title,
          severity: incident.severity,
          status: incident.status,
          owner: incident.owner,
          guildId: incident.guildId,
          reason: incident.reason,
        });

        const embed = new EmbedBuilder()
          .setTitle(`Incident ${summary.id}`)
          .setDescription(summary.title)
          .addFields(
            { name: 'Status', value: normalizeIncidentState(summary.status), inline: true },
            { name: 'Severity', value: summary.severity, inline: true },
            { name: 'Owner', value: summary.owner || 'unassigned', inline: true },
            { name: 'Reason', value: summary.reason || 'No reason provided', inline: false },
            { name: 'Guild', value: summary.guildId || 'unknown', inline: true }
          )
          .setColor(summary.severity === 'critical' ? 0x8e44ad : summary.severity === 'high' ? 0xe67e22 : 0x3498db)
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      if (subcommand === 'assign') {
        const incidentId = interaction.options.getString('id');
        const owner = interaction.options.getString('owner');
        const note = interaction.options.getString('note') || 'Assigned by operator';

        const incident = await Incident.findOne({ incidentId });
        if (!incident) {
          return interaction.reply({ content: `Incident ${incidentId} was not found.`, flags: MessageFlags.Ephemeral });
        }

        const targetStatus = incident.status === 'open' ? 'assigned' : incident.status;
        if (incident.status !== targetStatus && !isValidTransition(incident.status, targetStatus)) {
          return interaction.reply({
            content: `Incident ${incidentId} cannot be assigned from ${incident.status} to ${targetStatus}.`,
            flags: MessageFlags.Ephemeral
          });
        }

        incident.owner = owner;
        incident.status = targetStatus;
        incident.updatedAt = new Date();
        incident.timeline.push({ actor, action: 'assigned', note });
        await incident.save();

        return interaction.reply({
          content: `Incident ${incidentId} assigned to ${owner}.`,
          embeds: [
            new EmbedBuilder()
              .setTitle('📌 Incident Assigned')
              .setDescription(`**ID:** ${incident.incidentId}\n**Owner:** ${owner}\n**Status:** ${incident.status}`)
              .setColor(0x3498db)
              .setTimestamp()
          ]
        });
      }

      if (subcommand === 'resolve') {
        const incidentId = interaction.options.getString('id');
        const resolution = interaction.options.getString('resolution');

        const incident = await Incident.findOne({ incidentId });
        if (!incident) {
          return interaction.reply({ content: `Incident ${incidentId} was not found.`, flags: MessageFlags.Ephemeral });
        }

        if (!isValidTransition(incident.status, 'resolved')) {
          return interaction.reply({
            content: `Incident ${incidentId} cannot be resolved while it is ${incident.status}.`,
            flags: MessageFlags.Ephemeral
          });
        }

        incident.status = 'resolved';
        incident.resolution = resolution;
        incident.updatedAt = new Date();
        incident.timeline.push({ actor, action: 'resolved', note: resolution });
        await incident.save();

        return interaction.reply({
          content: `Incident ${incidentId} marked as resolved.`,
          embeds: [
            new EmbedBuilder()
              .setTitle('✅ Incident Resolved')
              .setDescription(`**ID:** ${incident.incidentId}\n**Resolution:** ${resolution}`)
              .setColor(0x2ecc71)
              .setTimestamp()
          ]
        });
      }

      return interaction.reply({ content: 'Unsupported incident action.', flags: MessageFlags.Ephemeral });
    }
  }
];

module.exports = { commands };
