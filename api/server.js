const crypto = require('node:crypto');
const { promisify } = require('node:util');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { Pool } = require('pg');
const { z } = require('zod');
const path = require('node:path');

const scrypt = promisify(crypto.scrypt);
const app = express();
const port = Number(process.env.PORT || 10000);
const production = process.env.NODE_ENV === 'production';
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: true },
      max: Number(process.env.DB_POOL_SIZE || 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
  : null;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'self'"] } } }));
app.use(express.json({ limit: '24kb', strict: true }));
app.use((req, res, next) => {
  const origin = process.env.APP_ORIGIN;
  if (origin && req.headers.origin === origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const limiter = (windowMs, limit) => rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => res.status(429).json({ error: 'rate_limited' }) });
app.use('/v1/auth', limiter(15 * 60 * 1000, 30));
app.use('/v1/applications', limiter(15 * 60 * 1000, 20));

class ApiError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
const feature = (key) => process.env[key] === 'true';
const key32 = (name) => {
  const raw = process.env[name];
  if (!raw) throw new ApiError(503, 'service_not_configured');
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length !== 32) throw new ApiError(503, 'service_not_configured');
  return decoded;
};
const poolOrFail = () => { if (!pool) throw new ApiError(503, 'database_not_configured'); return pool; };
const configured = (names) => names.every((name) => Boolean(process.env[name]));
const phoneSchema = z.string().regex(/^\+254[17]\d{8}$/);
const opaque = (value) => crypto.createHash('sha256').update(value).digest();
const sessionDigest = (value) => crypto.createHmac('sha256', key32('SESSION_HASH_KEY')).update(value).digest();
const phoneDigest = (phone) => crypto.createHmac('sha256', key32('PHONE_HASH_KEY')).update(phone).digest();
function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key32('PII_ENCRYPTION_KEY'), iv);
  const body = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value), 'utf8')), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}
function decrypt(box) {
  const data = Buffer.from(box);
  if (data.length < 29) throw new ApiError(500, 'data_unavailable');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key32('PII_ENCRYPTION_KEY'), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  const body = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
  return JSON.parse(body.toString('utf8'));
}
function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', key32('TOKEN_SIGNING_KEY')).update(body).digest('base64url');
  return `${body}.${signature}`;
}
function verifyToken(token) {
  if (typeof token !== 'string' || token.length > 2048) throw new ApiError(401, 'invalid_token');
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra) throw new ApiError(401, 'invalid_token');
  const expected = crypto.createHmac('sha256', key32('TOKEN_SIGNING_KEY')).update(body).digest();
  let received;
  try { received = Buffer.from(signature, 'base64url'); } catch { throw new ApiError(401, 'invalid_token'); }
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) throw new ApiError(401, 'invalid_token');
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { throw new ApiError(401, 'invalid_token'); }
  if (!payload.exp || payload.exp < Date.now()) throw new ApiError(401, 'expired_token');
  return payload;
}
const sameDigest = (left, right) => left && right && left.length === right.length && crypto.timingSafeEqual(left, right);

