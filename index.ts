import type { OpenClawPluginApi } from "openclaw/plugin-sdk/civic-google";

const DEFAULT_PROXY_URL = "https://app.civic.com/ext/openclaw";

type PluginConfig = {
  proxyUrl?: string;
};

type TokenResponse = {
  status: "ready" | "auth_required" | "pending" | "no_mapping" | "error";
  value?: string;
  authUrl?: string;
  jobId?: string;
  envVar?: string;
  error?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function register(api: OpenClawPluginApi) {
  const cfg = (api.pluginConfig ?? {}) as PluginConfig;
  const proxyUrl = cfg.proxyUrl || process.env.OPENCLAW_PROXY_URL || DEFAULT_PROXY_URL;

  api.on("before_tool_call", async (event) => {
    if (event.toolName !== "exec") return;

    const command = event.params?.command;
    if (typeof command !== "string" || !command.trimStart().startsWith("gog ")) return;

    const bearerToken = process.env.CIVIC_TOKEN || process.env.NEXUS_TOKEN;
    if (!bearerToken) {
      return {
        block: true,
        blockReason: "No CIVIC_TOKEN configured — set it in the gateway environment. Get your token from app.civic.com → Settings → API Keys.",
      };
    }

    try {
      const res = await fetch(`${proxyUrl}/token`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command }),
      });
      const result = (await res.json()) as TokenResponse;

      if (result.status === "ready" && result.value && result.envVar) {
        process.env[result.envVar] = result.value;
        return;
      }

      if (result.status === "no_mapping") return;

      if (result.status === "auth_required" && result.authUrl) {
        return {
          block: true,
          blockReason: `Google authorization required. Visit this URL to connect your account: ${result.authUrl}`,
        };
      }

      if (result.status === "pending" && result.jobId) {
        // Poll briefly for the auth URL or token
        for (let i = 0; i < 3; i++) {
          await sleep(2000);
          const pollRes = await fetch(
            `${proxyUrl}/token/status?jobId=${encodeURIComponent(result.jobId)}`,
            { headers: { Authorization: `Bearer ${bearerToken}` } },
          );
          const poll = (await pollRes.json()) as TokenResponse;

          if (poll.status === "ready" && poll.value) {
            process.env[result.envVar!] = poll.value;
            return;
          }
          if (poll.status === "auth_required" && poll.authUrl) {
            return {
              block: true,
              blockReason: `Google authorization required. Visit this URL to connect your account: ${poll.authUrl}`,
            };
          }
        }
      }

      if (result.status === "error") {
        return {
          block: true,
          blockReason: `Civic proxy error: ${result.error ?? "unknown error"}`,
        };
      }

      return {
        block: true,
        blockReason: "Google credential is pending authorization. Please complete the OAuth flow via Civic, then try again.",
      };
    } catch (err) {
      return {
        block: true,
        blockReason: `Failed to fetch credential from Civic proxy: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });
}
