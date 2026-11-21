// Cross-department operational workflow handoffs.
//
// Establishes explicit boundaries, deliverables, and input/output contracts
// between departments for collaborative society initiatives.

export const WORKFLOW_TYPES = {
  SOCIETY_WORKSHOP: "society_workshop",
  HACKATHON: "hackathon",
  TECHNICAL_TALK: "technical_talk",
  CAMPUS_INTAKE: "campus_intake"
};

/**
 * Department-specific submission requirements and deliverable templates.
 */
export const DEPARTMENT_DELIVERABLE_SCHEMAS = {
  // Technical departments
  technical: {
    requiredFields: ["repositoryUrl", "documentationNotes"],
    optionalFields: ["demoUrl", "testEvidenceUrl"],
    label: "Code & Implementation Deliverable"
  },
  ai_ml: {
    requiredFields: ["repositoryUrl", "modelWriteup"],
    optionalFields: ["datasetUrl", "demoUrl"],
    label: "Model & Dataset Deliverable"
  },
  web: {
    requiredFields: ["repositoryUrl", "deployedUrl"],
    optionalFields: ["prUrl", "lighthouseScore"],
    label: "Web Product & Deployment"
  },
  cybersecurity: {
    requiredFields: ["labWriteup", "remediationNotes"],
    optionalFields: ["proofOfConceptUrl"],
    label: "Security Lab & Threat Assessment"
  },
  dsa: {
    requiredFields: ["problemSetNotes", "editorialLink"],
    optionalFields: ["contestUrl"],
    label: "Problem Set & Editorial"
  },
  blockchain: {
    requiredFields: ["repositoryUrl", "contractAddressTestnet"],
    optionalFields: ["auditNotes"],
    label: "Smart Contract & Protocol Notes"
  },
  embedded: {
    requiredFields: ["schematicUrl", "firmwareRepoUrl"],
    optionalFields: ["videoDemoUrl"],
    label: "Hardware Bring-up & Schematics"
  },

  // Non-technical departments
  design: {
    requiredFields: ["canvaOrFigmaUrl", "assetPreviewUrl", "format"],
    optionalFields: ["revisionNumber", "brandGuidelinesChecked"],
    label: "Visual Creative & Brand Asset"
  },
  documentation: {
    requiredFields: ["documentUrl", "templateKind", "version"],
    optionalFields: ["meetingMinutesDate", "archivalNotes"],
    label: "Official Record & Documentation"
  },
  smm_content: {
    requiredFields: ["captionText", "mediaAssetUrls", "targetPlatforms", "scheduledPublishAt"],
    optionalFields: ["reelsUrl", "photographerName"],
    label: "Social Media Post & Content Package"
  },
  publicity: {
    requiredFields: ["distributionPlan", "targetAudiences", "channels"],
    optionalFields: ["campusOutreachRoster", "expectedReach"],
    label: "Promotional Distribution Campaign"
  },
  sponsorship: {
    requiredFields: ["sponsorName", "proposalUrl", "deliverablesList", "commitmentAmount"],
    optionalFields: ["mouDocumentId", "pointOfContactEmail"],
    label: "Sponsor Package & Deliverables"
  },
  management: {
    requiredFields: ["venueName", "runSheetUrl", "leadCoordinatorId", "volunteerCount"],
    optionalFields: ["equipmentChecklist", "contingencyNotes"],
    label: "Operational Run Sheet & Logistics"
  },
  public_relations: {
    requiredFields: ["institutionName", "pocName", "collaborationScope"],
    optionalFields: ["mouId", "meetingDate"],
    label: "Institutional Partnership Brief"
  }
};

/**
 * Standard society workshop cross-department workflow pipeline.
 */
