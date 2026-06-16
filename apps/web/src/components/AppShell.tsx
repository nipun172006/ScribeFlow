import { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  Home,
  Library,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { cx } from "../lib/classNames";

const navigationItems = [
  { label: "Dashboard", href: "/", icon: Home, end: true },
  { label: "Archive", href: "/archive", icon: Library },
  { label: "Search", href: "/search", icon: Search },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
];

function LogoMark() {
  return (
    <span className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-accent shadow-[0_0_30px_rgba(129,140,248,0.18)]">
        <ShieldCheck size={20} aria-hidden="true" />
      </span>
      <span>
        <span className="block font-display text-lg font-semibold tracking-normal text-primary">
          ScribeFlow
        </span>
        <span className="block font-ui text-xs text-muted">Meeting intelligence</span>
      </span>
    </span>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-background text-primary">
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_16%_16%,rgba(99,102,241,0.18),transparent_34rem),radial-gradient(circle_at_88%_18%,rgba(34,211,238,0.13),transparent_30rem),radial-gradient(circle_at_78%_86%,rgba(52,211,153,0.1),transparent_34rem)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_right,rgba(226,232,240,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(226,232,240,0.045)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_34%,rgba(2,6,23,0.74)_100%)]"
        aria-hidden="true"
      />

      <header className="fixed left-0 right-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-5">
        <nav
          className="mx-auto flex max-w-[1560px] items-center justify-between rounded-panel border border-white/10 bg-surface/80 px-4 py-3 shadow-soft backdrop-blur-2xl 2xl:max-w-[1600px]"
          aria-label="Primary"
        >
          <Link to="/" className="min-w-0 rounded-control focus-visible:outline-accent">
            <LogoMark />
          </Link>

          <div className="hidden items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.035] p-1 lg:flex">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.href}
                  to={item.href}
                  end={item.end}
                  className={({ isActive }) =>
                    cx(
                      "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 font-ui text-sm font-semibold transition duration-fast",
                      isActive
                        ? "bg-white/[0.08] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                        : "text-muted hover:bg-white/[0.055] hover:text-primary",
                    )
                  }
                >
                  <Icon size={16} aria-hidden="true" />
                  {item.label}
                </NavLink>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/meetings/new"
              className="sf-primary-button hidden sm:inline-flex"
            >
              <Plus size={17} aria-hidden="true" />
              New Meeting
            </Link>
            <button
              type="button"
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileOpen}
              className="sf-secondary-button px-3 lg:hidden"
              onClick={() => setMobileOpen((current) => !current)}
            >
              {mobileOpen ? (
                <X size={18} aria-hidden="true" />
              ) : (
                <Menu size={18} aria-hidden="true" />
              )}
            </button>
          </div>
        </nav>

        {mobileOpen ? (
          <div className="mx-auto mt-3 max-w-[1560px] rounded-panel border border-white/10 bg-zinc-950/90 p-3 shadow-soft backdrop-blur-2xl 2xl:max-w-[1600px] lg:hidden">
            <nav className="grid gap-1" aria-label="Mobile navigation">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    end={item.end}
                    className={({ isActive }) =>
                      cx(
                        "flex items-center gap-3 rounded-control px-3 py-3 font-ui text-sm font-semibold transition duration-fast",
                        isActive
                          ? "bg-white/[0.08] text-primary"
                          : "text-muted hover:bg-white/[0.055] hover:text-primary",
                      )
                    }
                  >
                    <Icon size={17} aria-hidden="true" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
            <Link to="/meetings/new" className="sf-primary-button mt-3 w-full">
              <Plus size={17} aria-hidden="true" />
              New Meeting
            </Link>
          </div>
        ) : null}
      </header>

      <main className="relative z-10 min-h-screen w-full px-5 pb-16 pt-28 sm:px-8 lg:px-10 xl:px-12">
        <div className="mx-auto w-full max-w-[1560px] 2xl:max-w-[1600px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
