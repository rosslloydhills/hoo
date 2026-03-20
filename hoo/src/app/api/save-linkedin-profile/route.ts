import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type LinkedInProfilePayload = {
  extension_secret?: string;
  profile_url?: string;
  name?: string;
  headline?: string;
  current_company?: string;
  location?: string;
  education?: string[];
  past_roles?: string[];
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => safeString(v)).filter(Boolean);
}

function buildOriginNote(profile: LinkedInProfilePayload) {
  const lines = [
    `LinkedIn sync: ${new Date().toISOString()}`,
    profile.profile_url ? `URL: ${profile.profile_url}` : '',
    profile.headline ? `Headline: ${profile.headline}` : '',
    profile.current_company ? `Current company: ${profile.current_company}` : '',
    profile.location ? `Location: ${profile.location}` : '',
    profile.education?.length ? `Education: ${profile.education.join(' | ')}` : '',
    profile.past_roles?.length ? `Past roles: ${profile.past_roles.join(' | ')}` : ''
  ].filter(Boolean);
  return lines.join('\n');
}

function isMissingColumnError(message: string) {
  const lower = message.toLowerCase();
  return lower.includes('column') && lower.includes('does not exist') && lower.includes('linkedin_url');
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as LinkedInProfilePayload | null;
    const extensionSecret = safeString(body?.extension_secret);
    const expectedSecret = safeString(process.env.EXTENSION_SECRET);
    if (!expectedSecret) {
      return NextResponse.json({ error: 'Missing EXTENSION_SECRET env var.' }, { status: 500, headers: CORS_HEADERS });
    }
    if (!extensionSecret || extensionSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Invalid extension secret.' }, { status: 401, headers: CORS_HEADERS });
    }

    const name = safeString(body?.name);
    const headline = safeString(body?.headline);
    const currentCompany = safeString(body?.current_company);
    const location = safeString(body?.location);
    const profileUrl = safeString(body?.profile_url);
    const education = safeStringArray(body?.education);
    const pastRoles = safeStringArray(body?.past_roles);

    if (!name) {
      return NextResponse.json({ error: 'Missing contact name.' }, { status: 400, headers: CORS_HEADERS });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const extensionUserId = safeString(process.env.EXTENSION_USER_ID);
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500, headers: CORS_HEADERS }
      );
    }
    if (!extensionUserId) {
      return NextResponse.json({ error: 'Missing EXTENSION_USER_ID env var.' }, { status: 500, headers: CORS_HEADERS });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const userId = extensionUserId;

    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id,name,origin_note')
      .eq('user_id', userId)
      .ilike('name', `%${name}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const originNote = buildOriginNote({
      profile_url: profileUrl,
      name,
      headline,
      current_company: currentCompany,
      location,
      education,
      past_roles: pastRoles
    });

    const payload: Record<string, string> = {
      name,
      role: headline || 'LinkedIn profile',
      company: currentCompany,
      work_location: location,
      origin_note: existingContact?.origin_note ? `${existingContact.origin_note}\n\n${originNote}` : originNote
    };

    // Best-effort write for optional schema field.
    if (profileUrl) payload.linkedin_url = profileUrl;

    if (existingContact?.id) {
      let { data, error } = await supabase
        .from('contacts')
        .update(payload)
        .eq('id', existingContact.id)
        .eq('user_id', userId)
        .select('id,name,company,role,work_location')
        .single();

      if (error && isMissingColumnError(error.message) && payload.linkedin_url) {
        const retryPayload = { ...payload };
        delete retryPayload.linkedin_url;
        const retry = await supabase
          .from('contacts')
          .update(retryPayload)
          .eq('id', existingContact.id)
          .eq('user_id', userId)
          .select('id,name,company,role,work_location')
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
      }
      return NextResponse.json({ ok: true, action: 'updated', contact: data }, { headers: CORS_HEADERS });
    }

    let { data, error } = await supabase
      .from('contacts')
      .insert({
        user_id: userId,
        ...payload,
        location_met: 'LinkedIn'
      })
      .select('id,name,company,role,work_location')
      .single();

    if (error && isMissingColumnError(error.message) && payload.linkedin_url) {
      const retryPayload = { ...payload };
      delete retryPayload.linkedin_url;
      const retry = await supabase
        .from('contacts')
        .insert({
          user_id: userId,
          ...retryPayload,
          location_met: 'LinkedIn'
        })
        .select('id,name,company,role,work_location')
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
    }
    return NextResponse.json({ ok: true, action: 'created', contact: data }, { headers: CORS_HEADERS });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to save LinkedIn profile.' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

