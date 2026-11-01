import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

// Third-party tags loaded in the document <head> of every page of the app.
//
//   HEAD_SCRIPT_SOURCES — external files, e.g.
//     { src: "https://example.com/widget.js", async: true }
//   HEAD_INLINE_SCRIPTS — inline code: only the JavaScript between the
//                         <script> tags (do not include the tags themselves).
//
// Keep the list minimal — everything here is injected into the document head
// of the embedded admin app and runs on every route.
const HEAD_SCRIPT_SOURCES = [];
const HEAD_INLINE_SCRIPTS = [
  // Brevo Conversations chat widget.
  `(function(d, w, c) {
        w.BrevoConversationsID = '6ad103d67e895492ba09e23e';
        w[c] = w[c] || function() {
            (w[c].q = w[c].q || []).push(arguments);
        };
        var s = d.createElement('script');
        s.async = true;
        s.src = 'https://conversations-widget.brevo.com/brevo-conversations.js';
        if (d.head) d.head.appendChild(s);
    })(document, window, 'BrevoConversations');`,
];

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        {HEAD_SCRIPT_SOURCES.map((tag) => (
          <script key={tag.src} src={tag.src} async={tag.async} defer={tag.defer} />
        ))}
        {HEAD_INLINE_SCRIPTS.map((code, index) => (
          // eslint-disable-next-line react/no-danger
          <script key={`head-inline-${index}`} dangerouslySetInnerHTML={{ __html: code }} />
        ))}
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
