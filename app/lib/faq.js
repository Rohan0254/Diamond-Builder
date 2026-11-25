// Configurable FAQ content for the Help page. Add entries here to add
// questions — the accordion and the page render whatever is in this list, so
// no page redesign is needed when questions are added or removed.

/** @type {ReadonlyArray<{id:string, question:string, answer:string}>} */
export const FAQ_ITEMS = [
  {
    id: "setup",
    question: "How do I set up Diamond Builder?",
    answer:
      "Follow the two onboarding steps on the Dashboard: enable the Diamond Ring Builder App Embed in your live Shopify theme and verify it, then select your primary Ring Collection and save your settings.",
  },
  {
    id: "not-detected",
    question: "Why is my theme embed not detected?",
    answer:
      "Make sure you turned on the Diamond Ring Builder toggle inside Shopify Theme Customizer -> App Embeds and clicked Save in the theme editor, then click Check Embed Status on the Dashboard.",
  },
  {
    id: "theme-changes",
    question: "Will Diamond Builder edit my Shopify theme files?",
    answer:
      "No. Diamond Builder uses an official Shopify Theme App Embed block, so your theme templates stay untouched and you can enable or disable it anytime from App Embeds.",
  },
  {
    id: "check-optimization",
    question: "How can I check if my storefront builder is live?",
    answer:
      "Check the onboarding banner and live page URLs on your Dashboard. Once Step 1 (Theme App Embed) and Step 2 (Ring Collection) are complete, click any live storefront URL to test the Build Your Own Ring flow.",
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