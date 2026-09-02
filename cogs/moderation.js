const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { isAdmin } = require('../lib/permissions');
const { Warning } = require('../lib/db');

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick a member')
      .addUserOption(opt => opt.setName('member').setDescription('Member to kick').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason')),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      const member = interaction.options.getMember('member');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      if (!member || !member.kickable) {
        return interaction.reply({ content: 'I cannot kick this member (role hierarchy or missing permission).', flags: MessageFlags.Ephemeral });
      }

      try {
        await member.kick(reason);

        const embed = new EmbedBuilder()
          .setTitle('👢 Member Kicked')
          .setDescription(`${member.user.tag} was kicked.\n**Reason:** ${reason}`)
          .setColor(0xe67e22)
          .setFooter({ text: `By ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } catch (err) {
        await interaction.reply({ content: `Failed to kick: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban a member')
      .addUserOption(opt => opt.setName('member').setDescription('Member to ban').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason'))
      .addIntegerOption(opt =>
        opt.setName('delete_days').setDescription('Days of their messages to delete (0-7)').setMinValue(0).setMaxValue(7)
      ),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      const user = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const deleteDays = interaction.options.getInteger('delete_days') || 0;

      try {
        await interaction.guild.members.ban(user, { reason, deleteMessageSeconds: deleteDays * 86400 });

        const embed = new EmbedBuilder()
          .setTitle('🔨 Member Banned')
          .setDescription(`${user.tag} was banned.\n**Reason:** ${reason}`)
          .setColor(0xe74c3c)
          .setFooter({ text: `By ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } catch (err) {
        await interaction.reply({ content: `Failed to ban: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('timeout')
      .setDescription('Timeout (mute) a member')
      .addUserOption(opt => opt.setName('member').setDescription('Member to timeout').setRequired(true))
      .addIntegerOption(opt =>
        opt.setName('minutes').setDescription('Duration in minutes (max 28 days)').setRequired(true).setMinValue(1).setMaxValue(40320)
      )
      .addStringOption(opt => opt.setName('reason').setDescription('Reason')),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      const member = interaction.options.getMember('member');
      const minutes = interaction.options.getInteger('minutes');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      if (!member) {
        return interaction.reply({ content: 'Member not found in this server.', flags: MessageFlags.Ephemeral });
      }

      try {
        await member.timeout(minutes * 60 * 1000, reason);

        const embed = new EmbedBuilder()
          .setTitle('🔇 Member Timed Out')
          .setDescription(`${member.user.tag} timed out for ${minutes} minute(s).\n**Reason:** ${reason}`)
          .setColor(0xf39c12)
          .setFooter({ text: `By ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } catch (err) {
        await interaction.reply({ content: `Failed to timeout: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Log a warning against a member')
      .addUserOption(opt => opt.setName('member').setDescription('Member to warn').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(true)),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      const user = interaction.options.getUser('member');
      const reason = interaction.options.getString('reason');

      try {
        await Warning.create({
          guildId: interaction.guild.id,
          userId: user.id,
          userTag: user.tag,
          reason,
          moderator: interaction.user.tag
        });

        const embed = new EmbedBuilder()
          .setTitle('⚠️ Member Warned')
          .setDescription(`${user.tag} was warned.\n**Reason:** ${reason}`)
          .setColor(0xf1c40f)
          .setFooter({ text: `By ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } catch (err) {
        await interaction.reply({ content: `Could not log warning — check the database connection: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('warnings')
      .setDescription("View a member's warning history")
      .addUserOption(opt => opt.setName('member').setDescription('Member to check').setRequired(true)),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      const user = interaction.options.getUser('member');

      try {
        const warnings = await Warning.find({ guildId: interaction.guild.id, userId: user.id })
          .sort({ createdAt: -1 })
          .limit(10);

        if (!warnings.length) {
          return interaction.reply({ content: `${user.tag} has no warnings on record.`, flags: MessageFlags.Ephemeral });
        }

        const lines = warnings.map(w => `**${w.createdAt.toISOString()}** — ${w.reason} _(by ${w.moderator})_`);

        const embed = new EmbedBuilder()
          .setTitle(`Warnings for ${user.tag}`)
          .setDescription(lines.join('\n'))
          .setColor(0xf1c40f);

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch (err) {
        await interaction.reply({ content: `Could not fetch warnings — check the database connection: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('purge')
      .setDescription('Bulk delete recent messages in this channel')
      .addIntegerOption(opt =>
        opt.setName('count').setDescription('Number of messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)
      ),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      const count = interaction.options.getInteger('count');

      try {
        const deleted = await interaction.channel.bulkDelete(count, true);
        await interaction.reply({
          content: `Deleted ${deleted.size} message(s). Note: Discord won't bulk-delete messages older than 14 days.`,
          flags: MessageFlags.Ephemeral
        });
      } catch (err) {
        await interaction.reply({ content: `Purge failed: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  }
];

module.exports = { commands };
