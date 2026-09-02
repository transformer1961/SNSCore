const { PermissionFlagsBits } = require('discord.js');

function isAdmin(interaction) {
  const allowedRoles = (process.env.ADMIN_ROLE_IDS || '').split(',').map(r => r.trim()).filter(Boolean);
  if (!allowedRoles.length) return interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  return interaction.member.roles.cache.some(r => allowedRoles.includes(r.id));
}

module.exports = { isAdmin };
