const TOAST_ID = 'hoo-linkedin-toast';
let lastProfileUrl = '';
let isSaving = false;

function textFrom(el) {
  return el?.textContent?.trim() ?? '';
}

function collectListTexts(root, selector, limit = 6) {
  if (!root) return [];
  return [...root.querySelectorAll(selector)]
    .map((el) => textFrom(el))
    .filter(Boolean)
    .slice(0, limit);
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

function scrapeLinkedInProfile() {
  const profileUrl = window.location.href.split('?')[0];
  const name =
    textFrom(document.querySelector('h1')) ||
    textFrom(document.querySelector('.text-heading-xlarge')) ||
    textFrom(document.querySelector('[data-anonymize="person-name"]'));

  const headline =
    textFrom(document.querySelector('.text-body-medium.break-words')) ||
    textFrom(document.querySelector('.pv-text-details__left-panel .text-body-medium'));

  const location =
    textFrom(document.querySelector('.text-body-small.inline.t-black--light.break-words')) ||
    textFrom(document.querySelector('.pv-text-details__left-panel .text-body-small'));

  const experienceSection =
    document.querySelector('#experience')?.closest('section') ||
    document.querySelector('section[id*="experience"]') ||
    document.querySelector('main');

  const educationSection =
    document.querySelector('#education')?.closest('section') ||
    document.querySelector('section[id*="education"]') ||
    document.querySelector('main');

  const pastRoles = collectListTexts(experienceSection, 'li .display-flex.align-items-center span[aria-hidden="true"]');
  const education = collectListTexts(educationSection, 'li .display-flex.align-items-center span[aria-hidden="true"]');

  const currentCompany =
    pastRoles[0] ||
    textFrom(document.querySelector('section[id*="experience"] li span[aria-hidden="true"]')) ||
    '';

  return {
    profile_url: profileUrl,
    name,
    headline,
    current_company: currentCompany,
    location,
    education,
    past_roles: pastRoles
  };
}

async function saveProfileIfNeeded() {
  if (!window.location.href.includes('linkedin.com/in/')) return;

  const profile = scrapeLinkedInProfile();
  if (!profile.name || profile.profile_url === lastProfileUrl || isSaving) return;

  isSaving = true;
  chrome.runtime.sendMessage({ type: 'SAVE_LINKEDIN_PROFILE', profile }, (response) => {
    isSaving = false;
    if (chrome.runtime.lastError) {
      showToast('Failed to save to Hoo', true);
      return;
    }
    if (!response?.ok) {
      showToast(response?.error || 'Failed to save to Hoo', true);
      return;
    }
    lastProfileUrl = profile.profile_url;
    showToast('Saved to Hoo');
  });
}

setTimeout(saveProfileIfNeeded, 1500);
new MutationObserver(() => {
  setTimeout(saveProfileIfNeeded, 500);
}).observe(document.documentElement, { childList: true, subtree: true });

