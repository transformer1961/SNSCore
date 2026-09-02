const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { EventLog } = require('../lib/db');
const { isAdmin } = require('../lib/permissions');

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('inquiries')
      .setDescription('Show recent website contact-form inquiries')
      .addIntegerOption(opt =>
        opt.setName('count').setDescription('How many to show (default 5)').setMinValue(1).setMaxValue(20)
      ),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      const count = interaction.options.getInteger('count') || 5;

      try {
        const events = await EventLog.find({ type: 'inquiry' }).sort({ createdAt: -1 }).limit(count);

        if (!events.length) {
          return interaction.reply({ content: 'No inquiries logged yet.', flags: MessageFlags.Ephemeral });
        }

        const lines = events.map(e => {
          const name = e.payload?.name || 'Unknown';
          const email = e.payload?.email || 'n/a';
          const when = e.createdAt.toISOString();
          return `**${name}** (${email}) — ${when}`;
        });

        const embed = new EmbedBuilder()
          .setTitle(`Last ${events.length} Inquiries`)
          .setDescription(lines.join('\n'))
          .setColor(0x9b59b6);

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch (err) {
        await interaction.reply({ content: `Could not fetch inquiries — check the database connection: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  }
];

module.exports = { commands };
