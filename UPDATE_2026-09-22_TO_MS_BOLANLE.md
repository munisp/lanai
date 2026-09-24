# Update for Ms Bolanle, Wednesday 23 September 2026 (DRAFT, DO NOT SEND YET)

**Status:** two variants below. Pick ONE headline line based on the deploy state at send time. Sending is a human action: the user sends it by WhatsApp or email.

**Variant A (deploy verified live before sending):** keep the section "The headline" as written in variant A.
**Variant B (deploy still blocked at send time):** use the honest-status headline.

---

## Variant A (only if the deploy lands and verifies first)

Good morning Ms Bolanle,

Here is your Wednesday update on the Lanai pilot.

### The headline

The first pilot code is now live on lanai.newfire.app.

### What was delivered since your last update

**1. Security hardening (the item we marked NO-GO last week).** The audit found that an advisor could in principle see client records that were not assigned to them. That entire class of gap is closed: every list now filters by who is asking, your senior team sees everything and other advisors see only their own clients, file storage is scoped per member, and the CRM proxy is locked to the one path it actually serves. Verified in code review and with automated probes against the live site this morning. One internal note, in the spirit of no surprises: one internal service-to-service connection currently runs unencrypted inside the private cluster network, exactly as it has since July, with no path from the public internet. We have logged the permanent encryption fix as a committed follow-up and it ships before the pilot ends.

**2. The data foundation for your three big features.** The database now has the three tables your requirements call for: client memory (travel history, preferences, family, important dates, past requests, issues and patterns), SLA timers (your 15 to 30 minute urgent and 2 to 4 hour ordinary targets), and proposal versions (every revision of a proposal is kept). These were migrated with a full backup and restore rehearsal first, so nothing touched production data until the safety net was proven.

**3. Every change deployed with a backup first.** Full backup, restored into a scratch database, contents compared. Only then did anything run against the live database. This is the reliability standard from section SR-1000 of your SRS.

### What we still need from you

These two questions have been open since 15 September and they now block real dates:

1. **CR-001, the read-only client booking view.** You asked to discuss this. It decides whether the booking screens appear in the pilot or wait until after. A one line yes or no lets us plan either way.
2. **CR-002, the pilot data policy.** Our proposal: we seed four synthetic client personas for testing, we may use your own details for end to end testing, and no real client data enters the system without your explicit say so. Confirm or adjust.

### The honest position on dates

The original plan aimed for 18 September. It passed without a release, and we owe you the straight version: the requirements phase took the first week, and the build block started this week rather than last. With the foundation now live, the remaining work is the features you will actually touch: message capture with voice transcription, the triage working sheet, the SLA timers and morning briefing, and the dashboard. We propose a revised go-live of [DATE PENDING] and will hold ourselves to the same Tuesday cadence, never silent, never vague.

### What you will see next Tuesday

The capture pipeline: WhatsApp messages in, transcribed, triaged into your working sheet with urgency and draft replies, all reviewable before anything sends. Nothing auto-sends, ever; that stays a hard rule from your requirements.

---

## Variant B (honest status if the deploy is still blocked)

Good morning Ms Bolanle,

Here is your Wednesday update on the Lanai pilot.

### The headline

The pilot build is code-complete for its first block: the security hardening is closed and reviewed, the three data tables your features need are built, and the production database safety net was rehearsed and passed. This morning's first deployment attempt was stopped by our own safety checks: the new build misbehaved under the platform's health probes, so the platform restored the previous version automatically within minutes. Your live site was never down and never degraded. We are fixing one build issue and deploying again; you will see it verified before we claim it.

### What was delivered since your last update

**1. Security hardening (the item we marked NO-GO last week).** Same content as variant A item 1, adjusted: "Verified in code review; live probe verification lands with the next deploy."

**2. The data foundation.** Same as variant A item 2, adjusted: the three tables are built and the migration is ready to apply the moment the deploy lands, after the backup gate we already passed.

**3. A proven deployment safety net.** This morning's attempt demonstrated it in practice: a failed build was detected and reverted automatically in minutes with zero downtime and zero data impact. Full backup taken and rehearsed (restore into scratch database, contents verified).

### What we still need from you

Identical to variant A: CR-001 and CR-002, word for word.

### What you will see next Tuesday

Same as variant A.

---

*Draft notes for the user (not part of the message): pick one variant based on deploy state at send time. Attach nothing sensitive. Send by WhatsApp or email per her preference. Keep CR wording identical to the 15 September draft so her answers map cleanly. [DATE PENDING] fills from the re-baseline once she answers CR-001/CR-002.*