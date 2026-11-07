import { settings, requireSessionSecret } from '../settings.js';
import { equalSecret } from './security.js';
import { hashToken } from './hash.js';
import { createMailboxToken, verifyMailboxToken } from './mailbox-token.js';
import { database, consumeLimit } from './database.js';

export const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
const cookieName = 'tmail_private';

function credentials(env) {
  const path = env.PRIVATE_MAIL_PATH ?? '';
  const password = env.PRIVATE_MAIL_PASSWORD ?? '';
  // Single URL segments; credentials stay entirely on the server.
  if (!path || !password || [path, password].some(x =>
    x.length > 256 || /[\s/\\?#%]/u.test(x) || x === '.' || x === '..'
  ) || ['api', 'mail', 'assets'].includes(path)) return null;
  return { path, password };
}

export async function matchesPrivateEntry(request, env) {
  const secret = credentials(env);
  if (!secret || !['GET', 'HEAD'].includes(request.method)) return false;
  let segments;
  try { segments = new URL(request.url).pathname.split('/').slice(1).map(decodeURIComponent); }
  catch { return false; }
  if (segments.length !== 2) return false;
  if (!(await equalSecret(segments[0], secret.path))) return false;
  // Rate-limit password attempts without revealing the configured path in responses.
  const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('CF-Connecting-IP') || 'local';
  const db = await database(env);
  try {
    if (!(await consumeLimit(db, `private-entry:${await hashToken(ip)}`, 60, 20))) return false;
  } finally { db.close(); }
  return equalSecret(segments[1], secret.password);
}

async function identity(env) {
  const secret = credentials(env);
  return secret ? `private:${(await hashToken(JSON.stringify(secret))).toLowerCase()}` : null;
}

export async function privateCookie(request, env) {
  const config = settings(env);
  requireSessionSecret(config.sessionSecret);
  const token = await createMailboxToken(await identity(env), config.sessionSecret, Date.now(), 3600);
  return `${cookieName}=${token}; Path=/api/private; HttpOnly; SameSite=Strict; Max-Age=3600${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}

export async function privateAccess(request, env) {
  const expected = await identity(env);
  if (!expected) return false;
  const token = (request.headers.get('Cookie') ?? '').split(';').map(x => x.trim())
    .find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!token || token.length > 2048) return false;
  return await verifyMailboxToken(token, settings(env).sessionSecret) === expected;
}

export function privateHtml(html) {
  return html.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-private-mail="true">')
    .replace('<head>', '<head><meta name="robots" content="noindex,nofollow,noarchive,nosnippet">')
    .replace(/<meta name="description"[^>]*>/, '')
    .replace(/<title>.*?<\/title>/, '<title>秘密邮箱</title>');
}

export function notFound() {
  return new Response('Not Found', { status: 404, headers: privateHeaders });
}
