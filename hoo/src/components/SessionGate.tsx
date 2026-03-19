'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/browserClient';
import { DashboardChat } from '@/components/DashboardChat';
import { ReminderBubbles } from '@/components/ReminderBubbles';
import { PeopleTab } from '@/components/PeopleTab';
import { PlaceholderTab } from '@/components/PlaceholderTab';
import { MapTab } from '@/components/MapTab';

type TabId = 'chat' | 'people' | 'map' | 'insights';

export function SessionGate() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [peopleRefreshKey, setPeopleRefreshKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.auth.getSession();
        const email = data.session?.user?.email ?? null;
        if (!mounted) return;

        setChecking(false);

        if (!email) router.replace('/login');
      } catch {
        // If Supabase is not configured yet, keep the UX on the login page.
        if (!mounted) return;
        setChecking(false);
        router.replace('/login');
      }
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

  if (checking) {
    return (
      <div style={{ padding: 24 }}>
        <div className="hoo-card" style={{ padding: 20 }}>
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="hoo-dashboardWrap hoo-dashboardWithNav">
      <div className="hoo-dashboardHeader">
        <div className="hoo-brandLogo" aria-label="HOO">
          H
          <span className="hoo-logoGlasses" aria-hidden>
            <span className="hoo-logoOo">O</span>
            <span className="hoo-logoBridge" />
            <span className="hoo-logoOo hoo-logoOoAlt">O</span>
          </span>
        </div>
        <button
          className="hoo-ghostBtn"
          onClick={async () => {
            const supabase = getSupabaseClient();
            await supabase.auth.signOut();
            router.replace('/login');
          }}
        >
          Log out
        </button>
      </div>

      {activeTab === 'chat' ? <DashboardChat onContactAdded={() => setPeopleRefreshKey((v) => v + 1)} /> : null}
      {activeTab === 'people' ? <PeopleTab refreshKey={peopleRefreshKey} /> : null}
      {activeTab === 'map' ? <MapTab /> : null}
      {activeTab === 'insights' ? (
        <PlaceholderTab title="Insights" description="Network insights dashboard is coming next phase." />
      ) : null}

      <nav className="hoo-bottomNav" aria-label="Primary navigation">
        <button className={`hoo-navItem ${activeTab === 'chat' ? 'is-active' : ''}`} onClick={() => setActiveTab('chat')}>
          <span className="hoo-navPill">
            <span className="hoo-navGlyph hoo-navGlyphChat" aria-hidden />
            <span className="hoo-navLabel">Chat</span>
          </span>
        </button>
        <button
          className={`hoo-navItem ${activeTab === 'people' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('people')}
        >
          <span className="hoo-navPill">
            <span className="hoo-navGlyph hoo-navGlyphPeople" aria-hidden />
            <span className="hoo-navLabel">People</span>
          </span>
        </button>
        <button className={`hoo-navItem ${activeTab === 'map' ? 'is-active' : ''}`} onClick={() => setActiveTab('map')}>
          <span className="hoo-navPill">
            <span className="hoo-navGlyph hoo-navGlyphMap" aria-hidden />
            <span className="hoo-navLabel">Map</span>
          </span>
        </button>
        <button
          className={`hoo-navItem ${activeTab === 'insights' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('insights')}
        >
          <span className="hoo-navPill">
            <span className="hoo-navGlyph hoo-navGlyphInsights" aria-hidden />
            <span className="hoo-navLabel">Insights</span>
          </span>
        </button>
      </nav>

      <ReminderBubbles />
    </div>
  );
}

