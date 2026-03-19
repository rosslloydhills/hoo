# HOO — Product Specification
> *"Know your people."*

---

## What Is Hoo

Hoo is an AI-powered personal networking app for Harvard students and young professionals. It solves the problem of meeting interesting people and then forgetting who they are two weeks later. It is a personal relationship memory layer — not a CRM, not a contacts app, not LinkedIn. The core experience is a chat interface backed by a structured database. You tell it about people you meet, and it remembers everything so you don't have to.

Target user: Harvard undergrad/grad students, young professionals aged 18-28. Technically comfortable, socially ambitious, would never describe themselves as someone who uses a CRM.

---

## Brand

**Name:** Hoo  
**Tagline:** Know your people.  
**Logo:** HOO wordmark in bold Inter. The two O's styled as glasses — the signature mark. Adaptable frame colour for different contexts (crimson, gold, charcoal).  
**In-app voice:** Smart, warm, slightly witty. "Hoo are you looking for?" as the search placeholder. Feels like a product with a personality.

**Colour palette:**
- Cream base: `#F5F0E8`
- Harvard Crimson: `#A51C30` — primary accent, buttons, active states, hero numbers
- Gold: `#C9A84C` — secondary accent, tags, badges, relationship strength
- Charcoal: `#1A1A1A` — body text
- White: `#FFFFFF` — card backgrounds

**Typography:**
- UI elements, labels, buttons: Inter (bold, all caps where appropriate)
- Headings only: Playfair Display — creates intellectual tension
- Never pure black text, always charcoal on cream

**Visual language:**
- Chrome metallic gradients on buttons and active elements
- Iridescent avatar ring borders shifting crimson to gold
- Frosted glass card backgrounds with soft drop shadows
- Subtle crimson radial glow on login page that follows cursor
- Angular elements — not the usual rounded corporate corners
- Micro-interactions: cards tilt on hover, reminder bubbles pulse softly

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Frontend | Next.js (React framework) |
| Backend / Database | Supabase (Postgres + auth + edge functions) |
| AI | Anthropic API (Claude) with function calling |
| Hosting | Vercel |
| Browser Extension | Chrome Extension, Manifest V3 |
| Email notifications | Resend |
| Geo / location | OpenCage API (geocoding) |
| Contacts sync | Google People API + Microsoft Graph API |
| Email sync | Gmail API + Microsoft Graph API |

---

## Database Schema

```sql
-- Contacts
create table contacts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text,
  company text,
  role text,
  email text,
  phone text,
  linkedin_url text,
  location_met text,
  location_lat float,
  location_lng float,
  origin_note text,          -- how/where/why you met them
  tags text[],               -- auto-extracted from context eg. #healthcare #consulting
  last_contacted_at timestamp,
  interaction_count integer default 0,
  relationship_strength integer default 0,  -- 0-100 score
  source text,               -- 'manual', 'google', 'linkedin', 'outlook', 'vcard', 'email_dump'
  needs_review boolean default false,
  created_at timestamp default now()
);

alter table contacts enable row level security;
create policy "Users see own contacts" on contacts
  for all using (auth.uid() = user_id);

-- Interactions log
create table interactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  contact_id uuid references contacts,
  date timestamp,
  notes text,
  created_at timestamp default now()
);

-- Tasks / reminders
create table tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  contact_id uuid references contacts,
  description text,
  due_date timestamp,
  completed boolean default false,
  created_at timestamp default now()
);

-- OAuth tokens for Google / Outlook
create table oauth_tokens (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  provider text,             -- 'google', 'outlook'
  access_token text,
  refresh_token text,
  expires_at timestamp
);
```

---

## App Navigation

Four bottom tabs. Always visible after login.

```
[Home / Chat]  [People]  [Map]  [Insights]
```

### Login Page
- Warm cream background
- Soft crimson radial glow that follows cursor movement
- "Hey." above the email/password fields
- Once email is recognised on return visits: "Hey, [first name]."
- Simple email + password. No social login for MVP.

### Home — Chat (default landing page)
- Full screen chat interface
- Pre-filled assistant prompt: *"Hoo are you looking for?"* or *"What can I help with?"*
- Chat input pinned to bottom, iMessage-style
- AI can: add contacts, query contacts, set reminders, answer questions about your network
- Reminder bubbles appear here as dismissible floating notifications in bottom right
- Bubble pulses softly when due, dismissed = marked complete

**AI tools available via function calling:**
- `add_contact` — parse and save a new contact from natural language
- `search_contacts` — query database by name, industry, location, company, tags
- `get_contact` — retrieve full profile for a named person
- `create_reminder` — set a follow-up task for a contact
- `get_relationship_insights` — surface neglected high-value contacts
- `search_by_location` — find contacts met near a place name
- `bulk_import_emails` — parse a pasted list of email addresses
- `update_contact` — add context or update info on an existing contact

### People Tab
- Search bar at top: placeholder *"Hoo are you looking for?"*
- Toggle: List view / Card view
- Filters: by industry, by location, by relationship strength, recently added
- Each contact row: avatar (initials fallback with crimson ring), name, company, role, last contacted
- Tap → opens Contact Profile page

