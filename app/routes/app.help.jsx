import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticateAdminOrDiagnose } from "../shopify.server";
import { createSupportTicket, sanitizeSupportInput } from "../support.server";
import { validateSupportRequest } from "../lib/support";
import { getFaqItems } from "../lib/faq";
/* eslint-disable react/prop-types -- plain JS internal components, not a public API */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Client-side mirror of the server validation for instant inline feedback. */
function validateClient({ name, email, message }) {
  const fieldErrors = {};
  if (!name.trim()) fieldErrors.name = "Name is required.";
  if (!email.trim()) {
    fieldErrors.email = "Email address is required.";
  } else if (!EMAIL_PATTERN.test(email.trim())) {
    fieldErrors.email = "Enter a valid email address.";
  }
  if (!message.trim()) fieldErrors.message = "Message is required.";
  return { ok: Object.keys(fieldErrors).length === 0, fieldErrors };
}

function ContactForm() {
  const fetcher = useFetcher();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot, hidden from users
  const [errors, setErrors] = useState({});
  const [lastResult, setLastResult] = useState(null);

  const isSubmitting = fetcher.state !== "idle";

  // Whenever the server returns a result, render it (errors → inline &
  // banner; success → banner + reference). Values are preserved on failure.
  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if (data.fieldErrors) {
      setErrors((prev) => ({ ...prev, ...data.fieldErrors }));
      setLastResult({ tone: "critical", heading: "Please check the form", detail: "Some fields need your attention." });
    } else if (data.ok) {
      setLastResult({
        tone: "success",
        heading: "Message sent successfully!",
        detail: "Thank you for contacting Diamond Builder Support. Your request has been received.",
        ticketId: data.ticketId,
        notified: data.notified,
      });
      setName("");
      setEmail("");
      setMessage("");
      setErrors({});
    } else if (data.error) {
      setLastResult({ tone: "critical", heading: "Message could not be sent", detail: data.error });
    }
  }, [fetcher.data]);

  const handleSubmit = () => {
    const values = { name, email, message };
    const client = validateClient(values);
    if (!client.ok) {
      setErrors(client.fieldErrors);
      setLastResult({
        tone: "critical",
        heading: "Please check the form",
        detail: "Some fields need your attention.",
      });
      return;
    }
    setErrors({});
    const formData = new FormData();
    formData.set("intent", "contact");
    formData.set("name", name.trim());
    formData.set("email", email.trim());
    formData.set("message", message.trim());
    formData.set("website", website); // honeypot: bots fill it, humans can't see it
    fetcher.submit(formData, { method: "POST" });
  };

  return (
    <s-section heading="Contact Support">
      <s-stack direction="block" gap="base">
        <s-text color="subdued">
          Tell us how we can help, and our team will get back to you.
        </s-text>

        {lastResult && (
          <s-banner tone={lastResult.tone} heading={lastResult.heading}>
            <s-stack direction="block" gap="small">
              <s-text>{lastResult.detail}</s-text>
              {lastResult.ticketId && (
                <s-text color="subdued">
                  Support request reference: {lastResult.ticketId}
                </s-text>
              )}
              {lastResult.notified && (
                <s-text color="subdued">
                  The support team has been notified.
                </s-text>
              )}
            </s-stack>
          </s-banner>
        )}

        <s-stack direction="block" gap="base">
          <s-text-field
            label="Name"
            required
            value={name}
            error={errors.name}
            autocomplete="name"
            disabled={isSubmitting}
            onInput={(event) => setName(event.target.value)}
          />
          <s-email-field
            label="Email Address"
            required
            value={email}
            error={errors.email}
            autocomplete="email"
            disabled={isSubmitting}
            onInput={(event) => setEmail(event.target.value)}
          />
          <s-text-area
            label="Message"
            required
            value={message}
            error={errors.message}
            placeholder="Describe your issue or question..."
            rows={6}
            disabled={isSubmitting}
            onInput={(event) => setMessage(event.target.value)}
          />

          {/* Honeypot: visually hidden, only bots fill it. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "auto", width: "1px", height: "1px", overflow: "hidden" }}>
            <label htmlFor="website">Website</label>
            <input
              id="website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>

          <s-stack direction="inline">
            <s-button
              type="button"
              variant="primary"
              loading={isSubmitting}
              disabled={isSubmitting}
              onClick={handleSubmit}
              icon="send"
            >
              {isSubmitting ? "Sending…" : "Send Message"}
            </s-button>
          </s-stack>
        </s-stack>
      </s-stack>
    </s-section>
  );
}

function FaqAccordion({ items }) {
  const [openId, setOpenId] = useState(null); // only one open at a time

  return (
    <div className="ss-faq">
      {items.map((item) => {
        const isOpen = openId === item.id;
        const buttonId = `ss-faq-button-${item.id}`;
        const panelId = `ss-faq-panel-${item.id}`;
        return (
          <div className={`ss-faq__item${isOpen ? " ss-faq__item--open" : ""}`} key={item.id}>
            <h3 className="ss-faq__heading">
              <button
                id={buttonId}
                type="button"
                className="ss-faq__trigger"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenId(isOpen ? null : item.id)}
              >
                <span>{item.question}</span>
                <s-icon
                  type={isOpen ? "minus" : "plus"}
                  tone="success"
                  className="ss-faq__icon"
                  aria-hidden="true"
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              aria-hidden={!isOpen}
              className="ss-faq__panel"
            >
              <div className="ss-faq__panel-inner">
                <s-text color="subdued">{item.answer}</s-text>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const loader = async ({ request }) => {
  const auth = await authenticateAdminOrDiagnose(request, "help.loader");
  if (!auth.ok) {
    return { authError: auth.error };
  }
  return { authError: null };
};

export const action = async ({ request }) => {
  const auth = await authenticateAdminOrDiagnose(request, "help.action");
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }
  const { session } = auth.context;

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent !== "contact") {
    return { ok: false, error: "Unsupported action." };
  }

  const input = sanitizeSupportInput(form);

  // Honeypot: a filled value means a bot. Pretend success without storing.
  if (input.honeypot) {
    return { ok: true, ticketId: null };
  }

  const serverValidation = validateSupportRequest({
    name: input.name,
    email: input.email,
    message: input.message,
  });
  if (!serverValidation.ok) {
    // Send the trimmed field errors + values back so the form can render
    // inline messages and preserve what the merchant typed.
    return {
      ok: false,
      fieldErrors: serverValidation.fieldErrors,
      values: serverValidation.values,
    };
  }

  try {
    const result = await createSupportTicket({
      shop: session.shop,
      name: input.name,
      email: input.email,
      message: input.message,
    });
    return result.ok
      ? {
          ok: true,
          ticketId: result.ticketId,
          notified: result.notified,
          notificationReason: result.notificationReason,
          duplicate: result.duplicate,
        }
      : { ok: false, error: result.error };
  } catch (error) {
    console.error("[help.action] failed to create support ticket", error);
    return {
      ok: false,
      error: "Your message could not be sent right now. Please try again.",
    };
  }
};

export default function HelpPage() {
  const { authError } = useLoaderData();
  const faqItems = getFaqItems();

  return (
    <s-page heading="Help & Support" inlinesize="base">
      <style>{`
        .ss-faq {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ss-faq__item {
          background: #ffffff;
          border: 1px solid var(--p-color-border-subdued, #e1e3e5);
          border-radius: 14px;
          overflow: hidden;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .ss-faq__item--open {
          border-color: rgba(0, 128, 96, 0.45);
          box-shadow: 0 4px 14px rgba(0, 128, 96, 0.08);
        }
        .ss-faq__heading {
          margin: 0;
        }
        .ss-faq__trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          width: 100%;
          padding: 16px 18px;
          border: 0;
          background: transparent;
          font: inherit;
          font-size: 15px;
          font-weight: 600;
          color: #202223;
          text-align: left;
          cursor: pointer;
        }
        .ss-faq__trigger:hover {
          background: rgba(0, 128, 96, 0.04);
        }
        .ss-faq__trigger:focus-visible {
          outline: 2px solid #008060;
          outline-offset: -2px;
          border-radius: 14px;
        }
        .ss-faq__icon {
          flex-shrink: 0;
        }
        .ss-faq__panel {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.22s ease;
        }
        .ss-faq__item--open .ss-faq__panel {
          grid-template-rows: 1fr;
        }
        .ss-faq__panel-inner {
          overflow: hidden;
          padding: 0 18px;
        }
        .ss-faq__item--open .ss-faq__panel-inner {
          padding-bottom: 18px;
        }
        .ss-faq__panel p {
          margin: 0;
        }
      `}</style>

      <s-stack direction="block" gap="base">
        <s-text color="subdued">
          Need assistance with Diamond Builder? Send us a message or find
          answers to common questions below.
        </s-text>

        {authError && (
          <s-banner tone="critical" heading="Could not authenticate with Shopify">
            {authError}
          </s-banner>
        )}

        <ContactForm />

        <s-section heading="Frequently Asked Questions">
          <s-stack direction="block" gap="small">
            <s-text color="subdued">
              Find quick answers to common questions about setting up and using
              Diamond Builder.
            </s-text>
            <FaqAccordion items={faqItems} />
          </s-stack>
        </s-section>
      </s-stack>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};