import os
import subprocess

user_guide_md = """# Lanai Lifestyle User Guide

**Version 2.0** · *A comprehensive step-by-step guide for navigating and using the platform.*

Welcome! This guide walks you through the **Lanai Lifestyle** platform, one screen at a time, in simple everyday language. By the end you will be able to navigate the entire application, use every service, and understand what the AI is doing for you without needing to call anyone for help.

---

## 1. What is Lanai?

Lanai is a **luxury travel concierge** that lives on your computer. It helps a travel team run their business and helps members (the travellers) see and manage their trips in one place.

There are **two areas**, like two doors into the same building:

| Area | Who uses it | What it's for |
|------|-------------|---------------|
| **Advisor Portal** | The Lanai team | Run the business: clients, trips, proposals, AI assistance, invoices |
| **Member Portal** | The travellers (members) | See your trips, documents, proposals, and message your advisor |

The platform has an **AI assistant built in**. It helps write proposals, prepare daily briefings, understand clients, and draft replies to messages. Think of it as a fast assistant that drafts content for you to review before sending.

---

## 2. Logging In

### 2.1 Advisor Portal
1. Open your browser and go to the web address your team gave you (for example `https://lanai.newfire.app`).
2. Click the **Sign In** button.
3. You will be taken to a secure login page.
4. Type your **email** and **password**.
5. Click **Sign In** again to land on your **Dashboard**.

> If you forget your password, click the **"Forgot password"** link on the login page.

### 2.2 Member Portal
1. Go to the member link (usually ends in `/client`).
2. Type your **email** and your **PIN**.
3. You will land on your personal **Trip Dashboard**.

> First time? Your advisor sends you an invitation email with a link to set your PIN.

---

## 3. The Advisor Portal: Screen by Screen

The **left-hand menu** is your map. Click any item to move between screens. Below is every screen, what it's for, and how to use it.

### 3.1 Dashboard (Home Base)

![Dashboard](screenshots/01-dashboard.png)

This is your **at-a-glance overview**. It shows live numbers pulled from your records:
- **Total clients**
- **Open travel requests** (trips people have asked for)
- **Active members**
- **Pipeline value** (the money in the works)

**How to use it:** Start here every day. It tells you what needs attention at a glance.

---

### 3.2 Clients (Client Directory)

![Clients](screenshots/02-clients.png)

A searchable list of **every client**. 

**How to use it:**
1. Use the **search box** to find someone by name, email, or city.
2. Click the **Add Client** button to add a new person (fill in their name, email, phone, and notes).
3. See each client's contact details at a glance.

---

### 3.3 Members (Membership Base)

![Members](screenshots/03-members.png)

Your **active membership base**. Each member has a tier (Platinum, Gold, Silver) and status.

**How to use it:** See who your members are, their tier, and their details. Click into a member to see their profile and history.

---

### 3.4 Travel Requests (Trip Pipeline)

![Travel Requests](screenshots/04-travel-requests.png)

Every trip a client has asked for, from first request to completed booking.

**How to use it:**
1. **Search** by destination or member.
2. Use the **status buttons** at the top to filter (New, In Progress, Proposal Sent, Booked, Completed, Cancelled).
3. Use the **Update Status** dropdown on any row to move a request to its next stage.

> **What the stages mean:** New (just asked) → In Progress (being worked on) → Proposal Sent (you've sent them options) → Booked (confirmed) → Completed (trip done) → Cancelled.

---

### 3.5 Proposals (AI Co-Pilot)

![Proposals](screenshots/05-proposals.png)

The **AI proposal generator**. Instead of writing a trip proposal from scratch, the AI drafts it for you.

**How to use it:**
1. Enter the client's details, including name, destination, dates, travellers, budget, and preferences.
2. Click **Generate**.
3. The AI writes a complete, client-ready proposal: accommodation, a day-by-day itinerary, experiences, estimated cost, and next steps.
4. **Review it, tweak it, and send it.**

> **A note on AI:** Generation can take a minute or two. The AI only uses the facts you give it and clearly labels any assumptions. It never invents confirmed prices or availability.

---

### 3.6 Intelligence (Client Insights)

![Intelligence](screenshots/06-intelligence.png)

A per-member **client intelligence** view. Pick a member and the AI looks at their profile to surface:
- A summary of their travel history and preferences.
- Open opportunities (requests and proposals).
- Risks or gaps (for example, missing information to collect).

**How to use it:** Select a member, then read the AI's summary to get up to speed before you speak with them.

---

### 3.7 Morning Briefing (Daily Priorities)

![Morning Briefing](screenshots/07-morning-briefing.png)

Generates a **daily briefing** with a digest of the day's clients, follow-ups, and priorities.

**How to use it:** Click **Generate Briefing**. The AI pulls together what matters for the day so you know where to focus. (This can take a minute or two.)

---

### 3.8 WhatsApp (AI Message Bridge)

![WhatsApp](screenshots/08-whatsapp.png)

When a client messages you on WhatsApp, the platform:
1. **Recognises** the contact (and creates or updates them in your records).
2. Runs **AI triage** to determine the intent, urgency, and tone of the message.
3. **Drafts a reply** for you to review and send.
4. Logs a **note** and **task** against the client automatically.

**How to use it:** Open a message, review the AI's suggested reply, edit if you like, and send.

---

### 3.9 Inbox (Unified Messaging)

![Inbox](screenshots/09-inbox.png)

Your **unified messaging inbox** (powered by Chatwoot). All client conversations across WhatsApp, email, and portal messages in one place.

**How to use it:**
- See all conversations and who's assigned to them.
- Reply directly.
- Use the **AI Draft** button to get a suggested reply, then edit and send.

> **24/7 AI auto-reply:** When a member sends a message through the portal, the platform **replies automatically around the clock** so no message ever goes unanswered, even outside working hours. The AI reads the message (intent, urgency, mood) and sends a personal reply right away. If the AI is unavailable, it sends a warm acknowledgment and flags the conversation for you to follow up. Your manual replies always take priority, and the system never replies to its own messages.

---

### 3.10 Communication Hub (Client Overview)

![Communication Hub](screenshots/10-communication-hub.png)

A unified view of a client's communications and activity to see the full picture of your relationship at a glance.

---

### 3.11 Analytics (Revenue & Pipeline)

![Analytics](screenshots/11-analytics.png)

**Revenue analytics** showing income, commissions, and pipeline value to track business performance.

---

### 3.12 Invoicing (Billing & Commissions)

![Invoicing](screenshots/12-invoicing.png)

Create and manage **client invoices** and **supplier commission invoices**.

**How to use it:** Create an invoice and track its status (Draft, Sent, Paid, or Overdue) along with due dates.

---

### 3.13 Task Templates (Workflow Automation)

![Task Templates](screenshots/13-task-templates.png)

**Pre-made templates** for common tasks and workflows so you do not have to start from scratch each time.

**How to use it:** Pick a template, and it fills in the standard steps for you to adjust and use.

---

### 3.14 Suppliers (Vetted Partner Network)

![Suppliers](screenshots/14-suppliers.png)

Your **vetted supplier network** covering hotels, villas, yachts, jets, transfers, and experiences.

**How to use it:** Browse suppliers, see their category, location, rating, preferred status, and contact details.

---

### 3.15 Supplier Services (Service Offerings)

![Supplier Services](screenshots/15-supplier-services.png)

The **services each supplier provides** (rooms, dining, experiences, and more).

**How to use it:** Add a service to a supplier, or submit an inquiry for a service you need for a client.

---

### 3.16 Settings (Platform Configuration)

![Settings](screenshots/16-settings.png)

Your **account and platform settings** covering profile details, preferences, and system configuration.

---

## 4. AI Services: What to Expect

The platform uses a **local AI assistant** to help you work faster. Here are the plain-English guidelines:

- **AI is a helper, not a replacement.** It drafts proposals, briefings, and replies that you should **review and personalise** before sending.
- **It uses the facts you give it.** The more accurate your client details, the better the output.
- **It labels its assumptions.** AI never claims availability, prices, or supplier confirmations unless you provide them.
- **Generation takes a little time.** Complex proposals can take a minute or two, which is normal.

---

## 5. The Member Portal (for travellers)

The Member Portal is your **private space** to manage your travel with Lanai.

### 5.1 Trip Dashboard
Your personal overview showing your **active and upcoming trips**, their status, and quick access to your documents and proposals.

### 5.2 Proposals
View the **proposals** your advisor prepared for you, including accommodation, itinerary, experiences, and investment, in a clean, client-ready format. You can review and respond.

### 5.3 Documents
Access your **travel documents** (itineraries, confirmations, and vouchers) in one secure place.

### 5.4 Billing
View your **invoices and payment status** for your trips.

### 5.5 Profile
Manage your **personal preferences**, such as favourite destinations, cabin class, room type, and dietary needs, so your advisor can tailor everything to you.

### 5.6 Messages
Chat securely with your advisor through the portal. **You will receive an instant reply around the clock** because the AI concierge acknowledges your message right away and routes it to your advisor, ensuring you are never left waiting.

---

## 6. Services at a Glance

| Service | Where | What it does |
|---------|-------|--------------|
| **Live CRM** | Advisor Portal | Every client and contact in one place |
| **AI Proposals** | Advisor Portal | Drafts complete client proposals in minutes |
| **AI Intelligence** | Advisor Portal | Analyses each client for opportunities & risks |
| **AI Morning Briefing** | Advisor Portal | Daily digest of priorities and follow-ups |
| **WhatsApp AI** | Advisor Portal | Triage + draft replies for WhatsApp messages |
| **Unified Inbox** | Advisor Portal | All client conversations in one place |
| **24/7 AI Auto-Reply** | Both portals | Instant AI replies to member messages, day or night |
| **Supplier Network** | Advisor Portal | Vetted hotels, yachts, jets, transfers & experiences |
| **Invoicing** | Advisor Portal | Client & commission invoices |
| **Analytics** | Advisor Portal | Revenue and pipeline at a glance |
| **Client Portal** | Members | Trips, documents, proposals, billing & preferences |

---

## 7. Frequently Asked Questions

**Q: I received a "Too many requests" message. What should I do?**  
A: This is a temporary safeguard. Wait a few minutes and try again.

**Q: How long does an AI proposal take?**  
A: Usually 1–2 minutes. The platform shows you when it is ready.

**Q: Can a client see my internal notes?**  
A: No. The client portal only shows what you choose to share (proposals, documents, trips, billing).

**Q: Where do WhatsApp messages appear?**  
A: In the **Inbox** and the **WhatsApp** page, with an AI-drafted reply ready for you.

**Q: Will members always get a reply?**  
A: Yes. The 24/7 AI concierge replies to every member message automatically, providing a personalised reply when available or a warm acknowledgment otherwise.

**Q: I cannot log in to the client portal.**  
A: Check your email and PIN. If you have forgotten your PIN, contact your advisor to resend an invitation.

---

## 8. Getting Help

- **Advisors:** Contact your platform administrator for access or support.
- **Members:** Your dedicated Lanai advisor is your first point of contact for anything in the portal.

---

*Lanai Lifestyle: Luxury travel, intelligently delivered.*
"""

