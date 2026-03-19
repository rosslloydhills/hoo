import { NextResponse } from 'next/server';

const SYSTEM_PROMPT =
  "You are Hoo, a personal network assistant. The user will describe someone they met. Extract: name, company, role, work_location, location_met, notes. work_location is where they are based or work. location_met is where the user met them. Return JSON only, no other text, in this exact format: {name, company, role, work_location, location_met, notes}.";

function tryParseContactJson(candidate: string) {
  // First attempt: strict JSON.
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    // continue
  }

  // Second attempt: tolerate unquoted keys / single quotes.
  // Anthropic sometimes returns: {name: "Alex", company: "Acme", ...}
  // which isn't valid JSON without quoting keys.
  const withQuotedKeys = candidate.replace(
    /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
    (_m, prefix: string, key: string) => `${prefix}"${key}":`
  );

  const withDoubleQuotes = withQuotedKeys.replace(/'/g, '"');

  return JSON.parse(withDoubleQuotes) as unknown;
}

function extractJson(text: string) {
  const trimmed = text.trim();

  // Be tolerant: isolate the first JSON object substring.
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  const candidate = firstBrace !== -1 && lastBrace !== -1 ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed;

  return tryParseContactJson(candidate);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { message?: string } | null;
    const userMessage = body?.message?.trim();
    if (!userMessage) {
      return NextResponse.json({ error: 'Missing message.' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing ANTHROPIC_API_KEY.' }, { status: 500 });
    }

    const model = 'claude-sonnet-4-5';

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        system: SYSTEM_PROMPT,
        max_tokens: 400,
        temperature: 0,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    const payload = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('[anthropic/extract] request failed', {
        status: resp.status,
        statusText: resp.statusText,
        payload
      });
      const msg = payload?.error?.message ?? payload?.message ?? 'Anthropic request failed.';
      return NextResponse.json({ error: typeof msg === 'string' ? msg : 'Anthropic request failed.' }, { status: 500 });
    }

    if (!payload || !(payload?.content?.[0]?.text && typeof payload.content[0].text === 'string')) {
      return NextResponse.json({ error: 'Anthropic returned unexpected response.' }, { status: 500 });
    }

    const text = payload.content[0].text;
    const extracted = extractJson(text) as Record<string, unknown>;

    // Minimal shape validation to avoid inserting junk.
    if (
      !extracted ||
      typeof extracted !== 'object' ||
      typeof extracted.name !== 'string' ||
      typeof extracted.company !== 'string' ||
      typeof extracted.role !== 'string' ||
      typeof extracted.work_location !== 'string' ||
      typeof extracted.location_met !== 'string' ||
      typeof extracted.notes !== 'string'
    ) {
      return NextResponse.json({ error: 'Anthropic returned unexpected JSON shape.' }, { status: 500 });
    }

    return NextResponse.json({
      name: extracted.name,
      company: extracted.company,
      role: extracted.role,
      work_location: extracted.work_location,
      location_met: extracted.location_met,
      notes: extracted.notes
    });
  } catch (e) {
    console.error('[anthropic/extract] unexpected error', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Anthropic extraction failed.' },
      { status: 500 }
    );
  }
}

