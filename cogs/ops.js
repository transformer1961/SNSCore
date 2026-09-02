const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { EventLog } = require('../lib/db');

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('status')
      .setDescription('Bot and process uptime'),
    async execute(interaction) {
      const uptimeSec = Math.floor(process.uptime());
      const h = Math.floor(uptimeSec / 3600);
      const m = Math.floor((uptimeSec % 3600) / 60);
      const s = uptimeSec % 60;

      const embed = new EmbedBuilder()
        .setTitle('SNS Core Status')
        .addFields(
          { name: 'Uptime', value: `${h}h ${m}m ${s}s`, inline: true },
          { name: 'Ping', value: `${interaction.client.ws.ping}ms`, inline: true }
        )
        .setColor(0x2ecc71)
        .setTimestamp(new Date());

      await interaction.reply({ embeds: [embed] });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('deploys')
      .setDescription('Show recent deploy events')
      .addIntegerOption(opt =>
        opt.setName('count').setDescription('How many to show (default 5)').setMinValue(1).setMaxValue(20)
      ),
    async execute(interaction) {
      const count = interaction.options.getInteger('count') || 5;

      const events = await EventLog.find({ type: 'deploy' }).sort({ createdAt: -1 }).limit(count);

      if (!events.length) {
        return interaction.reply({ content: 'No deploy events logged yet.', flags: MessageFlags.Ephemeral });
      }

      const lines = events.map(e => {
        const state = e.payload?.state || 'unknown';
        const name = e.payload?.name || 'unknown site';
        const when = e.createdAt.toISOString();
        return `**${name}** — ${state} — ${when}`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`Last ${events.length} Deploys`)
        .setDescription(lines.join('\n'))
        .setColor(0x3498db);

      await interaction.reply({ embeds: [embed] });
    }
  }
];

module.exports = { commands };
