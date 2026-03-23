import { MonochromeButton, SectionCard, StatusPill } from "@agent-marketplace/ui";
import { programFiles, publicationRecords } from "../../../lib/demo-data";

export default function PublishingPage() {
  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <p className="eyebrow">First-class publishing</p>
          <h1>Program files to Base and Arweave</h1>
        </div>
        <MonochromeButton>Create program file</MonochromeButton>
      </div>

      <section className="two-up-grid">
        <SectionCard title="Program file editor" eyebrow="Source of truth">
          <div className="stack">
            <input
              className="mono-input"
              defaultValue={programFiles[0]?.name}
              aria-label="Program file name"
            />
            <textarea
              className="mono-textarea"
              defaultValue={programFiles[0]?.content}
              aria-label="Program file content"
            />
            <div className="row-between">
              <MonochromeButton>Publish to Base</MonochromeButton>
              <MonochromeButton variant="secondary">Publish to Arweave</MonochromeButton>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Publication rules" eyebrow="Operational defaults">
          <ul className="bullet-list">
            <li>Program files stay workspace-scoped and audit-logged.</li>
            <li>Base publication registers chain-visible artifacts and manifests.</li>
            <li>Arweave publication creates immutable content-addressed retrieval URLs.</li>
            <li>Publishing can be routed through org-installed wallet integrations.</li>
          </ul>
        </SectionCard>
      </section>

      <SectionCard title="Stored program files" eyebrow="Publishable artifacts">
        <table className="table-block">
          <thead>
            <tr>
              <th>Name</th>
              <th>Source type</th>
              <th>Tags</th>
              <th>Agent</th>
            </tr>
          </thead>
          <tbody>
            {programFiles.map((programFile) => (
              <tr key={programFile.id}>
                <td>{programFile.name}</td>
                <td>{programFile.sourceType}</td>
                <td>{programFile.tags.join(", ")}</td>
                <td>{programFile.agentId ?? "unassigned"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Publication history" eyebrow="Onchain + permanent storage">
        <div className="approval-list">
          {publicationRecords.map((publication) => (
            <div key={publication.id} className="approval-list__item">
              <div className="approval-list__header">
                <strong>
                  {publication.target} · {publication.summary}
                </strong>
                <StatusPill>{publication.status}</StatusPill>
              </div>
              <p className="muted-copy">
                Transaction: {publication.transactionId ?? "pending"} · Gateway:{" "}
                {publication.gatewayUrl ?? "not available"}
              </p>
              <p className="muted-copy">
                Temporal workflow: {publication.orchestration.workflowId ?? "not scheduled"}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
