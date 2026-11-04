import { redirect } from "react-router";

export function loader({ request }) {
  const url = new URL(request.url);
  return redirect(`/admin/feeds/vendors${url.search}`);
}
