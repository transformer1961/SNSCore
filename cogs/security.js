const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { EventLog } = require('../lib/db');

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('alerts')
      .setDescription('Show recent security events (Arcjet)')
      .addIntegerOption(opt =>
        opt.setName('count').setDescription('How many to show (default 5)').setMinValue(1).setMaxValue(20)
      ),
    async execute(interaction) {
      const count = interaction.options.getInteger('count') || 5;

      const events = await EventLog.find({ type: 'security' }).sort({ createdAt: -1 }).limit(count);

      if (!events.length) {
        return interaction.reply({ content: 'No security events logged yet.', flags: MessageFlags.Ephemeral });
      }

      const lines = events.map(e => {
        const rule = e.payload?.rule || 'unknown rule';
        const decision = e.payload?.decision || 'unknown';
        const ip = e.payload?.ip || 'n/a';
        const when = e.createdAt.toISOString();
        return `**${rule}** — ${decision} — ${ip} — ${when}`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`Last ${events.length} Security Events`)
        .setDescription(lines.join('\n'))
        .setColor(0xe67e22);

      await interaction.reply({ embeds: [embed] });
    }
  }
];

module.exports = { commands };
