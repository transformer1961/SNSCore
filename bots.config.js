// Each entry is one Discord bot application/token running from this codebase.
// The "primary" bot owns the DB connection lifecycle, the webhook receiver, and the REST API.
// Only one bot should be marked primary: true.
//
// To add another bot:
//   1. Create a new Discord application + bot user in the Discord Developer Portal.
//   2. Add its token/client ID/guild ID to .env under new variable names.
//   3. Add an entry below pointing at those variable names and listing which cogs it should load.
//   4. Run `node deploy-commands.js` again to register its slash commands.
//
// A bot with no `cogs` still logs in and can be extended later — useful if you want it running
// but idle for now.

module.exports = [
  {
    id: 'core',
    name: 'SNS Core',
    enabled: true,
    tokenEnv: 'DISCORD_TOKEN',
    snsBotIdEnv: 'SNS_CORE_BOT_ID',
    snsBotTokenEnv: 'SNS_CORE_BOT_TOKEN',
    clientIdEnv: 'DISCORD_CLIENT_ID',
    guildIdEnv: 'DISCORD_GUILD_ID',
    cogs: [
      'ops',
      'security',
      'admin',
      'incident',
      'moderation',
      'accounts',
      'site',
      'announce',
      'inquiries',
      'kepler'
    ],
    primary: true
  },

  {
  id: 'tunes',
  name: 'SNS Tunes',
  enabled: true,
  tokenEnv: 'TUNES_DISCORD_TOKEN',
  snsBotIdEnv: 'SNS_TUNES_BOT_ID',
  snsBotTokenEnv: 'SNS_TUNES_BOT_TOKEN',
  clientIdEnv: 'TUNES_DISCORD_CLIENT_ID',
  guildIdEnv: 'TUNES_DISCORD_GUILD_ID',
  cogs: [],
  primary: false
}
];
