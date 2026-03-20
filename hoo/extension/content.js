console.log('[Hoo Extension] content script booted', {
  href: window.location.href,
  runtimeId: chrome?.runtime?.id ?? 'no-runtime-id'
});

const TOAST_ID = 'hoo-linkedin-toast';
let lastProfileUrl = '';
let isSaving = false;

function textFrom(el) {
  return el?.textContent?.trim() ?? '';
}

function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function firstTextBySelectors(selectors, root = document) {
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (!el) continue;
    const value = textFrom(el);
    if (value) return value;
  }
  return '';
}

function collectVisibleTextsFromSelectors(selectors, limit = 30) {
  const out = [];
  for (const selector of selectors) {
    const nodes = [...document.querySelectorAll(selector)];
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      const value = textFrom(node);
      if (!value) continue;
      out.push(value);
      if (out.length >= limit) return [...new Set(out)];
    }
  }
  return [...new Set(out)];
}

function fallbackNameFromTitle() {
  const raw = (document.title || '').trim();
  if (!raw) return '';
  // LinkedIn title often looks like: "Jane Doe - Company | LinkedIn"
  let candidate = raw.split('|')[0]?.trim() ?? raw;
  candidate = candidate.split(' - ')[0]?.trim() ?? candidate;
  if (!candidate || /linkedin/i.test(candidate)) return '';
  return candidate;
}

function parseCompanyFromHeadline(headline) {
  if (!headline) return '';

  // Common forms:
  // "Product Manager at Acme"
  // "Designer @ Acme"
  const atMatch = headline.match(/\bat\s+(.+)$/i);
  if (atMatch?.[1]) return atMatch[1].trim();

  const atSymbolMatch = headline.match(/@\s*([^|,•]+)/);
  if (atSymbolMatch?.[1]) return atSymbolMatch[1].trim();

  return '';
}

async function waitForNameWithRetry(maxWaitMs = 10000, stepMs = 1000) {
  const attempts = Math.max(1, Math.floor(maxWaitMs / stepMs));
  for (let i = 0; i < attempts; i += 1) {
    const name = firstTextBySelectors(
      ['h1', '.text-heading-xlarge', '.pv-text-details__left-panel h1', '.artdeco-entity-lockup__title'],
      document
    );
    const titleFallback = fallbackNameFromTitle();
    const resolved = name || titleFallback;
    console.log('[Hoo Extension] name retry attempt', {
      attempt: i + 1,
      selectorName: name,
      titleFallback,
      resolved
    });
    if (resolved) return resolved;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return '';
}

function normalizeListEntries(values, limit = 12) {
  const cleaned = values
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .map((value) => value.replace(/^[·•\-\u2022]+\s*/, '').trim())
    .filter((value) => value.length >= 3)
    .filter((value) => !/^(follow|connect|message|see more|show all|present)$/i.test(value))
    .filter((value) => !/^\d+\s*(mo|mos|yr|yrs|year|years)\b/i.test(value));

  const unique = [];
  const seen = new Set();
  for (const value of cleaned) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
    if (unique.length >= limit) break;
  }
  return unique;
}

