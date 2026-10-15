// Utility to manage Bring Your Own Key (BYOK) for Google Gemini

const STORAGE_KEY = 'fm26_custom_gemini_key';

export function getCustomApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  const key = localStorage.getItem(STORAGE_KEY);
  return key && key.trim().length > 10 ? key.trim() : null;
}

export function setCustomApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  const cleanKey = key.trim();
  localStorage.setItem(STORAGE_KEY, cleanKey);
  window.dispatchEvent(new Event('custom-api-key-changed'));
}

export function removeCustomApiKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('custom-api-key-changed'));
}

export function hasCustomApiKey(): boolean {
  return Boolean(getCustomApiKey());
}

export function getApiHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };
  const customKey = getCustomApiKey();
  if (customKey) {
    headers['x-gemini-api-key'] = customKey;
  }
  return headers;
}
