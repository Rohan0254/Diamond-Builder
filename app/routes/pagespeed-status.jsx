// Lightweight PageSpeed run-status endpoint used by the Dashboard.
//
// "Analyze now" starts a background run and returns immediately; the Dashboard
// polls this route until the run finishes. It lives outside the `/app` shell so
// a poll is a single authenticated DB read — it never re-runs the billing
// reconcile or shop-profile sync. Resource route: data only, no component.

import { authenticateAdminOrDiagnose } from "../shopify.server";
import { getRunState } from "../pagespeed.server";

export const loader = async ({ request }) => {
  const auth = await authenticateAdminOrDiagnose(request, "pagespeed-status");

  if (!auth.ok) {
    return Response.json({ run: null, authError: auth.error });
  }

  let run = null;
  try {
    run = await getRunState(auth.context.session.shop);
  } catch (error) {
    console.error("[pagespeed-status] failed to load run state", error);
  }

  return Response.json({ run });
};
