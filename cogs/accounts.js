// NOTE: field/collection names default to common conventions but are configurable
// via .env because this bot doesn't have direct visibility into SNS-web's exact
// Mongoose schema. Verify USERS_COLLECTION / USER_EMAIL_FIELD / USER_PASSWORD_FIELD
// against your actual user model before running /account-reset on a real account —
// test against a throwaway account first if possible.

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { isAdmin } = require('../lib/permissions');

const EMAIL_FIELD = process.env.USER_EMAIL_FIELD || 'email';
const PASSWORD_FIELD = process.env.USER_PASSWORD_FIELD || 'password';

function usersCollection() {
  const name = process.env.USERS_COLLECTION || 'users';
  return mongoose.connection.db.collection(name);
}

function dbReady() {
  return mongoose.connection.readyState === 1;
}

function generateTempPassword() {
  return crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('account-lookup')
      .setDescription('Look up an SNS-web account by email')
      .addStringOption(opt => opt.setName('email').setDescription('Account email').setRequired(true)),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      if (!dbReady()) {
        return interaction.reply({ content: 'Database not connected — check `MONGODB_URI`.', flags: MessageFlags.Ephemeral });
      }

      const email = interaction.options.getString('email').toLowerCase().trim();

      try {
        const user = await usersCollection().findOne({ [EMAIL_FIELD]: email });

        if (!user) {
          return interaction.reply({ content: `No account found for \`${email}\`.`, flags: MessageFlags.Ephemeral });
        }

        const embed = new EmbedBuilder()
          .setTitle('Account Lookup')
          .addFields(
            { name: 'Email', value: String(user[EMAIL_FIELD] || 'n/a'), inline: true },
            { name: 'ID', value: String(user._id), inline: true },
            { name: 'Role', value: String(user.role || 'n/a'), inline: true },
            { name: 'Created', value: user.createdAt ? new Date(user.createdAt).toISOString() : 'n/a', inline: true }
          )
          .setColor(0x3498db)
          .setFooter({ text: 'Password hash is never displayed.' });

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch (err) {
        await interaction.reply({ content: `Lookup failed: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('account-reset')
      .setDescription('Reset an SNS-web account password to a temporary one')
      .addStringOption(opt => opt.setName('email').setDescription('Account email').setRequired(true)),
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      }

      if (!dbReady()) {
        return interaction.reply({ content: 'Database not connected — check `MONGODB_URI`.', flags: MessageFlags.Ephemeral });
      }

      const email = interaction.options.getString('email').toLowerCase().trim();

      try {
        const col = usersCollection();
        const user = await col.findOne({ [EMAIL_FIELD]: email });

        if (!user) {
          return interaction.reply({ content: `No account found for \`${email}\`.`, flags: MessageFlags.Ephemeral });
        }

        const tempPassword = generateTempPassword();
        const hash = await bcrypt.hash(tempPassword, 10);

        await col.updateOne({ _id: user._id }, { $set: { [PASSWORD_FIELD]: hash, mustChangePassword: true } });

        const embed = new EmbedBuilder()
          .setTitle('🔑 Password Reset')
          .setDescription(
            `Temporary password generated for \`${email}\`.\n\n` +
            `**Send this to the user securely — it will not be shown again:**\n\`${tempPassword}\``
          )
          .setColor(0xf1c40f)
          .setFooter({ text: `Reset by ${interaction.user.tag}` });

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch (err) {
        await interaction.reply({ content: `Reset failed: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  }
];

module.exports = { commands };
