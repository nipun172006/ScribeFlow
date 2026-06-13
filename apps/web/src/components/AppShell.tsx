import { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { BarChart3, Home, Library, Menu, Mic2, Plus, Search, X } from "lucide-react";
import { cx } from "../lib/classNames";

const navigationItems = [
  { label: "Dashboard", href: "/", icon: Home, end: true },
  { label: "New Meeting", href: "/meetings/new", icon: Mic2 },
  { label: "Archive", href: "/archive", icon: Library },
  { label: "Search", href: "/search", icon: Search },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
];

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const sidebar = (
    <aside
      className={cx(
        "flex h-full w-72 flex-col border-r border-border/80 bg-surface px-4 py-5",
        "md:fixed md:inset-y-0 md:left-0",
      )}
      aria-label="Primary"
    >
      <Link
        to="/"
        className="flex items-center gap-3 rounded-control px-2 py-2 text-primary"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-card border border-accent/40 bg-accent/12 text-sm font-bold text-accent">
          SF
        </span>
        <span>
          <span className="block text-base font-semibold">ScribeFlow</span>
          <span className="block text-xs text-muted">Meeting intelligence</span>
        </span>
      </Link>

      <Link
        to="/meetings/new"
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-control bg-accent px-3 py-2.5 text-sm font-semibold text-accent-contrast transition duration-fast hover:bg-accent/90"
      >
        <Plus size={17} aria-hidden="true" />
        New Meeting
      </Link>

      <nav className="mt-6 space-y-1" aria-label="Main navigation">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  "flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition duration-fast",
                  isActive
                    ? "bg-surface-raised text-primary"
                    : "text-muted hover:bg-surface-raised/70 hover:text-primary",
                )
              }
            >
              <Icon size={18} aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto rounded-card border border-border/70 bg-background/70 p-4">
        <p className="text-sm font-medium text-primary">Phase 4A analysis</p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Uploaded and live browser recordings can be transcribed with Deepgram,
          analysed with Gemini, and searched through the archive.
        </p>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-background text-primary">
      <div className="md:hidden">
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-card border border-accent/40 bg-accent/12 text-xs text-accent">
              SF
            </span>
            ScribeFlow
          </Link>
          <button
            type="button"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            className="rounded-control border border-border p-2 text-primary"
            onClick={() => setMobileOpen((current) => !current)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm">
            <div className="h-full max-w-80">{sidebar}</div>
          </div>
        ) : null}
      </div>

      <div className="hidden md:block">{sidebar}</div>

      <main className="md:pl-72">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
