import type { ClientBootstrapPayload } from "../types/sori";

export function normalizeServerDomain(input: string) {
  const value = input.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  return value.split("/")[0]?.toLowerCase() || "";
}

function validateBootstrap(payload: unknown): ClientBootstrapPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid bootstrap payload");
  }

  const data = payload as ClientBootstrapPayload;
  if (
    data.version !== 1
    || data.auth?.mode !== "cookie"
    || !data.endpoints?.api
    || !data.endpoints?.ws
    || !data.endpoints?.livekit
    || !data.endpoints?.media
    || !data.server?.defaultCommunityId
  ) {
    throw new Error("Server bootstrap is missing required fields");
  }

  return data;
}

async function fetchBootstrapUrl(url: string) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Bootstrap request failed: ${response.status}`);
  }

  return validateBootstrap(await response.json());
}

export async function discoverServer(domainInput: string) {
  const domain = normalizeServerDomain(domainInput);
  if (!domain || !domain.includes(".")) {
    throw new Error("Enter a valid domain name.");
  }

  const baseUrl = `https://${domain}`;
  const primaryUrl = `${baseUrl}/.well-known/sori/client.json`;
  const fallbackUrl = `${baseUrl}/client/bootstrap`;

  try {
    return {
      domain,
      bootstrap: await fetchBootstrapUrl(primaryUrl)
    };
  } catch (primaryError) {
    try {
      return {
        domain,
        bootstrap: await fetchBootstrapUrl(fallbackUrl)
      };
    } catch {
      throw primaryError instanceof Error
        ? primaryError
        : new Error("Server is unavailable or not a SORI server.");
    }
  }
}
