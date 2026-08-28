import { useState } from "react";
import { Crown, ArrowRight, Sparkles, MessageSquare, BarChart3, Building2, CheckCircle2, Moon, Sun } from "lucide-react";
import { getLoginUrl } from "../const";

const STEPS = [
  { num: "01", title: "Enquiry", desc: "Client reaches out via WhatsApp, email, or the member portal. Every channel lands in one unified inbox.", icon: MessageSquare },
  { num: "02", title: "Build", desc: "The AI co-pilot drafts a bespoke proposal from the client's profile, preferences, and trip details. The advisor refines, not starts from blank.", icon: Sparkles },
  { num: "03", title: "Propose", desc: "Send the interactive proposal. The client reviews, comments, and approves in their private branded portal.", icon: ArrowRight },
  { num: "04", title: "Book", desc: "Client confirms and pays securely. The booking, supplier confirmation, and commission are tracked automatically.", icon: CheckCircle2 },
  { num: "05", title: "Earn", desc: "Commission recorded at completion. Pipeline value, conversion rate, and repeat clients visible on the business scorecard.", icon: BarChart3 },
];

const FEATURES = [
  { title: "AI-Powered Proposals", desc: "The proposal co-pilot drafts bespoke itineraries in the Lanai voice, grounded in each client's full history.", icon: Sparkles },
  { title: "Curated Suppliers", desc: "A managed Virtuoso catalog with room rates, tiers, and amenities. One-click shortlist generation and approval.", icon: Building2 },
  { title: "Unified Inbox", desc: "WhatsApp, email, and portal messages threaded per client. AI triage and draft replies for every inbound.", icon: MessageSquare },
  { title: "Client Intelligence", desc: "Preferences, churn risk, lifetime value, and next-trip prompts learned and recalled automatically.", icon: BarChart3 },
];

const STATS = [
  { v: "7", l: "Stage lifecycle" },
  { v: "3", l: "Membership tiers" },
  { v: "2", l: "Connected portals" },
  { v: "Local", l: "Private AI models" },
];

