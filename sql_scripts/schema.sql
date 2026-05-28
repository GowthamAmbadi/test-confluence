-- ============================================================
-- CONFLUENCE 2026 — Database Schema
-- ============================================================
-- Run this in Supabase SQL Editor (Database > SQL Editor)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: pass_types
-- ============================================================
CREATE TABLE IF NOT EXISTS pass_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  price         NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  category      TEXT,
  description   TEXT,
  perks         JSONB DEFAULT '[]',
  available_qty INTEGER NOT NULL DEFAULT 100 CHECK (available_qty >= 0),
  sold_qty      INTEGER NOT NULL DEFAULT 0 CHECK (sold_qty >= 0),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pass_types_slug ON pass_types(slug);
CREATE INDEX idx_pass_types_active ON pass_types(is_active);

-- ============================================================
-- TABLE: participants
-- ============================================================
CREATE TABLE IF NOT EXISTS participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  college_company TEXT,
  city            TEXT,
  linkedin        TEXT,
  instagram       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT participants_email_key UNIQUE (email)
);

CREATE INDEX idx_participants_email ON participants(email);

-- ============================================================
-- TABLE: applications
-- ============================================================
CREATE TABLE IF NOT EXISTS applications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id    UUID REFERENCES participants(id) ON DELETE SET NULL,
  pass_type         TEXT NOT NULL,
  answers           JSONB NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','waitlisted')),
  registration_id   TEXT UNIQUE,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_applications_participant  ON applications(participant_id);
CREATE INDEX idx_applications_pass_type    ON applications(pass_type);
CREATE INDEX idx_applications_status       ON applications(status);
CREATE INDEX idx_applications_reg_id       ON applications(registration_id);

-- ============================================================
-- TABLE: cart_orders
-- ============================================================
CREATE TABLE IF NOT EXISTS cart_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name   TEXT NOT NULL,
  customer_email  TEXT NOT NULL,
  customer_phone  TEXT,
  customer_city   TEXT,
  order_data      JSONB NOT NULL DEFAULT '[]',
  coupon_code     TEXT,
  discount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal        NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
  gst             NUMERIC(10,2) NOT NULL CHECK (gst >= 0),
  total           NUMERIC(10,2) NOT NULL CHECK (total >= 0),
  payment_method  TEXT,
  payment_status  TEXT NOT NULL DEFAULT 'pending'
                    CHECK (payment_status IN ('pending','paid','failed','refunded')),
  order_ref       TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cart_orders_email   ON cart_orders(customer_email);
CREATE INDEX idx_cart_orders_status  ON cart_orders(payment_status);
CREATE INDEX idx_cart_orders_ref     ON cart_orders(order_ref);

-- ============================================================
-- TABLE: waitlist
-- ============================================================
CREATE TABLE IF NOT EXISTS waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  college     TEXT,
  city        TEXT,
  linkedin    TEXT,
  why_join    TEXT,
  value_add   TEXT,
  waitlist_id TEXT UNIQUE,
  status      TEXT NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting','invited','expired')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT waitlist_email_key UNIQUE (email)
);

CREATE INDEX idx_waitlist_email  ON waitlist(email);
CREATE INDEX idx_waitlist_status ON waitlist(status);
