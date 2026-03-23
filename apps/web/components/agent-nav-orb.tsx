"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { clearSession } from "../lib/session";
import { ThemeToggle } from "./theme-toggle";

const navItems = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "DB" },
  { href: "/agents", label: "Agents", shortLabel: "AG" },
  { href: "/integrations", label: "Integrations", shortLabel: "IN" },
  { href: "/publishing", label: "Durability", shortLabel: "DU" },
  { href: "/approvals", label: "Approvals", shortLabel: "AP" },
  { href: "/runs", label: "Runs", shortLabel: "RN" },
];

export function AgentNavOrb() {
  const pathname = usePathname();
  const router = useRouter();
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const open = pinnedOpen || hoverOpen;
  const activeItem = useMemo(
    () =>
      navItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ??
      navItems[0],
    [pathname],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPinnedOpen(false);
        setHoverOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPinnedOpen(false);
        setHoverOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleLogout = () => {
    clearSession();
    setPinnedOpen(false);
    setHoverOpen(false);
    router.replace("/login");
  };

  return (
    <div
      ref={rootRef}
      className="agent-nav-orb"
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => {
        if (!pinnedOpen) {
          setHoverOpen(false);
        }
      }}
    >
      <button
        type="button"
        className={`agent-nav-orb__trigger${open ? " is-open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open navigation menu"
        onClick={() => {
          const next = !pinnedOpen;
          setPinnedOpen(next);
          setHoverOpen(next);
        }}
      >
        <span className="agent-nav-orb__robot">
          <span className="agent-nav-orb__eyes">
            <span />
            <span />
          </span>
          <span className="agent-nav-orb__mouth" />
        </span>
        <span className="agent-nav-orb__label">
          <span className="eyebrow">Agent OS</span>
          <strong>{activeItem.label}</strong>
        </span>
      </button>

      {open ? (
        <div className="agent-nav-orb__panel" role="menu" aria-label="Primary navigation">
          <div className="agent-nav-orb__panel-header">
            <div>
              <p className="eyebrow">Control window</p>
              <strong>Agent navigation</strong>
            </div>
            <button
              type="button"
              className="agent-nav-orb__close"
              aria-label="Close navigation menu"
              onClick={() => {
                setPinnedOpen(false);
                setHoverOpen(false);
              }}
            >
              X
            </button>
          </div>

          <nav className="agent-nav-orb__menu">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`agent-nav-orb__link${active ? " is-active" : ""}`}
                  onClick={() => {
                    setPinnedOpen(false);
                    setHoverOpen(false);
                  }}
                >
                  <span className="agent-nav-orb__link-code">{item.shortLabel}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="agent-nav-orb__footer">
            <button type="button" className="mono-button mono-button--secondary" onClick={handleLogout}>
              Log out
            </button>
            <ThemeToggle />
          </div>
        </div>
      ) : null}
    </div>
  );
}