export default function LandingPage() {
  const [dark, setDark] = useState(false);

  const c = dark
    ? {
        bg: "#0f1a16", card: "#1a2820", border: "#2a3a32",
        ink: "#e8e4d8", muted: "#8a9a92",
        forest: "#7fb495", gold: "#d9b968",
        green: "#2c5e45", ivory: "#1a2820",
      }
    : {
        bg: "#fbfaf2", card: "#ffffff", border: "#ddd6c2",
        ink: "#1a2a22", muted: "#5e6b62",
        forest: "#2c5e45", gold: "#c8a24a",
        green: "#2c5e45", ivory: "#fbfaf2",
      };

  return (
    <div style={{ background: c.bg, color: c.ink, fontFamily: "'DM Sans', system-ui, sans-serif", minHeight: "100vh" }}>
      {/* Nav */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 40px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${c.gold}, ${dark ? "#b8924e" : "#b8924e"})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Crown style={{ width: 18, height: 18, color: c.bg }} />
          </div>
          <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 18, color: c.ink }}>Lanai Lifestyle</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => setDark(d => !d)} style={{ background: "none", border: "none", cursor: "pointer", color: c.muted, padding: 4 }}>
            {dark ? <Sun style={{ width: 18, height: 18 }} /> : <Moon style={{ width: 18, height: 18 }} />}
          </button>
          <button
            onClick={() => { window.location.href = getLoginUrl(); }}
            style={{ background: c.green, color: "#fbfaf2", border: "none", borderRadius: 999, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "60px 40px 40px", textAlign: "center" }}>
        <p style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: c.gold, marginBottom: 16 }}>
          The Intelligence Layer for Luxury Travel Concierge
        </p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: "clamp(32px, 5vw, 48px)", lineHeight: 1.1, margin: "0 0 16px", color: c.ink }}>
          Your clients expect extraordinary.
          <br />
          Your tools should make it effortless.
        </h1>
        <p style={{ fontSize: 18, color: c.muted, maxWidth: 580, margin: "0 auto 32px", lineHeight: 1.6 }}>
          Lanai provides the AI, the suppliers, and the platform to deliver complex luxury experiences with ease, from first enquiry to payout.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => { window.location.href = getLoginUrl(); }}
            style={{ background: c.green, color: "#fbfaf2", border: "none", borderRadius: 999, padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            Sign in to the advisor portal
          </button>
          <a href="/client" style={{ display: "inline-block", background: "transparent", color: c.ink, border: `1px solid ${c.border}`, borderRadius: 999, padding: "14px 28px", fontSize: 15, fontWeight: 600, textDecoration: "none" }}>
            Member portal
          </a>
        </div>
      </section>

      {/* 5-step flow */}
      <section style={{ maxWidth: 1100, margin: "40px auto", padding: "0 40px" }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 28, textAlign: "center", marginBottom: 8, color: c.ink }}>
          From enquiry to payout in five steps
        </h2>
        <p style={{ textAlign: "center", color: c.muted, marginBottom: 32, fontSize: 15 }}>
          No spreadsheets. No chasing. Just advisory.
        </p>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.num} style={{ flex: "1 1 0", minWidth: 180, background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: dark ? "#2c5e45" : "#efe2c2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon style={{ width: 18, height: 18, color: dark ? "#7fb495" : "#2c5e45" }} />
                  </div>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: c.muted }}>{s.num}</span>
                </div>
                <h3 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 18, margin: "0 0 6px", color: c.ink }}>{s.title}</h3>
                <p style={{ fontSize: 13, color: c.muted, lineHeight: 1.5, margin: 0 }}>{s.desc}</p>
                {i < STEPS.length - 1 && (
                  <div style={{ marginTop: 12, color: c.gold, fontSize: 12 }}>{"→"}</div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 1100, margin: "40px auto", padding: "0 40px" }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 28, textAlign: "center", marginBottom: 24, color: c.ink }}>
          The concierge platform for luxury travel advisors
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ width: 44, height: 44, borderRadius: 11, background: dark ? "#2c5e45" : "#efe2c2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                  <Icon style={{ width: 22, height: 22, color: dark ? "#7fb495" : "#2c5e45" }} />
                </div>
                <h3 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 17, margin: "0 0 6px", color: c.ink }}>{f.title}</h3>
                <p style={{ fontSize: 13.5, color: c.muted, lineHeight: 1.55, margin: 0 }}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Stats */}
      <section style={{ maxWidth: 900, margin: "40px auto", padding: "0 40px" }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
          {STATS.map((s) => (
            <div key={s.l} style={{ textAlign: "center", flex: "1 1 120px", maxWidth: 200 }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 36, color: c.gold, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted, marginTop: 6 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 700, margin: "48px auto", padding: "40px", textAlign: "center", background: dark ? "#1a2820" : "#f4efdf", borderRadius: 16, border: `1px solid ${c.border}` }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 26, margin: "0 0 12px", color: c.ink }}>
          The advisory model is evolving. Your toolkit should evolve with it.
        </h2>
        <p style={{ color: c.muted, marginBottom: 24, fontSize: 15 }}>
          Lanai is built for luxury travel advisors who want to spend less time on operations and more time with clients.
        </p>
        <button
          onClick={() => { window.location.href = getLoginUrl(); }}
          style={{ background: c.green, color: "#fbfaf2", border: "none", borderRadius: 999, padding: "14px 32px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
        >
          Sign in to the advisor portal
        </button>
        <p style={{ marginTop: 16, fontSize: 12, color: c.muted }}>
          Member? <a href="/client" style={{ color: c.gold, textDecoration: "underline" }}>Visit the member portal</a>
        </p>
      </section>

      {/* Footer */}
      <footer style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 40px", borderTop: `1px solid ${c.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Crown style={{ width: 16, height: 16, color: c.gold }} />
            <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 14, color: c.ink }}>Lanai Lifestyle</span>
          </div>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: c.muted, margin: 0 }}>
            The luxury concierge platform connecting travel advisors to vetted suppliers and intelligent tools.
          </p>
        </div>
        <p style={{ fontFamily: "monospace", fontSize: 10, color: c.muted, marginTop: 12, textAlign: "center" }}>
          {new Date().getFullYear()} Lanai Lifestyle. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