user_guide_html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lanai Lifestyle User Guide</title>
<style>
  @page {
    size: A4 portrait;
    margin: 18mm 16mm 18mm 16mm;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1f2937;
    line-height: 1.6;
    margin: 0;
    background: #fff;
    font-size: 14px;
  }
  .wrap {
    max-width: 860px;
    margin: 0 auto;
    padding: 20px 24px 60px;
  }
  h1 {
    font-size: 30px;
    color: #14532d;
    border-bottom: 3px solid #16a34a;
    padding-bottom: 10px;
    margin-top: 0;
  }
  h2 {
    font-size: 22px;
    color: #14532d;
    margin-top: 36px;
    margin-bottom: 12px;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 6px;
    page-break-after: avoid;
  }
  h3 {
    font-size: 17px;
    color: #166534;
    margin-top: 24px;
    margin-bottom: 8px;
    page-break-after: avoid;
  }
  p, li {
    font-size: 14px;
    color: #374151;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 14px 0;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid #d1d5db;
    padding: 8px 10px;
    text-align: left;
    font-size: 13px;
  }
  th {
    background: #f0fdf4;
    color: #14532d;
    font-weight: 600;
  }
  .screenshot-container {
    page-break-inside: avoid;
    margin: 12px 0 16px;
  }
  img {
    max-width: 100%;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    display: block;
    margin: 0 auto;
    box-shadow: 0 2px 6px rgba(0,0,0,0.06);
  }
  .caption {
    font-size: 12px;
    color: #6b7280;
    margin-top: 4px;
    margin-bottom: 14px;
    text-align: center;
    font-style: italic;
  }
  blockquote {
    border-left: 4px solid #16a34a;
    background: #f0fdf4;
    padding: 10px 14px;
    margin: 14px 0;
    border-radius: 0 6px 6px 0;
    page-break-inside: avoid;
  }
  .tip {
    background: #fffbeb;
    border-left: 4px solid #f59e0b;
    padding: 10px 14px;
    border-radius: 0 6px 6px 0;
    margin: 10px 0;
    page-break-inside: avoid;
  }
  .footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
    color: #6b7280;
    font-size: 13px;
    text-align: center;
    page-break-inside: avoid;
  }
  ol, ul {
    padding-left: 20px;
  }
  ol li, ul li {
    margin: 4px 0;
  }
  code {
    background: #f3f4f6;
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 12.5px;
    color: #111827;
  }
  .section-block {
    page-break-inside: avoid;
  }
