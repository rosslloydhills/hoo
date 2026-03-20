'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/browserClient';
import ReactMarkdown from 'react-markdown';
import {
  buildLinkedInGoogleSearchUrl,
  contentForChatModel,
  parseAssistantMessage,
  serializeAssistantMessage,
  type LinkedInPromptPayload
} from '@/lib/linkedinSearch';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type UserLocation = {
  lat: number;
  lng: number;
};

type DashboardChatProps = {
  onContactAdded?: () => void;
};

const LINKEDIN_BANNER_DISMISSED_AT_KEY = 'hoo_linkedin_banner_dismissed_at';
const LINKEDIN_BANNER_DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

type LinkedInBannerContact = {
  name: string | null;
  company: string | null;
  role: string | null;
};

function isBusinessHoursLocal() {
  const hour = new Date().getHours();
  return hour >= 9 && hour <= 16;
}

function isLinkedInBannerDismissedWithin24h() {
  if (typeof window === 'undefined') return false;
  const raw = localStorage.getItem(LINKEDIN_BANNER_DISMISSED_AT_KEY);
  if (!raw) return false;
  const t = Number(raw);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < LINKEDIN_BANNER_DISMISS_TTL_MS;
}

export function DashboardChat({ onContactAdded }: DashboardChatProps) {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationAttempted, setLocationAttempted] = useState(false);
  const [linkedinBannerContacts, setLinkedinBannerContacts] = useState<LinkedInBannerContact[]>([]);

  const historyRef = useRef<HTMLDivElement | null>(null);

  const refreshLinkedInBanner = useCallback(async () => {
    if (!userId || typeof window === 'undefined') {
      setLinkedinBannerContacts([]);
      return;
    }
    if (!isBusinessHoursLocal()) {
      setLinkedinBannerContacts([]);
      return;
    }
    if (isLinkedInBannerDismissedWithin24h()) {
      setLinkedinBannerContacts([]);
      return;
    }

    const { data, error } = await supabase
      .from('contacts')
      .select('name,company,role,linkedin_url,needs_linkedin_search')
      .eq('user_id', userId);

    if (error) {
      console.warn('[DashboardChat] LinkedIn banner contacts fetch failed', error);
      setLinkedinBannerContacts([]);
      return;
    }

    const list = (data ?? []).filter(
      (c: { needs_linkedin_search?: boolean | null; linkedin_url?: string | null }) =>
        Boolean(c.needs_linkedin_search) && !(c.linkedin_url && String(c.linkedin_url).trim())
    ) as LinkedInBannerContact[];

    setLinkedinBannerContacts(list);
  }, [userId, supabase]);

  useEffect(() => {
    void refreshLinkedInBanner();
  }, [refreshLinkedInBanner]);

  function dismissLinkedInBanner() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LINKEDIN_BANNER_DISMISSED_AT_KEY, String(Date.now()));
    }
    setLinkedinBannerContacts([]);
  }

  function findLinkedInForBannerContacts() {
    linkedinBannerContacts.forEach((c, i) => {
      window.setTimeout(() => {
        const url = buildLinkedInGoogleSearchUrl(c.name ?? '', c.company ?? '', c.role ?? '');
        window.open(url, '_blank', 'noopener,noreferrer');
      }, i * 800);
    });
  }

  async function getCurrentLocationIfNeeded() {
    if (userLocation || locationAttempted) return userLocation;
    setLocationAttempted(true);

    if (typeof window === 'undefined' || !('geolocation' in navigator)) return null;

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 5 * 60 * 1000
        });
      });

      const coords: UserLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      setUserLocation(coords);
      return coords;
    } catch {
      return null;
    }
  }

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
      content: row.content as string
    }));
    setMessages(mapped);
  }

  async function persistMessage(userId: string, message: ChatMessage): Promise<string | null> {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        user_id: userId,
        role: message.role,
        content: message.content
      })
      .select('id')
      .single();
    if (error) throw error;
    return data?.id ?? null;
  }

  async function updateMessageContent(userId: string, messageId: string, content: string) {
    await supabase.from('chat_messages').update({ content }).eq('id', messageId).eq('user_id', userId);
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

  function openLinkedInSearch(p: LinkedInPromptPayload) {
    const url = buildLinkedInGoogleSearchUrl(p.name, p.company, p.role);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function clearLinkedInPromptFromMessage(messageId: string) {
    if (!userId) return;
    setMessages((prev) => {
      const m = prev.find((x) => x.id === messageId);
      if (!m) return prev;
      const { text } = parseAssistantMessage(m.content);
      void updateMessageContent(userId, messageId, text).catch((err) =>
        console.warn('Failed to update chat message', err)
      );
      return prev.map((x) => (x.id === messageId ? { ...x, content: text } : x));
    });
  }

  async function handleLinkedInLater(messageId: string, p: LinkedInPromptPayload) {
    const { error } = await supabase.from('contacts').update({ needs_linkedin_search: true }).eq('id', p.contactId);
    if (error) {
      setError(error.message);
      return;
    }
    await clearLinkedInPromptFromMessage(messageId);
    onContactAdded?.();
    void refreshLinkedInBanner();
  }

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
      const savedId = await persistMessage(userId, userMsg);
      if (savedId) {
        setMessages((prev) => prev.map((m) => (m.id === userMsg.id ? { ...m, id: savedId } : m)));
      }
    } catch (persistErr) {
      console.warn('Failed to persist user message', persistErr);
    }

    setSending(true);
    try {
      const latestLocation = await getCurrentLocationIfNeeded();
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
            content: contentForChatModel(m.role, m.content)
          })),
          userLocation: latestLocation,
          accessToken
        })
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? 'Assistant request failed.');
      }

      const payload = (await res.json()) as {
        reply?: string;
        action?: 'add_contact' | 'update_contact' | 'search_contacts' | 'search_by_location' | 'create_reminder' | 'none';
        linkedinSearchPrompt?: LinkedInPromptPayload;
      };

      const assistantContent = serializeAssistantMessage(
        payload.reply ?? 'Done.',
        payload.linkedinSearchPrompt
      );
      const assistantLocalId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantLocalId,
          role: 'assistant',
          content: assistantContent
        }
      ]);
      try {
        const savedId = await persistMessage(userId, {
          id: assistantLocalId,
          role: 'assistant',
          content: assistantContent
        });
        if (savedId) {
          setMessages((prev) => prev.map((m) => (m.id === assistantLocalId ? { ...m, id: savedId } : m)));
        }
      } catch (persistErr) {
        console.warn('Failed to persist assistant message', persistErr);
      }

      if (payload.action === 'add_contact' || payload.action === 'update_contact') {
        onContactAdded?.();
        void refreshLinkedInBanner();
      }
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

  const showLinkedInReminderBanner =
    linkedinBannerContacts.length > 0 && isBusinessHoursLocal() && !isLinkedInBannerDismissedWithin24h();

  return (
    <div className="hoo-chatPage">
      {showLinkedInReminderBanner ? (
        <div className="hoo-chatLinkedinBanner" role="status">
          <div className="hoo-chatLinkedinBannerText">
            You have {linkedinBannerContacts.length} contact
            {linkedinBannerContacts.length === 1 ? '' : 's'} without LinkedIn profiles — want to find them now?
          </div>
          <div className="hoo-chatLinkedinBannerActions">
            <button type="button" className="hoo-chatLinkedinBannerFindBtn" onClick={findLinkedInForBannerContacts}>
              Find them
            </button>
            <button
              type="button"
              className="hoo-chatLinkedinBannerDismissBtn"
              onClick={dismissLinkedInBanner}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
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

          {messages.map((m) => {
            const assistantParsed =
              m.role === 'assistant' ? parseAssistantMessage(m.content) : { text: m.content, linkedinPrompt: undefined };
            return (
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
                  {m.role === 'assistant' ? (
                    <>
                      <ReactMarkdown>{assistantParsed.text}</ReactMarkdown>
                      {assistantParsed.linkedinPrompt ? (
                        <div className="hoo-linkedinPrompt">
                          <p className="hoo-linkedinPromptLine">
                            Want me to find {assistantParsed.linkedinPrompt.name}&apos;s LinkedIn?
                          </p>
                          <div className="hoo-linkedinPromptBtns">
                            <button
                              type="button"
                              className="hoo-linkedinPromptBtn hoo-linkedinPromptBtnYes"
                              onClick={() => {
                                openLinkedInSearch(assistantParsed.linkedinPrompt!);
                                void clearLinkedInPromptFromMessage(m.id);
                              }}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              className="hoo-linkedinPromptBtn"
                              onClick={() => void clearLinkedInPromptFromMessage(m.id)}
                            >
                              No
                            </button>
                            <button
                              type="button"
                              className="hoo-linkedinPromptBtn"
                              onClick={() => void handleLinkedInLater(m.id, assistantParsed.linkedinPrompt!)}
                            >
                              Later
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            );
          })}
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