async function sendOtp(phone, code) {
  if (!configured(['SMS_AT_USERNAME', 'SMS_AT_API_KEY'])) throw new ApiError(503, 'otp_provider_not_configured');
  const endpoint = process.env.SMS_AT_ENV === 'sandbox'
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';
  const form = new URLSearchParams({ username: process.env.SMS_AT_USERNAME, to: phone, message: `Your Haba verification code is ${code}. It expires in 5 minutes.` });
  if (process.env.SMS_AT_SENDER_ID) form.set('from', process.env.SMS_AT_SENDER_ID);
  const response = await fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json', Apikey: process.env.SMS_AT_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new ApiError(502, 'otp_delivery_failed');
  let result;
  try { result = await response.json(); } catch { throw new ApiError(502, 'otp_delivery_failed'); }
  if (result.SMSMessageData?.Recipients?.some((recipient) => Number(recipient.statusCode) !== 101)) throw new ApiError(502, 'otp_delivery_failed');
}

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const authRequired = asyncRoute(async (req, _res, next) => {
  const match = /^Bearer ([A-Za-z0-9._-]{32,2048})$/.exec(req.headers.authorization || '');
  if (!match) throw new ApiError(401, 'unauthorized');
  const result = await poolOrFail().query(
    `SELECT u.id FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_digest = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'`,
    [sessionDigest(match[1])],
  );
  if (!result.rowCount) throw new ApiError(401, 'unauthorized');
  req.userId = result.rows[0].id;
  next();
});
function lendingGate() {
  if (!feature('LENDING_ENABLED') || !process.env.CBK_AUTHORIZATION_REFERENCE || !process.env.ODPC_REGISTRATION_REFERENCE) throw new ApiError(423, 'lending_not_authorized');
}
function appIdParam(req) {
  const parsed = z.string().uuid().safeParse(req.params.applicationId);
  if (!parsed.success) throw new ApiError(404, 'not_found');
  return parsed.data;
}
async function requireOwnedApplication(db, id, userId) {
  const result = await db.query('SELECT id, status FROM applications WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!result.rowCount) throw new ApiError(404, 'not_found');
  return result.rows[0];
}

app.get('/healthz', asyncRoute(async (_req, res) => {
  let database = false;
  if (pool) { try { await pool.query('SELECT 1'); database = true; } catch {} }
  res.status(database ? 200 : 503).json({ status: database ? 'ok' : 'not_ready', database, registrationEnabled: feature('REGISTRATION_ENABLED'), lendingEnabled: feature('LENDING_ENABLED') });
}));

app.get('/v1/product-status', (_req, res) => res.json({
  country: 'KE', currency: 'KES',
  registrationEnabled: feature('REGISTRATION_ENABLED') && configured(['SMS_AT_USERNAME', 'SMS_AT_API_KEY']) && Boolean(pool),
  applicationEnabled: feature('LENDING_ENABLED') && Boolean(process.env.CBK_AUTHORIZATION_REFERENCE) && Boolean(process.env.ODPC_REGISTRATION_REFERENCE) && feature('CREDIT_PROVIDER_ADAPTER_APPROVED'),
  creditReviewEnabled: false,
  activationPaymentEnabled: false,
}));

app.post('/v1/auth/otp/request', asyncRoute(async (req, res) => {
  if (!feature('REGISTRATION_ENABLED')) throw new ApiError(423, 'registration_not_open');
  if (!pool) throw new ApiError(503, 'database_not_configured');
  const body = z.object({ phone: phoneSchema }).safeParse(req.body);
  if (!body.success) throw new ApiError(400, 'invalid_phone');
  const phone = body.data.phone;
  const digest = phoneDigest(phone);
  const recent = await pool.query(`SELECT count(*)::int AS count FROM otp_challenges WHERE phone_digest=$1 AND created_at > now() - interval '1 hour'`, [digest]);
  if (recent.rows[0].count >= 5) throw new ApiError(429, 'otp_rate_limited');
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeDigest = crypto.createHmac('sha256', key32('OTP_HASH_KEY')).update(`${digest.toString('hex')}:${code}`).digest();
  const row = await pool.query(`INSERT INTO otp_challenges(phone_digest,phone_ciphertext,code_digest,expires_at) VALUES($1,$2,$3,now()+interval '5 minutes') RETURNING id`, [digest, encrypt({ phone }), codeDigest]);
  try { await sendOtp(phone, code); }
  catch (error) { await pool.query('DELETE FROM otp_challenges WHERE id=$1', [row.rows[0].id]); throw error; }
  res.status(202).json({ challengeId: row.rows[0].id, expiresInSeconds: 300 });
}));

app.post('/v1/auth/otp/verify', asyncRoute(async (req, res) => {
  if (!feature('REGISTRATION_ENABLED')) throw new ApiError(423, 'registration_not_open');
  const body = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
  if (!body.success) throw new ApiError(400, 'invalid_code');
  const db = poolOrFail();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM otp_challenges WHERE id=$1 FOR UPDATE', [body.data.challengeId]);
    const challenge = result.rows[0];
    if (!challenge || challenge.consumed_at || challenge.verified_at || new Date(challenge.expires_at) < new Date() || challenge.attempts >= 5) throw new ApiError(400, 'invalid_or_expired_code');
    const codeDigest = crypto.createHmac('sha256', key32('OTP_HASH_KEY')).update(`${challenge.phone_digest.toString('hex')}:${body.data.code}`).digest();
    if (!sameDigest(codeDigest, challenge.code_digest)) {
      await client.query('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=$1', [challenge.id]);
      await client.query('COMMIT');
      throw new ApiError(400, 'invalid_or_expired_code');
    }
    await client.query('UPDATE otp_challenges SET verified_at=now() WHERE id=$1', [challenge.id]);
    await client.query('COMMIT');
    res.json({ registrationToken: signToken({ purpose: 'register', challengeId: challenge.id, phoneDigest: challenge.phone_digest.toString('hex'), exp: Date.now()+10*60*1000 }) });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); }
}));

