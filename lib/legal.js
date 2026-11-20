// Deployment-configurable legal/notice metadata.
//
// LOOM is deployed by different chapters/operators, so every identity value is
// read from the environment with a real default rather than a bracketed
// placeholder: a public legal page must never publish "[Email address]" and
// then ask the reader to guess. Defaults reflect the operator published in the
// LOOM policy set; an operator that differs overrides them.
//
// The pages that consume this module are rendered dynamically (the nonce-based
// CSP in middleware.js requires it), so the environment is read per request.
//
// `POLICY_VERSIONS` is written into `consent_records`. Bumping a version is the
// mechanism that asks every Auth0 member to accept the revised policy again --
// do it only when the text changed materially.

export const POLICY_VERSIONS = Object.freeze({
  terms: "2026-11-05",
  privacy: "2026-11-05",
  cookies: "2026-11-05",
  disclaimer: "2026-11-05"
});

// Indicative retention periods, kept as data so the privacy page and any future
// data-controls surface describe the same numbers.
export const RETENTION_PERIODS = Object.freeze([
  ["Enquiries and correspondence", "12 months after the last contact"],
  ["Account and profile data", "until you delete your account, plus 30 days"],
  ["Transaction and billing records", "8 years, as required by tax and accounting law"],
  ["Server logs and security events", "14 months"],
  ["Administrative audit records", "as long as needed to preserve an accountable trail; content is minimized"]
]);

const DEFAULTS = Object.freeze({
  operatorName: "LOOM",
  operatorAddress: "C-4 Janak Puri, New Delhi 110058, India",
  registrationNumber: null,
  website: "lets-loom.xyz",
  contactName: "LOOM chapter operations",
  contactEmail: null,
  retention:
    "as long as the chapter needs it to operate the service, after which it is deleted or anonymized when a deletion request is completed",
  governingLaw: "the laws of India",
  jurisdiction: "Delhi, India",
  arbitrationSeat: "Delhi, India",
  arbitrationInstitution: "the Delhi International Arbitration Centre",
  liabilityCap:
    "the total amount the member has paid to use the service, which is currently zero, or the minimum amount required by applicable law",
  currency: "INR",
  published: "2026-11-05"
});

function read(name, fallback) {
  const value = process.env[name];
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

export function legalConfig() {
  const operatorAddress = read("LEGAL_OPERATOR_ADDRESS", DEFAULTS.operatorAddress);
  const contactEmail = read("LEGAL_CONTACT_EMAIL", DEFAULTS.contactEmail);
  return {
    operatorName: read("LEGAL_OPERATOR_NAME", DEFAULTS.operatorName),
    operatorAddress,
    registrationNumber: read("LEGAL_REGISTRATION_NUMBER", DEFAULTS.registrationNumber),
    website: read("LEGAL_WEBSITE", DEFAULTS.website),
    contactName: read("LEGAL_CONTACT_NAME", DEFAULTS.contactName),
    contactEmail,
    contactPath: "/contact",
    grievanceOfficer: read("LEGAL_GRIEVANCE_OFFICER", null),
    grievanceDesignation: read("LEGAL_GRIEVANCE_DESIGNATION", "Chapter operations"),
    grievanceAddress: read("LEGAL_GRIEVANCE_ADDRESS", operatorAddress),
    grievanceEmail: read("LEGAL_GRIEVANCE_EMAIL", contactEmail),
    acknowledgementHours: "24",
    resolutionDays: "15",
    retention: read("LEGAL_RETENTION_PERIOD", DEFAULTS.retention),
    retentionPeriods: RETENTION_PERIODS,
    governingLaw: read("LEGAL_GOVERNING_LAW", DEFAULTS.governingLaw),
    jurisdiction: read("LEGAL_JURISDICTION", DEFAULTS.jurisdiction),
    arbitrationSeat: read("LEGAL_ARBITRATION_SEAT", DEFAULTS.arbitrationSeat),
    arbitrationInstitution: read("LEGAL_ARBITRATION_INSTITUTION", DEFAULTS.arbitrationInstitution),
    liabilityCap: read("LEGAL_LIABILITY_CAP", DEFAULTS.liabilityCap),
    currency: read("LEGAL_CURRENCY", DEFAULTS.currency),
    refundPath: "/contact",
    published: read("LEGAL_PUBLISHED_DATE", DEFAULTS.published),
    policyVersions: POLICY_VERSIONS
  };
}

/**
 * Human date for a policy version ("2026-11-05" -> "5 November 2026").
 * Fixed locale and UTC so the server-rendered text is deterministic.
 */
export function formatPolicyDate(value) {
  const iso = String(value || "").slice(0, 10);
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

/** True when a stored consent row matches the policy versions currently live. */
export function consentIsCurrent(record, versions = POLICY_VERSIONS) {
  if (!record) return false;
  return (
    record.terms_version === versions.terms &&
    record.privacy_version === versions.privacy
  );
}