</style>
</head>
<body>
<div class="wrap">

<h1>Lanai Lifestyle User Guide</h1>
<p><strong>Version 2.0</strong> · A comprehensive step-by-step guide for navigating and using the platform.</p>
<p>Welcome! This guide walks you through the <strong>Lanai Lifestyle</strong> platform, one screen at a time, in simple everyday language. By the end you will be able to navigate the entire application, use every service, and understand what the AI is doing for you without needing to call anyone for help.</p>

<h2>1. What is Lanai?</h2>
<p>Lanai is a <strong>luxury travel concierge</strong> that lives on your computer. It helps a travel team run their business and helps members (the travellers) see and manage their trips in one place.</p>
<p>There are <strong>two areas</strong>, like two doors into the same building:</p>
<table>
<tr><th>Area</th><th>Who uses it</th><th>What it's for</th></tr>
<tr><td><strong>Advisor Portal</strong></td><td>The Lanai team</td><td>Run the business: clients, trips, proposals, AI assistance, invoices</td></tr>
<tr><td><strong>Member Portal</strong></td><td>The travellers (members)</td><td>See your trips, documents, proposals, and message your advisor</td></tr>
</table>
<p>The platform has an <strong>AI assistant built in</strong>. It helps write proposals, prepare daily briefings, understand clients, and draft replies to messages. Think of it as a fast assistant that drafts content for you to review before sending.</p>

