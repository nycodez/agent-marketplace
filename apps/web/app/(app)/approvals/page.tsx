import { MonochromeButton, SectionCard, StatusPill } from "@agent-marketplace/ui";
import { approvals } from "../../../lib/demo-data";

export default function ApprovalsPage() {
  return (
    <div className="stack">
      <div>
        <p className="eyebrow">Human-in-the-loop</p>
        <h1>Approval queue</h1>
      </div>

      <SectionCard title="Pending requests" eyebrow="External writes">
        <div className="approval-list">
          {approvals.map((approval) => (
            <div key={approval.id} className="approval-list__item">
              <div className="approval-list__header">
                <strong>{approval.summary}</strong>
                <StatusPill>{approval.status}</StatusPill>
              </div>
              <ul className="bullet-list">
                {approval.requestedActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
              <div className="row-between">
                <MonochromeButton>Approve</MonochromeButton>
                <MonochromeButton variant="secondary">Reject</MonochromeButton>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
