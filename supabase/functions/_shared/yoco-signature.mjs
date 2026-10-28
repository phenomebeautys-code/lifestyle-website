export async function verifyWebhook(body, headers, secret) {
  const id = headers.get('webhook-id') || headers.get('svix-id');
  const timestamp = headers.get('webhook-timestamp') || headers.get('svix-timestamp');
  const signatures = headers.get('webhook-signature') || headers.get('svix-signature');
  if (!id || !timestamp || !signatures || !secret) return false;
  try {
    const encoded = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    if (!bytes.length) return false;
    const key = await crypto.subtle.importKey('raw', bytes, {name: 'HMAC', hash: 'SHA-256'}, false, ['verify']);
    const message = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
    for (const candidate of signatures.split(/\s+/)) {
      if (!candidate.startsWith('v1,')) continue;
      try {
        const digest = Uint8Array.from(atob(candidate.slice(3)), char => char.charCodeAt(0));
        if (await crypto.subtle.verify('HMAC', key, digest, message)) return true;
      } catch { /* Ignore malformed candidates, never bypass verification. */ }
    }
  } catch { return false; }
  return false;
}
