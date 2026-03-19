import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type AssistBody = {
  message?: string;
  accessToken?: string;
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
};

const MODEL = 'claude-sonnet-4-5';

const BASE_SYSTEM_PROMPT = `You are Hoo, a personal network assistant.

You must decide whether the user is:
1) adding/updating a contact from natural language, or
2) asking a question about their contacts database, or
3) setting a reminder/follow-up task.

Available tools:
- add_contact: use when user is describing someone they met and wants to save them.
- search_contacts: use when user asks who they know / where / company / industry / role style questions.
- create_reminder: use when user asks to be reminded to follow up with someone on a date or timeframe.

Rules:
- Use tools when needed. Do not invent people.
- For add_contact, extract: name, company, role, work_location, location_met, notes.
- work_location means where they are based or work.
- location_met means where the user met them.
- When responding after tool results, be concise and readable.
- For search results, return a short summary and a clear list of matches.
- For reminders, extract a specific due_date and contact_name when possible.
`;

const TOOLS = [
  {
    name: 'add_contact',
    description:
      'Extract and save a new contact from user-provided text. Use this when user describes someone they met.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        company: { type: 'string' },
        role: { type: 'string' },
        work_location: { type: 'string' },
        location_met: { type: 'string' },
        notes: { type: 'string' }
      },
      required: ['name', 'company', 'role', 'work_location', 'location_met', 'notes'],
      additionalProperties: false
    }
  },
  {
    name: 'search_contacts',
    description:
      'Search contacts by free-text and/or structured filters such as company, role, work location, or meeting location.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        company: { type: 'string' },
        role: { type: 'string' },
        work_location: { type: 'string' },
        location_met: { type: 'string' },
        limit: { type: 'number' }
      },
      required: [],
      additionalProperties: false
    }
  },
  {
    name: 'create_reminder',
    description: 'Create a follow-up reminder task for a contact with due date and description.',
    input_schema: {
      type: 'object',
      properties: {
        contact_name: { type: 'string' },
        due_date: {
          type: 'string',
          description: 'ISO date/time when reminder is due (e.g. 2026-03-26 or 2026-03-26T09:00:00Z).'
        },
        description: { type: 'string' }
      },
      required: ['contact_name', 'due_date', 'description'],
      additionalProperties: false
    }
  }
];

function safeString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function clampLimit(value: unknown, fallback = 8) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(1, Math.min(25, Math.floor(value)));
}

function firstText(content: any[]) {
  return content
    .filter((c) => c?.type === 'text' && typeof c?.text === 'string')
    .map((c) => c.text)
    .join('\n')
    .trim();
}

function escapeOrValue(value: string) {
  // Keep PostgREST .or string stable.
  return value.replace(/,/g, ' ').trim();
}

function startOfLocalDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function resolveReminderDueDate(userMessage: string, dueDateRaw: string) {
  const lower = userMessage.toLowerCase();
  const today = startOfLocalDay(new Date());

  // Deterministic handling for common relative requests.
  if (/\bnext week\b/.test(lower)) {
    const target = addDays(today, 7);
    target.setHours(12, 0, 0, 0);
    return target;
  }
  if (/\btomorrow\b/.test(lower)) {
    const target = addDays(today, 1);
    target.setHours(12, 0, 0, 0);
    return target;
  }

  const parsed = new Date(dueDateRaw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  // Last fallback so reminders can still be created.
  const fallback = addDays(today, 7);
  fallback.setHours(12, 0, 0, 0);
  return fallback;
}

export async function POST(req: Request) {
  try {
    const todaysDate = new Date().toLocaleString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
    const systemPrompt = `Today's date is ${todaysDate}.\n\n${BASE_SYSTEM_PROMPT}`;

    const body = (await req.json().catch(() => null)) as AssistBody | null;
    const userMessage = body?.message?.trim();
    const accessToken = body?.accessToken?.trim();
    const history = Array.isArray(body?.history) ? body.history : [];

    if (!userMessage && history.length === 0) {
      return NextResponse.json({ error: 'Missing message/history.' }, { status: 400 });
    }

    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token.' }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing ANTHROPIC_API_KEY.' }, { status: 500 });
    }

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
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Invalid session.' }, { status: 401 });
    }
    const userId = userData.user.id;

    let action: 'add_contact' | 'search_contacts' | 'create_reminder' | 'none' = 'none';

    const normalizedHistory = history
      .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
      .map((h) => ({ role: h.role, content: h.content.trim() }))
      .filter((h) => h.content.length > 0);

    // Anthropic conversations should start with a user message.
    while (normalizedHistory.length > 0 && normalizedHistory[0].role !== 'user') {
      normalizedHistory.shift();
    }

    let messages: any[] = normalizedHistory.map((h) => ({
      role: h.role,
      content: h.content
    }));

    if (messages.length === 0 && userMessage) {
      messages = [{ role: 'user', content: userMessage }];
    }

    const latestUserText =
      [...messages].reverse().find((m) => m.role === 'user' && typeof m.content === 'string')?.content ?? userMessage ?? '';

    for (let step = 0; step < 4; step += 1) {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: MODEL,
          system: systemPrompt,
          max_tokens: 900,
          temperature: 0,
          tools: TOOLS,
          messages
        })
      });

      const payload = await resp.json().catch(() => null);
      if (!resp.ok) {
        console.error('[chat/assist] anthropic error', {
          status: resp.status,
          statusText: resp.statusText,
          payload
        });
        const msg = payload?.error?.message ?? payload?.message ?? 'Anthropic request failed.';
        return NextResponse.json({ error: typeof msg === 'string' ? msg : 'Anthropic request failed.' }, { status: 500 });
      }

      const content = payload?.content;
      if (!Array.isArray(content)) {
        return NextResponse.json({ error: 'Invalid Anthropic response.' }, { status: 500 });
      }

      const toolUses = content.filter((c: any) => c?.type === 'tool_use');
      if (toolUses.length === 0) {
        const reply = firstText(content);
        return NextResponse.json({ reply: reply || 'Done.', action });
      }

      messages.push({ role: 'assistant', content });

      const toolResults: any[] = [];
      for (const toolUse of toolUses) {
        const name = toolUse?.name;
        const input = toolUse?.input ?? {};

        if (name === 'search_contacts') {
          action = 'search_contacts';

          let queryBuilder = supabase
            .from('contacts')
            .select('id,name,company,role,work_location,location_met,origin_note,created_at')
            .eq('user_id', userId);

          const q = safeString(input.query);
          const company = safeString(input.company);
          const role = safeString(input.role);
          const workLocation = safeString(input.work_location);
          const locationMet = safeString(input.location_met);
          const limit = clampLimit(input.limit, 8);

          if (company) queryBuilder = queryBuilder.ilike('company', `%${company}%`);
          if (role) queryBuilder = queryBuilder.ilike('role', `%${role}%`);
          if (workLocation) queryBuilder = queryBuilder.ilike('work_location', `%${workLocation}%`);
          if (locationMet) queryBuilder = queryBuilder.ilike('location_met', `%${locationMet}%`);

          if (q) {
            const e = escapeOrValue(q);
            queryBuilder = queryBuilder.or(
              `name.ilike.%${e}%,company.ilike.%${e}%,role.ilike.%${e}%,work_location.ilike.%${e}%,location_met.ilike.%${e}%,origin_note.ilike.%${e}%`
            );
          }

          const { data, error } = await queryBuilder.order('created_at', { ascending: false }).limit(limit);

          if (error) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ ok: false, error: error.message })
            });
          } else {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ ok: true, count: data?.length ?? 0, results: data ?? [] })
            });
          }
        } else if (name === 'add_contact') {
          action = 'add_contact';

          const insertPayload = {
            user_id: userId,
            name: safeString(input.name),
            company: safeString(input.company),
            role: safeString(input.role),
            work_location: safeString(input.work_location),
            location_met: safeString(input.location_met),
            origin_note: safeString(input.notes)
          };

          const { data, error } = await supabase
            .from('contacts')
            .insert(insertPayload)
            .select('id,name,company,role,work_location,location_met,origin_note')
            .single();

          if (error) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ ok: false, error: error.message })
            });
          } else {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ ok: true, contact: data })
            });
          }
        } else if (name === 'create_reminder') {
          action = 'create_reminder';

          const contactName = safeString(input.contact_name);
          const dueDateRaw = safeString(input.due_date);
          const descriptionRaw = safeString(input.description);

          if (!contactName || !dueDateRaw || !descriptionRaw) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({
                ok: false,
                error: 'Missing contact_name, due_date, or description for reminder.'
              })
            });
            continue;
          }

          const parsedDate = resolveReminderDueDate(latestUserText, dueDateRaw);

          const { data: matchedContact } = await supabase
            .from('contacts')
            .select('id,name')
            .eq('user_id', userId)
            .ilike('name', `%${contactName}%`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const contactId = matchedContact?.id ?? null;
          const effectiveContactName = matchedContact?.name ?? contactName;

          const { data, error } = await supabase
            .from('tasks')
            .insert({
              user_id: userId,
              contact_id: contactId,
              description: `${effectiveContactName}: ${descriptionRaw}`,
              due_date: parsedDate.toISOString(),
              completed: false
            })
            .select('id,description,due_date,completed,contact_id')
            .single();

          if (error) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ ok: false, error: error.message })
            });
          } else {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({
                ok: true,
                task: data,
                contact_name: effectiveContactName
              })
            });
            console.log('[chat/assist] reminder saved', {
              requested_due_date: dueDateRaw,
              resolved_due_date: parsedDate.toISOString(),
              task_id: data?.id
            });
          }
        } else {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ ok: false, error: `Unknown tool: ${name}` })
          });
        }
      }

      messages.push({ role: 'user', content: toolResults });
    }

    return NextResponse.json({ error: 'Tool loop exceeded maximum steps.' }, { status: 500 });
  } catch (e) {
    console.error('[chat/assist] unexpected error', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Chat assist failed.' },
      { status: 500 }
    );
  }
}

