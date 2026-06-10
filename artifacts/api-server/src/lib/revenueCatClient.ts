import { createClient } from "@replit/revenuecat-sdk/client";

/**
 * Resolves a fresh RevenueCat access token from the Replit connectors proxy.
 * The token is short-lived, so it is re-fetched on every call — never cache the
 * returned client (hence "uncachable").
 */
async function getAccessToken(): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "X_REPLIT_TOKEN / REPLIT_CONNECTORS_HOSTNAME not found for repl/depl",
    );
  }

  type ConnectionResponse = {
    items?: Array<{
      settings?: {
        access_token?: string;
        oauth?: { credentials?: { access_token?: string } };
      };
    }>;
  };

  const body = (await fetch(
    "https://" +
      hostname +
      "/api/v2/connection?include_secrets=true&connector_names=revenuecat",
    {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    },
  ).then((res) => res.json())) as ConnectionResponse;

  const settings = body.items?.[0]?.settings;
  const accessToken =
    settings?.access_token || settings?.oauth?.credentials?.access_token;

  if (!accessToken) {
    throw new Error("RevenueCat not connected");
  }
  return accessToken;
}

export async function getUncachableRevenueCatClient() {
  const accessToken = await getAccessToken();
  return createClient({
    baseUrl: "https://api.revenuecat.com/v2",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