app.post('/v1/auth/register', asyncRoute(async (req, res) => {
  if (!feature('REGISTRATION_ENABLED')) throw new ApiError(423, 'registration_not_open');
  const body = z.object({ registrationToken: z.string().min(20).max(2048), password: z.string().min(12).max(128) }).safeParse(req.body);
  if (!body.success) throw new ApiError(400, 'invalid_registration');
  const token = verifyToken(body.data.registrationToken);
  if (token.purpose !== 'register') throw new ApiError(401, 'invalid_token');
  const db = poolOrFail();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const challengeResult = await client.query('SELECT * FROM otp_challenges WHERE id=$1 FOR UPDATE', [token.challengeId]);
    const challenge = challengeResult.rows[0];
    if (!challenge || !challenge.verified_at || challenge.consumed_at || challenge.expires_at < new Date() || challenge.phone_digest.toString('hex') !== token.phoneDigest) throw new ApiError(400, 'invalid_registration');
    const userId = crypto.randomUUID();
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(body.data.password, salt, 64);
    await client.query('INSERT INTO users(id,phone_digest,phone_ciphertext,password_salt,password_hash,country_code) VALUES($1,$2,$3,$4,$5,\'KE\')', [userId, challenge.phone_digest, challenge.phone_ciphertext, salt, hash]);
    await client.query('UPDATE otp_challenges SET consumed_at=now() WHERE id=$1', [challenge.id]);
    const sessionToken = crypto.randomBytes(32).toString('base64url');
    await client.query('INSERT INTO sessions(user_id,token_digest,expires_at) VALUES($1,$2,now()+interval \'12 hours\')', [userId, sessionDigest(sessionToken)]);
    await client.query('INSERT INTO audit_events(user_id,event_type,subject_type,subject_id) VALUES($1,\'account_created\',\'user\',$1)', [userId]);
    await client.query('COMMIT');
    res.status(201).json({ accessToken: sessionToken, tokenType: 'Bearer', expiresInSeconds: 43200 });
  } catch (error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
  finally { client.release(); }
}));

app.post('/v1/auth/login', asyncRoute(async (req, res) => {
  if (!feature('REGISTRATION_ENABLED')) throw new ApiError(423, 'registration_not_open');
  const body = z.object({ phone: phoneSchema, password: z.string().min(1).max(128) }).safeParse(req.body);
  if (!body.success) throw new ApiError(400, 'invalid_login');
  const digest = phoneDigest(body.data.phone);
  const result = await poolOrFail().query('SELECT id,password_salt,password_hash FROM users WHERE phone_digest=$1 AND status=\'active\'', [digest]);
  if (!result.rowCount) throw new ApiError(401, 'invalid_login');
  const user = result.rows[0];
  const hash = await scrypt(body.data.password, user.password_salt, 64);
  if (!sameDigest(hash, user.password_hash)) throw new ApiError(401, 'invalid_login');
  const accessToken = crypto.randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO sessions(user_id,token_digest,expires_at) VALUES($1,$2,now()+interval \'12 hours\')', [user.id, sessionDigest(accessToken)]);
  res.json({ accessToken, tokenType: 'Bearer', expiresInSeconds: 43200 });
}));

app.post('/v1/auth/logout', authRequired, asyncRoute(async (req, res) => {
  const token = req.headers.authorization.slice(7);
  await poolOrFail().query('UPDATE sessions SET revoked_at=now() WHERE token_digest=$1 AND user_id=$2 AND revoked_at IS NULL', [sessionDigest(token), req.userId]);
  res.sendStatus(204);
}));

