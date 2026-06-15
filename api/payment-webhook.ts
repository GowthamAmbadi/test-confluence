import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buffer } from 'micro';

const DEFAULT_UPSTREAM_URL =
  'https://jktxnmwtbjyonhzygwpu.supabase.co/functions/v1/payment-webhook';

/** Hop-by-hop headers and those recomputed by fetch. */
const SKIP_REQUEST_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

const SKIP_RESPONSE_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

export const config = {
  api: {
    bodyParser: false,
  },
};

function getUpstreamUrl(): string {
  return process.env.SUPABASE_PAYMENT_WEBHOOK_URL?.trim() || DEFAULT_UPSTREAM_URL;
}

function forwardHeaders(source: Headers, skip: Set<string>): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (!skip.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}

function requestHeadersToFetch(req: VercelRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (SKIP_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => headers.append(key, v));
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

function writeUpstreamHeaders(res: VercelResponse, upstream: Response): void {
  upstream.headers.forEach((value, key) => {
    if (!SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const rawBody = await buffer(req);
    const upstream = await fetch(getUpstreamUrl(), {
      method: 'POST',
      headers: requestHeadersToFetch(req),
      body: rawBody,
      redirect: 'manual',
    });

    const responseBody = Buffer.from(await upstream.arrayBuffer());
    writeUpstreamHeaders(res, upstream);
    res.status(upstream.status).send(responseBody);
  } catch (error) {
    console.error('payment-webhook proxy error:', error);
    res.status(502).json({ error: 'Webhook proxy failed' });
  }
}
