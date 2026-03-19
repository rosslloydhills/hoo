'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/browserClient';
import ReactMarkdown from 'react-markdown';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type DashboardChatProps = {
  onContactAdded?: () => void;
};

export function DashboardChat({ onContactAdded }: DashboardChatProps) {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const historyRef = useRef<HTMLDivElement | null>(null);

  async function refreshMessages(id: string) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id,role,content,created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) throw error;

    const mapped = (data ?? []).map((row) => ({
      id: row.id,
      role: row.role as 'user' | 'assistant',
      content: row.content
    }));
    setMessages(mapped);
  }

  async function persistMessage(userId: string, message: ChatMessage) {
    await supabase.from('chat_messages').insert({
      user_id: userId,
      role: message.role,
      content: message.content
    });
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const id = data.session?.user?.id ?? null;
        if (!mounted) return;

        if (!id) {
          // SessionGate should have redirected already, but keep it defensive.
          setUserId(null);
          return;
        }

        setUserId(id);
        await refreshMessages(id);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Failed to load contacts.');
      }
    })();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    const el = historyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  async function onSend() {
    if (sending) return;
    const content = draft.trim();
    if (!content) return;
    if (!userId) return;

    setDraft('');
    setError(null);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content
    };
    setMessages((prev) => [...prev, userMsg]);
    try {
      await persistMessage(userId, userMsg);
    } catch (persistErr) {
      console.warn('Failed to persist user message', persistErr);
    }

    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error('No active session token. Please log in again.');
      }

      const res = await fetch('/api/chat/assist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: content,
          history: [...messages, userMsg].slice(-10).map((m) => ({
            role: m.role,
            content: m.content
          })),
          accessToken
        })
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? 'Assistant request failed.');
      }

      const payload = (await res.json()) as {
        reply?: string;
        action?: 'add_contact' | 'update_contact' | 'search_contacts' | 'create_reminder' | 'none';
      };

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: payload.reply ?? 'Done.'
        }
      ]);
      try {
        await persistMessage(userId, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: payload.reply ?? 'Done.'
        });
      } catch (persistErr) {
        console.warn('Failed to persist assistant message', persistErr);
      }

      if (payload.action === 'add_contact' || payload.action === 'update_contact') onContactAdded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: e instanceof Error ? e.message : 'Extraction failed.'
        }
      ]);
      try {
        await persistMessage(userId, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: e instanceof Error ? e.message : 'Extraction failed.'
        });
      } catch (persistErr) {
        console.warn('Failed to persist assistant error message', persistErr);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="hoo-chatPage">
      {error ? <div className="hoo-error" style={{ marginBottom: 10 }}>{error}</div> : null}
      <div className="hoo-chatCard hoo-card">
        <div className="hoo-chatHeader">
          <div className="hoo-chatHeaderTitle">Chat</div>
          <div className="hoo-chatHeaderSubtitle">Add contacts or ask questions about your network.</div>
        </div>

        <div className="hoo-chatHistory" ref={historyRef}>
          {messages.length === 0 ? (
            <div className="hoo-chatEmpty">
              Describe someone you met, or ask a question about your contacts.
            </div>
          ) : null}

          {messages.map((m) => (
            <div
              key={m.id}
              className={m.role === 'user' ? 'hoo-messageRow hoo-messageRowUser' : 'hoo-messageRow'}
            >
              <div
                className={
                  m.role === 'user'
                    ? 'hoo-messageBubble hoo-messageBubbleUser'
                    : 'hoo-messageBubble hoo-messageBubbleAssistant'
                }
              >
                {m.role === 'assistant' ? <ReactMarkdown>{m.content}</ReactMarkdown> : m.content}
              </div>
            </div>
          ))}
        </div>

        <form
          className="hoo-chatComposer"
          onSubmit={(e) => {
            e.preventDefault();
            onSend();
          }}
        >
          <input
            className="hoo-chatInput"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message Hoo…"
          />
          <button className="hoo-sendBtn" type="submit" disabled={sending || !draft.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}