export const SOCIETY_WORKSHOP_PIPELINE = [
  {
    step: 1,
    id: "technical_proposal",
    owningDepartment: "technical", // Dynamic based on host dept (e.g. 'web', 'ai_ml')
    title: "Workshop Proposal & Technical Brief",
    outputs: ["proposal", "speakerDetails", "curriculumPrerequisites"],
    requiredForNext: true
  },
  {
    step: 2,
    id: "documentation_brief",
    owningDepartment: "documentation",
    title: "Official Event Brief & Planning Document",
    inputs: ["technical_proposal"],
    outputs: ["officialBriefUrl", "budgetEstimates"],
    requiredForNext: true
  },
  {
    step: 3,
    id: "design_creatives",
    owningDepartment: "design",
    title: "Event Posters, Banners & Brand Creatives",
    inputs: ["documentation_brief"],
    outputs: ["posterUrl", "bannerUrl", "figmaUrl"],
    requiredForNext: true
  },
  {
    step: 4,
    id: "smm_content_prep",
    owningDepartment: "smm_content",
    title: "Social Media Campaign & Teaser Reel",
    inputs: ["design_creatives"],
    outputs: ["caption", "scheduledReelUrl", "publishingSchedule"],
    requiredForNext: true
  },
  {
    step: 5,
    id: "publicity_distribution",
    owningDepartment: "publicity",
    title: "Campus Broadcast & Student Group Outreach",
    inputs: ["smm_content_prep"],
    outputs: ["broadcastLog", "registrationDriveConfirmed"],
    requiredForNext: true
  },
  {
    step: 6,
    id: "management_logistics",
    owningDepartment: "management",
    title: "Venue Booking, Run Sheet & Volunteer Allocation",
    inputs: ["publicity_distribution"],
    outputs: ["venueConfirmed", "runSheet", "volunteerRoster"],
    requiredForNext: true
  },
  {
    step: 7,
    id: "documentation_post_event",
    owningDepartment: "documentation",
    title: "Event Retrospective, Attendance Archive & Minutes",
    inputs: ["management_logistics"],
    outputs: ["retrospectiveReportUrl", "attendanceVerified", "photoArchiveUrl"],
    requiredForNext: false
  }
];

export const HANDOFF_TRANSITIONS = Object.freeze({
  pending: Object.freeze({}),
  ready: Object.freeze({ start: "in_progress", block: "blocked" }),
  in_progress: Object.freeze({ submit: "submitted", block: "blocked" }),
  submitted: Object.freeze({ approve: "approved", return: "returned" }),
  approved: Object.freeze({}),
  returned: Object.freeze({ start: "in_progress", submit: "submitted", block: "blocked" }),
  blocked: Object.freeze({ start: "in_progress" }),
  cancelled: Object.freeze({})
});

export function decideHandoffTransition(currentStatus, action) {
  const nextStatus = HANDOFF_TRANSITIONS[currentStatus]?.[action] || null;
  return nextStatus
    ? { ok: true, nextStatus }
    : { ok: false, reason: "INVALID_TRANSITION" };
}

/**
 * Validate deliverable payload against department submission requirements.
 */
export function validateDepartmentDeliverable(deptSlug, deliverableData = {}) {
  const schema = DEPARTMENT_DELIVERABLE_SCHEMAS[deptSlug] || DEPARTMENT_DELIVERABLE_SCHEMAS.technical;
  const missing = [];
  for (const field of schema.requiredFields) {
    const val = deliverableData[field];
    if (val === undefined || val === null || (typeof val === "string" && !val.trim())) {
      missing.push(field);
    }
  }
  return {
    valid: missing.length === 0,
    missingFields: missing,
    schemaLabel: schema.label
  };
}

/**
 * Get the next handoff step in a pipeline.
 */
export function getNextHandoffStep(currentStepId, pipeline = SOCIETY_WORKSHOP_PIPELINE) {
  const index = pipeline.findIndex((s) => s.id === currentStepId);
  if (index < 0 || index >= pipeline.length - 1) return null;
  return pipeline[index + 1];
}
