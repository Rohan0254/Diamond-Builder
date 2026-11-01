/* eslint-disable react/prop-types */
// Element-level loading feedback for page navigations.
//
// The shell tells this component which control started a load (a button, a nav
// link, an issue card); it draws a shimmering box over exactly that control, so
// the merchant sees the thing they clicked acknowledge the click instead of the
// whole page grey out.
//
// Nothing here touches the control itself — the overlay is a fixed-position
// sibling. It only reads geometry, which means it also works for Polaris web
// components that paint inside a shadow root.

import { useEffect, useState } from "react";

/**
 * Corner radius to draw with. The control's own radius when it paints one
 * (plain buttons, cards, links); Polaris web components paint their radius
 * inside a shadow tree we cannot measure, so those get a soft rounded box.
 */
function radiusFor(element, box) {
  const first = Number.parseFloat(getComputedStyle(element).borderRadius) || 0;
  const limit = box.height / 2;
  if (first > 0) return Math.min(first, limit);
  return Math.min(10, limit);
}

export default function NavLoadingShimmer({ target = null }) {
  const [box, setBox] = useState(null);

  useEffect(() => {
    if (!target || !target.isConnected) {
      setBox(null);
      return undefined;
    }

    let frame = 0;
    const measure = () => {
      frame = 0;
      // A control can leave the DOM (its route swapped in) mid-load.
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        setBox(null);
        return;
      }
      const next = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        radius: radiusFor(target, rect),
      };
      // Re-measuring on a timer must not re-render when nothing moved.
      setBox((previous) =>
        previous &&
        previous.top === next.top &&
        previous.left === next.left &&
        previous.width === next.width &&
        previous.height === next.height &&
        previous.radius === next.radius
          ? previous
          : next,
      );
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    // The control can also move without a scroll (a banner appearing, a tab
    // finishing its layout), so keep it glued while the load is in flight.
    const poll = window.setInterval(measure, 250);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.clearInterval(poll);
    };
  }, [target]);

  if (!box) return null;

  return (
    <span
      className="psi-nav-shimmer"
      style={{
        top: `${box.top}px`,
        left: `${box.left}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        borderRadius: `${box.radius}px`,
      }}
      aria-hidden="true"
    />
  );
}