app.get('/v1/me', authRequired, asyncRoute(async (req, res) => {
  const result = await poolOrFail().query('SELECT id,phone_ciphertext,country_code,created_at FROM users WHERE id=$1', [req.userId]);
  if (!result.rowCount) throw new ApiError(404, 'not_found');
  const phone = decrypt(result.rows[0].phone_ciphertext).phone;
  res.json({ id: result.rows[0].id, phone: `${phone.slice(0, 4)}••••${phone.slice(-2)}`, country: result.rows[0].country_code, createdAt: result.rows[0].created_at });
}));

const applicationSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  dateOfBirth: z.string().date(),
  countyOrRegion: z.string().trim().min(2).max(100),
  workStatus: z.enum(['employed','self_employed','casual','student','unemployed']),
  employer: z.string().trim().max(120).optional().default(''),
  occupation: z.string().trim().max(120).optional().default(''),
  monthlyIncomeKes: z.number().int().min(0).max(100_000_000),
});
app.post('/v1/applications', authRequired, asyncRoute(async (req, res) => {
  lendingGate();
  const body = applicationSchema.safeParse(req.body);
  if (!body.success) throw new ApiError(400, 'invalid_application');
  const created = await poolOrFail().query('INSERT INTO applications(user_id,applicant_ciphertext) VALUES($1,$2) RETURNING id,status,created_at', [req.userId, encrypt(body.data)]);
  await pool.query('INSERT INTO audit_events(user_id,event_type,subject_type,subject_id) VALUES($1,\'application_created\',\'application\',$2)', [req.userId, created.rows[0].id]);
  res.status(201).json(created.rows[0]);
}));

const referenceSchema = z.object({
  contacts: z.array(z.object({ name: z.string().trim().min(2).max(120), phone: phoneSchema, relationship: z.enum(['family','friend','colleague','neighbour','other']) })).length(2),
  applicantsConfirmedPermission: z.literal(true),
});
app.put('/v1/applications/:applicationId/references', authRequired, asyncRoute(async (req, res) => {
  lendingGate();
  const applicationId = appIdParam(req);
  const body = referenceSchema.safeParse(req.body);
  if (!body.success) throw new ApiError(400, 'invalid_references');
  await requireOwnedApplication(poolOrFail(), applicationId, req.userId);
  await pool.query('UPDATE applications SET references_ciphertext=$1,updated_at=now() WHERE id=$2 AND user_id=$3', [encrypt(body.data.contacts), applicationId, req.userId]);
  await pool.query('INSERT INTO audit_events(user_id,event_type,subject_type,subject_id) VALUES($1,\'references_added\',\'application\',$2)', [req.userId, applicationId]);
  res.sendStatus(204);
}));

app.post('/v1/applications/:applicationId/consents', authRequired, asyncRoute(async (req, res) => {
  lendingGate();
  const applicationId = appIdParam(req);
  const body = z.object({ purpose: z.enum(['application_processing','credit_bureau_check','reference_contact']), noticeVersion: z.string().trim().min(1).max(40), accepted: z.boolean() }).safeParse(req.body);
  if (!body.success) throw new ApiError(400, 'invalid_consent');
  await requireOwnedApplication(poolOrFail(), applicationId, req.userId);
  const created = await pool.query('INSERT INTO consent_records(user_id,application_id,purpose,notice_version,accepted) VALUES($1,$2,$3,$4,$5) RETURNING id,created_at', [req.userId, applicationId, body.data.purpose, body.data.noticeVersion, body.data.accepted]);
  res.status(201).json(created.rows[0]);
}));