function showToast(message, isError = false) {
  const existing = document.getElementById(TOAST_ID);
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '18px';
  toast.style.right = '18px';
  toast.style.zIndex = '999999';
  toast.style.padding = '10px 14px';
  toast.style.borderRadius = '12px';
  toast.style.background = isError ? '#7f0e1f' : '#0f5132';
  toast.style.color = '#fff';
  toast.style.fontSize = '13px';
  toast.style.fontWeight = '700';
  toast.style.boxShadow = '0 12px 24px rgba(0,0,0,0.22)';

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

async function scrapeLinkedInProfile() {
  const profileUrl = window.location.href.split('?')[0];
  const name = await waitForNameWithRetry(10000, 1000);
  const topSection =
    document.querySelector('main section') ||
    document.querySelector('.pv-top-card') ||
    document.querySelector('[data-view-name="profile-card"]') ||
    document.querySelector('main');

  console.log('[Hoo Extension] top profile section text dump', {
    text: (topSection?.textContent || '').replace(/\s+/g, ' ').trim()
  });

  const headline = firstTextBySelectors([
    'h2.text-body-medium',
    'div[data-generated-suggestion-target]',
    'main section span[aria-hidden="true"]',
    '.text-body-medium.break-words',
    '.pv-text-details__left-panel .text-body-medium',
    '.artdeco-entity-lockup__subtitle',
    'section .text-body-medium'
  ]);

  const locationCandidates = [
    ...document.querySelectorAll('span.text-body-small'),
    ...document.querySelectorAll('.pv-text-details__left-panel .text-body-small'),
    ...document.querySelectorAll('.artdeco-entity-lockup__caption')
  ]
    .map((el) => textFrom(el))
    .filter(Boolean);
  const location = locationCandidates.find((value) => /,/.test(value) || /\b[A-Za-z]{3,}\b/.test(value)) || '';

  const experienceTextsRaw = collectVisibleTextsFromSelectors([
    '.experience-section li span[aria-hidden="true"]',
    '.experience-section li',
    '.pvs-list__container li span[aria-hidden="true"]',
    '.pvs-list li span[aria-hidden="true"]',
    '.pvs-list li',
    '[data-field="experience"] li span[aria-hidden="true"]',
    '[data-field="experience"] li'
  ]);
  const experienceTexts = normalizeListEntries(experienceTextsRaw, 16);

  const educationRaw = collectVisibleTextsFromSelectors([
    '#education li span[aria-hidden="true"]',
    'section[id*="education"] li span[aria-hidden="true"]',
    'section[id*="education"] li'
  ]);
  const education = normalizeListEntries(educationRaw, 8);

  const currentCompany = parseCompanyFromHeadline(headline) || experienceTexts[0] || '';

  const scraped = {
    profile_url: profileUrl,
    name,
    headline,
    current_company: currentCompany,
    location,
    education,
    past_roles: experienceTexts
  };
  console.log('[Hoo Extension] scraped profile payload', scraped);
  return scraped;
}

async function saveProfileIfNeeded() {
  if (!window.location.href.includes('linkedin.com/in/')) return;
  if (!chrome?.runtime?.id) {
    console.error('[Hoo Extension] runtime unavailable (possible invalid extension context) at start of save');
    return;
  }

  const profile = await scrapeLinkedInProfile();
  if (!profile.name) {
    console.log('[Hoo Extension] skipping save because name is empty', { profileUrl: profile.profile_url });
    return;
  }
  if (profile.profile_url === lastProfileUrl) {
    console.log('[Hoo Extension] skipping duplicate save for profile', { profileUrl: profile.profile_url });
    return;
  }
  if (isSaving) {
    console.log('[Hoo Extension] save already in progress, skipping', { profileUrl: profile.profile_url });
    return;
  }

  isSaving = true;
  try {
    if (!chrome?.runtime?.id) {
      isSaving = false;
      console.error('[Hoo Extension] runtime unavailable before sendMessage');
      return;
    }

    console.log('[Hoo Extension] sending message to background', {
      type: 'SAVE_LINKEDIN_PROFILE',
      profile
    });
    chrome.runtime.sendMessage({ type: 'SAVE_LINKEDIN_PROFILE', profile }, (response) => {
      isSaving = false;
      const runtimeError = chrome?.runtime?.lastError?.message ?? null;
      console.log('[Hoo Extension] background callback received', {
        response,
        runtimeLastError: runtimeError
      });
      if (runtimeError) {
        console.error('[Hoo Extension] sendMessage failed', {
          error: runtimeError,
          profileUrl: profile.profile_url
        });
        showToast('Failed to save to Hoo', true);
        return;
      }
      if (!response?.ok) {
        console.error('[Hoo Extension] save API returned failure', {
          error: response?.error,
          profileUrl: profile.profile_url
        });
        showToast(response?.error || 'Failed to save to Hoo', true);
        return;
      }
      lastProfileUrl = profile.profile_url;
      showToast('Saved to Hoo');
    });
  } catch (err) {
    isSaving = false;
    console.error('[Hoo Extension] exception around runtime.sendMessage', {
      message: err instanceof Error ? err.message : String(err)
    });
    showToast('Failed to save to Hoo', true);
  }
}

setTimeout(saveProfileIfNeeded, 4000);
new MutationObserver(() => {
  console.log('[Hoo Extension] DOM mutation observed, scheduling save check');
  setTimeout(saveProfileIfNeeded, 500);
}).observe(document.documentElement, { childList: true, subtree: true });

