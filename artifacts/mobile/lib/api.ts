let _sessionId: string | null = null;

export function setSessionId(id: string | null) {
  _sessionId = id;
}

export function getSessionId(): string | null {
  return _sessionId;
}

export async function api<T = any>(path: string, options?: RequestInit): Promise<T> {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const base = `https://${domain}`;
  const headers: Record<string, string> = {};

  if (options?.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (_sessionId) {
    headers['Authorization'] = `Bearer ${_sessionId}`;
  }

  const mergedHeaders = { ...headers, ...(options?.headers as Record<string, string> ?? {}) };

  const response = await fetch(`${base}/api${path}`, {
    ...options,
    headers: mergedHeaders,
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json();
      errorMessage = errorBody.error || errorBody.message || errorMessage;
    } catch {}
    throw new Error(errorMessage);
  }

  const text = await response.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}
