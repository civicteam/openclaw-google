# @civic/openclaw-google

An [OpenClaw](https://openclaw.ai) plugin that injects fresh Google OAuth tokens from [Civic AuthZ](https://nexus.civic.com) into agent tool calls — enabling agents to use Google APIs (Gmail, Calendar, etc.) without storing credentials locally.

## How it works

When an agent calls a tool matching a configured pattern (e.g. `gog gmail search ...`), this plugin:

1. Fetches a fresh OAuth token from the Civic credential proxy
2. If ready → sets `GOG_ACCESS_TOKEN` so the tool call proceeds transparently
3. If not yet authorized → creates an OAuth authorization job and blocks the call with a URL for the user to click
4. After authorization → all subsequent calls work automatically (tokens are refreshed by Civic)

## Prerequisites

### 1. A Civic account with Google OAuth authorized

Sign up at [nexus.civic.com](https://nexus.civic.com) and connect your Google account. The plugin uses Civic AuthZ to manage OAuth tokens — no credentials are stored on your machine.

### 2. OpenClaw installed

```bash
npm install -g openclaw
```

See [openclaw.ai](https://openclaw.ai) for setup docs.

### 3. `gog` CLI installed

```bash
brew install gog
```

`gog` is the Google CLI that this plugin authenticates. See [github.com/openclaw/gog](https://github.com/openclaw/gog).

## Installation

```bash
openclaw plugins install @civic/openclaw-google
```

## Configuration

Add to `~/.openclaw/openclaw.json`:

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

Set your Civic token in the OpenClaw gateway environment. Add to your launchd plist or shell environment:

```bash
NEXUS_TOKEN=<your-civic-nexus-token>
```

Get your token from [nexus.civic.com](https://nexus.civic.com) → Settings → API Keys.

## Usage

Once installed and configured, `gog` commands just work:

```bash
# Read emails — plugin auto-injects Google token
gog gmail search 'newer_than:1d is:unread'

# Create a draft
gog gmail drafts create --to alice@example.com --subject "Hello" --body "Hi!"

# List calendar events
gog calendar list
```

If Google hasn't been authorized yet, the agent will receive an authorization URL to share with you. After you click it and authorize, the call succeeds automatically.

## Default credential mappings

Credentials follow least-privilege — each command gets only the minimum scope needed:

| Command pattern | Scope | Credential |
|---|---|---|
| `gog gmail send` | `gmail.send` | `google-gmail-send` |
| `gog gmail drafts` | `gmail.compose` | `google-gmail-draft` |
| `gog gmail` (all others) | `gmail.readonly` | `google-gmail-read` |
| `gog calendar create/update/delete` | `calendar.events` | `google-calendar-write` |
| `gog calendar` (all others) | `calendar.readonly` | `google-calendar-read` |

Custom mappings can be configured via `plugins.entries.civic-google.config.credentialMappings`.

## Advanced: custom proxy

By default the plugin uses `https://nexus.civic.com/ext/openclaw` as the credential proxy. Override with:

```bash
OPENCLAW_PROXY_URL=http://localhost:3013/openclaw  # for local development
```

## Publishing (maintainers)

```bash
npm publish --access public
```

Then submit a PR to [openclaw/openclaw](https://github.com/openclaw/openclaw) adding an entry to `docs/plugins/community.md`.

## License

MIT
