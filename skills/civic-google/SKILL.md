---
name: civic-google
description: Set up Google Workspace access (Gmail, Calendar, Drive, etc.) via the Civic OAuth plugin
metadata: {"openclaw": {"requires": {"bins": ["gog"], "env": ["CIVIC_TOKEN"]}, "emoji": "🔑"}}
---

## Setup

1. Install the plugin:
   ```bash
   openclaw plugins install @civic/openclaw-google
   ```

2. Install gog:
   ```bash
   brew install gog
   ```

3. Set your Civic API token in the gateway environment:
   ```bash
   CIVIC_TOKEN=<your-token-from-app.civic.com>
   ```

4. Restart the gateway.
