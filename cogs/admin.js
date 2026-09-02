const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isAdmin } = require('../lib/permissions');

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('addrole')
      .setDescription('Add a role to a member')
      .addUserOption(opt => opt.setName('member').setDescription('Member to update').setRequired(true))
      .addRoleOption(opt => opt.setName('role').setDescription('Role to add').setRequired(true)),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      const member = interaction.options.getMember('member');
      const role = interaction.options.getRole('role');

      try {
        await member.roles.add(role);
        await interaction.reply({ content: `Added **${role.name}** to ${member.user.tag}.`, flags: MessageFlags.Ephemeral });
      } catch (err) {
        await interaction.reply({ content: `Failed to add role: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('removerole')
      .setDescription('Remove a role from a member')
      .addUserOption(opt => opt.setName('member').setDescription('Member to update').setRequired(true))
      .addRoleOption(opt => opt.setName('role').setDescription('Role to remove').setRequired(true)),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      const member = interaction.options.getMember('member');
      const role = interaction.options.getRole('role');

      try {
        await member.roles.remove(role);
        await interaction.reply({ content: `Removed **${role.name}** from ${member.user.tag}.`, flags: MessageFlags.Ephemeral });
      } catch (err) {
        await interaction.reply({ content: `Failed to remove role: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  }
];

module.exports = { commands };
