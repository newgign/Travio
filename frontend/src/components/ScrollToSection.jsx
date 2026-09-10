import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToSection() {
  const { pathname, hash, key } = useLocation();
  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return; }
    const id = hash === "#hot-tours" ? "offers" : hash.slice(1);
    let frame;
    let lastPosition;
    let stopped = false;
    const root = document.getElementById("root");
    if (!root) return;

    function stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    }
    function align() {
      if (stopped) return;
      const target = document.getElementById(id);
      if (!target) return;
      const position = target.getBoundingClientRect().top + window.scrollY;
      if (lastPosition === undefined || Math.abs(position - lastPosition) > 1) {
        lastPosition = position;
        target.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
          block: "start",
        });
      }
      // Re-align if loading content above the section changes its position.
      if (!root.querySelector('[aria-busy="true"]')) observer.disconnect();
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(align);
    }
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
    schedule();
    const events = ["wheel", "touchstart", "pointerdown", "keydown"];
    events.forEach(event => window.addEventListener(event, stop, { passive: true }));
    return () => {
      stop();
      events.forEach(event => window.removeEventListener(event, stop));
    };
  }, [pathname, hash, key]);
  return null;
}
