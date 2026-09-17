"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

// Student <-> mentor conversation. Reads the real thread, sends through
// the messages API. Mentors pass receiverId to reply to a student.
export function MessageThread({ mentorUserId, receiverId, compact: isCompact }) {
  const [messages, setMessages] = useState(null);
  const [threads, setThreads] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/mentors/${mentorUserId}/messages`);
      const d = await res.json();
      if (!d.ok) throw new Error(d.error?.message || "Couldn't load messages");
      setMessages(d.data.messages || null);
      setThreads(d.data.threads || null);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [mentorUserId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "nearest" }); }, [messages]);

  async function send(e) {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/mentors/${mentorUserId}/messages`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft.trim(), ...(receiverId ? { receiverId } : {}) }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error?.message || "Message not sent");
      setDraft("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Mentor inbox (threads) renders on the manage page, not here.
  if (threads && !messages) return null;

  return (
    <div className={isCompact ? "" : "rounded-2xl border p-4"} style={isCompact ? undefined : { borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      {!isCompact && <h3 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Messages</h3>}
      {messages === null && !error ? (
        <div className="py-4" aria-hidden="true">
          <div className="skel" style={{ height: 44 }} />
          <div className="skel mt-2" style={{ height: 44, width: "80%" }} />
        </div>
      ) : error ? (
        <div className="py-3">
          <p className="text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>
          <button type="button" onClick={load} className="mt-2 text-[12.5px] font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            Try again
          </button>
        </div>
      ) : messages.length === 0 ? (
        <p className="py-3 text-[13px]" style={{ color: "var(--text-muted)" }}>
          No messages yet — say hello and share what you&apos;d like help with.
        </p>
      ) : (
        <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto" aria-live="polite" aria-label="Conversation">
          {messages.map((m) => {
            const isMine = receiverId ? m.sender_id === mentorUserId : m.sender_id !== mentorUserId;
            return (
              <li key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-5"
                  style={isMine
                    ? { background: "var(--dash-accent, var(--accent))", color: "#fff" }
                    : { background: "var(--bg-muted)", color: "var(--text)" }}
                >
                  <p>{m.body}</p>
                  <p className="mt-0.5 text-[10px] opacity-70" suppressHydrationWarning>
                    {m.created_at ? new Date(m.created_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                    {isMine && m.read_at ? " · seen" : ""}
                  </p>
                </div>
              </li>
            );
          })}
          <li ref={bottomRef} aria-hidden="true" />
        </ul>
      )}
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          maxLength={2000}
          aria-label="Message text"
          className="flex-1 rounded-xl border px-3 py-2 text-[13px] outline-none"
          style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
        />
        <button type="submit" disabled={busy || !draft.trim()} aria-label="Send message" className="btn-ink !px-3.5 disabled:opacity-50">
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
