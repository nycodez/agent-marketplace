"use client";

import { useEffect, useState } from "react";
import { MonochromeButton } from "@agent-marketplace/ui";

export function TypedTeamDraftExplainer() {
  const [openPanel, setOpenPanel] = useState<"typed-team-draft" | "least-privilege-grants" | null>(
    null,
  );

  const open = openPanel !== null;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenPanel(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const panelContent =
    openPanel === "typed-team-draft"
      ? {
          title: "Typed team draft",
          intro:
            "A typed team draft is a structured agent blueprint, not just a paragraph of prompt text. The system turns the business brief into named agents with explicit runtime fields.",
          bullets: [
            "Each draft agent gets a role name, mission, responsibilities, and success metrics.",
            "Allowed tools, triggers, and approval policy are saved as typed fields the runtime can enforce.",
            "Operators can review, edit, and publish the draft before any agent becomes active.",
            "The published version becomes durable configuration that can be audited, granted, and replayed.",
          ],
        }
      : openPanel === "least-privilege-grants"
        ? {
            title: "Least-privilege grants",
            intro:
              "Least-privilege grants mean an agent only gets the specific tools and systems it needs for its job, not blanket access to every integration in the workspace.",
            bullets: [
              "Integrations are installed once for the organization, then granted per agent and per workspace.",
              "A support agent might get only `slack.post`, while a different agent gets read-only CRM access.",
              "Runs only plan actions for tools that are both allowed on the agent and explicitly granted.",
              "This keeps mistakes, overreach, and secret sprawl under control while preserving auditability.",
            ],
          }
        : null;

  return (
    <>
      <p className="hero-copy">
        Agent Marketplace turns a business brief into a{" "}
        <button
          type="button"
          className="inline-term-button"
          onClick={() => setOpenPanel("typed-team-draft")}
        >
          typed team draft
        </button>
        , connects integrations with{" "}
        <button
          type="button"
          className="inline-term-button"
          onClick={() => setOpenPanel("least-privilege-grants")}
        >
          least-privilege grants
        </button>
        , supports first-class publication to Base and Arweave, and keeps every external write
        behind an approval queue.
      </p>

      {panelContent ? (
        <div className="info-window-backdrop" role="presentation" onClick={() => setOpenPanel(null)}>
          <div
            className="info-window"
            role="dialog"
            aria-modal="true"
            aria-labelledby="marketing-info-window-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="info-window__titlebar">
              <div>
                <p className="eyebrow">System help</p>
                <strong id="marketing-info-window-title">{panelContent.title}</strong>
              </div>
              <button
                type="button"
                className="info-window__close"
                aria-label="Close help window"
                onClick={() => setOpenPanel(null)}
              >
                X
              </button>
            </div>

            <div className="info-window__body">
              <p className="muted-copy">{panelContent.intro}</p>

              <ul className="bullet-list">
                {panelContent.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>

              <div className="info-window__actions">
                <MonochromeButton type="button" onClick={() => setOpenPanel(null)}>
                  Close window
                </MonochromeButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
