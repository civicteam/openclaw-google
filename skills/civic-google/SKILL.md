---
name: civic-google
description: Set up Google Workspace access (Gmail, Calendar, Drive, etc.) via the Civic OAuth plugin
metadata: {"openclaw": {"requires": {"bins": ["gog"], "env": ["CIVIC_TOKEN"]}, "emoji": "🔑"}}
---

## What this does

This plugin intercepts `gog` CLI commands and automatically injects a short-lived OAuth access token from Civic. No Google Cloud project, no local credentials, no token management. Each subcommand gets only the minimum OAuth scope it needs.

On first use for a given scope, the user is shown an authorization URL to consent. After that, tokens are refreshed automatically server-side.

## Setup

1. Install the plugin:
   ```bash
   openclaw plugins install @civic/openclaw-google
   ```

2. Install gog (the Google CLI):
   ```bash
   brew install gog
   ```

3. Set your Civic API token in the gateway environment:
   ```bash
   CIVIC_TOKEN=<your-token-from-app.civic.com>
   ```
   Get your token from app.civic.com -> Settings -> API Keys.

4. Restart the gateway.

## Supported services and commands

The plugin maps each `gog` subcommand to the narrowest OAuth scope required. Write operations use specific scopes; unrecognized subcommands fall back to read-only.

### Gmail
- `gog gmail send` — gmail.send
- `gog gmail draft`, `gog gmail drafts` — gmail.compose
- `gog gmail trash`, `archive`, `read`, `unread`, `batch` — gmail.modify
- `gog gmail` (catch-all) — gmail.readonly

### Calendar
- `gog calendar create`, `update`, `delete`, `respond`, `subscribe` — calendar.events
- `gog calendar` (catch-all) — calendar.readonly

### Drive
- `gog drive upload`, `create`, `update`, `delete`, `move`, `rename`, `share`, `copy`, `import` — drive.file
- `gog drive transfer` — drive (full access, required for ownership transfer)
- `gog drive` (catch-all) — drive.readonly

### Docs
- `gog docs create`, `edit`, `append` — documents
- `gog docs copy`, `delete`, `import` — documents + drive.file
- `gog docs export` — documents.readonly + drive.file
- `gog docs` (catch-all) — documents.readonly + drive.readonly

### Sheets
- `gog sheets write`, `append`, `delete`, `insert`, `format`, `merge`, `freeze`, `resize` — spreadsheets
- `gog sheets create` — spreadsheets + drive.file
- `gog sheets` (catch-all) — spreadsheets.readonly + drive.readonly

### Slides
- `gog slides create`, `copy` — presentations + drive.file
- `gog slides edit`, `update`, `duplicate`, `delete` — presentations
- `gog slides` (catch-all) — presentations.readonly + drive.readonly

### Tasks
- `gog tasks add`, `done`, `delete`, `move`, `update` — tasks
- `gog tasks` (catch-all) — tasks.readonly

### Contacts
- `gog contacts create`, `update`, `delete`, `merge`, `batch` — contacts
- `gog contacts` (catch-all) — contacts.readonly

### Chat
- `gog chat send` — chat.messages.create
- `gog chat create` — chat.spaces
- `gog chat delete` — chat.messages
- `gog chat` (catch-all) — chat.spaces.readonly + chat.messages.readonly

### Forms
- `gog forms create`, `update`, `delete` — forms.body
- `gog forms` (catch-all) — forms.body.readonly + forms.responses.readonly

### Apps Script
- `gog appscript run` — script.projects
- `gog appscript deploy` — script.deployments
- `gog appscript` (catch-all) — script.projects.readonly + drive.readonly

## How it works

1. Agent calls `gog gmail search newer_than:1d`
2. Plugin intercepts the `exec` tool call via `before_tool_call` hook
3. Sends `POST /token` to the Civic proxy with the raw command
4. Proxy matches `gog gmail` catch-all, resolves to `gmail.readonly` scope
5. If authorized: returns a short-lived access token, plugin sets `GOG_ACCESS_TOKEN` env var
6. If not yet authorized: blocks the tool call and surfaces an auth URL for the user
7. `gog` runs with the injected token

## Troubleshooting

- **"No CIVIC_TOKEN configured"** — Set `CIVIC_TOKEN` in your gateway environment. Get it from app.civic.com -> Settings -> API Keys.
- **Auth URL keeps appearing** — The user needs to click the authorization link and complete the Google consent screen. Each scope requires separate consent.
- **Token errors after working previously** — The user may have revoked access in their Google account settings. Re-authorize by triggering any `gog` command.

## Custom proxy URL

For local development, set `OPENCLAW_PROXY_URL` in the gateway environment:
```bash
OPENCLAW_PROXY_URL=http://localhost:3013/openclaw
```
