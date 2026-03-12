import type { OpenClawPluginApi } from "openclaw/plugin-sdk/civic-google";

const DEFAULT_PROXY_URL = "https://nexus.civic.com/ext/openclaw";

type CredentialMapping = {
  credentialId: string;
  envVar: string;
  toolMatch: string;
};

type PluginConfig = {
  proxyUrl?: string;
  credentialMappings?: CredentialMapping[];
};

/**
 * Default credential mappings — ordered most-specific first.
 * The hook returns on the first match, so specific subcommands
 * (e.g. "gog gmail send") must come before broader ones ("gog gmail").
 *
 * Add new entries here as scopes are expanded. Each gog subcommand
 * gets the minimum scopes it needs (least privilege).
 */
const DEFAULT_MAPPINGS: CredentialMapping[] = [
  // --- Gmail (specific subcommands before the read catch-all) ---
  { credentialId: "google-gmail-send", envVar: "GOG_ACCESS_TOKEN", toolMatch: "exec:gog gmail send" },
  { credentialId: "google-gmail-draft", envVar: "GOG_ACCESS_TOKEN", toolMatch: "exec:gog gmail drafts" },
  { credentialId: "google-gmail-draft", envVar: "GOG_ACCESS_TOKEN", toolMatch: "exec:gog gmail draft" },
  { credentialId: "google-gmail-modify", envVar: "GOG_ACCESS_TOKEN", toolMatch: "exec:gog gmail trash" },
  { credentialId: "google-gmail-modify", envVar: "GOG_ACCESS_TOKEN", toolMatch: "exec:gog gmail archive" },
  { credentialId: "google-gmail-modify", envVar: "GOG_ACCESS_TOKEN", toolMatch: "exec:gog gmail read" },
  { credentialId: "google-gmail-modify", envVar: "GOG_ACCESS_TOKEN", toolMatch: "exec:gog gmail unread" },
  { credentialId: "google-gmail-modify", envVar: "GOG_ACCESS_TOKEN", toolMatch: "exec:gog gmail batch" },
  // Gmail read catch-all (search, get, messages, attachment, labels, thread, etc.)
  { credentialId: "google-gmail-read", envVar: "GOG_ACCESS_TOKEN", toolMatch: "exec:gog gmail" },

  // --- Calendar (specific write subcommands before the read catch-all) ---
  { credentialId: "google-calendar-write", envVar: "GOG_ACCESS_TOKEN", toolMatch: "exec:gog calendar create" },
  { credentialId: "google-calendar-write", envVar: "GOG_ACCESS_TOKEN", toolMatch: "exec:gog calendar update" },
  { credentialId: "google-calendar-write", envVar: "GOG_ACCESS_TOKEN", toolMatch: "exec:gog calendar delete" },
  { credentialId: "google-calendar-write", envVar: "GOG_ACCESS_TOKEN", toolMatch: "exec:gog calendar respond" },
  { credentialId: "google-calendar-write", envVar: "GOG_ACCESS_TOKEN", toolMatch: "exec:gog calendar subscribe" },
  // Calendar read catch-all (events, calendars, freebusy, search, conflicts, etc.)
  { credentialId: "google-calendar-read", envVar: "GOG_ACCESS_TOKEN", toolMatch: "exec:gog calendar" },
];

/** Parses a toolMatch string like "exec:gog gmail" into { toolName, commandPrefix }. */
const parseToolMatch = (
  match: string,
): { toolName: string; commandPrefix: string | undefined } => {
  const colonIdx = match.indexOf(":");
  if (colonIdx === -1) return { toolName: match, commandPrefix: undefined };
  return {
    toolName: match.slice(0, colonIdx),
    commandPrefix: match.slice(colonIdx + 1),
  };
};

/** Checks if an exec command matches a commandPrefix (e.g. "gog gmail" matches "gog gmail search ..."). */
const commandMatches = (command: string, prefix: string): boolean => {
  const trimmed = command.trimStart();
  return trimmed === prefix || trimmed.startsWith(`${prefix} `);
};

