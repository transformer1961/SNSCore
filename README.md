# SNS Core

Admin/ops Discord bot for Sentinel Network Systems, with a multi-bot loader and a REST API for integrating with SNS-web.

## Setup

```bash
npm install
cp .env.example .env
# fill in .env
node deploy-commands.js   # registers slash commands for every configured bot
npm start
```

## Running multiple bots from one codebase

`bots.config.js` lists every bot this process runs. The primary bot (`SNS Core`) owns the database connection, the webhook receiver, and the REST API — everything else is just Discord command handling.

To add another bot:
1. Create a new application + bot user in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Add its token, client ID, and (optionally) guild ID to `.env` under new variable names, e.g. `TUNES_DISCORD_TOKEN`.
3. Add an entry to `bots.config.js` pointing at those variable names, with a `cogs` list (can be empty to start).
4. Run `node deploy-commands.js` again — it loops over every configured bot and registers each one's commands separately, since each has its own Discord application.
5. `npm start` logs all configured bots in.

A bot without a token set in `.env` is skipped at startup with a warning, so partially-configured entries in `bots.config.js` don't crash the process.

## Commands

**Ops**
- `/status` — bot uptime + ping
- `/deploys [count]` — recent Netlify deploy events
- `/alerts [count]` — recent Arcjet security events
- `/site-status` — ping the live site, report status code + response time (needs `SITE_URL`)

**Website integration**
- `/inquiries [count]` — recent contact-form leads (needs `INQUIRIES_CHANNEL_ID` webhook wired up)
- `/account-lookup <email>` — look up an SNS-web account (no password shown)
- `/account-reset <email>` — generate + hash a temporary password, reply is ephemeral so only you see it. **Field names are configurable — verify `USERS_COLLECTION`/`USER_EMAIL_FIELD`/`USER_PASSWORD_FIELD` against your real schema first.**

**Moderation**
- `/kick @member [reason]`
- `/ban @member [reason] [delete_days]`
- `/timeout @member minutes [reason]`
- `/warn @member reason` / `/warnings @member` — logged to Mongo, not just chat history
- `/purge count` — bulk delete (Discord won't touch messages older than 14 days)

**Admin** (member management)
- `/addrole @member @role`
- `/removerole @member @role`

**Announcements**
- `/announce channel title message [color]`

**Incident response**
- `/lockdown [channel] [reason]` / `/unlock [channel]`
- `/lockdown-all reason confirm:CONFIRM`
- `/maintenance on [message]` / `off` / `status`
- `/alerts-mute [minutes]` / `/alerts-unmute`
- **`/kepler-protocol activate reason confirm:CONFIRM`** — locks every text channel, enables maintenance mode, and remembers exactly which channels it touched. `/kepler-protocol deactivate` restores only those channels and clears maintenance. `/kepler-protocol status` checks current state.

Everything except `/status`, `/site-status`, `/maintenance status`, and `/kepler-protocol status` is gated by `ADMIN_ROLE_IDS` in `.env` (comma-separated role IDs). If unset, falls back to requiring the Discord "Administrator" permission.

**Bot permissions needed:** `/lockdown`, `/lockdown-all`, and `/kepler-protocol` need **Manage Channels**. `/kick`, `/ban`, `/timeout` need their respective Discord permissions. `/purge` needs **Manage Messages**. Add these scopes when generating your OAuth2 invite URL.

## Inbound webhooks (site → bot)

**Netlify deploy notifications:** Site settings → Build & deploy → Deploy notifications → Outgoing webhook → `https://your-host:PORT/webhooks/netlify`.

**Arcjet security events:** from your Netlify Function's Arcjet decision handler, `fetch()` a POST to `https://your-host:PORT/webhooks/arcjet` with `{ rule, decision, ip, path, reason }`.

**Website inquiries:** from your SNS-web contact-form function, after a successful submit, POST to `https://your-host:PORT/webhooks/inquiry` with `{ name, email, company, message, source }`. Set `INQUIRIES_CHANNEL_ID` to route these into a channel.

All three check `x-webhook-secret` against `WEBHOOK_SECRET` if it's set.

## Outbound REST API (bot → site)

For the website's admin panel to read bot status and trigger actions. Requires `API_KEY` in `.env` — every `/api/*` route refuses requests (503) until it's set, and requires a matching `x-api-key` header otherwise (401).

**Call these from a server-side Netlify Function, never directly from the browser** — `API_KEY` would be exposed in client-side JS otherwise. See `website-integration-examples/` for ready-to-adapt proxy functions.

| Route | Method | Body | Purpose |
|---|---|---|---|
| `/api/status` | GET | — | Bot uptime, ping, guild name/member count, maintenance/kepler/mute state |
| `/api/maintenance` | POST | `{ action: "on"\|"off", message? }` | Toggle maintenance mode |
| `/api/lockdown` | POST | `{ action: "lock"\|"unlock"\|"lockdown-all", channelId?, reason? }` | Lock/unlock channels |
| `/api/kepler` | POST | `{ action: "activate"\|"deactivate", reason? }` | Full incident lockdown |
| `/api/member/:discordId` | GET | — | Guild membership + roles for a Discord user ID (used by OAuth flow below) |

All routes use the bot's `DISCORD_GUILD_ID` as the default guild for lockdown/kepler/member-lookup actions.

## Discord OAuth2 login for site visitors

The bot's `/api/member/:discordId` endpoint supports this, but the actual OAuth flow (redirect, code exchange, session creation) lives in SNS-web, not the bot. See `website-integration-examples/`:

- `discord-oauth-start.js` — redirects to Discord's consent screen
- `discord-oauth-callback.js` — exchanges the code, fetches identity, checks guild membership via the bot API. **Session creation is left as a TODO** — wire it into however SNS-web already handles login.
- `bot-status.js`, `bot-maintenance.js` — example server-side proxies for the admin panel

Register the redirect URI in the [Discord Developer Portal](https://discord.com/developers/applications) → your app → OAuth2 → Redirects, matching `DISCORD_OAUTH_REDIRECT_URI` exactly.

## Hosting

Needs a persistent process (WebSocket connection to Discord) — Netlify Functions won't work for the bot itself. Railway or Fly.io are the simplest cheap options; a small VPS works too.

## Next steps to fill in

- `account-lookup`/`account-reset` field names are guesses — verify against your real SNS-web user schema before using `/account-reset` on a live account.
- No rate limiting on the webhook/API endpoints yet — worth adding once they're internet-facing.
- Slash commands are guild-scoped (instant registration) for now. Switch to global registration once stable — global commands take up to an hour to propagate.
- The OAuth callback's session-creation step is unimplemented — needs to match SNS-web's existing auth pattern.
