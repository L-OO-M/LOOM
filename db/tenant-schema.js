import { boolean, date, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// NOTE: no `users` mirror table — profiles is the single source of truth
// for identity, role, and tenant (dead mirror dropped in migration 012).
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("student"),
  tenantId: uuid("tenant_id"),
  enrollmentNumber: text("enrollment_number"),
  department: text("department"),
  year: integer("year"),
  primaryDomain: text("primary_domain"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  githubUsername: text("github_username"),
  classification: jsonb("classification").notNull().default({}),
  classificationVersion: integer("classification_version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const resourceProgress = pgTable("resource_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: text("student_id").notNull(),
  resourceId: text("resource_id").notNull(),
  status: text("status").notNull().default("completed"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  roadmapNodeId: text("roadmap_node_id"),
  status: text("status").notNull().default("active"),
  repoUrl: text("repo_url"),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const contestRegistrations = pgTable("contest_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  contestId: uuid("contest_id").notNull(),
  studentId: text("student_id").notNull(),
  status: text("status").notNull().default("registered"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const contestSubmissions = pgTable("contest_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  contestId: uuid("contest_id").notNull(),
  studentId: text("student_id").notNull(),
  url: text("url"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const mentors = pgTable("mentors", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  tenantId: uuid("tenant_id"),
  expertise: text("expertise").notNull().default(""),
  bio: text("bio").notNull().default(""),
  available: boolean("available").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const githubConnections = pgTable("github_connections", {
  userId: text("user_id").primaryKey(),
  githubUsername: text("github_username"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow()
});

// NOTE: no `roadmaps` table — the catalog lives in roadmap_nodes keyed by
// domain (dead table dropped in migration 012).
export const roadmapNodes = pgTable("roadmap_nodes", {
  id: text("id").primaryKey(),
  roadmapId: uuid("roadmap_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  domain: text("domain").notNull(),
  difficultyLevel: text("difficulty_level").notNull().default("beginner"),
  sortOrder: integer("sort_order").notNull()
});

export const studentRoadmapProgress = pgTable("student_roadmap_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: text("student_id").notNull(),
  nodeId: text("node_id").notNull(),
  status: text("status").notNull(),
  evidenceSource: text("evidence_source"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const repositories = pgTable("repositories", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  studentId: text("student_id"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow()
});

export const githubEvents = pgTable("github_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  eventName: text("event_name").notNull(),
  deliveryId: text("delivery_id").notNull(),
  repositoryId: text("repository_id"),
  actorLogin: text("actor_login"),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow()
});

export const studentDailyActivity = pgTable("student_daily_activity", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: text("student_id").notNull(),
  day: date("day").notNull(),
  commits: integer("commits").notNull().default(0),
  pullRequests: integer("pull_requests").notNull().default(0),
  reviews: integer("reviews").notNull().default(0),
  score: numeric("score").notNull().default("0")
});

export const resources = pgTable("resources", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  domain: text("domain").notNull(),
  level: text("level").notNull(),
  kind: text("kind").notNull().default("article"),
  url: text("url"),
  storageKey: text("storage_key"),
  minutes: integer("minutes").notNull().default(30)
});

export const contests = pgTable("contests", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true })
});

export const mentorSessions = pgTable("mentor_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  mentorId: text("mentor_id").notNull(),
  studentId: text("student_id").notNull(),
  status: text("status").notNull().default("scheduled"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true })
});

// NOTE: no `leaderboard_snapshots` — the board computes live from profiles +
// activity + progress (dead table dropped in migration 012).
export const auditLogs = pgTable("audit_logs", {  id: uuid("id").primaryKey().defaultRandom(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// Phase 4.1 — OSS contribution portal + chapter federation (migration 006).
export const openSourceProjects = pgTable("open_source_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  githubRepoUrl: text("github_repo_url").notNull().unique(),
  owner: text("owner").notNull(),
  repoName: text("repo_name").notNull(),
  description: text("description").notNull().default(""),
  difficulty: text("difficulty").notNull().default("beginner"),
  primaryDomain: text("primary_domain").notNull().default("web"),
  language: text("language"),
  stars: integer("stars").notNull().default(0),
  goodFirstIssues: integer("good_first_issues").notNull().default(0),
  isCurated: boolean("is_curated").notNull().default(false),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const studentOssContributions = pgTable("student_oss_contributions", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: text("student_id").notNull(),
  tenantId: uuid("tenant_id"),
  projectId: uuid("project_id"),
  repoUrl: text("repo_url").notNull(),
  prUrl: text("pr_url").notNull(),
  prNumber: integer("pr_number"),
  title: text("title").notNull().default(""),
  contributionType: text("contribution_type").notNull().default("pr"),
  status: text("status").notNull().default("claimed"),
  mergedAt: timestamp("merged_at", { withTimezone: true }),
  filesChanged: integer("files_changed").notNull().default(0),
  linesAdded: integer("lines_added").notNull().default(0),
  linesDeleted: integer("lines_deleted").notNull().default(0),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const ossBadges = pgTable("oss_badges", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: text("student_id").notNull(),
  tenantId: uuid("tenant_id"),
  badgeKey: text("badge_key").notNull(),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
  projectUrl: text("project_url"),
  metadata: jsonb("metadata").notNull().default({})
});

export const chapterProfiles = pgTable("chapter_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().unique(),
  slug: text("slug").notNull().unique(),
  publicName: text("public_name").notNull(),
  mission: text("mission").notNull().default(""),
  contactEmail: text("contact_email"),
  websiteUrl: text("website_url"),
  socialLinks: jsonb("social_links").notNull().default({}),
  publicStats: jsonb("public_stats").notNull().default({}),
  isFeatured: boolean("is_featured").notNull().default(false),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const chapterPartnerships = pgTable("chapter_partnerships", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantAId: uuid("tenant_a_id").notNull(),
  tenantBId: uuid("tenant_b_id").notNull(),
  collaborationType: text("collaboration_type").notNull().default("resource-share"),
  status: text("status").notNull().default("active"),
  initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull().defaultNow()
});

export const federationMetrics = pgTable("federation_metrics", {  id: uuid("id").primaryKey().defaultRandom(),
  metricDate: date("metric_date").notNull().defaultNow(),
  totalStudents: integer("total_students").notNull().default(0),
  totalChapters: integer("total_chapters").notNull().default(0),
  totalOssContributions: integer("total_oss_contributions").notNull().default(0),
  topTenantId: uuid("top_tenant_id"),
  perTenant: jsonb("per_tenant").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// Phase 4.2 — skill verification + portable credentials (migration 007).
export const skillBadges = pgTable("skill_badges", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  criteria: jsonb("criteria").notNull().default({}),
  tier: integer("tier").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const studentAchievements = pgTable("student_achievements", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: text("student_id").notNull(),
  tenantId: uuid("tenant_id"),
  badgeId: uuid("badge_id"),
  sourceType: text("source_type").notNull().default("manual"),
  sourceRef: text("source_ref"),
  level: text("level").notNull().default("gold"),
  evidenceUrl: text("evidence_url"),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow()
});

export const verifiableCredentials = pgTable("verifiable_credentials", {
  id: text("id").primaryKey(),
  studentId: text("student_id").notNull(),
  tenantId: uuid("tenant_id"),
  achievementId: uuid("achievement_id"),
  credentialType: text("credential_type").notNull().default("badge"),
  title: text("title").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  signature: text("signature").notNull(),
  viewCount: integer("view_count").notNull().default(0),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true })
});

export const credentialViews = pgTable("credential_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  credentialId: text("credential_id").notNull(),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow()
});

// Phase 4.2b — analytics rollups (migration 008).
export const studentAnalyticsSnapshots = pgTable("student_analytics_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: text("student_id").notNull(),
  tenantId: uuid("tenant_id"),
  snapshotDate: date("snapshot_date").notNull().defaultNow(),
  totalCommits: integer("total_commits").notNull().default(0),
  totalPrs: integer("total_prs").notNull().default(0),
  totalReviews: integer("total_reviews").notNull().default(0),
  roadmapCompletionPct: numeric("roadmap_completion_pct").notNull().default("0"),
  ossVerified: integer("oss_verified").notNull().default(0),
  achievements: integer("achievements").notNull().default(0),
  consistencyScore: numeric("consistency_score").notNull().default("0"),
  activeDays30: integer("active_days_30").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const cohortMetrics = pgTable("cohort_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  cohortDate: date("cohort_date").notNull().defaultNow(),
  totalStudents: integer("total_students").notNull().default(0),
  activeStudents7d: integer("active_students_7d").notNull().default(0),
  avgConsistency: numeric("avg_consistency").notNull().default("0"),
  avgRoadmapPct: numeric("avg_roadmap_pct").notNull().default("0"),
  domainDistribution: jsonb("domain_distribution").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const roadmapNodeAnalytics = pgTable("roadmap_node_analytics", {
  id: uuid("id").primaryKey().defaultRandom(),
  nodeId: text("node_id").notNull(),
  tenantId: uuid("tenant_id"),
  totalStarted: integer("total_started").notNull().default(0),
  totalCompleted: integer("total_completed").notNull().default(0),
  dropOffPct: numeric("drop_off_pct").notNull().default("0"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow()
});

export const mentorEffectiveness = pgTable("mentor_effectiveness", {
  id: uuid("id").primaryKey().defaultRandom(),
  mentorId: text("mentor_id").notNull(),
  tenantId: uuid("tenant_id"),
  menteeCount: integer("mentee_count").notNull().default(0),
  sessionCount: integer("session_count").notNull().default(0),
  avgMenteeRoadmapPct: numeric("avg_mentee_roadmap_pct").notNull().default("0"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow()
});

// Phase 4.3 — community (migration 009).
export const forumThreads = pgTable("forum_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  domain: text("domain").notNull().default("general"),
  authorId: text("author_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  tags: text("tags").array().notNull().default([]),
  viewCount: integer("view_count").notNull().default(0),
  replyCount: integer("reply_count").notNull().default(0),
  upvoteCount: integer("upvote_count").notNull().default(0),
  solved: boolean("solved").notNull().default(false),
  solutionPostId: uuid("solution_post_id"),
  pinned: boolean("pinned").notNull().default(false),
  status: text("status").notNull().default("visible"),
  flagCount: integer("flag_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const forumReplies = pgTable("forum_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").notNull(),
  authorId: text("author_id").notNull(),
  body: text("body").notNull().default(""),
  upvoteCount: integer("upvote_count").notNull().default(0),
  isAnswer: boolean("is_answer").notNull().default(false),
  status: text("status").notNull().default("visible"),
  flagCount: integer("flag_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const forumVotes = pgTable("forum_votes", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: text("student_id").notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const forumFlags = pgTable("forum_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: text("student_id").notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  reason: text("reason").notNull().default("spam"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const wikiPages = pgTable("wiki_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  domain: text("domain").notNull().default("general"),
  authorId: text("author_id").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("published"),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const wikiEditRequests = pgTable("wiki_edit_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageId: uuid("page_id").notNull(),
  requesterId: text("requester_id").notNull(),
  proposedTitle: text("proposed_title"),
  proposedContent: text("proposed_content").notNull().default(""),
  reason: text("reason").notNull().default(""),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const codeSnippets = pgTable("code_snippets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  authorId: text("author_id").notNull(),
  domain: text("domain").notNull().default("general"),
  language: text("language").notNull().default("javascript"),
  title: text("title").notNull(),
  code: text("code").notNull().default(""),
  description: text("description").notNull().default(""),
  tags: text("tags").array().notNull().default([]),
  upvoteCount: integer("upvote_count").notNull().default(0),
  status: text("status").notNull().default("visible"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// Phase 4.4 — events + social (migration 010).
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  eventType: text("event_type").notNull().default("workshop"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  domain: text("domain").notNull().default("general"),
  speakerName: text("speaker_name"),
  speakerBio: text("speaker_bio"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  location: text("location"),
  capacity: integer("capacity"),
  registeredCount: integer("registered_count").notNull().default(0),
  isOnline: boolean("is_online").notNull().default(false),
  status: text("status").notNull().default("upcoming"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const eventRegistrations = pgTable("event_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull(),
  studentId: text("student_id").notNull(),
  status: text("status").notNull().default("registered"),
  attendedAt: timestamp("attended_at", { withTimezone: true }),
  feedbackScore: integer("feedback_score"),
  feedbackText: text("feedback_text"),
  checkInCode: text("check_in_code").notNull(),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow()
});

export const eventMaterials = pgTable("event_materials", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull(),
  fileType: text("file_type").notNull().default("slide"),
  title: text("title").notNull(),
  storageUrl: text("storage_url").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow()
});

export const certificates = pgTable("certificates", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id"),
  studentId: text("student_id").notNull(),
  tenantId: uuid("tenant_id"),
  title: text("title").notNull(),
  verificationCode: text("verification_code").notNull().unique(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow()
});

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  tenantId: uuid("tenant_id"),
  username: text("username").notNull().unique(),
  bio: text("bio").notNull().default(""),
  avatarUrl: text("avatar_url"),
  location: text("location"),
  socialLinks: jsonb("social_links").notNull().default({}),
  primaryDomain: text("primary_domain"),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const followers = pgTable("followers", {
  id: uuid("id").primaryKey().defaultRandom(),
  followerId: text("follower_id").notNull(),
  followingId: text("following_id").notNull(),
  followedAt: timestamp("followed_at", { withTimezone: true }).notNull().defaultNow()
});

export const userEndorsements = pgTable("user_endorsements", {
  id: uuid("id").primaryKey().defaultRandom(),
  endorserId: text("endorser_id").notNull(),
  endorseeId: text("endorsee_id").notNull(),
  skill: text("skill").notNull(),
  endorsedAt: timestamp("endorsed_at", { withTimezone: true }).notNull().defaultNow()
});

export const mentorReviews = pgTable("mentor_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  mentorId: text("mentor_id").notNull(),
  reviewerId: text("reviewer_id").notNull(),
  rating: integer("rating").notNull(),
  reviewText: text("review_text").notNull().default(""),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow()
});
