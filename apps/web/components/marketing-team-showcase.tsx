"use client";

import { useEffect, useState } from "react";
import { StatusPill } from "@agent-marketplace/ui";
import type { AgentTeamDraft } from "@agent-marketplace/contracts";

export function MarketingTeamShowcase({ teams }: { teams: AgentTeamDraft[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (teams.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % teams.length);
    }, 4800);

    return () => window.clearInterval(interval);
  }, [teams.length]);

  const activeTeam = teams[activeIndex];

  return (
    <div className="team-showcase stack">
      <div className="team-showcase__header">
        <div>
          <p className="eyebrow">Example agent teams</p>
          <h2 className="team-showcase__title">{activeTeam.title}</h2>
        </div>
        <div className="team-showcase__controls">
          {teams.map((team, index) => (
            <button
              key={team.id}
              type="button"
              className={`team-showcase__dot${index === activeIndex ? " is-active" : ""}`}
              aria-label={`Show ${team.title}`}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      </div>

      <p className="muted-copy">{activeTeam.brief}</p>

      <div className="stack">
        {activeTeam.generatedAgents.map((agent) => (
          <div key={agent.id} className="agent-list__item">
            <div className="agent-list__header">
              <strong>{agent.roleName}</strong>
              <StatusPill>{agent.approvalPolicy}</StatusPill>
            </div>
            <p className="agent-list__meta">{agent.mission}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