**Contact Profile Page:**
```
[Avatar with crimson/gold ring]
[Name — large]
[Role · Company · Location]

ORIGIN NOTE (highlighted block)
"Met at Harvard networking event, Oct 2024
 — discussed insurance in healthcare"

TAGS  #healthcare  #insurance  #consulting

CONTACT
📞 [phone]   ✉️ [email]   🔗 [LinkedIn]

RELATIONSHIP STRENGTH
████░░  Last contact: 3 weeks ago
Interaction count: 7

TIMELINE
  Oct 2024 — First met at networking event
  Nov 2024 — Followed up re: intro

[HOO ARE YOU? →]  (opens chat pre-loaded with this contact's context)
```

- Empty context state: *"No context yet — how do you know [name]?"* → taps to open chat
- Profile photos degrade gracefully to initials in crimson circle

### Map Tab
- Dot map of locations where contacts were met
- Tap a dot → surfaces who you met there, when, and their origin note
- Filter by time period

### Insights Tab
- Network health dashboard
- Relationship strength breakdown across all contacts
- Industry/sector breakdown (fed by auto-extracted tags)
- City breakdown — where your network is concentrated
- Neglected contacts — high relationship score but not contacted in 60+ days
- Network growth over time

---

## Key Features & Flows

### Adding a contact via chat
User types: *"Met Alex Hills at a networking event, his number is 07805339791, we talked about insurance in healthcare"*

AI parses → extracts name, phone, origin note → auto-tags `#healthcare` `#insurance` → saves with current geolocation and timestamp → confirms: *"Got it — Alex Hills saved. Tagged healthcare and insurance."*

### Setting a reminder
User: *"Remind me to follow up with Alex next Tuesday"*
AI → creates task record → reminder bubble appears on app on due date

### Bulk email import
User pastes block of email addresses into chat
AI → detects email list → infers company from domain → saves all with `needs_review` flag → asks one open question: *"Before I save these — tell me anything you remember about any of them. Otherwise I'll save them with just their email and company."*
User: *"They were all colleagues when I worked at McKinsey"*
AI → applies origin note to all records → clears review flag

### Gmail / Google Contacts sync
- User connects Google via OAuth in Settings
- Google People API pulls all contacts → name, email, phone → upserts into database
- Gmail sent mail → extracts all recipients → updates `last_contacted_at` and `interaction_count` → calculates `relationship_strength` score
- Runs automatically on first connect, manually via Sync button thereafter

### Apple / iCloud users
- Export contacts from iPhone as .vcf (vCard) file
- Upload on Settings page → AI parses and imports
- One-time dump, not a live sync

### Outlook / Microsoft sync
- Same OAuth flow as Google using Microsoft Graph API
- Covers Harvard Microsoft accounts

### LinkedIn Chrome Extension
- Activates on any `linkedin.com/in/` URL
- Scrapes: name, headline, current company, location, education, past roles
- Posts to `/api/save-linkedin-profile`
- Matches to existing contact by name if possible, otherwise creates new
- Shows toast: *"Saved to Hoo"*

### LinkedIn name matching
- Bulk import screen: paste list of names
- App generates LinkedIn search URL for each: `linkedin.com/search/results/people/?keywords=[name]`
- User clicks → visits profile → extension handles the save

---

## Context Tiers

| Tier | Source | What gets stored |
|------|--------|-----------------|
| Rich | Manual chat entry | Origin note + auto-tags |
| Shared | Bulk import with comment | Shared origin note applied to batch |
| Bare | Email dump / contacts sync | Email + company from domain only |
| Empty | Unknown | Prompt to add context |

---

## Build Phases

| Phase | What gets built | Effort |
|-------|----------------|--------|
| 1 | Scaffold, auth, login page with cursor glow, Vercel deploy | Day 1 |
| 2 | Database schema, add contact via chat, contacts list | Days 2-3 |
| 2.5 | Google + Outlook OAuth, contacts + Gmail sync, vCard upload | Days 3-4 |
| 3 | AI querying — search contacts, relationship insights | Days 4-5 |
| 4 | Reminders, in-page bubbles, auto-nudge for neglected contacts | Days 5-6 |
| 5 | Geo-tagging, location search via OpenCage | Day 6 |
| 6 | Chrome extension — LinkedIn profile scraping | Days 7-9 |
| 7 | LinkedIn name matching — bulk name → search URL | Day 9 |
| 8 | Bulk email import, vCard/CSV import, review queue | Days 10-11 |

**MVP (Phases 1-4):** Working app with chat, real contact data from Gmail, AI querying, and reminders. Shippable to early users.

---

## Settings Page

- Connected Accounts: Google (OAuth), Outlook (OAuth), iCloud (vCard upload)
- Sync status + last synced timestamp
- Manual sync button
- Account / logout

---

## Out of Scope for MVP

- Mobile app (React Native) — web first, mobile later
- Voice input — Phase 2 product
- Second-degree network mapping
- App Store listing
- Outreach draft generation (post-MVP)
- Push notifications (using in-page bubbles for MVP)

---

## Cursor Session Instructions

Paste this entire document at the start of every new Cursor session.

Key principles to remind Cursor of:
- This is a Next.js app using Supabase for auth and database
- Row-level security is enabled — users must only ever see their own data
- The AI layer uses Anthropic API with function calling — the chat interface is the primary way users interact with their data
- Design follows the Hoo brand spec above — cream base, crimson accent, Inter typography, chrome gradients, frosted glass cards
- Always check for security issues when touching auth or database queries