app.get('/v1/applications', authRequired, asyncRoute(async (req, res) => {
  const result = await poolOrFail().query('SELECT id,status,submitted_at,created_at,updated_at FROM applications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [req.userId]);
  res.json({ applications: result.rows });
}));

app.post('/v1/applications/:applicationId/submit', authRequired, asyncRoute(async (req, res) => {
  lendingGate();
  const applicationId = appIdParam(req);
  const db = poolOrFail();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const owned = await client.query('SELECT id,status,references_ciphertext FROM applications WHERE id=$1 AND user_id=$2 FOR UPDATE', [applicationId, req.userId]);
    const application = owned.rows[0];
    if (!application) throw new ApiError(404, 'not_found');
    if (application.status !== 'draft') throw new ApiError(409, 'application_already_submitted');
    if (!application.references_ciphertext || decrypt(application.references_ciphertext).length !== 2) throw new ApiError(409, 'references_required');
    const consents = await client.query(`SELECT purpose FROM consent_records WHERE application_id=$1 AND user_id=$2 AND accepted=true`, [applicationId, req.userId]);
    const accepted = new Set(consents.rows.map((row) => row.purpose));
    for (const purpose of ['application_processing','credit_bureau_check','reference_contact']) {
      if (!accepted.has(purpose)) throw new ApiError(409, 'required_consent_missing');
    }
    const updated = await client.query(`UPDATE applications SET status='submitted',submitted_at=now(),updated_at=now() WHERE id=$1 RETURNING id,status,submitted_at`, [applicationId]);
    await client.query('INSERT INTO audit_events(user_id,event_type,subject_type,subject_id) VALUES($1,\'application_submitted\',\'application\',$2)', [req.userId, applicationId]);
    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
  finally { client.release(); }
}));

app.post('/v1/me/close-account', authRequired, asyncRoute(async (req, res) => {
  const body = z.object({ confirm: z.literal(true) }).safeParse(req.body);
  if (!body.success) throw new ApiError(400, 'confirmation_required');
  const client = await poolOrFail().connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE users SET status='closed',updated_at=now() WHERE id=$1`, [req.userId]);
    await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [req.userId]);
    await client.query('INSERT INTO audit_events(user_id,event_type,subject_type,subject_id) VALUES($1,\'account_closed\',\'user\',$1)', [req.userId]);
    await client.query('COMMIT');
    res.sendStatus(204);
  } catch (error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
  finally { client.release(); }
}));

const publicRoot = path.resolve(__dirname, '..');
app.get('/', (_req, res) => res.sendFile(path.join(publicRoot, 'index.html')));
for (const asset of ['styles.css', 'onboarding.css', 'app-live.js']) {
  app.get(`/${asset}`, (_req, res) => res.sendFile(path.join(publicRoot, asset)));
}

app.post('/v1/applications/:applicationId/credit-review', authRequired, asyncRoute(async (req, _res) => {
  lendingGate();
  const applicationId = appIdParam(req);
  await requireOwnedApplication(poolOrFail(), applicationId, req.userId);
  if (!configured(['CREDIT_PROVIDER_BASE_URL','CREDIT_PROVIDER_API_KEY'])) throw new ApiError(503, 'credit_provider_not_configured');
  throw new ApiError(503, 'credit_provider_adapter_not_approved');
}));

app.post('/v1/applications/:applicationId/activation-payment', authRequired, asyncRoute(async (req, _res) => {
  lendingGate();
  const applicationId = appIdParam(req);
  await requireOwnedApplication(poolOrFail(), applicationId, req.userId);
  if (!configured(['MPESA_CONSUMER_KEY','MPESA_CONSUMER_SECRET','MPESA_SHORTCODE','MPESA_PASSKEY','MPESA_CALLBACK_TOKEN'])) throw new ApiError(503, 'payment_provider_not_configured');
  throw new ApiError(503, 'payment_product_review_required');
}));

app.use((req, res) => res.status(404).json({ error: 'not_found' }));
app.use((error, _req, res, _next) => {
  if (error instanceof ApiError) return res.status(error.status).json({ error: error.code });
  if (error?.name === 'ZodError') return res.status(400).json({ error: 'invalid_request' });
  if (error?.code === '23505') return res.status(409).json({ error: 'account_already_exists' });
  process.stderr.write(`request_error ${error?.name || 'Error'}\n`);
  res.status(500).json({ error: 'internal_error' });
});

const server = app.listen(port, '0.0.0.0', () => process.stdout.write(`Haba API listening on ${port}\n`));
async function shutdown() {
  server.close(async () => { if (pool) await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
