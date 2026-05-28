/* ============================================================
   CONFLUENCE 2026 — supabase.js
   ============================================================
   ⚙️  Replace the placeholders below with your project values.
   Find them in: Supabase Dashboard → Project Settings → API
   ============================================================ */

const SUPABASE_URL = "https://qmuxmblinicmtkenhejz.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtdXhtYmxpbmljbXRrZW5oZWp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4ODc1OTIsImV4cCI6MjA5NTQ2MzU5Mn0.musTzuviLENgQypboBptngzV2bxtSVDA9QoCT3QSOP8"

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
 * Create cart order after checkout.
 */
async function createOrder(orderData) {
  const db = getDB();
  const { data, error } = await db
    .from('cart_orders')
    .insert({
      customer_name: orderData.name,
      customer_email: orderData.email,
      order_data: orderData.items,
      subtotal: orderData.subtotal,
      gst: orderData.gst,
      total: orderData.total,
      payment_status: 'paid',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Fetch active pass types from DB.
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

// ─── UTILS ───

function generateRegistrationId(passType = 'pass') {
  const prefix = {
    'learning-lab': 'LL',
    'concept-cocoon': 'CC',
    'networking-gala': 'NG',
    'all-access': 'AA',
    'waitlist': 'WL',
  }[passType] || 'CF';

  const year = '26';
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}${year}-${rand}`;
}

// ─── EXPORTS ───
window.db = { getDB, upsertParticipant, insertApplication, submitApplication, insertWaitlist, createOrder, fetchPassTypes, generateRegistrationId };
