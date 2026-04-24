"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentChatMessage, AgentChatThread } from "@agent-marketplace/contracts";
import { MonochromeButton, SectionCard, StatusPill } from "@agent-marketplace/ui";
import { apiFetch } from "../../../lib/api-client";

type ChatDetail = {
  thread: AgentChatThread;
  messages: AgentChatMessage[];
};

type MessageCreateResult = {
  messages: AgentChatMessage[];
};

export default function ChatPage() {
  const [threads, setThreads] = useState<AgentChatThread[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<ChatDetail | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [message, setMessage] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const loaded = await apiFetch<AgentChatThread[]>("/agent-chats");
      setThreads(loaded);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load chats.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const activeThreads = useMemo(
    () => threads.filter((thread) => thread.status === "active"),
    [threads],
  );
  const archivedThreads = useMemo(
    () => threads.filter((thread) => thread.status === "archived"),
    [threads],
  );
  const visibleThreads = showArchived ? archivedThreads : activeThreads;

  const loadThread = async (threadId: string) => {
    setWorking(threadId);
    setError(null);

    try {
      const detail = await apiFetch<ChatDetail>(`/agent-chats/${threadId}`);
      setSelectedDetail(detail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load chat.");
    } finally {
      setWorking(null);
    }
  };

  const handleCreate = async () => {
    setWorking("create");
    setError(null);

    try {
      const detail = await apiFetch<ChatDetail>("/agent-chats", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim() || undefined,
          message: newMessage.trim() || undefined,
        }),
      });
      setSelectedDetail(detail);
      setNewTitle("");
      setNewMessage("");
      await loadThreads();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to start chat.");
    } finally {
      setWorking(null);
    }
  };

  const handleSend = async () => {
    if (!selectedDetail) {
      return;
    }

    setWorking("message");
    setError(null);

    try {
      const result = await apiFetch<MessageCreateResult>(`/agent-chats/${selectedDetail.thread.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          message,
        }),
      });
      setSelectedDetail({
        ...selectedDetail,
        thread: {
          ...selectedDetail.thread,
          status: "active",
        },
        messages: [...selectedDetail.messages, ...result.messages],
      });
      setMessage("");
      await loadThreads();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send message.");
    } finally {
      setWorking(null);
    }
  };

  const handleArchive = async () => {
    if (!selectedDetail) {
      return;
    }

    setWorking("archive");
    setError(null);

    try {
      const thread = await apiFetch<AgentChatThread>(`/agent-chats/${selectedDetail.thread.id}/archive`, {
        method: "POST",
      });
      setSelectedDetail({
        ...selectedDetail,
        thread,
      });
      await loadThreads();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Unable to archive chat.");
    } finally {
      setWorking(null);
    }
  };

  const handleResume = async (threadId?: string) => {
    const targetThreadId = threadId ?? selectedDetail?.thread.id;
    if (!targetThreadId) {
      return;
    }

    setWorking("resume");
    setError(null);

    try {
      await apiFetch<AgentChatThread>(`/agent-chats/${targetThreadId}/resume`, {
        method: "POST",
      });
      await loadThreads();
      await loadThread(targetThreadId);
      setShowArchived(false);
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "Unable to resume chat.");
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <p className="eyebrow">Memory chat</p>
          <h1>Chat</h1>
          <p className="muted-copy">
            Start or resume conversations. Each message retrieves Learning Library context before the assistant responds.
          </p>
        </div>
        <div className="row-between">
          <MonochromeButton type="button" variant="secondary" disabled={loading} onClick={() => void loadThreads()}>
            {loading ? "Refreshing..." : "Refresh"}
          </MonochromeButton>
          <MonochromeButton type="button" variant="secondary" onClick={() => setShowArchived((current) => !current)}>
            {showArchived ? "Show active" : "Show archived"}
          </MonochromeButton>
        </div>
      </div>

      {error ? <p className="form-status">{error}</p> : null}

      <section className="two-up-grid">
        <SectionCard title="Start chat" eyebrow="New conversation">
          <div className="stack">
            <input
              className="mono-input"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              aria-label="Chat title"
              placeholder="Optional title"
            />
            <textarea
              className="mono-textarea"
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              aria-label="Initial message"
              placeholder="Ask a question or leave blank to create an empty chat"
            />
            <MonochromeButton
              type="button"
              disabled={working !== null || (!newTitle.trim() && !newMessage.trim())}
              onClick={() => void handleCreate()}
            >
              {working === "create" ? "Starting..." : "Start chat"}
            </MonochromeButton>
          </div>
        </SectionCard>

        <SectionCard title={showArchived ? "Archived chats" : "Active chats"} eyebrow="Resume context">
          {loading ? (
            <p className="muted-copy">Loading chats...</p>
          ) : visibleThreads.length ? (
            <div className="stack">
              {visibleThreads.map((thread) => (
                <article key={thread.id} className="audit-list__item">
                  <div className="row-between">
                    <div>
                      <strong>{thread.title}</strong>
                      <p className="muted-copy">
                        {thread.lastMessage ?? "No messages yet"} - {thread.messageCount ?? 0} messages
                      </p>
                    </div>
                    <StatusPill>{thread.status}</StatusPill>
                  </div>
                  <div className="row-between">
                    <MonochromeButton type="button" variant="secondary" disabled={working !== null} onClick={() => void loadThread(thread.id)}>
                      {working === thread.id ? "Opening..." : "Open"}
                    </MonochromeButton>
                    {thread.status === "archived" ? (
                      <MonochromeButton type="button" disabled={working !== null} onClick={() => void handleResume(thread.id)}>
                        Resume
                      </MonochromeButton>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted-copy">{showArchived ? "No archived chats yet." : "No active chats yet."}</p>
          )}
        </SectionCard>
      </section>

      <SectionCard
        title={selectedDetail?.thread.title ?? "Conversation"}
        eyebrow={selectedDetail ? selectedDetail.thread.status : "Select or start a chat"}
        actions={
          selectedDetail ? (
            selectedDetail.thread.status === "archived" ? (
              <MonochromeButton type="button" variant="secondary" disabled={working !== null} onClick={() => void handleResume()}>
                Resume chat
              </MonochromeButton>
            ) : (
              <MonochromeButton type="button" variant="secondary" disabled={working !== null} onClick={() => void handleArchive()}>
                {working === "archive" ? "Archiving..." : "Archive"}
              </MonochromeButton>
            )
          ) : null
        }
      >
        {selectedDetail ? (
          <div className="stack">
            <div className="stack">
              {selectedDetail.messages.length ? (
                selectedDetail.messages.map((chatMessage) => (
                  <article key={chatMessage.id} className="audit-list__item">
                    <div className="row-between">
                      <strong>{chatMessage.role === "assistant" ? "Assistant" : chatMessage.role === "user" ? "You" : "System"}</strong>
                      <StatusPill>
                        {chatMessage.memoryContext.length
                          ? `${chatMessage.memoryContext.length} memory matches`
                          : "no memory matches"}
                      </StatusPill>
                    </div>
                    <p className="muted-copy">{chatMessage.content}</p>
                  </article>
                ))
              ) : (
                <p className="muted-copy">No messages yet.</p>
              )}
            </div>

            <textarea
              className="mono-textarea"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              aria-label="Message"
              placeholder="Ask a follow-up. Archived chats will resume when you send."
            />
            <MonochromeButton
              type="button"
              disabled={working !== null || !message.trim()}
              onClick={() => void handleSend()}
            >
              {working === "message" ? "Sending..." : "Send"}
            </MonochromeButton>
          </div>
        ) : (
          <p className="muted-copy">Open a previous chat or start a new one.</p>
        )}
      </SectionCard>
    </div>
  );
}
