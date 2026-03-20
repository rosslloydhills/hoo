const API_URL = 'https://hoopeople.vercel.app/api/save-linkedin-profile';
const EXTENSION_SECRET = 'hoo-extension-secret-2026';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Hoo Extension] background received message', {
    type: message?.type,
    profileUrl: message?.profile?.profile_url ?? null
  });
  if (message?.type !== 'SAVE_LINKEDIN_PROFILE') return;

  (async () => {
    try {
      if (!EXTENSION_SECRET || EXTENSION_SECRET === 'replace-with-your-extension-secret') {
        sendResponse({ ok: false, error: 'Missing EXTENSION_SECRET in background.js.' });
        return;
      }

      console.log('[Hoo Extension] sending LinkedIn profile to API', {
        apiUrl: API_URL,
        profileUrl: message?.profile?.profile_url ?? null
      });

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          ...message.profile,
          extension_secret: EXTENSION_SECRET
        })
      });

      const payload = await res.json().catch(() => null);
      console.log('[Hoo Extension] API response received', {
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        payload
      });
      if (!res.ok) {
        console.error('[Hoo Extension] API returned non-OK response', {
          status: res.status,
          statusText: res.statusText,
          body: payload,
          payload
        });
        sendResponse({ ok: false, error: payload?.error ?? 'Failed to save LinkedIn profile.' });
        return;
      }

      console.log('[Hoo Extension] profile save succeeded', {
        profileUrl: message?.profile?.profile_url ?? null,
        action: payload?.action ?? null
      });
      sendResponse({ ok: true, payload });
    } catch (err) {
      console.error('[Hoo Extension] API request threw error', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
      sendResponse({ ok: false, error: err instanceof Error ? err.message : 'Unexpected extension error.' });
    }
  })();

  return true;
});

