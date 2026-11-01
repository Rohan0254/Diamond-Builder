import { authenticate } from "../shopify.server";
import { redactShopData } from "../shop-data.server";

// Mandatory compliance webhooks — an App Store requirement.
//
// All three topics are delivered to this one endpoint, declared in
// `shopify.app.toml`:
//
//   [[webhooks.subscriptions]]
//   uri = "/webhooks/compliance"
//   compliance_topics = [ "customers/data_request", "customers/redact", "shop/redact" ]
//
// `authenticate.webhook` checks the Shopify HMAC before it looks at anything
// else, so a request with a bad signature is rejected with the `401 Unauthorized`
// Shopify requires, and the topic and body are only trusted once the request is
// proven to come from Shopify. Every accepted topic answers `200`: the webhook is
// a request for action, and the policy allows the action to be completed within
// 30 days — a shop with nothing stored is still acknowledged.
//
// Data posture: the app requests no customer or order scopes, so it never sees or
// stores customer data. `customers/data_request` and `customers/redact` are
// therefore acknowledged and logged only; `shop/redact` erases everything held
// for the shop (see `app/shop-data.server.js`).
export const action = async ({ request }) => {
  let webhook;

  try {
    webhook = await authenticate.webhook(request);
  } catch (error) {
    // The library's own rejections (401 invalid HMAC, 400 malformed request,
    // 405 non-POST) are deliberate responses — pass them straight through.
    if (error instanceof Response) throw error;
    // What's left is a body the library couldn't JSON-parse. Answer 400 rather
    // than bubbling a 500, so the failure is attributable to the request.
    console.error("[webhooks.compliance] Could not process webhook", error);
    return new Response("Bad Request", { status: 400 });
  }

  const { topic, shop, payload } = webhook;

  console.log(`Received ${topic} webhook for ${shop}`);

  // `topic` arrives in storage form, e.g. "CUSTOMERS_DATA_REQUEST".
  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      // Nothing to hand over: no customer data is stored. Answering the customer
      // is the store owner's job, not the app's.
      console.log(
        `[webhooks.compliance] customers/data_request for ${shop} — no customer data stored`,
        payload?.customer?.id ?? "",
      );
      break;

    case "CUSTOMERS_REDACT":
      // Nothing to erase, for the same reason.
      console.log(
        `[webhooks.compliance] customers/redact for ${shop} — no customer data stored`,
        payload?.customer?.id ?? "",
      );
      break;

    case "SHOP_REDACT": {
      const deleted = await redactShopData(shop);
      console.log(`[webhooks.compliance] shop/redact for ${shop}`, deleted);
      break;
    }

    default:
      // Unreachable while this endpoint only receives the three topics above.
      // Acknowledge instead of failing so an unexpected topic can't turn into a
      // retry storm.
      console.log(
        `[webhooks.compliance] Ignoring unsupported topic ${topic} for ${shop}`,
      );
  }

  return new Response();
};
