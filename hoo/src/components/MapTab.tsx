'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { getSupabaseClient } from '@/lib/supabase/browserClient';

type MapMode = 'met' | 'work';

type ContactRow = {
  id: string;
  name: string | null;
  company: string | null;
  work_location: string | null;
  location_lat: number | null;
  location_lng: number | null;
};

export type MapPoint = {
  id: string;
  name: string | null;
  company: string | null;
  lat: number;
  lng: number;
};

const LeafletContactsMap = dynamic(() => import('@/components/maps/LeafletContactsMap'), {
  ssr: false
});

const DEFAULT_CENTER: [number, number] = [42.3601, -71.0589];

function isFiniteLatLng(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng);
}

function computeBounds(points: MapPoint[]): [[number, number], [number, number]] {
  if (points.length === 0) {
    return [
      [DEFAULT_CENTER[0] - 0.08, DEFAULT_CENTER[1] - 0.12],
      [DEFAULT_CENTER[0] + 0.08, DEFAULT_CENTER[1] + 0.12]
    ];
  }

  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;

  for (const point of points) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }

  const latPad = Math.max((maxLat - minLat) * 0.25, 0.02);
  const lngPad = Math.max((maxLng - minLng) * 0.25, 0.02);
  return [
    [minLat - latPad, minLng - lngPad],
    [maxLat + latPad, maxLng + lngPad]
  ];
}

export function MapTab() {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [mode, setMode] = useState<MapMode>('met');
  const [metPoints, setMetPoints] = useState<MapPoint[]>([]);
  const [workPoints, setWorkPoints] = useState<MapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        const userId = sessionData.session?.user?.id;
        if (!mounted) return;
        if (!userId || !accessToken) {
          setLoading(false);
          return;
        }

        const { data, error: contactsError } = await supabase
          .from('contacts')
          .select('id,name,company,work_location,location_lat,location_lng')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (contactsError) throw new Error(contactsError.message);
        if (!mounted) return;

        const contacts = (data ?? []) as ContactRow[];
        console.log(
          '[MapTab] fetched contacts work_location values',
          contacts.map((c) => ({
            id: c.id,
            name: c.name,
            work_location: c.work_location
          }))
        );
        const met = contacts
          .filter((c) => isFiniteLatLng(c.location_lat, c.location_lng))
          .map((c) => ({
            id: c.id,
            name: c.name,
            company: c.company,
            lat: c.location_lat as number,
            lng: c.location_lng as number
          }));
        setMetPoints(met);

        const workRes = await fetch('/api/map/work-locations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accessToken })
        });
        const workPayload = (await workRes.json().catch(() => null)) as
          | { points?: MapPoint[]; error?: string }
          | null;
        if (!workRes.ok) {
          throw new Error(workPayload?.error ?? 'Failed to geocode work locations.');
        }
        if (!mounted) return;

        setWorkPoints(Array.isArray(workPayload?.points) ? workPayload.points : []);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Failed to load map points.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  const points = mode === 'met' ? metPoints : workPoints;
  const bounds = computeBounds(points);
  const modeLabel = mode === 'met' ? 'Met locations' : 'Work locations';

  return (
    <div className="hoo-tabPage">
      <div className="hoo-sectionTitle">Map</div>

      <div className="hoo-mapSwitch" role="tablist" aria-label="Map mode">
        <button
          className={`hoo-mapSwitchBtn ${mode === 'met' ? 'is-active' : ''}`}
          onClick={() => setMode('met')}
          role="tab"
          aria-selected={mode === 'met'}
        >
          Where You Met
        </button>
        <button
          className={`hoo-mapSwitchBtn ${mode === 'work' ? 'is-active' : ''}`}
          onClick={() => setMode('work')}
          role="tab"
          aria-selected={mode === 'work'}
        >
          Where They Work
        </button>
      </div>

      {error ? <div className="hoo-error">{error}</div> : null}

      <div className="hoo-mapMetaRow">
        <span className="hoo-mapLegendChip">
          <span className="hoo-mapLegendDot" />
          {modeLabel}
        </span>
        <span className="hoo-mapCountBadge">{points.length} plotted</span>
      </div>

      <div className="hoo-mapCard hoo-card">
        {loading ? (
          <div className="hoo-mapEmpty">Loading map…</div>
        ) : points.length === 0 ? (
          <div className="hoo-mapEmpty">
            {mode === 'met'
              ? 'No saved contact coordinates yet. Add contacts through chat to auto-tag where you met.'
              : 'No geocoded work locations yet.'}
          </div>
        ) : (
          <LeafletContactsMap points={points} bounds={bounds} mode={mode} />
        )}
      </div>
    </div>
  );
}

