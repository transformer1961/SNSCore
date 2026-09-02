const { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags } = require('discord.js');
const { isAdmin } = require('../lib/permissions');
const { getBotState } = require('../lib/db');

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
  }
];

module.exports = { commands };
