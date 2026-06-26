import {
  corsPreflightResponse,
  getAdminContext,
  jsonResponse,
} from '../_shared/adminAuth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const ctx = await getAdminContext(req);
  if (ctx instanceof Response) return ctx;

  return jsonResponse({
    user: {
      id: ctx.user.id,
      email: ctx.user.email,
    },
    profile: ctx.profile,
  });
});
