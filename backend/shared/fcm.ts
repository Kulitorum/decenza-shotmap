import { createSign } from 'crypto';

interface ServiceAccount {
  project_id: string;
  private_key: string;
  client_email: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function getServiceAccount(): ServiceAccount | null {
  const json = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!json) return null;
  return JSON.parse(json) as ServiceAccount;
}

/** Create a signed JWT for Google OAuth2 */
function createJwt(sa: ServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const signInput = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signInput);
  const signature = signer.sign(sa.private_key, 'base64url');

  return `${signInput}.${signature}`;
}

/** Get an OAuth2 access token (cached for ~55 minutes) */
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const jwt = createJwt(sa);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('FCM OAuth2 token error:', text);
    throw new Error(`FCM OAuth2 failed: ${response.status}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000, // refresh 5 min early
  };
  return cachedToken.token;
}

/** Send an FCM data message to a single token. Returns false if token is invalid. */
export async function sendFcmMessage(
  fcmToken: string,
  data: Record<string, string>
): Promise<boolean> {
  const sa = getServiceAccount();
  if (!sa) {
    console.log('FCM: no service account configured, skipping');
    return false;
  }

  const accessToken = await getAccessToken(sa);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          data,
          android: {
            priority: 'high',
          },
        },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 404 || text.includes('UNREGISTERED')) {
      console.log(`FCM: token unregistered: ${fcmToken.slice(0, 20)}...`);
      return false;
    }
    console.error(`FCM send error (${response.status}):`, text);
  }
  return response.ok;
}
