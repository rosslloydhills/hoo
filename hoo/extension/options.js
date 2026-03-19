const tokenInput = document.getElementById('token');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');

async function load() {
  const { supabaseAccessToken } = await chrome.storage.sync.get(['supabaseAccessToken']);
  if (typeof supabaseAccessToken === 'string') {
    tokenInput.value = supabaseAccessToken;
  }
}

saveBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  await chrome.storage.sync.set({ supabaseAccessToken: token });
  statusEl.textContent = token ? 'Token saved.' : 'Token cleared.';
});

load();

