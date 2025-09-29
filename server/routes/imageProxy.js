// server.js (or routes/imageProxy.js then app.use('/api', imageProxyRouter))
const crypto = require('crypto');
const { URL } = require('url');
const http = require('http');
const https = require('https');

// Ensure these env vars exist (set defaults)
const IMAGE_PROXY_SECRET = process.env.IMAGE_PROXY_SECRET || 'change_this_secret';
const IMAGE_PROXY_TOKEN_TTL = Number(process.env.IMAGE_PROXY_TOKEN_TTL || 300); // seconds
// comma-separated hostnames you will allow for proxying (e.g. S3 host, cdn.example.com). Default: same-host only
const IMAGE_PROXY_ALLOWLIST = (process.env.IMAGE_PROXY_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);

// helper: base64url encode/decode
const b64url = {
  encode: (s) => Buffer.from(String(s)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  decode: (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
};

// create token for a url
function signTokenForUrl(url, ttlSec = IMAGE_PROXY_TOKEN_TTL) {
  const expires = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${url}|${expires}`;
  const sig = crypto.createHmac('sha256', IMAGE_PROXY_SECRET).update(payload).digest('hex');
  return `${b64url.encode(url)}.${expires}.${sig}`;
}

// verify token and return { ok, url, reason }
function verifyToken(token) {
  try {
    const [encodedUrl, expiresStr, sig] = token.split('.');
    if (!encodedUrl || !expiresStr || !sig) return { ok: false, reason: 'invalid-format' };
    const url = b64url.decode(encodedUrl);
    const expires = Number(expiresStr);
    if (Number.isNaN(expires)) return { ok: false, reason: 'bad-expiry' };
    const now = Math.floor(Date.now() / 1000);
    if (now > expires) return { ok: false, reason: 'expired' };

    const payload = `${url}|${expires}`;
    const expected = crypto.createHmac('sha256', IMAGE_PROXY_SECRET).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return { ok: false, reason: 'bad-signature' };

    // host allowlist check
    try {
      const urlObj = new URL(url, `http://example`); // base harmless if relative
      const hostname = urlObj.hostname || null;
      // allow relative paths (starts with '/') or same-host or hosts in allowlist
      if (url.startsWith('/')) return { ok: true, url };

      if (IMAGE_PROXY_ALLOWLIST.length > 0) {
        if (!hostname || !IMAGE_PROXY_ALLOWLIST.includes(hostname)) {
          return { ok: false, reason: 'host-not-allowed' };
        }
      }
      return { ok: true, url };
    } catch (e) {
      return { ok: false, reason: 'bad-url' };
    }
  } catch (e) {
    return { ok: false, reason: 'exception' };
  }
}

/**
 * POST /api/image-token
 * Body: { url: string }  (url can be absolute or relative like /uploads/foo.jpg)
 * Protected: requires `protect` middleware (so client must call with Authorization header or session cookie)
 * Response: { token: string, expiresAt: <timestamp> }
 */
app.post('/api/image-token', protect, express.json(), (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') return res.status(400).json({ message: 'url required' });

    // optionally normalize relative paths to absolute using req host (not required; token stores original)
    let finalUrl = url;
    if (finalUrl.startsWith('/')) {
      // make absolute same-origin so proxy can later fetch it correctly
      finalUrl = `${req.protocol}://${req.get('host')}${finalUrl}`;
    }

    // Basic allowlist enforcement server-side (optional)
    if (IMAGE_PROXY_ALLOWLIST.length > 0) {
      const host = new URL(finalUrl).hostname;
      if (!IMAGE_PROXY_ALLOWLIST.includes(host)) {
        return res.status(403).json({ message: 'host not allowed' });
      }
    }

    const token = signTokenForUrl(finalUrl, IMAGE_PROXY_TOKEN_TTL);
    const expiresAt = Math.floor(Date.now() / 1000) + IMAGE_PROXY_TOKEN_TTL;
    return res.json({ token, expiresAt });
  } catch (err) {
    console.error('image-token error', err);
    return res.status(500).json({ message: 'server error' });
  }
});

/**
 * GET /api/image/:token
 * Public: verifies token server-side, then proxies the image and streams it back.
 * Usage: <img src="/api/image/{token}" />
 */
app.get('/api/image/:token', (req, res) => {
  const { token } = req.params || {};
  if (!token) return res.status(400).send('token required');

  const verified = verifyToken(token);
  if (!verified.ok) {
    console.warn('image token verify failed:', verified.reason);
    return res.status(403).send('invalid token');
  }

  const target = verified.url;
  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch (e) {
    return res.status(400).send('bad url');
  }

  const lib = targetUrl.protocol === 'https:' ? https : http;

  const upstreamOptions = {
    method: 'GET',
    headers: {
      // do NOT forward client tokens here; this request is server-side.
      // You can add server-side auth headers if your storage requires them.
      // 'Authorization': `Bearer ${process.env.SERVER_IMAGE_FETCH_TOKEN}`,
      'User-Agent': 'image-proxy/1.0',
      Accept: '*/*',
    },
  };

  const upstreamReq = lib.request(targetUrl, upstreamOptions, (upstreamRes) => {
    const status = upstreamRes.statusCode || 502;

    if (status >= 400) {
      // propagate certain statuses for debugging (but hide details in prod)
      res.status(status).type('txt').send('upstream image fetch failed');
      upstreamRes.resume();
      return;
    }

    const contentType = upstreamRes.headers['content-type'] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    // forward cache-control if present (you can override for stricter TTL)
    if (upstreamRes.headers['cache-control']) {
      res.setHeader('Cache-Control', upstreamRes.headers['cache-control']);
    } else {
      // default caching
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }

    upstreamRes.pipe(res);
  });

  upstreamReq.on('error', (err) => {
    console.error('upstream request error for image proxy:', err);
    if (!res.headersSent) res.status(502).send('proxy error');
  });

  upstreamReq.end();
});
