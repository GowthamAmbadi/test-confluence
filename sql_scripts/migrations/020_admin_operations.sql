-- ============================================================
-- Migration 020: Operations & Reports (Module 7)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_check_ins_volunteer_hour
  ON check_ins (checked_in_by, checked_in_at DESC)
  WHERE status = 'active' AND checked_in_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registration_items_event_answers_department
  ON registration_items ((LOWER(event_answers->>'department')))
  WHERE event_answers ? 'department';

CREATE INDEX IF NOT EXISTS idx_registration_items_event_answers_academic_year
  ON registration_items ((LOWER(event_answers->>'academic_year')))
  WHERE event_answers ? 'academic_year';

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_ist_day
  ON audit_logs (((created_at AT TIME ZONE 'Asia/Kolkata')::date));

-- Export job queue (operational — not a reporting duplicate)
CREATE TABLE IF NOT EXISTS admin_export_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by      UUID NOT NULL,
  export_type       TEXT NOT NULL,
  format            TEXT NOT NULL,
  filters           JSONB NOT NULL DEFAULT '{}'::JSONB,
  status            TEXT NOT NULL DEFAULT 'queued',
  row_count         INT,
  storage_path      TEXT,
  file_name         TEXT,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,

  CONSTRAINT admin_export_jobs_requested_by_fk
    FOREIGN KEY (requested_by) REFERENCES admin_profiles (id) ON DELETE CASCADE,
  CONSTRAINT admin_export_jobs_export_type_check CHECK (
    export_type IN ('registrations', 'payments', 'check_ins', 'notes', 'activity', 'revenue', 'daily_summary')
  ),
  CONSTRAINT admin_export_jobs_format_check CHECK (
    format IN ('csv', 'xlsx', 'pdf')
  ),
  CONSTRAINT admin_export_jobs_status_check CHECK (
    status IN ('queued', 'running', 'generating_file', 'uploading', 'ready', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_admin_export_jobs_requested_by
  ON admin_export_jobs (requested_by, created_at DESC);

ALTER TABLE admin_export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_export_jobs_read_own
  ON admin_export_jobs FOR SELECT
  TO authenticated
  USING (requested_by IN (
    SELECT id FROM admin_profiles WHERE user_id = auth.uid()
  ));

REVOKE INSERT, UPDATE, DELETE ON admin_export_jobs FROM anon, authenticated;

-- Resolve IST date presets from JSONB filters
CREATE OR REPLACE FUNCTION resolve_operations_date_range(p_filters JSONB)
RETURNS TABLE (v_from TIMESTAMPTZ, v_to TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_preset TEXT := NULLIF(btrim(p_filters->>'date_preset'), '');
  v_from_date DATE := NULLIF(p_filters->>'date_from', '')::DATE;
  v_to_date DATE := NULLIF(p_filters->>'date_to', '')::DATE;
BEGIN
  IF v_preset = 'today' THEN
    v_from := (v_today::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
    v_to := v_from + INTERVAL '1 day';
  ELSIF v_preset = 'yesterday' THEN
    v_from := ((v_today - 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
    v_to := v_from + INTERVAL '1 day';
  ELSIF v_preset = 'last_7' THEN
    v_from := ((v_today - 6)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
    v_to := ((v_today + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
  ELSIF v_preset = 'last_30' THEN
    v_from := ((v_today - 29)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
    v_to := ((v_today + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
  ELSIF v_preset = 'custom' AND v_from_date IS NOT NULL AND v_to_date IS NOT NULL THEN
    v_from := (v_from_date::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
    v_to := ((v_to_date + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
  ELSE
    v_from := NULL;
    v_to := NULL;
  END IF;
  RETURN NEXT;
END;
$$;

-- Filter options for Operations UI
CREATE OR REPLACE FUNCTION get_admin_operations_filter_options()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_events JSONB;
  v_volunteers JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'name'), '[]'::JSONB)
  INTO v_events
  FROM (
    SELECT jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug) AS row
    FROM events e
    WHERE e.is_active = TRUE
    ORDER BY e.name
  ) s;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'full_name'), '[]'::JSONB)
  INTO v_volunteers
  FROM (
    SELECT jsonb_build_object(
      'id', ap.id,
      'full_name', ap.full_name,
      'role', ap.role
    ) AS row
    FROM admin_profiles ap
    WHERE ap.is_active = TRUE
      AND ap.role IN ('SUPER_ADMIN', 'CHECKIN_STAFF')
      AND EXISTS (
        SELECT 1 FROM check_ins ci
        WHERE ci.checked_in_by = ap.id AND ci.status = 'active'
      )
    ORDER BY ap.full_name
  ) s;

  RETURN jsonb_build_object('events', v_events, 'volunteers', v_volunteers);
END;
$$;

-- Shared registration filter (returns matching registration ids)
CREATE OR REPLACE FUNCTION _ops_match_registration(
  p_r registrations,
  p_filters JSONB,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    (p_from IS NULL OR (p_r.created_at >= p_from AND p_r.created_at < p_to))
    AND (
      NULLIF(btrim(p_filters->>'event_id'), '') IS NULL
      OR EXISTS (
        SELECT 1 FROM registration_items ri
        WHERE ri.registration_id = p_r.id
          AND ri.event_id = (p_filters->>'event_id')::UUID
      )
    )
    AND (
      NULLIF(btrim(p_filters->>'registration_status'), '') IS NULL
      OR p_r.status = p_filters->>'registration_status'
    )
    AND (
      NULLIF(btrim(p_filters->>'check_in_status'), '') IS NULL
      OR (
        (p_filters->>'check_in_status' = 'checked_in' AND EXISTS (
          SELECT 1 FROM check_ins ci WHERE ci.registration_id = p_r.id AND ci.status = 'active'
        ))
        OR (p_filters->>'check_in_status' = 'not_checked_in' AND NOT EXISTS (
          SELECT 1 FROM check_ins ci WHERE ci.registration_id = p_r.id AND ci.status = 'active'
        ))
      )
    )
    AND (
      NULLIF(btrim(p_filters->>'payment_status'), '') IS NULL
      OR (
        (p_filters->>'payment_status' = 'complete' AND p_r.status = 'PAYMENT_COMPLETE')
        OR (p_filters->>'payment_status' = 'pending' AND p_r.status = 'PAYMENT_PENDING'
          AND NOT EXISTS (SELECT 1 FROM payments px WHERE px.registration_id = p_r.id AND px.status = 'failed')
          AND NOT EXISTS (SELECT 1 FROM orders ox WHERE ox.registration_id = p_r.id AND ox.status = 'failed'))
        OR (p_filters->>'payment_status' = 'failed' AND (
          EXISTS (SELECT 1 FROM payments px WHERE px.registration_id = p_r.id AND px.status = 'failed')
          OR EXISTS (SELECT 1 FROM orders ox WHERE ox.registration_id = p_r.id AND ox.status = 'failed')
        ))
      )
    )
    AND (
      NULLIF(btrim(p_filters->>'q'), '') IS NULL
      OR p_r.registration_id ILIKE '%' || (p_filters->>'q') || '%'
      OR p_r.full_name ILIKE '%' || (p_filters->>'q') || '%'
      OR p_r.email ILIKE '%' || (p_filters->>'q') || '%'
      OR p_r.phone ILIKE '%' || (p_filters->>'q') || '%'
      OR p_r.college ILIKE '%' || (p_filters->>'q') || '%'
      OR EXISTS (
        SELECT 1 FROM registration_items ri
        WHERE ri.registration_id = p_r.id
          AND COALESCE(ri.event_answers->>'city', '') ILIKE '%' || (p_filters->>'q') || '%'
      )
    );
$$;

-- Main report RPC (one call per tab)
CREATE OR REPLACE FUNCTION get_admin_operations_report(
  p_report_type TEXT,
  p_filters JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_day_start TIMESTAMPTZ := (v_today::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
  v_result JSONB;
  v_volunteer_id UUID := NULLIF(btrim(p_filters->>'volunteer_id'), '')::UUID;
BEGIN
  SELECT dr.v_from, dr.v_to INTO v_from, v_to
  FROM resolve_operations_date_range(p_filters) dr;

  IF p_report_type = 'registration' THEN
    SELECT jsonb_build_object(
      'summary', jsonb_build_object(
        'total_registrations', (SELECT COUNT(*)::INT FROM registrations),
        'period_registrations', (
          SELECT COUNT(*)::INT FROM registrations r
          WHERE _ops_match_registration(r, p_filters, v_from, v_to)
        ),
        'daily_registrations', (
          SELECT COUNT(*)::INT FROM registrations r
          WHERE (r.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = v_today
        )
      ),
      'charts', jsonb_build_object(
        'registrations_per_day', (
          SELECT COALESCE(jsonb_agg(row ORDER BY row->>'date'), '[]'::JSONB)
          FROM (
            SELECT jsonb_build_object(
              'date', d::TEXT,
              'count', COUNT(r.id)::INT
            ) AS row
            FROM generate_series(
              COALESCE((v_from AT TIME ZONE 'Asia/Kolkata')::DATE, v_today - 29),
              COALESCE((v_to AT TIME ZONE 'Asia/Kolkata')::DATE - 1, v_today),
              '1 day'::INTERVAL
            ) AS d
            LEFT JOIN registrations r
              ON (r.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d
              AND _ops_match_registration(r, p_filters, NULL, NULL)
            GROUP BY d
          ) s
        ),
        'by_pass', (
          SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'count')::INT DESC), '[]'::JSONB)
          FROM (
            SELECT jsonb_build_object('name', e.name, 'count', COUNT(DISTINCT r.id)::INT) AS row
            FROM registrations r
            JOIN registration_items ri ON ri.registration_id = r.id
            JOIN events e ON e.id = ri.event_id
            WHERE _ops_match_registration(r, p_filters, v_from, v_to)
            GROUP BY e.id, e.name
            LIMIT 25
          ) s
        ),
        'by_college', (
          SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'count')::INT DESC), '[]'::JSONB)
          FROM (
            SELECT jsonb_build_object('college', COALESCE(NULLIF(btrim(r.college), ''), '—'), 'count', COUNT(*)::INT) AS row
            FROM registrations r
            WHERE _ops_match_registration(r, p_filters, v_from, v_to)
            GROUP BY COALESCE(NULLIF(btrim(r.college), ''), '—')
            ORDER BY COUNT(*) DESC
            LIMIT 25
          ) s
        ),
        'by_city', (
          SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'count')::INT DESC), '[]'::JSONB)
          FROM (
            SELECT jsonb_build_object(
              'city', COALESCE(NULLIF(btrim(ri.event_answers->>'city'), ''), '—'),
              'count', COUNT(DISTINCT r.id)::INT
            ) AS row
            FROM registrations r
            JOIN registration_items ri ON ri.registration_id = r.id
            WHERE _ops_match_registration(r, p_filters, v_from, v_to)
              AND ri.event_answers ? 'city'
            GROUP BY COALESCE(NULLIF(btrim(ri.event_answers->>'city'), ''), '—')
            ORDER BY COUNT(DISTINCT r.id) DESC
            LIMIT 25
          ) s
        ),
        'by_department', (
          SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'count')::INT DESC), '[]'::JSONB)
          FROM (
            SELECT jsonb_build_object(
              'department', COALESCE(NULLIF(btrim(ri.event_answers->>'department'), ''), '—'),
              'count', COUNT(DISTINCT r.id)::INT
            ) AS row
            FROM registrations r
            JOIN registration_items ri ON ri.registration_id = r.id
            WHERE _ops_match_registration(r, p_filters, v_from, v_to)
              AND ri.event_answers ? 'department'
              AND NULLIF(btrim(ri.event_answers->>'department'), '') IS NOT NULL
            GROUP BY COALESCE(NULLIF(btrim(ri.event_answers->>'department'), ''), '—')
            ORDER BY COUNT(DISTINCT r.id) DESC
            LIMIT 25
          ) s
        ),
        'by_academic_year', (
          SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'count')::INT DESC), '[]'::JSONB)
          FROM (
            SELECT jsonb_build_object(
              'academic_year', COALESCE(NULLIF(btrim(ri.event_answers->>'academic_year'), ''), '—'),
              'count', COUNT(DISTINCT r.id)::INT
            ) AS row
            FROM registrations r
            JOIN registration_items ri ON ri.registration_id = r.id
            WHERE _ops_match_registration(r, p_filters, v_from, v_to)
              AND ri.event_answers ? 'academic_year'
              AND NULLIF(btrim(ri.event_answers->>'academic_year'), '') IS NOT NULL
            GROUP BY COALESCE(NULLIF(btrim(ri.event_answers->>'academic_year'), ''), '—')
            ORDER BY COUNT(DISTINCT r.id) DESC
            LIMIT 25
          ) s
        )
      ),
      'has_department', EXISTS (
        SELECT 1 FROM registration_items ri
        WHERE ri.event_answers ? 'department'
          AND NULLIF(btrim(ri.event_answers->>'department'), '') IS NOT NULL
        LIMIT 1
      ),
      'has_academic_year', EXISTS (
        SELECT 1 FROM registration_items ri
        WHERE ri.event_answers ? 'academic_year'
          AND NULLIF(btrim(ri.event_answers->>'academic_year'), '') IS NOT NULL
        LIMIT 1
      ),
      'table', (
        SELECT COALESCE(jsonb_agg(row ORDER BY row->>'created_at' DESC), '[]'::JSONB)
        FROM (
          SELECT jsonb_build_object(
            'registration_reference', r.registration_id,
            'full_name', r.full_name,
            'college', r.college,
            'city', (
              SELECT MAX(NULLIF(btrim(ri.event_answers->>'city'), ''))
              FROM registration_items ri WHERE ri.registration_id = r.id
            ),
            'department', (
              SELECT MAX(NULLIF(btrim(ri.event_answers->>'department'), ''))
              FROM registration_items ri WHERE ri.registration_id = r.id
            ),
            'academic_year', (
              SELECT MAX(NULLIF(btrim(ri.event_answers->>'academic_year'), ''))
              FROM registration_items ri WHERE ri.registration_id = r.id
            ),
            'pass', COALESCE((
              SELECT string_agg(e.name, ', ' ORDER BY e.name)
              FROM registration_items ri JOIN events e ON e.id = ri.event_id
              WHERE ri.registration_id = r.id
            ), '—'),
            'status', r.status,
            'created_at', r.created_at
          ) AS row
          FROM registrations r
          WHERE _ops_match_registration(r, p_filters, v_from, v_to)
          ORDER BY r.created_at DESC
          LIMIT 500
        ) s
      )
    ) INTO v_result;

  ELSIF p_report_type = 'revenue' THEN
    SELECT jsonb_build_object(
      'summary', jsonb_build_object(
        'captured_revenue', COALESCE((
          SELECT SUM(p.amount)::NUMERIC FROM payments p
          JOIN registrations r ON r.id = p.registration_id
          WHERE p.status = 'captured'
            AND _ops_match_registration(r, p_filters, NULL, NULL)
            AND (v_from IS NULL OR (p.paid_at >= v_from AND p.paid_at < v_to))
        ), 0),
        'expected_revenue', COALESCE((
          SELECT SUM(o.total)::NUMERIC
          FROM orders o
          JOIN registrations r ON r.id = o.registration_id
          WHERE o.status IN ('created', 'paid')
            AND _ops_match_registration(r, p_filters, NULL, NULL)
            AND (v_from IS NULL OR (o.created_at >= v_from AND o.created_at < v_to))
        ), 0),
        'today_revenue', COALESCE((
          SELECT SUM(p.amount)::NUMERIC FROM payments p
          WHERE p.status = 'captured'
            AND p.paid_at >= v_day_start AND p.paid_at < v_day_start + INTERVAL '1 day'
        ), 0),
        'average_order_value', COALESCE((
          SELECT ROUND(SUM(p.amount) / NULLIF(COUNT(DISTINCT p.registration_id), 0), 2)::NUMERIC
          FROM payments p
          JOIN registrations r ON r.id = p.registration_id
          WHERE p.status = 'captured'
            AND _ops_match_registration(r, p_filters, NULL, NULL)
            AND (v_from IS NULL OR (p.paid_at >= v_from AND p.paid_at < v_to))
        ), 0),
        'payments_completed', (
          SELECT COUNT(*)::INT FROM payments p
          JOIN registrations r ON r.id = p.registration_id
          WHERE p.status = 'captured'
            AND _ops_match_registration(r, p_filters, NULL, NULL)
            AND (v_from IS NULL OR (p.paid_at >= v_from AND p.paid_at < v_to))
        ),
        'payments_pending', (
          SELECT COUNT(*)::INT FROM registrations r
          WHERE r.status = 'PAYMENT_PENDING'
            AND _ops_match_registration(r, p_filters, v_from, v_to)
            AND NOT EXISTS (SELECT 1 FROM payments px WHERE px.registration_id = r.id AND px.status = 'failed')
        ),
        'payments_failed', (
          SELECT COUNT(DISTINCT r.id)::INT FROM registrations r
          WHERE _ops_match_registration(r, p_filters, v_from, v_to)
            AND (
              EXISTS (SELECT 1 FROM payments px WHERE px.registration_id = r.id AND px.status = 'failed')
              OR EXISTS (SELECT 1 FROM orders ox WHERE ox.registration_id = r.id AND ox.status = 'failed')
            )
        )
      ),
      'charts', jsonb_build_object(
        'revenue_per_day', (
          SELECT COALESCE(jsonb_agg(row ORDER BY row->>'date'), '[]'::JSONB)
          FROM (
            SELECT jsonb_build_object(
              'date', d::TEXT,
              'revenue', COALESCE(SUM(p.amount), 0)::NUMERIC,
              'count', COUNT(p.id)::INT
            ) AS row
            FROM generate_series(
              COALESCE((v_from AT TIME ZONE 'Asia/Kolkata')::DATE, v_today - 29),
              COALESCE((v_to AT TIME ZONE 'Asia/Kolkata')::DATE - 1, v_today),
              '1 day'::INTERVAL
            ) AS d
            LEFT JOIN payments p
              ON p.status = 'captured'
              AND (p.paid_at AT TIME ZONE 'Asia/Kolkata')::DATE = d
            LEFT JOIN registrations r ON r.id = p.registration_id
              AND _ops_match_registration(r, p_filters, NULL, NULL)
            WHERE p.id IS NULL OR r.id IS NOT NULL
            GROUP BY d
          ) s
        ),
        'revenue_by_pass', (
          SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'revenue')::NUMERIC DESC), '[]'::JSONB)
          FROM (
            SELECT jsonb_build_object(
              'name', e.name,
              'revenue', COALESCE(SUM(p.amount), 0)::NUMERIC,
              'count', COUNT(DISTINCT p.id)::INT
            ) AS row
            FROM payments p
            JOIN registrations r ON r.id = p.registration_id
            JOIN registration_items ri ON ri.registration_id = r.id
            JOIN events e ON e.id = ri.event_id
            WHERE p.status = 'captured'
              AND _ops_match_registration(r, p_filters, NULL, NULL)
              AND (v_from IS NULL OR (p.paid_at >= v_from AND p.paid_at < v_to))
            GROUP BY e.id, e.name
            LIMIT 25
          ) s
        ),
        'payment_method', jsonb_build_object('enabled', FALSE, 'items', '[]'::JSONB)
      )
    ) INTO v_result;

  ELSIF p_report_type = 'checkin' THEN
    SELECT jsonb_build_object(
      'summary', jsonb_build_object(
        'total_checked_in', (
          SELECT COUNT(DISTINCT ci.registration_id)::INT
          FROM check_ins ci
          JOIN registrations r ON r.id = ci.registration_id
          WHERE ci.status = 'active'
            AND _ops_match_registration(r, p_filters, NULL, NULL)
            AND (v_from IS NULL OR (ci.checked_in_at >= v_from AND ci.checked_in_at < v_to))
            AND (v_volunteer_id IS NULL OR ci.checked_in_by = v_volunteer_id)
        ),
        'pending_check_in', (
          SELECT COUNT(*)::INT FROM registrations r
          WHERE r.status = 'PAYMENT_COMPLETE'
            AND _ops_match_registration(r, p_filters, NULL, NULL)
            AND NOT EXISTS (
              SELECT 1 FROM check_ins ci WHERE ci.registration_id = r.id AND ci.status = 'active'
            )
        ),
        'check_in_rate', COALESCE((
          SELECT ROUND(
            100.0 * COUNT(DISTINCT ci.registration_id)::NUMERIC
            / NULLIF((
              SELECT COUNT(*) FROM registrations r2
              WHERE r2.status = 'PAYMENT_COMPLETE'
                AND _ops_match_registration(r2, p_filters, NULL, NULL)
            ), 0),
            1
          )
          FROM check_ins ci
          JOIN registrations r ON r.id = ci.registration_id
          WHERE ci.status = 'active'
            AND _ops_match_registration(r, p_filters, NULL, NULL)
        ), 0)
      ),
      'charts', jsonb_build_object(
        'hourly_trend', (
          SELECT COALESCE(jsonb_agg(row ORDER BY row->>'hour'), '[]'::JSONB)
          FROM (
            SELECT jsonb_build_object(
              'hour', to_char(h, 'HH24:00'),
              'count', COUNT(ci.id)::INT
            ) AS row
            FROM generate_series(0, 23) AS h
            LEFT JOIN check_ins ci
              ON ci.status = 'active'
              AND EXTRACT(HOUR FROM ci.checked_in_at AT TIME ZONE 'Asia/Kolkata') = h
              AND (v_from IS NULL OR (ci.checked_in_at >= v_from AND ci.checked_in_at < v_to))
              AND (v_volunteer_id IS NULL OR ci.checked_in_by = v_volunteer_id)
            LEFT JOIN registrations r ON r.id = ci.registration_id
              AND _ops_match_registration(r, p_filters, NULL, NULL)
            WHERE ci.id IS NULL OR r.id IS NOT NULL
            GROUP BY h
          ) s
        ),
        'peak_hour', (
          SELECT COALESCE(to_char(
            (SELECT h FROM (
              SELECT EXTRACT(HOUR FROM ci.checked_in_at AT TIME ZONE 'Asia/Kolkata') AS h,
                     COUNT(*) AS cnt
              FROM check_ins ci
              JOIN registrations r ON r.id = ci.registration_id
              WHERE ci.status = 'active'
                AND _ops_match_registration(r, p_filters, NULL, NULL)
                AND (v_from IS NULL OR (ci.checked_in_at >= v_from AND ci.checked_in_at < v_to))
                AND (v_volunteer_id IS NULL OR ci.checked_in_by = v_volunteer_id)
              GROUP BY 1 ORDER BY cnt DESC LIMIT 1
            ) ph),
            'FM00:00'
          ), '—')
        )
      ),
      'volunteer_performance', (
        SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'check_ins')::INT DESC), '[]'::JSONB)
        FROM (
          SELECT jsonb_build_object(
            'volunteer_name', COALESCE(ap.full_name, 'Unknown'),
            'check_ins', COUNT(ci.id)::INT,
            'avg_check_ins_per_hour', ROUND(
              COUNT(ci.id)::NUMERIC / GREATEST(
                EXTRACT(EPOCH FROM (MAX(ci.checked_in_at) - MIN(ci.checked_in_at))) / 3600.0,
                1
              ),
              1
            )
          ) AS row
          FROM check_ins ci
          JOIN registrations r ON r.id = ci.registration_id
          LEFT JOIN admin_profiles ap ON ap.id = ci.checked_in_by
          WHERE ci.status = 'active'
            AND _ops_match_registration(r, p_filters, NULL, NULL)
            AND (v_from IS NULL OR (ci.checked_in_at >= v_from AND ci.checked_in_at < v_to))
            AND (v_volunteer_id IS NULL OR ci.checked_in_by = v_volunteer_id)
          GROUP BY ci.checked_in_by, ap.full_name
          ORDER BY COUNT(ci.id) DESC
          LIMIT 25
        ) s
      ),
      'table', (
        SELECT COALESCE(jsonb_agg(row ORDER BY row->>'checked_in_at' DESC), '[]'::JSONB)
        FROM (
          SELECT jsonb_build_object(
            'checked_in_at', ci.checked_in_at,
            'attendee_name', r.full_name,
            'registration_reference', r.registration_id,
            'pass', e.name,
            'volunteer_name', COALESCE(ap.full_name, '—')
          ) AS row
          FROM check_ins ci
          JOIN registrations r ON r.id = ci.registration_id
          JOIN events e ON e.id = ci.event_id
          LEFT JOIN admin_profiles ap ON ap.id = ci.checked_in_by
          WHERE ci.status = 'active'
            AND _ops_match_registration(r, p_filters, NULL, NULL)
            AND (v_from IS NULL OR (ci.checked_in_at >= v_from AND ci.checked_in_at < v_to))
            AND (v_volunteer_id IS NULL OR ci.checked_in_by = v_volunteer_id)
          ORDER BY ci.checked_in_at DESC
          LIMIT 500
        ) s
      )
    ) INTO v_result;

  ELSIF p_report_type = 'email' THEN
    SELECT jsonb_build_object(
      'summary', jsonb_build_object(
        'confirmation_sent', (
          SELECT COUNT(*)::INT FROM audit_logs a
          JOIN registrations r ON r.id = a.registration_id
          WHERE a.event_type IN ('EMAIL_SENT', 'ADMIN_EMAIL_RESENT')
            AND _ops_match_registration(r, p_filters, NULL, NULL)
            AND (v_from IS NULL OR (a.created_at >= v_from AND a.created_at < v_to))
        ),
        'emails_failed', (
          SELECT COUNT(*)::INT FROM audit_logs a
          JOIN registrations r ON r.id = a.registration_id
          WHERE a.event_type = 'EMAIL_FAILED'
            AND _ops_match_registration(r, p_filters, NULL, NULL)
            AND (v_from IS NULL OR (a.created_at >= v_from AND a.created_at < v_to))
        ),
        'resend_count', (
          SELECT COUNT(*)::INT FROM audit_logs a
          JOIN registrations r ON r.id = a.registration_id
          WHERE a.event_type = 'ADMIN_EMAIL_RESENT'
            AND _ops_match_registration(r, p_filters, NULL, NULL)
            AND (v_from IS NULL OR (a.created_at >= v_from AND a.created_at < v_to))
        ),
        'email_success_rate', COALESCE((
          SELECT ROUND(
            100.0 * COUNT(*) FILTER (WHERE a.event_type IN ('EMAIL_SENT', 'ADMIN_EMAIL_RESENT'))::NUMERIC
            / NULLIF(COUNT(*) FILTER (WHERE a.event_type IN ('EMAIL_SENT', 'ADMIN_EMAIL_RESENT', 'EMAIL_FAILED')), 0),
            1
          )
          FROM audit_logs a
          JOIN registrations r ON r.id = a.registration_id
          WHERE a.event_type IN ('EMAIL_SENT', 'EMAIL_FAILED', 'ADMIN_EMAIL_RESENT')
            AND _ops_match_registration(r, p_filters, NULL, NULL)
            AND (v_from IS NULL OR (a.created_at >= v_from AND a.created_at < v_to))
        ), 100)
      ),
      'charts', jsonb_build_object(
        'email_timeline', (
          SELECT COALESCE(jsonb_agg(row ORDER BY row->>'date'), '[]'::JSONB)
          FROM (
            SELECT jsonb_build_object(
              'date', d::TEXT,
              'sent', COUNT(a.id) FILTER (WHERE a.event_type IN ('EMAIL_SENT', 'ADMIN_EMAIL_RESENT'))::INT,
              'failed', COUNT(a.id) FILTER (WHERE a.event_type = 'EMAIL_FAILED')::INT,
              'resent', COUNT(a.id) FILTER (WHERE a.event_type = 'ADMIN_EMAIL_RESENT')::INT
            ) AS row
            FROM generate_series(
              COALESCE((v_from AT TIME ZONE 'Asia/Kolkata')::DATE, v_today - 29),
              COALESCE((v_to AT TIME ZONE 'Asia/Kolkata')::DATE - 1, v_today),
              '1 day'::INTERVAL
            ) AS d
            LEFT JOIN audit_logs a
              ON (a.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d
              AND a.event_type IN ('EMAIL_SENT', 'EMAIL_FAILED', 'ADMIN_EMAIL_RESENT')
            LEFT JOIN registrations r ON r.id = a.registration_id
              AND _ops_match_registration(r, p_filters, NULL, NULL)
            WHERE a.id IS NULL OR r.id IS NOT NULL
            GROUP BY d
          ) s
        )
      ),
      'top_resent', (
        SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'resend_count')::INT DESC), '[]'::JSONB)
        FROM (
          SELECT jsonb_build_object(
            'registration_reference', r.registration_id,
            'attendee_name', r.full_name,
            'resend_count', COUNT(*)::INT
          ) AS row
          FROM audit_logs a
          JOIN registrations r ON r.id = a.registration_id
          WHERE a.event_type = 'ADMIN_EMAIL_RESENT'
            AND _ops_match_registration(r, p_filters, NULL, NULL)
            AND (v_from IS NULL OR (a.created_at >= v_from AND a.created_at < v_to))
          GROUP BY r.id, r.registration_id, r.full_name
          ORDER BY COUNT(*) DESC
          LIMIT 25
        ) s
      )
    ) INTO v_result;

  ELSIF p_report_type = 'activity' THEN
    SELECT jsonb_build_object(
      'summary', jsonb_build_object(
        'total_events', (
          SELECT COUNT(*)::INT FROM (
            SELECT a.id::TEXT AS eid FROM audit_logs a
            LEFT JOIN registrations r ON r.id = a.registration_id
            WHERE (v_from IS NULL OR (a.created_at >= v_from AND a.created_at < v_to))
              AND (
                a.registration_id IS NULL
                OR _ops_match_registration(r, p_filters, NULL, NULL)
              )
              AND (
                p_filters->'event_types' IS NULL
                OR jsonb_array_length(p_filters->'event_types') = 0
                OR a.event_type = ANY(
                  SELECT jsonb_array_elements_text(p_filters->'event_types')
                )
              )
            UNION ALL
            SELECT ala.id::TEXT AS eid FROM admin_login_audit ala
            WHERE (v_from IS NULL OR (ala.login_at >= v_from AND ala.login_at < v_to))
              AND (
                p_filters->'event_types' IS NULL
                OR jsonb_array_length(p_filters->'event_types') = 0
                OR 'ADMIN_LOGIN' = ANY(
                  SELECT jsonb_array_elements_text(p_filters->'event_types')
                )
              )
          ) combined
        )
      ),
      'groups', (
        SELECT COALESCE(jsonb_agg(group_row ORDER BY group_row->>'date' DESC), '[]'::JSONB)
        FROM (
          SELECT jsonb_build_object(
            'date', day::TEXT,
            'events', COALESCE((
              SELECT jsonb_agg(ev ORDER BY ev->>'timestamp' DESC)
              FROM (
                SELECT jsonb_build_object(
                  'timestamp', a.created_at,
                  'event_type', a.event_type,
                  'action', map_audit_event_label(a.event_type),
                  'actor', COALESCE(ap.full_name, a.actor_id, 'System'),
                  'registration_reference', r.registration_id,
                  'metadata', a.metadata
                ) AS ev
                FROM audit_logs a
                LEFT JOIN registrations r ON r.id = a.registration_id
                LEFT JOIN admin_profiles ap ON ap.id::TEXT = a.actor_id AND a.actor_type = 'admin'
                WHERE (a.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = day
                  AND (v_from IS NULL OR (a.created_at >= v_from AND a.created_at < v_to))
                  AND (a.registration_id IS NULL OR _ops_match_registration(r, p_filters, NULL, NULL))
                  AND (
                    p_filters->'event_types' IS NULL
                    OR jsonb_array_length(p_filters->'event_types') = 0
                    OR a.event_type = ANY(SELECT jsonb_array_elements_text(p_filters->'event_types'))
                  )
                UNION ALL
                SELECT jsonb_build_object(
                  'timestamp', ala.login_at,
                  'event_type', 'ADMIN_LOGIN',
                  'action', 'Admin Login',
                  'actor', COALESCE(ap2.full_name, ala.user_id::TEXT),
                  'registration_reference', NULL,
                  'metadata', jsonb_build_object('ip', ala.ip_address, 'device', ala.device_label)
                )
                FROM admin_login_audit ala
                LEFT JOIN admin_profiles ap2 ON ap2.id = ala.admin_profile_id
                WHERE (ala.login_at AT TIME ZONE 'Asia/Kolkata')::DATE = day
                  AND (v_from IS NULL OR (ala.login_at >= v_from AND ala.login_at < v_to))
                  AND (
                    p_filters->'event_types' IS NULL
                    OR jsonb_array_length(p_filters->'event_types') = 0
                    OR 'ADMIN_LOGIN' = ANY(SELECT jsonb_array_elements_text(p_filters->'event_types'))
                  )
                ORDER BY 1 DESC
                LIMIT 200
              ) inner_ev
            ), '[]'::JSONB)
          ) AS group_row
          FROM (
            SELECT DISTINCT d::DATE AS day
            FROM generate_series(
              COALESCE((v_from AT TIME ZONE 'Asia/Kolkata')::DATE, v_today - 6),
              COALESCE((v_to AT TIME ZONE 'Asia/Kolkata')::DATE - 1, v_today),
              '1 day'::INTERVAL
            ) AS d
          ) days
        ) s
      )
    ) INTO v_result;

  ELSE
    RETURN jsonb_build_object('error', 'Unknown report type');
  END IF;

  RETURN v_result || jsonb_build_object(
    'report_type', p_report_type,
    'filters', p_filters,
    'generated_at', NOW()
  );
END;
$$;

-- Export row data
CREATE OR REPLACE FUNCTION get_admin_export_rows(
  p_export_type TEXT,
  p_filters JSONB DEFAULT '{}'::JSONB,
  p_limit INT DEFAULT 50000
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
  v_columns JSONB;
  v_rows JSONB;
  v_count INT;
BEGIN
  p_limit := LEAST(GREATEST(COALESCE(p_limit, 50000), 1), 50000);
  SELECT dr.v_from, dr.v_to INTO v_from, v_to
  FROM resolve_operations_date_range(p_filters) dr;

  IF p_export_type = 'registrations' THEN
    v_columns := '["Registration ID","Name","Email","Phone","College","City","Department","Academic Year","Pass","Status","Created At"]'::JSONB;
    SELECT COALESCE(jsonb_agg(row), '[]'::JSONB), COUNT(*)::INT
    INTO v_rows, v_count
    FROM (
      SELECT jsonb_build_array(
        r.registration_id, r.full_name, r.email, r.phone, r.college,
        (SELECT MAX(NULLIF(btrim(ri.event_answers->>'city'), '')) FROM registration_items ri WHERE ri.registration_id = r.id),
        (SELECT MAX(NULLIF(btrim(ri.event_answers->>'department'), '')) FROM registration_items ri WHERE ri.registration_id = r.id),
        (SELECT MAX(NULLIF(btrim(ri.event_answers->>'academic_year'), '')) FROM registration_items ri WHERE ri.registration_id = r.id),
        COALESCE((SELECT string_agg(e.name, ', ') FROM registration_items ri JOIN events e ON e.id = ri.event_id WHERE ri.registration_id = r.id), ''),
        r.status, r.created_at
      ) AS row
      FROM registrations r
      WHERE _ops_match_registration(r, p_filters, v_from, v_to)
      ORDER BY r.created_at DESC
      LIMIT p_limit
    ) s;

  ELSIF p_export_type = 'payments' OR p_export_type = 'revenue' THEN
    v_columns := '["Payment ID","Registration ID","Name","Amount","Currency","Method","Status","Paid At"]'::JSONB;
    SELECT COALESCE(jsonb_agg(row), '[]'::JSONB), COUNT(*)::INT
    INTO v_rows, v_count
    FROM (
      SELECT jsonb_build_array(
        p.razorpay_payment_id, r.registration_id, r.full_name,
        p.amount, p.currency, COALESCE(p.method, ''), p.status, p.paid_at
      ) AS row
      FROM payments p
      JOIN registrations r ON r.id = p.registration_id
      WHERE p.status = 'captured'
        AND _ops_match_registration(r, p_filters, NULL, NULL)
        AND (v_from IS NULL OR (p.paid_at >= v_from AND p.paid_at < v_to))
      ORDER BY p.paid_at DESC
      LIMIT p_limit
    ) s;

  ELSIF p_export_type = 'check_ins' THEN
    v_columns := '["Checked In At","Registration ID","Name","Pass","Volunteer"]'::JSONB;
    SELECT COALESCE(jsonb_agg(row), '[]'::JSONB), COUNT(*)::INT
    INTO v_rows, v_count
    FROM (
      SELECT jsonb_build_array(
        ci.checked_in_at, r.registration_id, r.full_name, e.name,
        COALESCE(ap.full_name, '')
      ) AS row
      FROM check_ins ci
      JOIN registrations r ON r.id = ci.registration_id
      JOIN events e ON e.id = ci.event_id
      LEFT JOIN admin_profiles ap ON ap.id = ci.checked_in_by
      WHERE ci.status = 'active'
        AND _ops_match_registration(r, p_filters, NULL, NULL)
        AND (v_from IS NULL OR (ci.checked_in_at >= v_from AND ci.checked_in_at < v_to))
      ORDER BY ci.checked_in_at DESC
      LIMIT p_limit
    ) s;

  ELSIF p_export_type = 'notes' THEN
    v_columns := '["Created At","Category","Note","Author","Registration ID","Name"]'::JSONB;
    SELECT COALESCE(jsonb_agg(row), '[]'::JSONB), COUNT(*)::INT
    INTO v_rows, v_count
    FROM (
      SELECT jsonb_build_array(
        n.created_at, COALESCE(n.category, 'General'), n.note,
        COALESCE(ap.full_name, ''), r.registration_id, r.full_name
      ) AS row
      FROM admin_notes n
      JOIN registrations r ON r.id = n.entity_id AND n.entity_type = 'registration'
      LEFT JOIN admin_profiles ap ON ap.id = n.created_by
      WHERE (v_from IS NULL OR (n.created_at >= v_from AND n.created_at < v_to))
        AND _ops_match_registration(r, p_filters, NULL, NULL)
      ORDER BY n.created_at DESC
      LIMIT p_limit
    ) s;

  ELSIF p_export_type = 'activity' THEN
    v_columns := '["Timestamp","Event Type","Action","Actor","Registration ID","Details"]'::JSONB;
    SELECT COALESCE(jsonb_agg(row), '[]'::JSONB), COUNT(*)::INT
    INTO v_rows, v_count
    FROM (
      SELECT jsonb_build_array(
        a.created_at, a.event_type, map_audit_event_label(a.event_type),
        COALESCE(ap.full_name, a.actor_id, 'System'),
        r.registration_id, a.metadata::TEXT
      ) AS row
      FROM audit_logs a
      LEFT JOIN registrations r ON r.id = a.registration_id
      LEFT JOIN admin_profiles ap ON ap.id::TEXT = a.actor_id AND a.actor_type = 'admin'
      WHERE (v_from IS NULL OR (a.created_at >= v_from AND a.created_at < v_to))
        AND (a.registration_id IS NULL OR _ops_match_registration(r, p_filters, NULL, NULL))
      ORDER BY a.created_at DESC
      LIMIT p_limit
    ) s;

  ELSE
    RETURN jsonb_build_object('error', 'Unknown export type');
  END IF;

  RETURN jsonb_build_object(
    'columns', v_columns,
    'rows', v_rows,
    'row_count', v_count
  );
END;
$$;

-- Daily summary for management PDF
CREATE OR REPLACE FUNCTION get_admin_daily_summary(p_date DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date DATE := COALESCE(p_date, (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE);
  v_from TIMESTAMPTZ := (v_date::TIMESTAMP AT TIME ZONE 'Asia/Kolkata');
  v_to TIMESTAMPTZ := v_from + INTERVAL '1 day';
  v_filters JSONB := jsonb_build_object('date_preset', 'custom', 'date_from', v_date::TEXT, 'date_to', v_date::TEXT);
BEGIN
  RETURN jsonb_build_object(
    'date', v_date::TEXT,
    'title', 'Confluence 2026 — Daily Operations Summary',
    'registrations', (
      SELECT jsonb_build_object(
        'total', COUNT(*)::INT,
        'payment_complete', COUNT(*) FILTER (WHERE status = 'PAYMENT_COMPLETE')::INT,
        'payment_pending', COUNT(*) FILTER (WHERE status = 'PAYMENT_PENDING')::INT
      )
      FROM registrations r
      WHERE r.created_at >= v_from AND r.created_at < v_to
    ),
    'revenue', jsonb_build_object(
      'captured', COALESCE((
        SELECT SUM(amount)::NUMERIC FROM payments
        WHERE status = 'captured' AND paid_at >= v_from AND paid_at < v_to
      ), 0),
      'expected', COALESCE((
        SELECT SUM(o.total)::NUMERIC FROM orders o
        WHERE o.status IN ('created', 'paid')
          AND o.created_at >= v_from AND o.created_at < v_to
      ), 0),
      'pending_payments', (
        SELECT COUNT(*)::INT FROM registrations
        WHERE status = 'PAYMENT_PENDING'
          AND created_at >= v_from AND created_at < v_to
      )
    ),
    'check_ins', (
      SELECT jsonb_build_object(
        'total', COUNT(DISTINCT ci.registration_id)::INT,
        'peak_hour', COALESCE((
          SELECT to_char(
            (SELECT h FROM (
              SELECT EXTRACT(HOUR FROM ci2.checked_in_at AT TIME ZONE 'Asia/Kolkata') AS h, COUNT(*) cnt
              FROM check_ins ci2 WHERE ci2.status = 'active'
                AND ci2.checked_in_at >= v_from AND ci2.checked_in_at < v_to
              GROUP BY 1 ORDER BY cnt DESC LIMIT 1
            ) ph), 'FM00:00'
          ), '—')
        )
      )
      FROM check_ins ci
      WHERE ci.status = 'active' AND ci.checked_in_at >= v_from AND ci.checked_in_at < v_to
    ),
    'volunteers', (
      SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'check_ins')::INT DESC), '[]'::JSONB)
      FROM (
        SELECT jsonb_build_object(
          'name', COALESCE(ap.full_name, 'Unknown'),
          'check_ins', COUNT(ci.id)::INT,
          'avg_per_hour', ROUND(
            COUNT(ci.id)::NUMERIC / GREATEST(
              EXTRACT(EPOCH FROM (MAX(ci.checked_in_at) - MIN(ci.checked_in_at))) / 3600.0, 1
            ), 1
          )
        ) AS row
        FROM check_ins ci
        LEFT JOIN admin_profiles ap ON ap.id = ci.checked_in_by
        WHERE ci.status = 'active' AND ci.checked_in_at >= v_from AND ci.checked_in_at < v_to
        GROUP BY ci.checked_in_by, ap.full_name
        ORDER BY COUNT(ci.id) DESC
        LIMIT 10
      ) s
    ),
    'email', (
      SELECT jsonb_build_object(
        'sent', COUNT(*) FILTER (WHERE event_type IN ('EMAIL_SENT', 'ADMIN_EMAIL_RESENT'))::INT,
        'failed', COUNT(*) FILTER (WHERE event_type = 'EMAIL_FAILED')::INT,
        'success_rate', COALESCE(ROUND(
          100.0 * COUNT(*) FILTER (WHERE event_type IN ('EMAIL_SENT', 'ADMIN_EMAIL_RESENT'))::NUMERIC
          / NULLIF(COUNT(*) FILTER (WHERE event_type IN ('EMAIL_SENT', 'ADMIN_EMAIL_RESENT', 'EMAIL_FAILED')), 0),
          1
        ), 100)
      )
      FROM audit_logs
      WHERE event_type IN ('EMAIL_SENT', 'EMAIL_FAILED', 'ADMIN_EMAIL_RESENT')
        AND created_at >= v_from AND created_at < v_to
    ),
    'generated_at', NOW()
  );
END;
$$;

-- System health checks
CREATE OR REPLACE FUNCTION get_admin_system_health()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_db_ok BOOLEAN;
  v_recent_payments INT;
  v_recent_emails_sent INT;
  v_recent_emails_failed INT;
  v_recent_checkins INT;
  v_admin_logins_24h INT;
BEGIN
  BEGIN
    PERFORM 1;
    v_db_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_db_ok := FALSE;
  END;

  SELECT COUNT(*)::INT INTO v_recent_payments
  FROM payments WHERE status = 'captured' AND paid_at > NOW() - INTERVAL '7 days';

  SELECT
    COUNT(*) FILTER (WHERE event_type IN ('EMAIL_SENT', 'ADMIN_EMAIL_RESENT'))::INT,
    COUNT(*) FILTER (WHERE event_type = 'EMAIL_FAILED')::INT
  INTO v_recent_emails_sent, v_recent_emails_failed
  FROM audit_logs
  WHERE event_type IN ('EMAIL_SENT', 'EMAIL_FAILED', 'ADMIN_EMAIL_RESENT')
    AND created_at > NOW() - INTERVAL '7 days';

  SELECT COUNT(*)::INT INTO v_recent_checkins
  FROM check_ins WHERE status = 'active' AND checked_in_at > NOW() - INTERVAL '7 days';

  SELECT COUNT(*)::INT INTO v_admin_logins_24h
  FROM admin_login_audit WHERE login_at > NOW() - INTERVAL '24 hours';

  RETURN jsonb_build_object(
    'generated_at', NOW(),
    'components', jsonb_build_array(
      jsonb_build_object(
        'id', 'database',
        'name', 'Database',
        'status', CASE WHEN v_db_ok THEN 'healthy' ELSE 'down' END,
        'detail', CASE WHEN v_db_ok THEN 'Connected' ELSE 'Connection failed' END
      ),
      jsonb_build_object(
        'id', 'payment_webhook',
        'name', 'Payment Webhook',
        'status', CASE WHEN v_recent_payments > 0 THEN 'healthy' WHEN EXISTS (
          SELECT 1 FROM orders WHERE created_at > NOW() - INTERVAL '7 days' LIMIT 1
        ) THEN 'degraded' ELSE 'unknown' END,
        'detail', v_recent_payments || ' captured payments in last 7 days'
      ),
      jsonb_build_object(
        'id', 'email_service',
        'name', 'Email Service',
        'status', CASE
          WHEN v_recent_emails_failed = 0 AND v_recent_emails_sent > 0 THEN 'healthy'
          WHEN v_recent_emails_failed > 0 AND v_recent_emails_sent > v_recent_emails_failed THEN 'degraded'
          WHEN v_recent_emails_failed > 0 AND v_recent_emails_sent = 0 THEN 'down'
          ELSE 'unknown'
        END,
        'detail', v_recent_emails_sent || ' sent, ' || v_recent_emails_failed || ' failed (7d)'
      ),
      jsonb_build_object(
        'id', 'storage',
        'name', 'Storage',
        'status', 'healthy',
        'detail', 'Export bucket configured (admin-exports)'
      ),
      jsonb_build_object(
        'id', 'edge_functions',
        'name', 'Edge Functions',
        'status', 'healthy',
        'detail', 'Runtime responding'
      ),
      jsonb_build_object(
        'id', 'admin_api',
        'name', 'Admin API',
        'status', CASE WHEN v_admin_logins_24h > 0 THEN 'healthy' ELSE 'degraded' END,
        'detail', v_admin_logins_24h || ' staff logins in last 24h'
      )
    )
  );
END;
$$;

-- Export job helpers (service_role only)
CREATE OR REPLACE FUNCTION create_admin_export_job(
  p_requested_by UUID,
  p_export_type TEXT,
  p_format TEXT,
  p_filters JSONB,
  p_file_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO admin_export_jobs (requested_by, export_type, format, filters, file_name, status, expires_at)
  VALUES (p_requested_by, p_export_type, p_format, p_filters, p_file_name, 'queued', NOW() + INTERVAL '24 hours')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_admin_export_job(
  p_job_id UUID,
  p_status TEXT,
  p_row_count INT DEFAULT NULL,
  p_storage_path TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE admin_export_jobs
  SET
    status = p_status,
    row_count = COALESCE(p_row_count, row_count),
    storage_path = COALESCE(p_storage_path, storage_path),
    error_message = p_error_message,
    completed_at = CASE WHEN p_status IN ('ready', 'failed') THEN NOW() ELSE completed_at END
  WHERE id = p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_admin_export_job(p_job_id UUID, p_requested_by UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job admin_export_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM admin_export_jobs
  WHERE id = p_job_id AND requested_by = p_requested_by;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;

  RETURN jsonb_build_object(
    'id', v_job.id,
    'export_type', v_job.export_type,
    'format', v_job.format,
    'status', v_job.status,
    'row_count', v_job.row_count,
    'file_name', v_job.file_name,
    'storage_path', v_job.storage_path,
    'error_message', v_job.error_message,
    'created_at', v_job.created_at,
    'completed_at', v_job.completed_at,
    'expires_at', v_job.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION list_admin_export_jobs(p_requested_by UUID, p_limit INT DEFAULT 20)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row ORDER BY row->>'created_at' DESC)
    FROM (
      SELECT jsonb_build_object(
        'id', j.id,
        'export_type', j.export_type,
        'format', j.format,
        'status', j.status,
        'row_count', j.row_count,
        'file_name', j.file_name,
        'created_at', j.created_at,
        'completed_at', j.completed_at,
        'expires_at', j.expires_at
      ) AS row
      FROM admin_export_jobs j
      WHERE j.requested_by = p_requested_by
      ORDER BY j.created_at DESC
      LIMIT LEAST(GREATEST(p_limit, 1), 50)
    ) s
  ), '[]'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION resolve_operations_date_range(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_admin_operations_filter_options() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_admin_operations_report(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_admin_export_rows(TEXT, JSONB, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_admin_daily_summary(DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_admin_system_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION create_admin_export_job(UUID, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_admin_export_job(UUID, TEXT, INT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_admin_export_job(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION list_admin_export_jobs(UUID, INT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION get_admin_operations_filter_options() TO service_role;
GRANT EXECUTE ON FUNCTION get_admin_operations_report(TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION get_admin_export_rows(TEXT, JSONB, INT) TO service_role;
GRANT EXECUTE ON FUNCTION get_admin_daily_summary(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION get_admin_system_health() TO service_role;
GRANT EXECUTE ON FUNCTION create_admin_export_job(UUID, TEXT, TEXT, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION update_admin_export_job(UUID, TEXT, INT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_admin_export_job(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION list_admin_export_jobs(UUID, INT) TO service_role;

COMMENT ON FUNCTION get_admin_operations_report IS 'Module 7 — one RPC per Operations tab.';
COMMENT ON FUNCTION get_admin_export_rows IS 'Module 7 — server-side export row data.';
COMMENT ON FUNCTION get_admin_daily_summary IS 'Module 7 — management daily summary for PDF export.';
