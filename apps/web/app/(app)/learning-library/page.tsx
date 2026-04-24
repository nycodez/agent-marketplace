"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  LearningLibraryQueryResult,
  LearningLibrarySource,
  LearningLibrarySourceType,
} from "@agent-marketplace/contracts";
import { MonochromeButton, SectionCard, StatusPill } from "@agent-marketplace/ui";
import { apiFetch } from "../../../lib/api-client";

type ReindexResult = {
  indexedCount: number;
  failedCount: number;
};

type PurgeResult = {
  deletedCount: number;
};

const sourceTypeOptions: Array<{ value: LearningLibrarySourceType; label: string }> = [
  { value: "manual_note", label: "Manual note" },
  { value: "program_file", label: "Program file" },
  { value: "agent_run", label: "Agent run" },
  { value: "chat_message", label: "Chat message" },
  { value: "integration_artifact", label: "Integration artifact" },
  { value: "uploaded_document", label: "Uploaded document" },
];

export default function LearningLibraryPage() {
  const [sources, setSources] = useState<LearningLibrarySource[]>([]);
  const [results, setResults] = useState<LearningLibraryQueryResult[]>([]);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [sourceType, setSourceType] = useState<LearningLibrarySourceType>("manual_note");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const indexedCount = useMemo(
    () => sources.filter((source) => source.status === "indexed").length,
    [sources],
  );

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (search.trim()) {
        params.set("search", search.trim());
      }
      const loaded = await apiFetch<LearningLibrarySource[]>(
        `/learning-library/sources${params.toString() ? `?${params.toString()}` : ""}`,
      );
      setSources(loaded);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the learning library.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    setWorking("create");
    setError(null);
    setStatusMessage(null);

    try {
      await apiFetch<LearningLibrarySource>("/learning-library/sources", {
        method: "POST",
        body: JSON.stringify({
          title,
          summary: summary.trim() || null,
          content,
          sourceType,
          metadata: {},
        }),
      });
      setTitle("");
      setSummary("");
      setContent("");
      setSourceType("manual_note");
      setStatusMessage("Learning source indexed.");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to index source.");
    } finally {
      setWorking(null);
    }
  };

  const handleQuery = async () => {
    setWorking("query");
    setError(null);
    setStatusMessage(null);

    try {
      const loaded = await apiFetch<LearningLibraryQueryResult[]>("/learning-library/query", {
        method: "POST",
        body: JSON.stringify({
          query,
          limit: 8,
        }),
      });
      setResults(loaded);
      setStatusMessage(`Found ${loaded.length} matching excerpt${loaded.length === 1 ? "" : "s"}.`);
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : "Unable to query the learning library.");
    } finally {
      setWorking(null);
    }
  };

  const handleReindex = async () => {
    setWorking("reindex");
    setError(null);
    setStatusMessage(null);

    try {
      const result = await apiFetch<ReindexResult>("/learning-library/reindex", {
        method: "POST",
        body: JSON.stringify({
          limit: 250,
        }),
      });
      setStatusMessage(`Reindexed ${result.indexedCount} source${result.indexedCount === 1 ? "" : "s"}; ${result.failedCount} failed.`);
      await load();
    } catch (reindexError) {
      setError(reindexError instanceof Error ? reindexError.message : "Unable to reindex sources.");
    } finally {
      setWorking(null);
    }
  };

  const handleDelete = async (sourceId: string) => {
    setWorking(sourceId);
    setError(null);
    setStatusMessage(null);

    try {
      await apiFetch<{ deleted: boolean }>(`/learning-library/sources/${sourceId}`, {
        method: "DELETE",
      });
      setStatusMessage("Learning source removed.");
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to remove source.");
    } finally {
      setWorking(null);
    }
  };

  const handlePurge = async () => {
    if (!window.confirm("Remove all indexed learning library data for this workspace?")) {
      return;
    }

    setWorking("purge");
    setError(null);
    setStatusMessage(null);

    try {
      const result = await apiFetch<PurgeResult>("/learning-library/purge", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setResults([]);
      setStatusMessage(`Purged ${result.deletedCount} source${result.deletedCount === 1 ? "" : "s"}.`);
      await load();
    } catch (purgeError) {
      setError(purgeError instanceof Error ? purgeError.message : "Unable to purge the library.");
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <p className="eyebrow">Workspace memory</p>
          <h1>Learning Library</h1>
          <p className="muted-copy">
            Indexed notes, artifacts, and run history are retrieved automatically when agents plan a run.
          </p>
        </div>
        <div className="row-between">
          <MonochromeButton type="button" variant="secondary" disabled={working !== null} onClick={() => void handleReindex()}>
            {working === "reindex" ? "Reindexing..." : "Reindex"}
          </MonochromeButton>
          <MonochromeButton type="button" variant="secondary" disabled={working !== null || !sources.length} onClick={() => void handlePurge()}>
            {working === "purge" ? "Purging..." : "Purge"}
          </MonochromeButton>
        </div>
      </div>

      <section className="stats-grid">
        <div className="stat-tile">
          <span className="stat-tile__label">Sources</span>
          <strong className="stat-tile__value">{sources.length}</strong>
          <span className="stat-tile__hint">workspace scoped</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile__label">Indexed</span>
          <strong className="stat-tile__value">{indexedCount}</strong>
          <span className="stat-tile__hint">available to agents</span>
        </div>
      </section>

      {error ? <p className="form-status">{error}</p> : null}
      {statusMessage ? <p className="form-status">{statusMessage}</p> : null}

      <section className="two-up-grid">
        <SectionCard title="Add source" eyebrow="Manual memory">
          <div className="stack">
            <input
              className="mono-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Source title"
              placeholder="Source title"
            />
            <input
              className="mono-input"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              aria-label="Source summary"
              placeholder="Optional summary"
            />
            <label className="provider-flow__field">
              <span>Source type</span>
              <select
                className="mono-input"
                value={sourceType}
                onChange={(event) => setSourceType(event.target.value as LearningLibrarySourceType)}
              >
                {sourceTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              className="mono-textarea"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              aria-label="Source content"
              placeholder="Paste the content the agents should remember..."
            />
            <MonochromeButton
              type="button"
              disabled={working !== null || !title.trim() || !content.trim()}
              onClick={() => void handleCreate()}
            >
              {working === "create" ? "Indexing..." : "Index source"}
            </MonochromeButton>
          </div>
        </SectionCard>

        <SectionCard title="Query memory" eyebrow="Retrieval check">
          <div className="stack">
            <textarea
              className="mono-textarea"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Library query"
              placeholder="Ask what the agents should retrieve..."
            />
            <MonochromeButton type="button" disabled={working !== null || query.trim().length < 2} onClick={() => void handleQuery()}>
              {working === "query" ? "Searching..." : "Search library"}
            </MonochromeButton>
            <div className="stack">
              {results.map((result) => (
                <article key={result.chunkId} className="audit-list__item">
                  <div className="row-between">
                    <strong>{result.source.title}</strong>
                    <StatusPill>{result.source.sourceType}</StatusPill>
                  </div>
                  <p className="muted-copy">{result.content}</p>
                </article>
              ))}
            </div>
          </div>
        </SectionCard>
      </section>

      <SectionCard title="Indexed sources" eyebrow="Library inventory">
        <div className="stack">
          <div className="row-between">
            <input
              className="mono-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Filter sources"
              placeholder="Filter sources"
            />
            <MonochromeButton type="button" variant="secondary" disabled={loading} onClick={() => void load()}>
              {loading ? "Loading..." : "Refresh"}
            </MonochromeButton>
          </div>
          {sources.length ? (
            <div className="stack">
              {sources.map((source) => (
                <article key={source.id} className="audit-list__item">
                  <div className="row-between">
                    <div>
                      <strong>{source.title}</strong>
                      <p className="muted-copy">
                        {source.summary ?? "No summary"} - {source.chunkCount ?? 0} chunks
                      </p>
                    </div>
                    <div className="row-between">
                      <StatusPill>{source.status}</StatusPill>
                      <StatusPill>{source.sourceType}</StatusPill>
                      <MonochromeButton
                        type="button"
                        variant="secondary"
                        disabled={working !== null}
                        onClick={() => void handleDelete(source.id)}
                      >
                        {working === source.id ? "Removing..." : "Remove"}
                      </MonochromeButton>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted-copy">No indexed sources yet.</p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
