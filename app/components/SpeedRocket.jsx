/* eslint-disable react/prop-types */
// The "Analyzing…" rocket.
//
// A PageSpeed run takes up to a minute. The toolbar button shows that work is
// happening, but this makes the wait feel like progress: while a run is in
// flight a rocket hovers 70px above the bottom edge of the dashboard, and the
// moment the run lands it launches off the top of the screen and is gone.
//
// Rendered by `app/routes/app._index.jsx` with `active={isRunning}`. It only
// appears for a run seen in this session: a page that loads with nothing in
// flight renders nothing, so it can never get stuck on screen.
//
// The CSS lives here rather than in `app/lib/report/styles.js` because nothing
// else needs it, and `ROCKET_CSS` is exported so the standalone preview can use
// the same rules instead of a copy that drifts.

import { useEffect, useRef, useState } from "react";

// Must match the `psi-rocket-launch` animation in ROCKET_CSS.
const LAUNCH_MS = 1100;

export const ROCKET_CSS = `
  /* 70px above the bottom edge, centred. Pointer events stay off so the
     rocket never blocks the page underneath it. */
  .psi-rocket {
    position: fixed; left: 50%; bottom: 70px; transform: translateX(-50%);
    z-index: 2147482000; pointer-events: none;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
  }
  .psi-rocket__stage {
    position: relative; display: block; width: 48px; height: 64px;
  }
  .psi-rocket__body {
    display: block; width: 48px; height: 64px;
    filter: drop-shadow(0 6px 10px rgba(19, 85, 196, 0.22));
  }
  .psi-rocket__flame {
    position: absolute; left: 50%; bottom: -15px; width: 16px; height: 26px;
    transform: translateX(-50%);
    background: radial-gradient(
      50% 60% at 50% 32%,
      #fff6c9 0%, #ffca3a 38%, #ff6b35 72%, rgba(255, 107, 53, 0) 100%
    );
    border-radius: 50% 50% 50% 50% / 34% 34% 66% 66%;
    filter: blur(1px);
  }
  .psi-rocket__label {
    font: 600 13px/1 Inter, system-ui, -apple-system, sans-serif; color: #1355c4;
    background: #ffffff; border: 1px solid #dbe6fb; border-radius: 999px;
    padding: 6px 12px; white-space: nowrap;
    box-shadow: 0 4px 14px rgba(19, 85, 196, 0.16);
  }

  @keyframes psi-rocket-hover {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
  @keyframes psi-rocket-flame {
    from { transform: translateX(-50%) scale(0.94, 0.82); }
    to { transform: translateX(-50%) scale(1.04, 1.16); }
  }
  /* Up and out — the run is done, so the rocket has nothing left to do. */
  @keyframes psi-rocket-launch {
    0% { transform: translateY(0) scale(1); opacity: 1; }
    55% { transform: translateY(-45vh) scale(0.94); opacity: 1; }
    100% { transform: translateY(-135vh) scale(0.86); opacity: 0; }
  }

  .psi-rocket--running .psi-rocket__stage {
    animation: psi-rocket-hover 1.8s ease-in-out infinite;
  }
  .psi-rocket--running .psi-rocket__flame {
    animation: psi-rocket-flame 0.28s ease-in-out infinite alternate;
  }
  .psi-rocket--launching .psi-rocket__stage {
    animation: psi-rocket-launch 1.1s cubic-bezier(0.5, 0.02, 0.86, 0.32) forwards;
  }
  .psi-rocket--launching .psi-rocket__flame {
    animation: psi-rocket-flame 0.12s ease-in-out infinite alternate;
  }
  .psi-rocket--launching .psi-rocket__label {
    opacity: 0; transition: opacity 0.18s ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .psi-rocket--running .psi-rocket__stage,
    .psi-rocket--running .psi-rocket__flame,
    .psi-rocket--launching .psi-rocket__flame { animation: none; }
    /* No flight: the finished run just clears. */
    .psi-rocket--launching .psi-rocket__stage { animation: none; opacity: 0; }
  }
`;

// A 48×64 rocket: two swept fins, a rounded body, a porthole and a nozzle.
function RocketArt() {
  return (
    <svg className="psi-rocket__body" viewBox="0 0 48 64" aria-hidden="true">
      <defs>
        <linearGradient id="psiRocketBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6aa4fa" />
          <stop offset="100%" stopColor="#1a73e8" />
        </linearGradient>
      </defs>
      <path
        d="M13.6 32.5C8.4 36.4 4.8 42 4 48.6l9.6-4Z"
        fill="#1355c4"
      />
      <path
        d="M34.4 32.5C39.6 36.4 43.2 42 44 48.6l-9.6-4Z"
        fill="#1355c4"
      />
      <path
        d="M24 3c6.9 7.4 10.4 16.6 10.4 26.6v15H13.6v-15C13.6 19.6 17.1 10.4 24 3Z"
        fill="url(#psiRocketBody)"
      />
      <circle cx="24" cy="25.5" r="5.4" fill="#e8f0fe" stroke="#a8c7fa" strokeWidth="2.2" />
      <path
        d="M16.8 44.6h14.4v3.6a4.4 4.4 0 0 1-4.4 4.4h-5.6a4.4 4.4 0 0 1-4.4-4.4Z"
        fill="#0b3d91"
      />
    </svg>
  );
}

export default function SpeedRocket({ active = false }) {
  // hidden → running → launching → hidden
  const [phase, setPhase] = useState("hidden");
  // Only launch for a run this mount actually saw running, so a page that
  // loads with nothing in flight never plays the animation.
  const seenRunning = useRef(false);

  useEffect(() => {
    if (active) {
      seenRunning.current = true;
      setPhase("running");
      return undefined;
    }
    if (!seenRunning.current) return undefined;
    seenRunning.current = false;
    setPhase("launching");
    const id = window.setTimeout(() => setPhase("hidden"), LAUNCH_MS);
    return () => window.clearTimeout(id);
  }, [active]);

  if (phase === "hidden") return null;

  return (
    <>
      <style>{ROCKET_CSS}</style>
      <div
        className={`psi-rocket psi-rocket--${phase}`}
        role="status"
        aria-live="polite"
      >
        <span className="psi-rocket__stage">
          <RocketArt />
          <span className="psi-rocket__flame" aria-hidden="true" />
        </span>
        <span className="psi-rocket__label">Analyzing your store…</span>
      </div>
    </>
  );
}
