# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial fork from `ontology-for-mfg` with `ontology-for-retail` overlay (CI 4-job, eval template, ADR template, harness-eval baseline).
- Design spec: `docs/superpowers/specs/2026-05-08-ontology-gcc-design.md` (14 scenarios A-N, 25 classes, 5 부서 페르소나).
- 5 implementation plans: `docs/superpowers/plans/2026-05-08-plan{1..5}-*.md`.
- Phase 0 Bootstrap (Plan 1 Tasks 0.1~0.8): mfg directory copy, mfg→gcc identifier rename, CI workflow, harness-eval baseline, .claude harness, CLAUDE.md (~280 line), bilingual README, SECURITY/.env/.editorconfig/.mcp.json/requirements-dev.
- Phase 1 Infrastructure deploy complete: 6-stack CDK live in account 061525506239 (network imports retail VPC).
- ECR images pushed (api + web ARM64); ECS services running 2/2 each.
- Cognito users provisioned (admin@whchoi.net, demo@whchoi.net / `!234Qwer`).
- CloudFront `https://d2vtgoziwcvh15.cloudfront.net/` returns 200/307 (Phase 1 acceptance: empty home reachable).

### Notes
- raw_data/ (PII inputs) is gitignored. Stored separately in KMS-encrypted S3.
- Phase 1 (Infrastructure) — 6-stack CDK with retail VPC import — complete.
