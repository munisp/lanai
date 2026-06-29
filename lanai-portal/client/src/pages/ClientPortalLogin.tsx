/**
 * Lanai — Client Portal Login
 * Consumer-facing: lighter, warmer, more personal than the advisor portal
 * Auth: demo PIN-based stored in localStorage (no real auth needed for demo)
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Crown, Eye, EyeOff, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Demo credentials for client portal
const DEMO_ACCOUNTS = [
  { email: "sarah.chen@lanai.com",    pin: "1234", name: "Sarah Chen",            tier: "Platinum" },
  { email: "james@whitfield.co.uk",   pin: "5678", name: "James Whitfield",       tier: "Gold" },
  { email: "h.family@harrington.com", pin: "9012", name: "The Harrington Family", tier: "Platinum" },
];

export default function ClientPortalLogin() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    await new Promise(r => setTimeout(r, 600)); // Simulate auth delay

    const account = DEMO_ACCOUNTS.find(a => a.email.toLowerCase() === email.toLowerCase() && a.pin === pin);
    if (account) {
      localStorage.setItem("lanai_client_session", JSON.stringify({
        email: account.email,
        name: account.name,
        tier: account.tier,
        loginAt: new Date().toISOString(),
      }));
      navigate("/client/dashboard");
    } else {
      setError("Invalid email or PIN. Try: sarah.chen@lanai.com / 1234");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex" style={{ background: "oklch(0.97 0.015 80)" }}>
      {/* Left panel — branding */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ background: "oklch(0.25 0.06 145)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "oklch(0.72 0.12 75)" }}>
            <Crown className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-semibold text-lg tracking-wide" style={{ fontFamily: "'Playfair Display', serif" }}>
            Lanai Lifestyle
          </span>
        </div>

        <div>
          <blockquote className="text-white/80 text-xl leading-relaxed italic mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
            "Every journey begins with a conversation. Your dedicated advisor is here to craft experiences that exceed every expectation."
          </blockquote>
          <div className="flex gap-6">
            {["Bespoke Itineraries", "24/7 Concierge", "Private Access"].map(feat => (
              <div key={feat} className="text-center">
                <div className="w-1 h-1 rounded-full mx-auto mb-2" style={{ background: "oklch(0.72 0.12 75)" }} />
                <span className="text-white/60 text-xs tracking-widest uppercase">{feat}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/30 text-xs">© 2025 Lanai Lifestyle. All rights reserved.</p>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <Crown className="w-6 h-6" style={{ color: "oklch(0.35 0.09 145)" }} />
            <span className="font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>Lanai Lifestyle</span>
          </div>

          <h1 className="text-3xl font-bold mb-2 text-gray-900" style={{ fontFamily: "'Playfair Display', serif" }}>
            Member Portal
          </h1>
          <p className="text-gray-500 mb-8 text-sm">
            Sign in to view your trips, submit requests, and connect with your advisor.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wider">Email Address</label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="bg-white border-gray-200 focus:border-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wider">Member PIN</label>
              <div className="relative">
                <Input
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  placeholder="4-digit PIN"
                  maxLength={4}
                  required
                  className="bg-white border-gray-200 focus:border-gray-400 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full gap-2 text-white"
              style={{ background: "oklch(0.35 0.09 145)" }}
            >
              {loading ? "Signing in…" : <>Sign In <ArrowRight className="w-4 h-4" /></>}
            </Button>
          </form>

          <div className="mt-8 p-4 rounded-xl border border-dashed border-gray-200 bg-white/60">
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Demo Credentials</p>
            <div className="space-y-1">
              {DEMO_ACCOUNTS.map(a => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => { setEmail(a.email); setPin(a.pin); }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 transition-colors"
                >
                  <span className="text-xs font-medium text-gray-700">{a.name}</span>
                  <span className="text-xs text-gray-400 ml-2">({a.tier})</span>
                </button>
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            Need help?{" "}
            <a href="mailto:concierge@lanai.com" className="underline hover:text-gray-600">
              Contact your advisor
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
