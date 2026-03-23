import type { PropsWithChildren } from "react";
import { AgentNavOrb } from "./agent-nav-orb";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <AgentNavOrb />
      <main className="app-shell__content">{children}</main>
    </div>
  );
}