type ProxyResponse = {
  status?: string;
  value?: string;
  authUrl?: string;
  jobId?: string;
  error?: string;
  credentialId?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fetches a credential from the Civic proxy. */
const proxyGet = async (
  proxyUrl: string,
  credentialId: string,
  bearerToken: string,
): Promise<ProxyResponse & { httpStatus: number }> => {
  const res = await fetch(`${proxyUrl}/credentials/${credentialId}`, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  const body = (await res.json()) as ProxyResponse;
  return { ...body, httpStatus: res.status };
};

/** Creates (or reuses) an auth job via the Civic proxy. */
const proxyCreate = async (
  proxyUrl: string,
  credentialId: string,
  bearerToken: string,
): Promise<ProxyResponse & { httpStatus: number }> => {
  const res = await fetch(`${proxyUrl}/credentials/${credentialId}/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  const body = (await res.json()) as ProxyResponse;
  return { ...body, httpStatus: res.status };
};

/** Polls the job status until we get an auth URL or give up. */
const pollForAuthUrl = async (
  proxyUrl: string,
  credentialId: string,
  jobId: string,
  bearerToken: string,
): Promise<ProxyResponse & { httpStatus: number }> => {
  for (let i = 0; i < 3; i++) {
    await sleep(2000);
    const res = await fetch(
      `${proxyUrl}/credentials/${credentialId}/status?jobId=${encodeURIComponent(jobId)}`,
      { headers: { Authorization: `Bearer ${bearerToken}` } },
    );
    const body = (await res.json()) as ProxyResponse;
    if (
      body.status === "auth_required" ||
      body.status === "AUTH_REQUIRED" ||
      body.status === "USER_ACTION_REQUIRED" ||
      body.status === "ready" ||
      body.status === "APPROVED" ||
      body.authUrl
    ) {
      return { ...body, httpStatus: res.status };
    }
  }
  return { status: "pending", httpStatus: 200 };
};

export default function register(api: OpenClawPluginApi) {
  const cfg = (api.pluginConfig ?? {}) as PluginConfig;
  const proxyUrl = cfg.proxyUrl || process.env.OPENCLAW_PROXY_URL || DEFAULT_PROXY_URL;
  const mappings = cfg.credentialMappings?.length ? cfg.credentialMappings : DEFAULT_MAPPINGS;

  api.on("before_tool_call", async (event) => {
    for (const mapping of mappings) {
      const { toolName, commandPrefix } = parseToolMatch(mapping.toolMatch);

      if (event.toolName !== toolName) continue;

      if (commandPrefix) {
        const command = event.params?.command;
        if (typeof command !== "string" || !commandMatches(command, commandPrefix)) continue;
      }

      const bearerToken = process.env.CIVIC_TOKEN || process.env.NEXUS_TOKEN;
      if (!bearerToken) {
        return {
          block: true,
          blockReason: `No CIVIC_TOKEN or NEXUS_TOKEN configured — cannot authenticate to Civic proxy for "${mapping.credentialId}".`,
        };
      }

      try {
        const result = await proxyGet(proxyUrl, mapping.credentialId, bearerToken);

        // Token is ready — inject and proceed
        if (result.status === "ready" && result.value) {
          process.env[mapping.envVar] = result.value;
          return;
        }

        // Not configured or auth required — auto-create the auth job (getOrCreate)
        if (result.status === "not_configured" || result.status === "auth_required") {
          const createResult = await proxyCreate(proxyUrl, mapping.credentialId, bearerToken);

          // Already authorized — re-fetch to get the token value
          if (createResult.status === "ready") {
            const freshToken = await proxyGet(proxyUrl, mapping.credentialId, bearerToken);
            if (freshToken.status === "ready" && freshToken.value) {
              process.env[mapping.envVar] = freshToken.value;
              return;
            }
          }

          // Auth URL available — surface it
          if (createResult.status === "auth_required" && createResult.authUrl) {
            return {
              block: true,
              blockReason: `Google authorization required. Visit this URL to connect your account: ${createResult.authUrl}`,
            };
          }

          // Job created but pending — poll briefly for the auth URL
          if (createResult.status === "pending" && createResult.jobId) {
            const pollResult = await pollForAuthUrl(
              proxyUrl,
              mapping.credentialId,
              createResult.jobId,
              bearerToken,
            );

            if (pollResult.status === "ready" && pollResult.value) {
              process.env[mapping.envVar] = pollResult.value;
              return;
            }

            if (pollResult.authUrl) {
              return {
                block: true,
                blockReason: `Google authorization required. Visit this URL to connect your account: ${pollResult.authUrl}`,
              };
            }
          }

          return {
            block: true,
            blockReason: `Google credential "${mapping.credentialId}" is pending authorization. Please complete the OAuth flow via Civic Nexus, then try again.`,
          };
        }

        // HTTP or proxy errors
        if (result.httpStatus >= 400) {
          return {
            block: true,
            blockReason: `Civic proxy error (HTTP ${result.httpStatus}) for "${mapping.credentialId}": ${result.error ?? "unknown error"}`,
          };
        }

        return {
          block: true,
          blockReason: `Unexpected credential status for "${mapping.credentialId}": ${result.status ?? "unknown"}`,
        };
      } catch (err) {
        return {
          block: true,
          blockReason: `Failed to fetch credential "${mapping.credentialId}" from Civic proxy: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
  });
}
