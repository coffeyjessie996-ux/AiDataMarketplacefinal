import express from 'express';
import type { PrismaClient } from '@prisma/client';
import type { User } from '../types';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

type AuthReq = express.Request & { user?: User };
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const REQUIRED_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'];

function config() {
  // Reuse the OAuth client credentials already configured in Production; keep the
  // Gmail-specific names available as overrides for future environments.
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
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

function decryptToken(encrypted: { encryptedRefreshToken: string; tokenIv: string; tokenAuthTag: string }, key: Buffer) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.tokenIv, 'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.tokenAuthTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.encryptedRefreshToken, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function safeHeader(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim();
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


  // Single-recipient, human-approved sending only. No bulk sends or unattended campaigns.
  router.post('/send', auth, async (req, res) => {
    const user = (req as AuthReq).user;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    if (user.status !== 'active' || !['admin', 'seller'].includes(user.role)) {
      return res.status(403).json({ error: 'An active seller or administrator account is required.' });
    }
    if (process.env.EMAIL_SENDING_ENABLED !== 'true') {
      return res.status(503).json({ error: 'Email sending is not enabled in Production yet.' });
    }
    const postalAddress = process.env.MAIL_POSTAL_ADDRESS?.trim();
    const senderName = process.env.MAIL_SENDER_NAME?.trim();
    if (!postalAddress || postalAddress.length < 8 || !senderName || senderName.length < 2) {
      return res.status(503).json({ error: 'Add the business name as MAIL_SENDER_NAME and physical mailing address as MAIL_POSTAL_ADDRESS before sending.' });
    }
    const settings = config();
    if (!settings) return res.status(503).json({ error: 'Gmail OAuth configuration is incomplete.' });

    const leadId = typeof req.body?.leadId === 'string' ? req.body.leadId : '';
    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : '';
    if (req.body?.approved !== true || req.body?.contactVerified !== true) {
      return res.status(400).json({ error: 'Review the message and confirm the business contact was independently verified before sending.' });
    }
    if (!leadId || subject.length < 3 || subject.length > 180 || body.length < 10 || body.length > 5000 ||
        !/^[a-f0-9-]{36}$/i.test(idempotencyKey)) {
      return res.status(400).json({ error: 'A valid lead, subject, message, and unique send key are required.' });
    }

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, ...(user.role === 'admin' ? {} : { ownerId: user.id }) },
      select: { id: true, companyName: true, email: true, source: true, stage: true },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    if (['Remote OK', 'SAM.gov'].includes(lead.source)) {
      return res.status(409).json({ error: 'Public job listings and government solicitations cannot be contacted through sales outreach.' });
    }
    const recipient = lead.email?.trim().toLowerCase() || '';
    if (recipient.length > 254 || !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(recipient) || recipient === settings.senderEmail) {
      return res.status(400).json({ error: 'This lead does not have an eligible business email address.' });
    }
    const suppressed = await prisma.emailSuppression.findUnique({ where: { email: recipient } });
    if (suppressed) return res.status(409).json({ error: 'This recipient has opted out and is suppressed.' });

    const since30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const prior = await prisma.outboundEmail.findFirst({
      where: { recipient, OR: [{ status: 'SENDING' }, { status: 'SENT', sentAt: { gte: since30Days } }] },
      select: { id: true },
    });
    if (prior) return res.status(409).json({ error: 'A message was already sent to this address within the last 30 days.' });
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const userDayKey = user.id + ':' + dayStart.toISOString().slice(0, 10);
    await prisma.emailSendQuota.upsert({
      where: { userDayKey },
      create: { userId: user.id, userDayKey, day: dayStart, sendCount: 0 },
      update: {},
    });
    const quota = await prisma.emailSendQuota.updateMany({
      where: { userDayKey, sendCount: { lt: 5 } },
      data: { sendCount: { increment: 1 } },
    });
    if (quota.count !== 1) return res.status(429).json({ error: 'Daily sending limit reached (5 send attempts per account).' });

    const connection = await prisma.gmailConnection.findUnique({ where: { userId: user.id } });
    if (!connection || connection.senderEmail.toLowerCase() !== settings.senderEmail ||
        !connection.scopes.includes('https://www.googleapis.com/auth/gmail.send')) {
      return res.status(409).json({ error: 'Connect the configured Gmail sender before sending.' });
    }

    const unsubscribeToken = randomBytes(32).toString('hex');
    const unsubscribeTokenHash = createHash('sha256').update(unsubscribeToken).digest('hex');
    const recipientDayKey = recipient + ':' + new Date().toISOString().slice(0, 10);
    let outbound;
    try {
      outbound = await prisma.outboundEmail.create({
        data: {
          userId: user.id, leadId: lead.id, recipient, subject,
          body, idempotencyKey, recipientDayKey, unsubscribeTokenHash, status: 'SENDING',
        },
      });
    } catch {
      return res.status(409).json({ error: 'This send was already submitted or another message to this address was already queued today.' });
    }

    try {
      const refreshToken = decryptToken(connection, settings.encryptionKey);
      const tokenResponse = await fetch(GOOGLE_TOKEN, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: settings.clientId, client_secret: settings.clientSecret,
          refresh_token: refreshToken, grant_type: 'refresh_token',
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!tokenResponse.ok) throw new Error('Google token refresh failed.');
      const tokenPayload = await tokenResponse.json() as { access_token?: string };
      if (!tokenPayload.access_token) throw new Error('Google did not return an access token.');

      const unsubscribeUrl = new URL('/api/gmail/unsubscribe/' + unsubscribeToken, settings.redirectUri).toString();
      const footer = [
        '',
        '---',
        'This is a business inquiry from ' + senderName + ' (' + settings.senderEmail + ').',
        'Business mailing address: ' + postalAddress,
        'To stop receiving business emails, unsubscribe here: ' + unsubscribeUrl,
      ].join('\\n');
      const fullBody = body + footer;
      const mime = [
        'From: ' + safeHeader(senderName) + ' <' + settings.senderEmail + '>',
        'To: ' + recipient,
        'Subject: ' + safeHeader(subject),
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        'List-Unsubscribe: <' + unsubscribeUrl + '>',
        'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
        '',
        Buffer.from(fullBody, 'utf8').toString('base64'),
      ].join('\\r\\n');
      const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + tokenPayload.access_token, 'content-type': 'application/json' },
        body: JSON.stringify({ raw: base64Url(mime) }),
        signal: AbortSignal.timeout(20000),
      });
      if (!sendResponse.ok) {
        const status = sendResponse.status;
        throw new Error('Gmail send failed with HTTP ' + status + '.');
      }
      const sent = await sendResponse.json() as { id?: string };
      await prisma.outboundEmail.update({
        where: { id: outbound.id },
        data: { status: 'SENT', gmailMessageId: sent.id || null, sentAt: new Date() },
      });
      await prisma.lead.update({
        where: { id: lead.id },
        data: { stage: 'CONTACTED', lastContactedAt: new Date(), activities: {
          create: { type: 'email_sent', description: 'Human-approved business email sent to ' + recipient + ' via connected Gmail.' },
        } },
      });
      return res.status(201).json({ sent: true, recipient, message: 'Email sent successfully.' });
    } catch (error) {
      console.error('Approved Gmail send failed', error);
      await prisma.outboundEmail.update({
        where: { id: outbound.id },
        data: { status: 'FAILED', failureReason: error instanceof Error ? error.message.slice(0, 300) : 'Unknown sending error.' },
      });
      return res.status(502).json({ error: 'Email could not be sent. No success was recorded.' });
    }
  });

  // Public unsubscribe endpoint supports both a browser click and Gmail one-click POST.
  const unsubscribe = async (req: express.Request, res: express.Response) => {
    const token = typeof req.params.token === 'string' ? req.params.token : '';
    if (!/^[a-f0-9]{64}$/.test(token)) return res.status(404).send('Unsubscribe link not found.');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const outbound = await prisma.outboundEmail.findUnique({
      where: { unsubscribeTokenHash: tokenHash },
      select: { recipient: true },
    });
    if (!outbound) return res.status(404).send('Unsubscribe link not found.');
    await prisma.emailSuppression.upsert({
      where: { email: outbound.recipient },
      create: { email: outbound.recipient, reason: 'UNSUBSCRIBED', source: 'gmail_one_click_or_link' },
      update: { reason: 'UNSUBSCRIBED', source: 'gmail_one_click_or_link' },
    });
    return res.status(200).send('You have been unsubscribed from future business emails.');
  };
  // GET displays a confirmation page so security scanners that prefetch links do not unsubscribe recipients.
  router.get('/unsubscribe/:token', async (req, res) => {
    const token = typeof req.params.token === 'string' ? req.params.token : '';
    if (!/^[a-f0-9]{64}$/.test(token)) return res.status(404).send('Unsubscribe link not found.');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const exists = await prisma.outboundEmail.findUnique({
      where: { unsubscribeTokenHash: tokenHash }, select: { id: true },
    });
    if (!exists) return res.status(404).send('Unsubscribe link not found.');
    const action = '/api/gmail/unsubscribe/' + token;
    return res.type('html').send('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head><body style="font-family:system-ui;max-width:560px;margin:48px auto;padding:20px"><h1>Unsubscribe from business emails</h1><p>Confirm below to stop future business emails to this address.</p><form method="post" action="' + action + '"><button type="submit" style="padding:12px 18px">Confirm unsubscribe</button></form></body></html>');
  });
  router.post('/unsubscribe/:token', unsubscribe);

  return router;
}
