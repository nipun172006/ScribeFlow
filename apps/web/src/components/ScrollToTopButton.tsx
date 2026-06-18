import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cx } from "../lib/classNames";

/**
 * ScrollToTopButton
 *
 * A floating action button that appears once the user scrolls past 300px.
 * Clicking it smoothly scrolls the window back to the top.
 *
 * Added by AryanSirohi148 — UI polish / responsive layout improvement.
 */
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > 300);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <button
      type="button"
      aria-label="Scroll to top"
      onClick={scrollToTop}
      className={cx(
        "fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface/80 text-accent shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-300",
        "hover:border-accent/40 hover:bg-surface hover:shadow-[0_8px_32px_rgba(54,211,194,0.18)] hover:scale-110",
        "focus-visible:outline-accent",
        visible
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "translate-y-4 opacity-0 pointer-events-none",
      )}
    >
      <ArrowUp size={18} aria-hidden="true" />
    </button>
  );
}
