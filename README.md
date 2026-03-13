# @civic/openclaw-google

An [OpenClaw](https://openclaw.ai) plugin that gives AI agents access to Google Workspace (Gmail, Calendar, etc.) using [Civic](https://nexus.civic.com) for OAuth. No Google Cloud project, no local credentials, no token management.

## What this replaces

Without this plugin, giving an agent access to Google APIs via `gog` requires:

1. Creating a Google Cloud project, enabling APIs, and configuring the OAuth consent screen
2. Generating OAuth client credentials (`credentials.json`)
3. Running `gog auth credentials set credentials.json` then `gog auth add you@gmail.com` — which opens a browser and stores a refresh token in your local keyring
4. Dealing with token expiry, revocation, and refresh failures yourself
5. Accepting that `gog` requests broad scopes by default — e.g., `gmail.modify` + `gmail.settings.basic` + `gmail.settings.sharing` even if your agent only reads email

Every user who runs the agent has to do this themselves.

With this plugin, the setup is:

```bash
openclaw plugins install @civic/openclaw-google
```

Civic provides the OAuth client, stores tokens encrypted server-side, refreshes them automatically, and the plugin requests only the scope each command actually needs.

## How it works

```
Agent calls "gog gmail search ..."
        │
        ▼
Plugin intercepts (before_tool_call hook)
        │
        ▼
Matches "gog gmail" → needs google-gmail-read (gmail.readonly)
        │
        ▼
Fetches token from Civic  ──→  Token ready? → Inject GOG_ACCESS_TOKEN → gog runs
                           └→  Not authorized? → Block with auth URL for user
                           └→  Token expired? → Civic already refreshed it → inject and run
```

The agent and `gog` never see OAuth client credentials or refresh tokens. They get a short-lived access token injected via environment variable.

On first use for a given scope, the agent surfaces an authorization URL. The user clicks it, consents once, and all future calls for that scope work automatically.

## Least-privilege scope mapping

`gog`'s native auth requests broad scopes per service. This plugin maps each subcommand to the minimum scope needed:

| Agent action | Scope via this plugin | Scope via native `gog auth` |
|---|---|---|
| Read/search email | `gmail.readonly` | `gmail.modify` + `gmail.settings.basic` + `gmail.settings.sharing` |
| Send email | `gmail.send` | (same broad set) |
| Create/edit drafts | `gmail.compose` | (same broad set) |
| Trash/archive email | `gmail.modify` | (same broad set) |
| Read calendar | `calendar.readonly` | `calendar` (full read/write) |
| Create/update/delete events | `calendar.events` | `calendar` (full read/write) |

Each scope requires separate user consent. An agent that only reads email cannot send or delete it.

## Quick start

### 1. Install the plugin

```bash
openclaw plugins install @civic/openclaw-google
```

### 2. Install `gog`

```bash
brew install gog
```

### 3. Set your Civic token

Add to the OpenClaw gateway environment:

```bash
NEXUS_TOKEN=<your-civic-api-token>
```

Get your token from [nexus.civic.com](https://nexus.civic.com) → Settings → API Keys.

### 4. Use it

Ask your agent to read email, check your calendar, draft a reply. On first use per scope, you'll see an authorization link to click.

## Default credential mappings

| Command | Credential ID | Scope |
|---|---|---|
| `gog gmail send` | `google-gmail-send` | `gmail.send` |
| `gog gmail drafts` / `draft` | `google-gmail-draft` | `gmail.compose` |
| `gog gmail trash` / `archive` / `read` / `unread` / `batch` | `google-gmail-modify` | `gmail.modify` |
| `gog gmail` (everything else) | `google-gmail-read` | `gmail.readonly` |
| `gog calendar create` / `update` / `delete` / `respond` / `subscribe` | `google-calendar-write` | `calendar.events` |
| `gog calendar` (everything else) | `google-calendar-read` | `calendar.readonly` |

Mappings are evaluated most-specific first — `gog gmail send` matches before the `gog gmail` catch-all.

## Configuration

The plugin works out of the box after install. To customize, edit `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "civic-google": {
        "enabled": true
      }
    }
  }
}
```

### Custom credential mappings

To add mappings for additional Google services (e.g., Drive):

```json
{
  "plugins": {
    "entries": {
      "civic-google": {
        "enabled": true,
        "config": {
          "credentialMappings": [
            {
              "credentialId": "google-drive-read",
              "envVar": "GOG_ACCESS_TOKEN",
              "toolMatch": "exec:gog drive"
            }
          ]
        }
      }
    }
  }
}
```

### Custom proxy URL

Default: `https://nexus.civic.com/ext/openclaw`. For local development:

```bash
OPENCLAW_PROXY_URL=http://localhost:3013/openclaw
```

## Security

- Tokens are stored in Civic's encrypted store (AES-256), not on the agent's machine
- Access tokens are short-lived (~1 hour) and refreshed automatically server-side
- Each subcommand gets only the scope it needs, with separate user consent per scope
- Revoking access in Civic invalidates all tokens immediately
- The agent never sees OAuth client secrets or refresh tokens

## License

MIT
