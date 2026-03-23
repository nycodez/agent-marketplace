import { SectionCard, StatusPill } from "@agent-marketplace/ui";
import { runs } from "../../../lib/demo-data";

export default function RunsPage() {
  return (
    <div className="stack">
      <div>
        <p className="eyebrow">Execution ledger</p>
        <h1>Runs and step history</h1>
      </div>

      <SectionCard title="Recent runs" eyebrow="Durable state">
        <table className="table-block">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th>Temporal</th>
              <th>Trigger</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{run.agentName}</td>
                <td>
                  <StatusPill>{run.status}</StatusPill>
                </td>
                <td>{run.orchestration.workflowId ?? "not scheduled"}</td>
                <td>{run.triggerType}</td>
                <td>{run.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="What a run stores" eyebrow="Audit completeness">
        <ul className="bullet-list">
          <li>Summary and planned actions.</li>
          <li>Approval requirement and linked approval request.</li>
          <li>Temporal workflow metadata for orchestration, replay, and recovery.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
