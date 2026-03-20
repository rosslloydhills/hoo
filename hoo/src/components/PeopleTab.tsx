'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/browserClient';
import { buildLinkedInGoogleSearchUrl } from '@/lib/linkedinSearch';

type ContactRow = {
  id: string;
  name: string | null;
  company: string | null;
  role: string | null;
  work_location: string | null;
  location_met: string | null;
  linkedin_url: string | null;
  needs_linkedin_search: boolean | null;
};

type PeopleTabProps = {
  refreshKey?: number;
};

export function PeopleTab({ refreshKey = 0 }: PeopleTabProps) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId || !mounted) {
        if (mounted) setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('contacts')
        .select('id,name,company,role,work_location,location_met,linkedin_url,needs_linkedin_search')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!mounted) return;
      setContacts((data ?? []) as ContactRow[]);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [supabase, refreshKey]);

  const initialFor = (name: string | null) => {
    const t = (name ?? '').trim();
    return t ? t[0].toUpperCase() : '?';
  };

  const contactsNeedingLinkedIn = contacts.filter(
    (c) => c.needs_linkedin_search && !(c.linkedin_url && c.linkedin_url.trim())
  );

  function openLinkedInSearchForContact(c: ContactRow) {
    const url = buildLinkedInGoogleSearchUrl(c.name ?? '', c.company ?? '', c.role ?? '');
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function openAllPendingLinkedInSearches() {
    contactsNeedingLinkedIn.forEach((c, i) => {
      window.setTimeout(() => openLinkedInSearchForContact(c), i * 800);
    });
  }

  return (
    <div className="hoo-tabPage">
      <div className="hoo-peopleHeader">
        <div className="hoo-sectionTitle">People</div>
        {contactsNeedingLinkedIn.length > 0 ? (
          <button type="button" className="hoo-findLinkedInBulkBtn" onClick={openAllPendingLinkedInSearches}>
            Find LinkedIn profiles ({contactsNeedingLinkedIn.length})
          </button>
        ) : null}
      </div>
      {loading ? (
        <div className="hoo-contactsEmpty">Loading…</div>
      ) : contacts.length === 0 ? (
        <div className="hoo-contactsEmpty">No contacts yet.</div>
      ) : (
        <ul className="hoo-peopleGrid">
          {contacts.map((c) => (
            <li key={c.id} className="hoo-contactItem hoo-card">
              <div className="hoo-contactRow">
                <div className="hoo-contactAvatar" aria-hidden>
                  {initialFor(c.name)}
                </div>
                <div className="hoo-contactBody">
                  <div className="hoo-contactName">{c.name || 'Unnamed'}</div>
                  <div className="hoo-contactMeta">
                    {c.company ? c.company : null}
                    {c.company && c.role ? ' · ' : null}
                    {c.role ? c.role : null}
                  </div>
                  {c.work_location ? <div className="hoo-contactSub">Based in {c.work_location}</div> : null}
                  {c.location_met ? <div className="hoo-contactSub">Met in {c.location_met}</div> : null}
                </div>
                {c.needs_linkedin_search && !(c.linkedin_url && c.linkedin_url.trim()) ? (
                  <button
                    type="button"
                    className="hoo-contactLinkedInHint"
                    onClick={() => openLinkedInSearchForContact(c)}
                    title="Find LinkedIn profile"
                    aria-label={`Find LinkedIn profile for ${c.name || 'contact'}`}
                  >
                    <span className="hoo-contactLinkedInIcon" aria-hidden>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M6.5 8.5h-3v12h3V8.5zm-1.5-4.5c-1 0-1.8.8-1.8 1.8S4 7.6 5 7.6s1.8-.8 1.8-1.8S6 4 5 4zm13.5 8.9c0-3.7-1.6-5.4-4.7-5.4-2.2 0-3.6 1.2-4.2 2.1h-.1V8.5H13v12h3v-6.7c0-1.4.3-2.8 2-2.8 1.7 0 1.7 1.6 1.7 2.8V20.5h3v-7.5c0-2.8-.6-5-3.9-5z"
                          fill="currentColor"
                        />
                      </svg>
                    </span>
                    <span className="hoo-contactLinkedInDot" aria-hidden />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

