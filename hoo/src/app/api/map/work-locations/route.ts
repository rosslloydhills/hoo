import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type WorkLocationsBody = {
  accessToken?: string;
};

type WorkPoint = {
  id: string;
  name: string | null;
  company: string | null;
  work_location: string;
  lat: number;
  lng: number;
};

type ContactRow = {
  id: string;
  name: string | null;
  company: string | null;
  work_location: string | null;
};

function readEnvSecret(name: string) {
  const raw = process.env[name];
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

function isFiniteLatLng(lat: unknown, lng: unknown) {
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

async function geocodePlaceWithOpenCage(placeName: string, apiKey: string) {
  const url = new URL('https://api.opencagedata.com/geocode/v1/json');
  url.searchParams.set('q', placeName);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('limit', '1');
  url.searchParams.set('no_annotations', '1');

  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
  const payload = await resp.json().catch(() => null);
  console.log('[map/work-locations] geocode response', {
    placeName,
    status: resp.status,
    ok: resp.ok,
    firstResult: Array.isArray(payload?.results) ? payload.results[0] : null
  });
  if (!resp.ok) {
    const msg = payload?.status?.message ?? 'OpenCage request failed.';
    throw new Error(typeof msg === 'string' ? msg : 'OpenCage request failed.');
  }

  const result = Array.isArray(payload?.results) ? payload.results[0] : null;
  const lat = result?.geometry?.lat;
  const lng = result?.geometry?.lng;
  if (!isFiniteLatLng(lat, lng)) throw new Error(`Could not geocode "${placeName}".`);

  return { lat, lng };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as WorkLocationsBody | null;
    const accessToken = body?.accessToken?.trim();
    if (!accessToken) return NextResponse.json({ error: 'Missing access token.' }, { status: 401 });

    const openCageApiKey = readEnvSecret('OPENCAGE_API_KEY') || readEnvSecret('NEXT_PUBLIC_OPENCAGE_API_KEY');
    if (!openCageApiKey) return NextResponse.json({ error: 'Missing OPENCAGE_API_KEY.' }, { status: 500 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 });

    const { data, error } = await supabase
      .from('contacts')
      .select('id,name,company,work_location')
      .eq('user_id', userData.user.id)
      .not('work_location', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const contacts = ((data ?? []) as ContactRow[]).filter(
      (c) => typeof c.work_location === 'string' && c.work_location.trim().length > 0
    );
    console.log('[map/work-locations] fetched work locations', {
      totalContacts: contacts.length,
      workLocations: contacts.map((c) => c.work_location?.trim() ?? '')
    });

    const normalizeLocation = (v: string) => v.trim().toLowerCase();
    const locationCache = new Map<string, { lat: number; lng: number } | null>();
    const placesToGeocode = [...new Set(contacts.map((c) => c.work_location?.trim() ?? '').filter(Boolean))];

    for (const place of placesToGeocode) {
      const key = normalizeLocation(place);
      try {
        const coords = await geocodePlaceWithOpenCage(place, openCageApiKey);
        locationCache.set(key, coords);
      } catch {
        locationCache.set(key, null);
      }
    }

    const points: WorkPoint[] = contacts
      .map((contact) => {
        const place = contact.work_location?.trim() ?? '';
        if (!place) return null;
        const coords = locationCache.get(normalizeLocation(place));
        if (!coords) return null;
        return {
          id: contact.id,
          name: contact.name,
          company: contact.company,
          work_location: place,
          lat: coords.lat,
          lng: coords.lng
        };
      })
      .filter((p): p is WorkPoint => p !== null);

    return NextResponse.json({ points });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to build work location map points.' },
      { status: 500 }
    );
  }
}

