import Link from "next/link";
import type { PropsWithChildren } from "react";
import { ThemeToggle } from "./theme-toggle";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/agents", label: "Agents" },
  { href: "/integrations", label: "Integrations" },
  { href: "/publishing", label: "Publishing" },
  { href: "/approvals", label: "Approvals" },
  { href: "/runs", label: "Runs" },
];

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="brand-lockup">
          <p className="brand-lockup__eyebrow">Agent Marketplace</p>
          <h1 className="brand-lockup__title">Independent operating system for agent teams</h1>
        </div>
        <nav className="primary-nav">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="primary-nav__link">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="app-shell__sidebar-footer">
          <ThemeToggle />
        </div>
      </aside>
      <main className="app-shell__content">{children}</main>
    </div>
  );
}
