import express from 'express';
import type { PrismaClient } from '@prisma/client';
import type { User } from '../types';
import { createHash, createCipheriv, randomBytes } from 'node:crypto';

type AuthReq = express.Request & { user?: User };
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const REQUIRED_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'];

function config() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;
  const senderEmail = process.env.GMAIL_SENDER_EMAIL?.toLowerCase();
  const key = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !redirectUri || !senderEmail || !key) return null;
  let encryptionKey: Buffer;
  try { encryptionKey = Buffer.from(key, 'base64'); } catch { return null; }
  if (encryptionKey.length !== 32) return null;
  return { clientId, clientSecret, redirectUri, senderEmail, encryptionKey };
}

function encryptToken(token: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return {
    encryptedRefreshToken: ciphertext.toString('base64'),
    tokenIv: iv.toString('base64'),
    tokenAuthTag: cipher.getAuthTag().toString('base64'),
  };
}

export function createGmailRouter(prisma: PrismaClient, auth: express.RequestHandler) {
  const router = express.Router();

  router.get('/status', auth, async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    const connection = await prisma.gmailConnection.findUnique({
      where: { userId: user.id },
      select: { senderEmail: true, scopes: true, connectedAt: true },
    });
    return res.json({
      connected: Boolean(connection),
      senderEmail: connection?.senderEmail ?? null,
      scopes: connection?.scopes ?? [],
      connectedAt: connection?.connectedAt.toISOString() ?? null,
    });
  });

  router.post('/oauth/start', auth, async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    const settings = config();
    if (!settings) return res.status(503).json({ error: 'Gmail OAuth is not configured. Add the five Gmail environment variables to the API deployment.' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Only active marketplace accounts can connect the sales mailbox.' });
    if (!['admin', 'seller'].includes(user.role)) return res.status(403).json({ error: 'Only marketplace administrators or sellers can connect the sales mailbox.' });

    const rawState = randomBytes(32).toString('hex');
    const stateHash = createHash('sha256').update(rawState).digest('hex');
    await prisma.gmailOAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await prisma.gmailOAuthState.create({
      data: { userId: user.id, stateHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set('client_id', settings.clientId);
    url.searchParams.set('redirect_uri', settings.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', REQUIRED_SCOPES.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('login_hint', settings.senderEmail);
    url.searchParams.set('state', rawState);
    return res.json({ authorizationUrl: url.toString() });
  });

  // Public callback: one-time random state is bound to the signed-in owner and expires after 10 minutes.
  router.get('/oauth/callback', async (req, res) => {
    const frontend = (process.env.FRONTEND_URL || 'https://aidatamarketplacefinal.vercel.app').replace(/\/$/, '');
    const fail = (reason: string) => res.redirect(302, frontend + '/pipeline?gmail=error&reason=' + encodeURIComponent(reason));
    if (typeof req.query.error === 'string') return fail('Google authorization was cancelled.');
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const rawState = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !/^[a-f0-9]{64}$/.test(rawState)) return fail('The Google authorization response was incomplete.');
    const settings = config();
    if (!settings) return fail('Gmail OAuth server settings are incomplete.');
    const stateHash = createHash('sha256').update(rawState).digest('hex');
    const state = await prisma.gmailOAuthState.findUnique({ where: { stateHash } });
    if (!state || state.usedAt || state.expiresAt < new Date()) return fail('The authorization request expired. Please try connecting again.');

    // Consume state before exchanging the code so a callback cannot be replayed.
    const consumed = await prisma.gmailOAuthState.updateMany({
      where: { id: state.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) return fail('This authorization request has already been used.');

    // Re-check the account at callback time; a role or account status may have changed during consent.
    const owner = await prisma.user.findUnique({
      where: { id: state.userId },
      select: { role: true, status: true },
    });
    if (!owner || owner.status.toLowerCase() !== 'active' || !['admin', 'seller'].includes(owner.role.toLowerCase())) {
      return fail('This marketplace account is no longer authorized to connect the sales mailbox.');
    }

    try {
      const tokenResponse = await fetch(GOOGLE_TOKEN, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: settings.clientId, client_secret: settings.clientSecret,
          redirect_uri: settings.redirectUri, grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!tokenResponse.ok) {
        console.error('Google token exchange failed', tokenResponse.status);
        return fail('Google could not complete authorization. Check the OAuth client and callback URL.');
      }
      const tokens = await tokenResponse.json() as { id_token?: string; refresh_token?: string; scope?: string };
      if (!tokens.id_token) return fail('Google did not return a verified account identity.');
      const identityResponse = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(tokens.id_token), {
        signal: AbortSignal.timeout(10000),
      });
      if (!identityResponse.ok) return fail('Google account verification failed.');
      const identity = await identityResponse.json() as { aud?: string; email?: string; email_verified?: boolean | string; iss?: string };
      const verified = identity.email_verified === true || identity.email_verified === 'true';
      if (identity.aud !== settings.clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(identity.iss || '') ||
          !verified || identity.email?.toLowerCase() !== settings.senderEmail) {
        return fail('The authorized Google account does not match the configured marketplace sender address.');
      }
      if (!tokens.refresh_token) return fail('Google did not provide offline access. Revoke this app in Google Account permissions and reconnect.');
      const scopes = (tokens.scope || '').split(' ').filter(Boolean);
      if (!scopes.includes('https://www.googleapis.com/auth/gmail.send')) return fail('Google did not grant Gmail send permission.');
      const encrypted = encryptToken(tokens.refresh_token, settings.encryptionKey);
      await prisma.gmailConnection.upsert({
        where: { userId: state.userId },
        create: { userId: state.userId, senderEmail: settings.senderEmail, scopes, ...encrypted },
        update: { senderEmail: settings.senderEmail, scopes, ...encrypted },
      });
      return res.redirect(302, frontend + '/pipeline?gmail=connected');
    } catch (error) {
      console.error('Gmail OAuth callback failed', error);
      return fail('Gmail connection could not be saved. Please try again.');
    }
  });

  return router;
}
