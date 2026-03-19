'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/browserClient';

type ContactRow = {
  id: string;
  name: string | null;
  company: string | null;
  role: string | null;
  work_location: string | null;
  location_met: string | null;
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
        .select('id,name,company,role,work_location,location_met')
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

  return (
    <div className="hoo-tabPage">
      <div className="hoo-sectionTitle">People</div>
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

