const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('site-status')
      .setDescription('Check if the SNS-web site is up'),
    async execute(interaction) {
      const url = process.env.SITE_URL;
      if (!url) {
        return interaction.reply({ content: 'Set `SITE_URL` in the bot\'s `.env` first.', flags: MessageFlags.Ephemeral });
      }

      await interaction.deferReply();

      const start = Date.now();
      try {
        const res = await fetch(url, { method: 'GET', redirect: 'follow' });
        const ms = Date.now() - start;

        const embed = new EmbedBuilder()
          .setTitle(res.ok ? '🟢 Site Up' : '🟠 Site Responded With Error')
          .setDescription(`\`${url}\`\nStatus: **${res.status}**\nResponse time: **${ms}ms**`)
          .setColor(res.ok ? 0x2ecc71 : 0xe67e22)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        const embed = new EmbedBuilder()
          .setTitle('🔴 Site Unreachable')
          .setDescription(`\`${url}\`\nError: ${err.message}`)
          .setColor(0xe74c3c)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }
    }
  }
];

module.exports = { commands };
