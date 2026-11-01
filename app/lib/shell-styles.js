// Shell-level styles for `app/routes/app.jsx`.
//

export const SHELL_CSS = `
  /* Fixed to the control's own box, so it reads as part of the button/link.
     It accepts pointer events on purpose: a second click on a control that is
     already loading is swallowed instead of starting the same page twice. */
  .psi-nav-shimmer {
    position: fixed; z-index: 2147483000;
    pointer-events: auto; cursor: default; overflow: hidden;
    background: rgba(26, 115, 232, 0.12);
    box-shadow: inset 0 0 0 1px rgba(26, 115, 232, 0.18);
  }
  .psi-nav-shimmer::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(
      100deg,
      rgba(255, 255, 255, 0) 25%,
      rgba(255, 255, 255, 0.9) 50%,
      rgba(255, 255, 255, 0) 75%
    );
    background-size: 250% 100%;
    animation: psi-nav-sweep 1.05s linear infinite;
  }
  @keyframes psi-nav-sweep {
    0% { background-position: 140% 0; }
    100% { background-position: -40% 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .psi-nav-shimmer::after {
      animation: none;
      background: linear-gradient(
        100deg,
        rgba(255, 255, 255, 0.1),
        rgba(255, 255, 255, 0.65),
        rgba(255, 255, 255, 0.1)
      );
    }
  }

  /* Announces the pending load without adding anything visible. */
  .psi-visually-hidden {
    position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
`;
