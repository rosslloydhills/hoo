export function buildLinkedInGoogleSearchQuery(name: string, company: string, role: string) {
  return [name, company, role, 'site:linkedin.com/in'].filter((s) => s.trim().length > 0).join(' ').trim();
}

export function buildLinkedInGoogleSearchUrl(name: string, company: string, role: string) {
  const q = buildLinkedInGoogleSearchQuery(name, company, role);
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export const HOO_ASSISTANT_PREFIX = '__HOO_ASSISTANT__';

export type LinkedInPromptPayload = {
  contactId: string;
  name: string;
  company: string;
  role: string;
};

export type StoredAssistantPayload = {
  text: string;
  linkedinPrompt?: LinkedInPromptPayload;
};

export function serializeAssistantMessage(text: string, linkedinPrompt?: LinkedInPromptPayload) {
  if (!linkedinPrompt) return text;
  const payload: StoredAssistantPayload = { text, linkedinPrompt };
  return `${HOO_ASSISTANT_PREFIX}${JSON.stringify(payload)}`;
}

export function parseAssistantMessage(content: string): StoredAssistantPayload {
  if (!content.startsWith(HOO_ASSISTANT_PREFIX)) {
    return { text: content };
  }
  try {
    const parsed = JSON.parse(content.slice(HOO_ASSISTANT_PREFIX.length)) as StoredAssistantPayload;
    if (typeof parsed.text === 'string') return parsed;
  } catch {
    // fall through
  }
  return { text: content };
}

export function contentForChatModel(role: string, content: string) {
  if (role !== 'assistant') return content;
  return parseAssistantMessage(content).text;
}
