-- 024_feature_requests: community wishlist — users propose features, admin reviews
CREATE TABLE IF NOT EXISTS public.feature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  requester_id text NOT NULL,
  title text NOT NULL CHECK (char_length(title) >= 4 AND char_length(title) <= 160),
  description text NOT NULL CHECK (char_length(description) >= 10),
  integration text NOT NULL DEFAULT '' CHECK (char_length(integration) <= 2000),
  tradeoffs text NOT NULL DEFAULT '' CHECK (char_length(tradeoffs) <= 2000),
  implementation text NOT NULL DEFAULT '' CHECK (char_length(implementation) <= 2000),
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('general','ui','performance','content','integration','other')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','needs_info','approved','rejected','in_progress','built')),
  assigned_to text,
  decided_by text,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feature_requests_tenant_status_idx ON public.feature_requests(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS feature_requests_requester_idx ON public.feature_requests(requester_id);

CREATE TABLE IF NOT EXISTS public.feature_request_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.feature_requests(id) ON DELETE CASCADE,
  author_id text NOT NULL,
  body text NOT NULL CHECK (char_length(body) >= 2 AND char_length(body) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feature_request_comments_request_idx ON public.feature_request_comments(request_id, created_at);
