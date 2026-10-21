import { listEntitlements, listCustomerActiveEntitlements, listCustomers, listSubscriptions } from "@replit/revenuecat-sdk";
import { getUncachableRevenueCatClient } from "../../artifacts/api-server/src/lib/revenueCatClient";

// Read-only diagnostic. Never log tokens, customer identifiers or purchase data.
const client = await getUncachableRevenueCatClient();
const project_id = process.env.REVENUECAT_PROJECT_ID!;
function report(label: string, result: { response: Response; error?: unknown; data?: unknown }) {
  const error = result.error as { type?: string; message?: string } | undefined;
  console.log(JSON.stringify({ endpoint: label, status: result.response.status, errorType: error?.type, message: error?.message }));
}
report("entitlements", await listEntitlements({ client, path: { project_id } }));
const customers = await listCustomers({ client, path: { project_id }, query: { limit: 20 } });
report("customers", customers);
const customer_id = customers.data?.items?.[0]?.id ?? "diagnostic-nonexistent-customer";
report("active_entitlements", await listCustomerActiveEntitlements({ client, path: { project_id, customer_id } }));
report("subscriptions", await listSubscriptions({ client, path: { project_id, customer_id } }));

// Optional live backend check using an existing anonymous device identity.
// Only summaries are printed; no customer id or private content is exposed.
const origin = process.argv[2];
const device = customers.data?.items?.find(c => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(c.id));
if (origin && device) {
  const url = new URL("/api/me/plan?refresh=true", origin);
  if (url.protocol !== "https:") throw new Error("HTTPS required");
  const response = await fetch(url, { headers: { "x-device-id": device.id } });
  const body = await response.json() as { plan?: string; error?: string };
  console.log(JSON.stringify({ endpoint: "live_me_plan", status: response.status, plan: body.plan, error: body.error }));
  // Romanization uses the live server's configured OpenAI client without
  // creating a conversation or modifying any saved learning content.
  const aiResponse = await fetch(new URL("/api/openai/romanize", origin), {
    method: "POST",
    headers: { "x-device-id": device.id, "Content-Type": "application/json" },
    body: JSON.stringify({ text: "こんにちは", language: "Japanese" }),
  });
  const aiBody = await aiResponse.json() as { romanization?: string };
  console.log(JSON.stringify({ endpoint: "live_openai_romanize", status: aiResponse.status, ok: typeof aiBody.romanization === "string" && aiBody.romanization.length > 0 }));
}