<h2>2. Logging In</h2>
<h3>2.1 Advisor Portal</h3>
<ol>
<li>Open your browser and go to the web address your team gave you (for example <code>https://lanai.newfire.app</code>).</li>
<li>Click the <strong>Sign In</strong> button.</li>
<li>You will be taken to a secure login page.</li>
<li>Type your <strong>email</strong> and <strong>password</strong>.</li>
<li>Click <strong>Sign In</strong> again to land on your <strong>Dashboard</strong>.</li>
</ol>
<div class="tip">If you forget your password, click the <strong>"Forgot password"</strong> link on the login page.</div>

<h3>2.2 Member Portal</h3>
<ol>
<li>Go to the member link (usually ends in <code>/client</code>).</li>
<li>Type your <strong>email</strong> and your <strong>PIN</strong>.</li>
<li>You will land on your personal <strong>Trip Dashboard</strong>.</li>
</ol>
<div class="tip">First time? Your advisor sends you an invitation email with a link to set your PIN.</div>

<h2>3. The Advisor Portal: Screen by Screen</h2>
<p>The <strong>left-hand menu</strong> is your map. Click any item to move between screens. Below is every screen, what it's for, and how to use it.</p>

<div class="section-block">
<h3>3.1 Dashboard (Home Base)</h3>
<div class="screenshot-container">
  <img src="screenshots/01-dashboard.png" alt="Dashboard">
  <div class="caption">The Dashboard: your at-a-glance overview.</div>
</div>
<p>This is your <strong>at-a-glance overview</strong>. It shows live numbers pulled from your records: <strong>Total clients</strong>, <strong>Open travel requests</strong>, <strong>Active members</strong>, and <strong>Pipeline value</strong>.</p>
<p><strong>How to use it:</strong> Start here every day. It tells you what needs attention at a glance.</p>
</div>

<div class="section-block">
<h3>3.2 Clients (Client Directory)</h3>
<div class="screenshot-container">
  <img src="screenshots/02-clients.png" alt="Clients">
  <div class="caption">The Clients screen: searchable list of every client.</div>
</div>
<p>A searchable list of <strong>every client</strong>.</p>
<ol>
<li>Use the <strong>search box</strong> to find someone by name, email, or city.</li>
<li>Click the <strong>Add Client</strong> button to add a new person.</li>
<li>See each client's contact details at a glance.</li>
</ol>
</div>

<div class="section-block">
<h3>3.3 Members (Membership Base)</h3>
<div class="screenshot-container">
  <img src="screenshots/03-members.png" alt="Members">
  <div class="caption">The Members screen: your active membership base.</div>
</div>
<p>Your <strong>active membership base</strong>. Each member has a tier (Platinum, Gold, Silver) and status.</p>
<p><strong>How to use it:</strong> See who your members are, their tier, and their details. Click into a member to see their profile and history.</p>
</div>

<div class="section-block">
<h3>3.4 Travel Requests (Trip Pipeline)</h3>
<div class="screenshot-container">
  <img src="screenshots/04-travel-requests.png" alt="Travel Requests">
  <div class="caption">The Travel Requests screen: every trip request from first enquiry to booking.</div>
</div>
<p>Every trip a client has asked for, from first request to completed booking.</p>
<ol>
<li><strong>Search</strong> by destination or member.</li>
<li>Use the <strong>status buttons</strong> at the top to filter (New, In Progress, Proposal Sent, Booked, Completed, Cancelled).</li>
<li>Use the <strong>Update Status</strong> dropdown on any row to move a request to its next stage.</li>
</ol>
<blockquote><strong>What the stages mean:</strong> New (just asked) → In Progress (being worked on) → Proposal Sent (you've sent them options) → Booked (confirmed) → Completed (trip done) → Cancelled.</blockquote>
</div>

<div class="section-block">
<h3>3.5 Proposals (AI Co-Pilot)</h3>
<div class="screenshot-container">
  <img src="screenshots/05-proposals.png" alt="Proposals">
  <div class="caption">The Proposal Engine: the AI writes client-ready proposals for you.</div>
</div>
<p>The <strong>AI proposal generator</strong>. Instead of writing a trip proposal from scratch, the AI drafts it for you.</p>
<ol>
<li>Enter the client's details, including name, destination, dates, travellers, budget, and preferences.</li>
<li>Click <strong>Generate</strong>.</li>
<li>The AI writes a complete, client-ready proposal: accommodation, a day-by-day itinerary, experiences, estimated cost, and next steps.</li>
<li><strong>Review it, tweak it, and send it.</strong></li>
</ol>
<blockquote><strong>A note on AI:</strong> Generation can take a minute or two. The AI only uses the facts you give it and clearly labels any assumptions. It never invents confirmed prices or availability.</blockquote>
</div>

<div class="section-block">
<h3>3.6 Intelligence (Client Insights)</h3>
<div class="screenshot-container">
  <img src="screenshots/06-intelligence.png" alt="Intelligence">
  <div class="caption">The Intelligence screen: the AI analyses each client's profile.</div>
</div>
<p>A per-member <strong>client intelligence</strong> view. Pick a member and the AI looks at their profile to surface a summary of their travel history and preferences, open opportunities, and risks or gaps.</p>
<p><strong>How to use it:</strong> Select a member, then read the AI's summary to get up to speed before you speak with them.</p>
</div>

<div class="section-block">
<h3>3.7 Morning Briefing (Daily Priorities)</h3>
<div class="screenshot-container">
  <img src="screenshots/07-morning-briefing.png" alt="Morning Briefing">
  <div class="caption">The Morning Briefing: a daily digest of priorities.</div>
</div>
<p>Generates a <strong>daily briefing</strong> with a digest of the day's clients, follow-ups, and priorities.</p>
<p><strong>How to use it:</strong> Click <strong>Generate Briefing</strong>. The AI pulls together what matters for the day so you know where to focus. (This can take a minute or two.)</p>
</div>

<div class="section-block">
<h3>3.8 WhatsApp (AI Message Bridge)</h3>
<div class="screenshot-container">
  <img src="screenshots/08-whatsapp.png" alt="WhatsApp">
  <div class="caption">The WhatsApp screen: the AI triages messages and drafts replies.</div>
</div>
<p>When a client messages you on WhatsApp, the platform recognises the contact, runs <strong>AI triage</strong> (intent, urgency, mood), <strong>drafts a reply</strong> for you to review and send, and logs a <strong>note</strong> and <strong>task</strong> against the client automatically.</p>
<p><strong>How to use it:</strong> Open a message, review the AI's suggested reply, edit if you like, and send.</p>
</div>

<div class="section-block">
<h3>3.9 Inbox (Unified Messaging)</h3>
<div class="screenshot-container">
  <img src="screenshots/09-inbox.png" alt="Inbox">
  <div class="caption">The unified Inbox: all client conversations in one place.</div>
</div>
<p>Your <strong>unified messaging inbox</strong> (powered by Chatwoot). All client conversations across WhatsApp, email, and portal messages in one place.</p>
<ol>
<li>See all conversations and who's assigned to them.</li>
<li>Reply directly.</li>
<li>Use the <strong>AI Draft</strong> button to get a suggested reply, then edit and send.</li>
</ol>
<blockquote><strong>24/7 AI auto-reply:</strong> When a member sends a message through the portal, the platform <strong>replies automatically around the clock</strong> so no message ever goes unanswered, even outside working hours. Your manual replies always take priority, and the system never replies to its own messages.</blockquote>
</div>

<div class="section-block">
<h3>3.10 Communication Hub (Client Overview)</h3>
<div class="screenshot-container">
  <img src="screenshots/10-communication-hub.png" alt="Communication Hub">
  <div class="caption">The Communication Hub: a one-stop view of a client's communications.</div>
</div>
<p>A <strong>unified view</strong> of a client's communications and activity to see the full picture of your relationship at a glance.</p>
</div>

<div class="section-block">
<h3>3.11 Analytics (Revenue & Pipeline)</h3>
<div class="screenshot-container">
  <img src="screenshots/11-analytics.png" alt="Analytics">
  <div class="caption">The Analytics screen: revenue and pipeline.</div>
</div>
<p><strong>Revenue analytics</strong> showing income, commissions, and pipeline value to track business performance.</p>
</div>

<div class="section-block">
<h3>3.12 Invoicing (Billing & Commissions)</h3>
<div class="screenshot-container">
  <img src="screenshots/12-invoicing.png" alt="Invoicing">
  <div class="caption">The Invoicing screen: create and track invoices.</div>
</div>
<p>Create and manage <strong>client invoices</strong> and <strong>supplier commission invoices</strong>.</p>
<p><strong>How to use it:</strong> Create an invoice and track its status (Draft, Sent, Paid, or Overdue) along with due dates.</p>
</div>

<div class="section-block">
<h3>3.13 Task Templates (Workflow Automation)</h3>
<div class="screenshot-container">
  <img src="screenshots/13-task-templates.png" alt="Task Templates">
  <div class="caption">The Task Templates screen: pre-made templates for common workflows.</div>
</div>
<p><strong>Pre-made templates</strong> for common tasks and workflows so you do not have to start from scratch each time.</p>
<p><strong>How to use it:</strong> Pick a template, and it fills in the standard steps for you to adjust and use.</p>
</div>

<div class="section-block">
<h3>3.14 Suppliers (Vetted Partner Network)</h3>
<div class="screenshot-container">
  <img src="screenshots/14-suppliers.png" alt="Suppliers">
  <div class="caption">The Suppliers screen: your vetted supplier network.</div>
</div>
<p>Your <strong>vetted supplier network</strong> covering hotels, villas, yachts, jets, transfers, and experiences.</p>
<p><strong>How to use it:</strong> Browse suppliers, see their category, location, rating, preferred status, and contact details.</p>
</div>

<div class="section-block">
<h3>3.15 Supplier Services (Service Offerings)</h3>
<div class="screenshot-container">
  <img src="screenshots/15-supplier-services.png" alt="Supplier Services">
  <div class="caption">The Supplier Services screen: the services each supplier provides.</div>
</div>
<p>The <strong>services each supplier provides</strong> (rooms, dining, experiences, and more).</p>
<p><strong>How to use it:</strong> Add a service to a supplier, or submit an inquiry for a service you need for a client.</p>
</div>

<div class="section-block">
<h3>3.16 Settings (Platform Configuration)</h3>
<div class="screenshot-container">
  <img src="screenshots/16-settings.png" alt="Settings">
  <div class="caption">The Settings screen: account and platform configuration.</div>
</div>
<p>Your <strong>account and platform settings</strong> covering profile details, preferences, and system configuration.</p>
</div>

<h2>4. AI Services: What to Expect</h2>
<p>The platform uses a <strong>local AI assistant</strong> to help you work faster. Here are the plain-English guidelines:</p>
<ul>
<li><strong>AI is a helper, not a replacement.</strong> It drafts proposals, briefings, and replies that you should <strong>review and personalise</strong> before sending.</li>
<li><strong>It uses the facts you give it.</strong> The more accurate your client details, the better the output.</li>
<li><strong>It labels its assumptions.</strong> AI never claims availability, prices, or supplier confirmations unless you provide them.</li>
<li><strong>Generation takes a little time.</strong> Complex proposals can take a minute or two, which is normal.</li>
</ul>

<h2>5. The Member Portal (for travellers)</h2>
<p>The Member Portal is your <strong>private space</strong> to manage your travel with Lanai.</p>
<h3>5.1 Trip Dashboard</h3>
<p>Your personal overview showing your <strong>active and upcoming trips</strong>, their status, and quick access to your documents and proposals.</p>
<h3>5.2 Proposals</h3>
<p>View the <strong>proposals</strong> your advisor prepared for you, including accommodation, itinerary, experiences, and investment, in a clean, client-ready format. You can review and respond.</p>
<h3>5.3 Documents</h3>
<p>Access your <strong>travel documents</strong> (itineraries, confirmations, and vouchers) in one secure place.</p>
<h3>5.4 Billing</h3>
<p>View your <strong>invoices and payment status</strong> for your trips.</p>
<h3>5.5 Profile</h3>
<p>Manage your <strong>personal preferences</strong>, such as favourite destinations, cabin class, room type, and dietary needs, so your advisor can tailor everything to you.</p>
<h3>5.6 Messages</h3>
<p>Chat securely with your advisor through the portal. <strong>You will receive an instant reply around the clock</strong> because the AI concierge acknowledges your message right away and routes it to your advisor, ensuring you are never left waiting.</p>

<h2>6. Services at a Glance</h2>
<table>
<tr><th>Service</th><th>Where</th><th>What it does</th></tr>
<tr><td><strong>Live CRM</strong></td><td>Advisor Portal</td><td>Every client and contact in one place</td></tr>
<tr><td><strong>AI Proposals</strong></td><td>Advisor Portal</td><td>Drafts complete client proposals in minutes</td></tr>
<tr><td><strong>AI Intelligence</strong></td><td>Advisor Portal</td><td>Analyses each client for opportunities &amp; risks</td></tr>
<tr><td><strong>AI Morning Briefing</strong></td><td>Advisor Portal</td><td>Daily digest of priorities and follow-ups</td></tr>
<tr><td><strong>WhatsApp AI</strong></td><td>Advisor Portal</td><td>Triage + draft replies for WhatsApp messages</td></tr>
<tr><td><strong>Unified Inbox</strong></td><td>Advisor Portal</td><td>All client conversations in one place</td></tr>
<tr><td><strong>24/7 AI Auto-Reply</strong></td><td>Both portals</td><td>Instant AI replies to member messages, day or night</td></tr>
<tr><td><strong>Supplier Network</strong></td><td>Advisor Portal</td><td>Vetted hotels, yachts, jets, transfers &amp; experiences</td></tr>
<tr><td><strong>Invoicing</strong></td><td>Advisor Portal</td><td>Client &amp; commission invoices</td></tr>
<tr><td><strong>Analytics</strong></td><td>Advisor Portal</td><td>Revenue and pipeline at a glance</td></tr>
<tr><td><strong>Client Portal</strong></td><td>Members</td><td>Trips, documents, proposals, billing &amp; preferences</td></tr>
</table>

<h2>7. Frequently Asked Questions</h2>
<p><strong>Q: I received a "Too many requests" message. What should I do?</strong><br>A: This is a temporary safeguard. Wait a few minutes and try again.</p>
<p><strong>Q: How long does an AI proposal take?</strong><br>A: Usually 1–2 minutes. The platform shows you when it is ready.</p>
<p><strong>Q: Can a client see my internal notes?</strong><br>A: No. The client portal only shows what you choose to share (proposals, documents, trips, billing).</p>
<p><strong>Q: Where do WhatsApp messages appear?</strong><br>A: In the <strong>Inbox</strong> and the <strong>WhatsApp</strong> page, with an AI-drafted reply ready for you.</p>
<p><strong>Q: Will members always get a reply?</strong><br>A: Yes. The 24/7 AI concierge replies to every member message automatically, providing a personalised reply when available or a warm acknowledgment otherwise.</p>
<p><strong>Q: I cannot log in to the client portal.</strong><br>A: Check your email and PIN. If you have forgotten your PIN, contact your advisor to resend an invitation.</p>

<h2>8. Getting Help</h2>
<ul>
<li><strong>Advisors:</strong> Contact your platform administrator for access or support.</li>
<li><strong>Members:</strong> Your dedicated Lanai advisor is your first point of contact for anything in the portal.</li>
</ul>

<div class="footer">Lanai Lifestyle: Luxury travel, intelligently delivered.</div>

</div>
</body>
</html>
"""

# Save updated Markdown and HTML
base_dir = "/Users/oluwajobamalomo/lanai/user-guide"
md_path = os.path.join(base_dir, "Lanai_User_Guide.md")
html_path = os.path.join(base_dir, "Lanai_User_Guide.html")
pdf_path = os.path.join(base_dir, "Lanai_User_Guide.pdf")

with open(md_path, "w", encoding="utf-8") as f:
    f.write(user_guide_md.strip() + "\\n")
print(f"Updated {md_path}")

with open(html_path, "w", encoding="utf-8") as f:
    f.write(user_guide_html.strip() + "\\n")
print(f"Updated {html_path}")

# Compile PDF via Google Chrome
chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
cmd = [
    chrome_path,
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--no-pdf-header-footer",
    f"--print-to-pdf={pdf_path}",
    html_path
]

print("Compiling PDF...")
res = subprocess.run(cmd, capture_output=True, text=True)
print("Return code:", res.returncode)
if os.path.exists(pdf_path):
    print(f"Successfully generated {pdf_path} ({os.path.getsize(pdf_path)} bytes)")
else:
    print("Failed to generate PDF")
