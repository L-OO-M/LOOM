# Classification and Recommendations

## Classification Principle

Classification is deterministic. The dashboard reads stored output instead of recalculating live.

## Inputs

Initial inputs:

- Roadmap progress by domain
- GitHub activity by language and repository
- Contest attempts and outcomes
- Project completion
- Resource engagement
- Mentorship participation
- Recency and consistency

## Outputs

Stored output:

- Primary domain
- Confidence
- Activity level
- Learning stage
- Cohort
- Version
- Timestamp
- Inputs snapshot
- Result explanation

## Versioning

Every classification run stores `classification_version`. When the scoring logic changes, increment the version and run a controlled recalculation.

## Recommendation Rules

Recommendations come from structured matching:

- Current roadmap node
- Prerequisites
- Student domain
- Difficulty
- Resource tags
- Time availability
- Recent activity

No AI is needed for the initial recommendation engine.

## Anti-Gaming Rules

Do not reward raw event counts directly. Weight meaningful actions:

- Merged pull requests
- Reviewed work
- Project completion
- Contest performance
- Roadmap completion
- Mentorship contribution
- Consistency over time

Cap suspicious bursts and flag objective review cases without judgmental labels.
