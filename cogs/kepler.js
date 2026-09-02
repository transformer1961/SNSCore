const { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags } = require('discord.js');
const { isAdmin } = require('../lib/permissions');
const { getBotState } = require('../lib/db');

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('kepler-protocol')
      .setDescription('Full incident lockdown — locks every text channel and enables maintenance mode')
      .addSubcommand(sub =>
        sub.setName('activate')
          .setDescription('Activate Kepler Protocol')
          .addStringOption(opt => opt.setName('reason').setDescription('Reason for activation').setRequired(true))
          .addStringOption(opt => opt.setName('confirm').setDescription('Type CONFIRM exactly to proceed').setRequired(true))
      )
      .addSubcommand(sub => sub.setName('deactivate').setDescription('Deactivate Kepler Protocol and restore locked channels'))
      .addSubcommand(sub => sub.setName('status').setDescription('Check whether Kepler Protocol is active')),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();

      if (sub === 'status') {
        let state;
        try {
          state = await getBotState();
        } catch {
          return interaction.reply({ content: 'Could not reach the database.', flags: MessageFlags.Ephemeral });
        }

        const embed = new EmbedBuilder()
          .setTitle('Kepler Protocol Status')
          .setDescription(
            state.kepler?.active
              ? `🔴 **ACTIVE** — ${state.kepler.reason}\nActivated by ${state.kepler.activatedBy} at ${state.kepler.activatedAt?.toISOString()}\nChannels locked: ${state.kepler.lockedChannels?.length || 0}`
              : '🟢 Inactive'
          )
          .setColor(state.kepler?.active ? 0xe74c3c : 0x2ecc71);

        return interaction.reply({ embeds: [embed] });
      }

      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      let state;
      try {
        state = await getBotState();
      } catch {
        return interaction.reply({
          content: 'Could not reach the database — Kepler Protocol requires DB access to track locked channels.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (sub === 'activate') {
        const confirm = interaction.options.getString('confirm');
        if (confirm !== 'CONFIRM') {
          return interaction.reply({
            content: 'Aborted. Type `CONFIRM` exactly in the confirm field to activate Kepler Protocol.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (state.kepler?.active) {
          return interaction.reply({ content: 'Kepler Protocol is already active.', flags: MessageFlags.Ephemeral });
        }

        const reason = interaction.options.getString('reason');
        await interaction.deferReply();

        const textChannels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
        const lockedChannels = [];

        for (const [id, channel] of textChannels) {
          try {
            await channel.permissionOverwrites.edit(
              interaction.guild.roles.everyone,
              { SendMessages: false },
              { reason: `Kepler Protocol activated by ${interaction.user.tag}: ${reason}` }
            );
            lockedChannels.push(id);
          } catch {
            // skip channels the bot lacks permission on
          }
        }

        state.kepler = {
          active: true,
          activatedBy: interaction.user.tag,
          activatedAt: new Date(),
          reason,
          lockedChannels
        };
        state.maintenance = {
          active: true,
          message: `Kepler Protocol active: ${reason}`,
          setBy: interaction.user.tag,
          setAt: new Date()
        };
        await state.save();

        await interaction.client.user.setPresence({
          activities: [{ name: 'Kepler Protocol — LOCKDOWN' }],
          status: 'dnd'
        });

        const embed = new EmbedBuilder()
          .setTitle('🔴 KEPLER PROTOCOL ACTIVATED')
          .setDescription(
            `Locked ${lockedChannels.length}/${textChannels.size} channels.\nMaintenance mode enabled.\n**Reason:** ${reason}`
          )
          .setColor(0xe74c3c)
          .setFooter({ text: `Activated by ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'deactivate') {
        if (!state.kepler?.active) {
          return interaction.reply({ content: 'Kepler Protocol is not currently active.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply();

        let restored = 0;
        for (const id of state.kepler.lockedChannels || []) {
          try {
            const channel = await interaction.guild.channels.fetch(id);
            if (channel) {
              await channel.permissionOverwrites.edit(
                interaction.guild.roles.everyone,
                { SendMessages: null },
                { reason: `Kepler Protocol deactivated by ${interaction.user.tag}` }
              );
              restored++;
            }
          } catch {
            // channel may have been deleted since lockdown; skip
          }
        }

        state.kepler = { active: false, activatedBy: null, activatedAt: null, reason: null, lockedChannels: [] };
        state.maintenance = { active: false, message: null, setBy: interaction.user.tag, setAt: new Date() };
        await state.save();

        await interaction.client.user.setPresence({
          activities: [{ name: 'SNS systems' }],
          status: 'online'
        });

        const embed = new EmbedBuilder()
          .setTitle('🟢 Kepler Protocol Deactivated')
          .setDescription(`Restored ${restored} channel(s). Maintenance mode disabled.`)
          .setColor(0x2ecc71)
          .setFooter({ text: `Deactivated by ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }
    }
  }
];

module.exports = { commands };
