import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const visibility = z.enum(["private", "chapter", "public", "hidden"]);

export const relaxationWindowSchema = z.object({
  enabled: z.boolean(),
  start: isoDate.nullable(),
  end: isoDate.nullable(),
  allowed_categories: z.array(z.enum([
    "academic", "statutory", "emergency", "administrative", "placement"
  ])).max(10).default([])
}).superRefine((value, ctx) => {
  if (value.enabled && (!value.start || !value.end)) {
    ctx.addIssue({ code: "custom", message: "Enabled relaxation windows need start and end dates" });
  }
  if (value.start && value.end && value.end < value.start) {
    ctx.addIssue({ code: "custom", message: "Relaxation window end must be on or after start" });
  }
});

export const tenantSettingsSchema = z.object({
  relaxation_window: relaxationWindowSchema,
  dual_head_approval: z.object({
    require_dual_on_budget: z.boolean(),
    budget_threshold: z.number().nonnegative().max(1_000_000_000),
    currency: z.string().regex(/^[A-Z]{3}$/, "Currency must be a three-letter ISO code"),
    escalation_hours: z.number().int().min(1).max(24 * 90).default(336),
    independent_escalation_role: z.enum(["admin", "platform_admin", "auditor"]).default("admin")
  }),
  public_passport_defaults: z.object({
    visibility,
    show_academic_info: z.boolean(),
    show_unverified_projects: z.boolean()
  })
}).strict();

export const DEFAULT_TENANT_SETTINGS = Object.freeze({
  relaxation_window: {
    enabled: false,
    start: null,
    end: null,
    allowed_categories: []
  },
  dual_head_approval: {
    require_dual_on_budget: true,
    budget_threshold: 10_000,
    currency: "INR",
    escalation_hours: 336,
    independent_escalation_role: "admin"
  },
  public_passport_defaults: {
    visibility: "chapter",
    show_academic_info: false,
    show_unverified_projects: false
  }
});

export function parseTenantSettings(value) {
  const current = value && typeof value === "object" ? value : {};
  return tenantSettingsSchema.parse({
    relaxation_window: {
      ...DEFAULT_TENANT_SETTINGS.relaxation_window,
      ...(current.relaxation_window || {})
    },
    dual_head_approval: {
      ...DEFAULT_TENANT_SETTINGS.dual_head_approval,
      ...(current.dual_head_approval || {})
    },
    public_passport_defaults: {
      ...DEFAULT_TENANT_SETTINGS.public_passport_defaults,
      ...(current.public_passport_defaults || {})
    }
  });
}

export function mergeTenantSettings(current, patch) {
  const parsed = parseTenantSettings(current);
  return parseTenantSettings({
    relaxation_window: {
      ...parsed.relaxation_window,
      ...(patch?.relaxation_window || {})
    },
    dual_head_approval: {
      ...parsed.dual_head_approval,
      ...(patch?.dual_head_approval || {})
    },
    public_passport_defaults: {
      ...parsed.public_passport_defaults,
      ...(patch?.public_passport_defaults || {})
    }
  });
}
