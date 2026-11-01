// Configurable FAQ content for the Help page. Add entries here to add
// questions — the accordion and the page render whatever is in this list, so
// no page redesign is needed when questions are added or removed.

/** @type {ReadonlyArray<{id:string, question:string, answer:string}>} */
export const FAQ_ITEMS = [
  {
    id: "setup",
    question: "How do I set up Speed Scratcher?",
    answer:
      "Follow the three steps on the Setup page: copy each script into the location described on its card, save and publish any theme changes, then click Verify Setup. The app reports the verification result for each script individually.",
  },
  {
    id: "not-detected",
    question: "Why is my script not being detected?",
    answer:
      "Make sure the script is installed in the correct location, saved, and enabled where applicable. Some theme or storefront changes may take time to become visible. Run verification again after checking your installation. If your storefront is password protected, automatic verification cannot read it: make the store publicly visible, at least temporarily, to verify.",
  },
  {
    id: "theme-changes",
    question: "Will Speed Scratcher change my Shopify theme?",
    answer:
      "Speed Scratcher does not edit or replace your theme files. The scripts on the Setup page are installed by you into your theme and load additional JavaScript; the app itself does not modify your theme's code. As with any third-party script, review what it does before installing it.",
  },
  {
    id: "check-optimization",
    question: "How can I check whether optimization is working?",
    answer:
      "Open the Setup page and run Verify Setup: a verified result confirms the scripts are present on your storefront. Performance analytics and recommendations appear in the app's dashboard as they become available, so check back after your scripts are verified.",
  },
  {
    id: "contact-support",
    question: "Can I contact support if I need help?",
    answer:
      "Yes. Use the Contact Support form above to submit your question. If ticket notifications are configured for your app, the support team will be notified according to the app's notification setup and will reply using the email address you provide.",
  },
  {
    id: "subscription",
    question: "How do I manage my subscription?",
    answer:
      "Use the Plan page inside this app to start your 14-day free trial, switch plans, or cancel. Billing and payment handling are done by Shopify's own checkout — there is no separate billing setup here.",
  },
];

/** Returns the FAQ list (kept stable for future expansion/moderation). */
export function getFaqItems() {
  return FAQ_ITEMS.map((item) => ({ ...item }));
}