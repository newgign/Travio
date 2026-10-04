# Asedeliya — Production launch gap checklist

2026-10-04, Asia/Qyzylorda. Current consumer/booking lifecycle RC is READY in non-commercial tested scope. Commercial production: **NOT READY**. See [Sprint 7A audit](SPRINT_7A_COMMERCIAL_PRODUCTION_READINESS_GAP_AUDIT_REPORT.md) for evidence and closure criteria.

Keep TEST, BOOKING_DISABLED, PAYMENTS_DISABLED and production infrastructure paused. No need to buy production services for the recommended next engineering sprint. This checklist is a plan, not permission to enable flags or spend money.

## P0 — Before real sales: 10 open work packages

- [ ] **P0-01 Production DB:** owner approves durable target/cost; separately verifies identity, staging isolation, TLS, schema and migration authorization.
- [ ] **P0-02 Hotelbeds LIVE:** owner/provider confirms account access, credentials/mTLS, terms/quota and any actual approval requirements; separately authorized LIVE read-only acceptance. Approval status unknown.
- [ ] **P0-03 Real booking:** Engineering connects trusted Review to evidenced durable booking execution and duplicate/crash tests. Current flags alone are insufficient; hard safety gate remains off.
- [ ] **P0-04 PSP account:** owner selects merchant provider and confirms supported currencies/auth-capture/refund/account requirements and costs.
- [ ] **P0-05 Real payment:** hosted/tokenized flow, verified replay-safe webhooks, trusted money, dedupe and booking/payment sequencing; no raw card storage.
- [ ] **P0-06 Cancellation/refund:** actual booking/charge-based execution and partial/unknown outcome acceptance, no fake completion.
- [ ] **P0-07 Recovery/operators:** durable transaction evidence/reconciliation, truthful My Bookings/document state and named operator handling.
- [ ] **P0-08 Production deployment:** owner-approved isolated services/domain/HTTPS/CORS/secrets/revisions and rollback; backend health/readiness then bound frontend/browser acceptance.
- [ ] **P0-09 Backup/DR:** protected off-machine destination/retention, target-specific isolated restore/cutover plan and owner-defined recovery objectives. Historical local-copy restore is not production DR.
- [ ] **P0-10 Legal/fulfilment:** owner/legal approves company identity, commercial terms/privacy, rate cancellation/refund/price disclosures and reliable confirmed-booking delivery. Current Help pages are informational TEST content.

## P1 — Before unrestricted public launch: 6 requirements

- [ ] P1-01 External monitoring, alert routing and log retention accepted.
- [ ] P1-02 Production security/auth/webhook/PII/dependency review completed.
- [ ] P1-03 Responsive, keyboard and chosen browser acceptance completed.
- [ ] P1-04 Voucher/notices and email if selected accepted; approved manual delivery may support controlled launch only.
- [ ] P1-05 Provider quota/catalog and DB/service capacity validated.
- [ ] P1-06 Support, incident/rollback and PSP dispute handling rehearsed; stop criteria agreed.

## P2 — Later improvements: 4

- [ ] P2-01 Real-user performance optimization.
- [ ] P2-02 Broader browser/assistive-device coverage.
- [ ] P2-03 Operator dashboard/reconciliation automation.
- [ ] P2-04 Advanced dispute/forecasting analytics; basic required handling cannot be deferred.

## What the owner must decide or supply

DB/hosting/domain budget and account; private production secrets/targets; Hotelbeds LIVE requirements/access evidence; PSP merchant account and private API/webhook secrets; legal/operator/support details; backup destination/recovery objectives; separate approval for migrations, deploy, real operations and launch. No such action is claimed complete. Never paste secret values into chat/git/reports.

## Useful work now without paid services

Recommended **Sprint 7B — Payment Provider Contract & Mock Webhook Foundation**. Mock hosted-payment interfaces, trusted-money event contracts, signature/replay/dedupe and unknown/refund state tests, keeping all real providers and gates off. Durable lifecycle/reconciliation, document mocks, alert/backup contracts and launch checklists can also proceed offline in separately scoped sprints.

Order: owner decisions → isolated DB/config foundation and provider/account tracks → booking/payment integration → durable recovery → cancellation/refund → approved commercial RC/fulfilment → separately authorized controlled transaction → P1 accepted public launch.

Email delivery is currently OFF and conditionally optional for a controlled launch with approved reliable manual fulfilment; it is not marked ready. No production/legal/security/PCI/LIVE approval certification claimed. No runtime/dependency/schema changes or paid activation in this audit.
