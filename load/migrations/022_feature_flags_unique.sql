-- 022_feature_flags_unique: ensure explicit upsert target for (tenant_id, key)
CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_tenant_key_unique
  ON public.feature_flags(tenant_id, key);
