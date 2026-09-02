const { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags } = require('discord.js');
const { isAdmin } = require('../lib/permissions');

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('announce')
      .setDescription('Post a formatted announcement to a channel')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('Channel to post in').addChannelTypes(ChannelType.GuildText).setRequired(true)
      )
      .addStringOption(opt => opt.setName('title').setDescription('Announcement title').setRequired(true))
      .addStringOption(opt => opt.setName('message').setDescription('Announcement body').setRequired(true))
      .addStringOption(opt => opt.setName('color').setDescription('Hex color, e.g. #22e6d0')),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      const channel = interaction.options.getChannel('channel');
      const title = interaction.options.getString('title');
      const message = interaction.options.getString('message');
      const colorInput = interaction.options.getString('color');

      let color = 0x22e6d0;
      if (colorInput && /^#?[0-9a-fA-F]{6}$/.test(colorInput)) {
        color = parseInt(colorInput.replace('#', ''), 16);
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(message)
        .setColor(color)
        .setFooter({ text: `Posted by ${interaction.user.tag}` })
        .setTimestamp();

      try {
        await channel.send({ embeds: [embed] });
        await interaction.reply({ content: `Announcement posted in ${channel}.`, flags: MessageFlags.Ephemeral });
      } catch (err) {
        await interaction.reply({ content: `Failed to post: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  }
];

module.exports = { commands };
