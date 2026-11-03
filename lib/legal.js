// Deployment-configurable legal/notice metadata.
//
// These are intentionally NOT hardcoded to a company or jurisdiction: LOOM is
// deployed by different chapters/operators. Every value has an honest default
// so the public pages never contain bracketed placeholders while still making
// it clear when an operator has not published a specific detail.
//
// The pages that consume this module are `force-static`, so the environment is
// read at BUILD time. Operators who change these values must rebuild/redeploy.

export const POLICY_VERSIONS = Object.freeze({
  terms: "2026-10-27",
  privacy: "2026-10-27"
});

const DEFAULTS = Object.freeze({
  operatorName: "the operator of this LOOM deployment",
  contactName: "Chapter operations",
  contactEmail: null,
  retention:
    "as long as the chapter needs it to operate the service, after which it is deleted or anonymized when a deletion request is completed",
  governingLaw: "the laws that apply where this deployment is operated",
  liabilityCap:
    "the total amount the member has paid to use the service, which is currently zero, or the minimum amount required by applicable law"
});

function read(name, fallback) {
  const value = process.env[name];
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

export function legalConfig() {
  return {
    operatorName: read("LEGAL_OPERATOR_NAME", DEFAULTS.operatorName),
    contactName: read("LEGAL_CONTACT_NAME", DEFAULTS.contactName),
    contactEmail: read("LEGAL_CONTACT_EMAIL", DEFAULTS.contactEmail),
    contactPath: "/contact",
    retention: read("LEGAL_RETENTION_PERIOD", DEFAULTS.retention),
    governingLaw: read("LEGAL_GOVERNING_LAW", DEFAULTS.governingLaw),
    liabilityCap: read("LEGAL_LIABILITY_CAP", DEFAULTS.liabilityCap),
    published: read("LEGAL_PUBLISHED_DATE", "2026-10-27"),
    policyVersions: POLICY_VERSIONS
  };
}

/** True when a stored consent row matches the policy versions currently live. */
export function consentIsCurrent(record, versions = POLICY_VERSIONS) {
  if (!record) return false;
  return (
    record.terms_version === versions.terms &&
    record.privacy_version === versions.privacy
  );
}
