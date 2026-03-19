const API_URL = 'https://hoopeople.vercel.app/api/save-linkedin-profile';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'SAVE_LINKEDIN_PROFILE') return;

  (async () => {
    try {
      const { supabaseAccessToken } = await chrome.storage.sync.get(['supabaseAccessToken']);
      if (!supabaseAccessToken || typeof supabaseAccessToken !== 'string') {
        sendResponse({ ok: false, error: 'Missing Supabase token. Set it in extension options.' });
        return;
      }

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${supabaseAccessToken.trim()}`
        },
        body: JSON.stringify(message.profile)
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        sendResponse({ ok: false, error: payload?.error ?? 'Failed to save LinkedIn profile.' });
        return;
      }

      sendResponse({ ok: true, payload });
    } catch (err) {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : 'Unexpected extension error.' });
    }
  })();

  return true;
});

