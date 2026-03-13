// ─── GOOGLE OAUTH (Identity Services) ───────────────────────────────
// Uses the GIS Token Model to get an access token for Gemini API.
// The token is kept in memory only (not localStorage) for security.
// User clicks "Sign in with Google" → popup → token returned.
//
// Setup: developer creates a Google Cloud OAuth Client ID and sets it
// in Settings. End-users just click the button.

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type: string; message: string }) => void;
          }): { requestAccessToken(): void };
          revoke(token: string, callback?: () => void): void;
        };
      };
    };
  }
}

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  error?: string;
  error_description?: string;
}

export interface GoogleAuthState {
  accessToken: string | null;
  expiresAt: number | null;
  email: string | null;
}

const SCOPE = 'https://www.googleapis.com/auth/generative-language';

export function isGisLoaded(): boolean {
  return !!window.google?.accounts?.oauth2;
}

export function requestGoogleToken(clientId: string): Promise<GoogleAuthState> {
  return new Promise((resolve, reject) => {
    if (!isGisLoaded()) {
      reject(new Error('Google Identity Services not loaded. Refresh the page.'));
      return;
    }

    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        resolve({
          accessToken: response.access_token,
          expiresAt: Date.now() + response.expires_in * 1000,
          email: null,
        });
      },
      error_callback: (error) => {
        reject(new Error(error.message || 'Google sign-in failed'));
      },
    });

    client.requestAccessToken();
  });
}

export function revokeGoogleToken(token: string): void {
  if (isGisLoaded()) {
    window.google!.accounts.oauth2.revoke(token);
  }
}

export function isTokenValid(auth: GoogleAuthState | null): boolean {
  if (!auth?.accessToken || !auth.expiresAt) return false;
  return Date.now() < auth.expiresAt - 60_000; // 1min buffer
}

export async function callGeminiWithOAuth(
  prompt: string,
  accessToken: string,
  model: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) {
      throw new Error('Google token expired. Sign in again.');
    }
    throw new Error(`Gemini request failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text.trim()) throw new Error('Empty response from Gemini. Try again.');
  return text;
}
