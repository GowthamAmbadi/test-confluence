/* ============================================================
   CONFLUENCE 2026 — supabase.js
   ============================================================
   ⚙️  Replace the placeholders below with your project values.
   Find them in: Supabase Dashboard → Project Settings → API
   ============================================================ */

const SUPABASE_URL = "https://jktxnmwtbjyonhzygwpu.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprdHhubXd0Ymp5b25oenlnd3B1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTc2MDEsImV4cCI6MjA5NTk3MzYwMX0.lxhcIVV0O0LlpMdyjRo2tRM7wHy27HSwBKrCMVKDDPs"

// CDN client (loaded via <script> in HTML)
let _db = null;

function getDB() {
  if (_db) return _db;
  if (typeof window.supabase === 'undefined') {
    console.error('Supabase CDN not loaded. Add the CDN script before supabase.js');
    return null;
  }
  _db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _db;
}

// ─── HELPERS ───────────────────────────────────────────────

/**
 * Upsert participant, returns participant row.
 */
async function upsertParticipant(data) {
  const db = getDB();
  const { data: rows, error } = await db
    .from('participants')
    .upsert({
      full_name: data.full_name,
      email: data.email,
      phone: data.phone,
      college_company: data.college_company,
      city: data.city,
      linkedin: data.linkedin || null,
      instagram: data.instagram || null,
    }, { onConflict: 'email', returning: 'representation' })
    .select()
    .single();

  if (error) throw error;
  return rows;
}

/**
 * Insert application for a pass.
 * @param {string} participantId - UUID from participants table
 * @param {string} passType - e.g. 'learning-lab'
 * @param {object} answers - all form answers as JSONB
 * @returns application row
 */
async function insertApplication(participantId, passType, answers) {
  const db = getDB();
  const registrationId = generateRegistrationId(passType);

  const { data, error } = await db
    .from('applications')
    .insert({
      participant_id: participantId,
      pass_type: passType,
      answers,
      status: 'pending',
      registration_id: registrationId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Submit full application (upsert participant + insert application).
 */
async function submitApplication(formData, passType) {
  const participant = await upsertParticipant(formData);
  const application = await insertApplication(participant.id, passType, formData);
  return { participant, application };
}

/**
 * Insert waitlist entry.
 */
async function insertWaitlist(data) {
  const db = getDB();
  const { data: row, error } = await db
    .from('waitlist')
    .insert({
      name: data.name,
      email: data.email,
      phone: data.phone,
      college: data.college,
      city: data.city,
      linkedin: data.linkedin || null,
      why_join: data.why_join,
      value_add: data.value_add || null,
    })
    .select()
    .single();

  if (error) throw error;
  return row;
}

/**
 * Fetch active pass types from DB (legacy table).
 */
async function fetchPassTypes() {
  const db = getDB();
  const { data, error } = await db
    .from('pass_types')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Fetch active events from DB (Phase 2+ catalogue).
 */
async function fetchEvents() {
  const db = getDB();
  const { data, error } = await db
    .from('events')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true });

  if (error) throw error;
  return data;
}

// ─── UTILS ───

function generateRegistrationId(passType = 'pass') {
  const prefix = {
    'learning-lab': 'LL',
    'concept-cocoon': 'CC',
    'networking-gala': 'NG',
    'waitlist': 'WL',
  }[passType] || 'CF';

  const year = '26';
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}${year}-${rand}`;
}

// ─── EVENT CATALOG (slug → event row) ───

let _eventsBySlug = null;

async function loadEventsCatalog() {
  if (_eventsBySlug) return _eventsBySlug;
  const events = await fetchEvents();
  _eventsBySlug = {};
  for (const e of events) {
    _eventsBySlug[e.slug] = e;
  }
  return _eventsBySlug;
}

function getEventBySlug(slug) {
  return _eventsBySlug ? _eventsBySlug[slug] : null;
}

// ─── EDGE FUNCTIONS ───

async function invokeFunction(name, body) {
  const db = getDB();
  const { data, error } = await db.functions.invoke(name, { body });
  if (error) {
    const message = error.message || `Edge function ${name} failed`;
    return { data: null, error: { message } };
  }
  if (data?.error) {
    return { data: null, error: { message: data.error } };
  }
  return { data, error: null };
}

async function createRegistration(payload) {
  return invokeFunction('create-registration', payload);
}

async function createOrder(registrationId, promoCode, eventId) {
  const body = { registration_id: registrationId };
  if (promoCode) body.promo_code = promoCode;
  if (eventId) body.event_id = eventId;
  return invokeFunction('create-order', body);
}

async function validatePromo(code, subtotal, eventId) {
  if (!eventId) {
    return { data: null, error: { message: 'Event is required to validate promo code' } };
  }
  const body = { code, subtotal, event_id: eventId };
  const result = await invokeFunction('promo-validate', body);
  if (result.error) return result;
  return { data: result.data, error: null };
}

async function getRegistrationStatus(registrationId) {
  const db = getDB();
  const { data, error } = await db.functions.invoke('registration-status', {
    body: { registration_id: registrationId },
  });
  if (error) throw error;
  return data;
}

// ─── PUBLIC CONFIG (Razorpay key ID only — secrets stay server-side) ───

let _publicConfig = null;
let _publicConfigPromise = null;

async function loadPublicConfig() {
  if (_publicConfig) return _publicConfig;
  if (_publicConfigPromise) return _publicConfigPromise;

  _publicConfigPromise = (async () => {
    const db = getDB();
    if (!db) throw new Error('Supabase client not initialized');

    const { data, error } = await db.functions.invoke('public-config', { body: {} });
    if (error) {
      throw new Error(error.message || 'Failed to load public configuration');
    }
    if (data?.error) {
      throw new Error(data.error);
    }
    if (!data?.razorpay_key_id) {
      throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID in Supabase secrets.');
    }

    _publicConfig = { razorpayKeyId: data.razorpay_key_id };
    return _publicConfig;
  })();

  try {
    return await _publicConfigPromise;
  } catch (err) {
    _publicConfigPromise = null;
    throw err;
  }
}

async function getRazorpayKeyId() {
  const config = await loadPublicConfig();
  return config.razorpayKeyId;
}

// ─── EXPORTS ───
window.db = {
  getDB,
  SUPABASE_URL,
  insertWaitlist,
  fetchPassTypes,
  fetchEvents,
  loadEventsCatalog,
  getEventBySlug,
  createRegistration,
  createOrder,
  validatePromo,
  getRegistrationStatus,
  loadPublicConfig,
  getRazorpayKeyId,
};
