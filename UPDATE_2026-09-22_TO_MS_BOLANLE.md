# Update for Ms Bolanle, Thursday 24 September 2026 (DRAFT, DO NOT SEND YET)

**Status:** single variant, ready to send once you approve. Sending is a human action: you send it by WhatsApp or email. This draft reflects verified state as of 24 Sep evening.

---

Good morning Ms Bolanle,

Here is your update on the Lanai pilot.

### The headline

The client booking view you approved (CR-001) is now live on lanai.newfire.app, and the four demo clients are fully set up with sample trips and bookings.

### What was delivered since your last update

**1. The client booking view (CR-001) is live.** Your members can now open their portal, click My Bookings, and see their confirmed trips: the hotel or airline, the dates, number of guests, the booking reference, the status, and the total. It is read only, so members cannot change anything, and it shows each member only their own bookings. Test it yourself: sign in at the client portal with one of the demo member accounts (for example eleanor.vance@example.com, PIN 2026) and open the My Bookings tab.

**2. All four demo personas are complete (CR-002).** Eleanor Vance, Marcus Chen, Sofia Almeida, and James Whitfield now each have a profile, a travel request, a proposal, and a booking in the system. No real client data has entered the system, exactly as you required. When you give the word, these four can be removed or kept for the pilot, your choice at any time.

**3. Security posture holds.** Every list in the portal is filtered by who is asking, so an advisor sees only their assigned clients, and members see only their own data. One internal service-to-service connection runs unencrypted inside the private cluster network, same as July, with the permanent encryption fix logged as a committed follow-up before pilot end.

### One fix in flight, and the honest position

You have our last two updates saying advisor sign-in via Keycloak works; it does not for one demo account. The diagnosis is complete: the account is set up correctly in the identity service but has an unverified email flag, and our portal correctly rejects unverified identities. The one-line fix is identified, and we will apply it before our next update. The admin demo account signs in fine and was used for the verification above.

### What you will see next

With CR-001 and CR-002 confirmed, the next block is the features you will actually touch: message capture with voice transcription (SR-100/SR-102), the triage working sheet (SR-300), SLA timers and the morning briefing (SR-500), and the dashboard (SR-700). We propose a revised go-live of Tuesday 29 September for those, holding ourselves to the same Tuesday cadence, never silent, never vague.

### What we still need from you

Nothing right now. The two items you confirmed (the booking view and the four demo clients) are done, and the one-line advisor sign-in fix is ours to make. We will confirm when it is applied.

---

*Draft notes for the user (not part of the message): send by WhatsApp or email per her preference. If she asks about the unverified email: the identity service sets that flag when it has never confirmed the address; demo accounts skip email confirmation, so we flip the flag manually, a standard demo-account step. The sign-in fix is the only remaining item on the 30 Sep deliverable.*
