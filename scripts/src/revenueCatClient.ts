import { createClient } from "@replit/revenuecat-sdk/client";

// Resolves a fresh RevenueCat access token from the Replit connectors proxy.
// The token is short-lived, so this is re-fetched on every call — never cache
// the returned client (hence "uncachable").
async function getAccessToken(): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error("X_REPLIT_TOKEN / REPLIT_CONNECTORS_HOSTNAME not found for repl/depl");
  }

  const connectionSettings = await fetch(
    "https://" +
      hostname +
      "/api/v2/connection?include_secrets=true&connector_names=revenuecat",
    {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    },
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

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
