import { redirect } from "react-router";

// This app has no landing page: its root URL is the Dashboard.
//
// Shopify points the app name in the admin nav at the app root, and that load
// does not always carry the `shop` param this route used to require — which is
// exactly how the template's "A short heading about [your app]" placeholder
// could show up inside the admin. So nothing is ever rendered here:
//
//   * `/app` is the real entry point. Its loader authenticates first (App
//     Bridge recovers the session when a request arrives without shop/host),
//     then sends the merchant to the Dashboard — or on to Plan/Setup when
//     those steps are still outstanding.
//   * The query string is carried across untouched, because it holds the
//     params authentication depends on (shop, host, embedded, id_token) and
//     the one-shot `charge_id` Shopify adds when returning from billing.
export const loader = async ({ request }) => {
  const { search } = new URL(request.url);
  throw redirect(`/app${search}`);
};
