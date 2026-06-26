-- ============================================================
-- Migration 015: Dashboard aggregations + check_ins stub (Module 2)
-- ============================================================

CREATE TABLE IF NOT EXISTS check_ins (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id     UUID NOT NULL,
  registration_item_id UUID NOT NULL,
  event_id            UUID NOT NULL,
  checked_in_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_in_by       UUID,
  status              TEXT NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT check_ins_registration_fk
    FOREIGN KEY (registration_id) REFERENCES registrations (id) ON DELETE CASCADE,
  CONSTRAINT check_ins_registration_item_fk
    FOREIGN KEY (registration_item_id) REFERENCES registration_items (id) ON DELETE CASCADE,
  CONSTRAINT check_ins_event_fk
    FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT,
  CONSTRAINT check_ins_checked_in_by_fk
    FOREIGN KEY (checked_in_by) REFERENCES admin_profiles (id) ON DELETE SET NULL,
  CONSTRAINT check_ins_status_check CHECK (status IN ('active', 'voided'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_check_ins_active_registration_item
  ON check_ins (registration_item_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_check_ins_registration_id ON check_ins (registration_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_checked_in_at ON check_ins (checked_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_check_ins_event_id ON check_ins (event_id);

ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY check_ins_admin_read
  ON check_ins FOR SELECT
  TO authenticated
  USING (is_active_admin());

REVOKE INSERT, UPDATE, DELETE ON check_ins FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_registrations_created_at_ist_day
  ON registrations (((created_at AT TIME ZONE 'Asia/Kolkata')::date));

CREATE INDEX IF NOT EXISTS idx_payments_paid_at_ist_day
  ON payments (((paid_at AT TIME ZONE 'Asia/Kolkata')::date))
  WHERE status = 'captured';

-- Single RPC: all dashboard metrics in one database round trip
CREATE OR REPLACE FUNCTION get_admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_day_start TIMESTAMPTZ := (v_today::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
  v_cards JSONB;
  v_registrations_per_day JSONB;
  v_payments_per_day JSONB;
  v_pass_distribution JSONB;
  v_check_in_progress JSONB;
  v_recent_registrations JSONB;
  v_recent_payments JSONB;
  v_recent_check_ins JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_registrations', COUNT(*)::INT,
    'payment_complete', COUNT(*) FILTER (WHERE status = 'PAYMENT_COMPLETE')::INT,
    'payment_pending', COUNT(*) FILTER (WHERE status = 'PAYMENT_PENDING')::INT,
    'checked_in', (
      SELECT COUNT(DISTINCT registration_id)::INT
      FROM check_ins
      WHERE status = 'active'
    ),
    'pending_check_in', (
      SELECT COUNT(*)::INT
      FROM registrations r
      WHERE r.status = 'PAYMENT_COMPLETE'
        AND NOT EXISTS (
          SELECT 1 FROM check_ins ci
          WHERE ci.registration_id = r.id AND ci.status = 'active'
        )
    ),
    'revenue', COALESCE((
      SELECT SUM(amount)::NUMERIC
      FROM payments
      WHERE status = 'captured'
    ), 0),
    'today_registrations', COUNT(*) FILTER (
      WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::DATE = v_today
    )::INT,
    'today_revenue', COALESCE((
      SELECT SUM(amount)::NUMERIC
      FROM payments
      WHERE status = 'captured'
        AND paid_at >= v_day_start
        AND paid_at < v_day_start + INTERVAL '1 day'
    ), 0)
  )
  INTO v_cards
  FROM registrations;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'date'), '[]'::JSONB)
  INTO v_registrations_per_day
  FROM (
    SELECT jsonb_build_object(
      'date', d::TEXT,
      'count', COUNT(r.id)::INT
    ) AS row
    FROM generate_series(v_today - 29, v_today, '1 day'::INTERVAL) AS d
    LEFT JOIN registrations r
      ON (r.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d
    GROUP BY d
  ) s;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'date'), '[]'::JSONB)
  INTO v_payments_per_day
  FROM (
    SELECT jsonb_build_object(
      'date', d::TEXT,
      'count', COUNT(p.id)::INT,
      'revenue', COALESCE(SUM(p.amount), 0)::NUMERIC
    ) AS row
    FROM generate_series(v_today - 29, v_today, '1 day'::INTERVAL) AS d
    LEFT JOIN payments p
      ON p.status = 'captured'
      AND (p.paid_at AT TIME ZONE 'Asia/Kolkata')::DATE = d
    GROUP BY d
  ) s;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'name'), '[]'::JSONB)
  INTO v_pass_distribution
  FROM (
    SELECT jsonb_build_object(
      'name', e.name,
      'slug', e.slug,
      'count', SUM(ri.quantity)::INT
    ) AS row
    FROM registration_items ri
    JOIN registrations r ON r.id = ri.registration_id
    JOIN events e ON e.id = ri.event_id
    WHERE r.status = 'PAYMENT_COMPLETE'
    GROUP BY e.id, e.name, e.slug
  ) s;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'slug')), '[]'::JSONB)
  INTO v_check_in_progress
  FROM (
    SELECT jsonb_build_object(
      'name', e.name,
      'slug', e.slug,
      'expected', (
        SELECT COUNT(DISTINCT ri.registration_id)::INT
        FROM registration_items ri
        JOIN registrations r ON r.id = ri.registration_id
        WHERE ri.event_id = e.id AND r.status = 'PAYMENT_COMPLETE'
      ),
      'checked_in', (
        SELECT COUNT(DISTINCT ci.registration_id)::INT
        FROM check_ins ci
        WHERE ci.event_id = e.id AND ci.status = 'active'
      )
    ) AS row
    FROM events e
    WHERE e.is_active = TRUE
  ) s
  WHERE (row->>'expected')::INT > 0 OR (row->>'checked_in')::INT > 0;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'created_at' DESC), '[]'::JSONB)
  INTO v_recent_registrations
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'full_name', r.full_name,
      'email', r.email,
      'status', r.status,
      'registration_reference', r.registration_id,
      'created_at', r.created_at
    ) AS row
    FROM registrations r
    ORDER BY r.created_at DESC
    LIMIT 8
  ) s;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'paid_at' DESC), '[]'::JSONB)
  INTO v_recent_payments
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'amount', p.amount,
      'currency', p.currency,
      'razorpay_payment_id', p.razorpay_payment_id,
      'registration_reference', r.registration_id,
      'attendee_name', r.full_name,
      'paid_at', p.paid_at
    ) AS row
    FROM payments p
    JOIN registrations r ON r.id = p.registration_id
    WHERE p.status = 'captured'
    ORDER BY p.paid_at DESC NULLS LAST
    LIMIT 8
  ) s;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'checked_in_at' DESC), '[]'::JSONB)
  INTO v_recent_check_ins
  FROM (
    SELECT jsonb_build_object(
      'id', ci.id,
      'registration_reference', r.registration_id,
      'attendee_name', r.full_name,
      'event_name', e.name,
      'checked_in_at', ci.checked_in_at
    ) AS row
    FROM check_ins ci
    JOIN registrations r ON r.id = ci.registration_id
    JOIN events e ON e.id = ci.event_id
    WHERE ci.status = 'active'
    ORDER BY ci.checked_in_at DESC
    LIMIT 8
  ) s;

  RETURN jsonb_build_object(
    'generated_at', NOW(),
    'timezone', 'Asia/Kolkata',
    'cards', v_cards,
    'charts', jsonb_build_object(
      'registrations_per_day', v_registrations_per_day,
      'payments_per_day', v_payments_per_day,
      'pass_distribution', v_pass_distribution,
      'check_in_progress', v_check_in_progress
    ),
    'recent_activity', jsonb_build_object(
      'registrations', v_recent_registrations,
      'payments', v_recent_payments,
      'check_ins', v_recent_check_ins
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION get_admin_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_admin_dashboard_stats() TO service_role;

COMMENT ON FUNCTION get_admin_dashboard_stats IS 'Module 2 dashboard aggregations — single round trip for admin-dashboard API.';
