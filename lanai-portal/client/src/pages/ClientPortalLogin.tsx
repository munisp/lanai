/**
 * Lanai — Member Portal Login
 * Route: /client
 * Authenticates members via email + PIN against the server-side session API.
 * No hardcoded credentials — all validation is server-side with bcrypt.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Crown, Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

export default function ClientPortalLogin() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);

  const utils = trpc.useUtils();

  const loginMutation = trpc.memberAuth.login.useMutation({
    onSuccess: async () => {
      // Invalidate the me query so MemberPortalGuard picks up the new session
      await utils.memberAuth.me.invalidate();
      navigate("/client/dashboard");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email, pin });
  };

  const isLoading = loginMutation.isPending;
  const error = loginMutation.error?.message;

  return (
    <div className="min-h-screen flex" style={{ background: "oklch(0.97 0.015 80)" }}>
      {/* Left branding panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ background: "oklch(0.25 0.06 145)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "oklch(0.72 0.12 75)" }}
          >
            <Crown className="w-5 h-5 text-white" />
          </div>
          <span
            className="text-white font-semibold text-lg tracking-wide"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Lanai Lifestyle
          </span>
        </div>

        <div>
          <blockquote
            className="text-white/80 text-xl leading-relaxed italic mb-6"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            "Every journey begins with a conversation. Your dedicated advisor is here to craft
            experiences that exceed every expectation."
          </blockquote>
          <div className="flex gap-6">
            {["Bespoke Itineraries", "24/7 Concierge", "Private Access"].map((feat) => (
              <div key={feat} className="text-center">
                <div
                  className="w-1 h-1 rounded-full mx-auto mb-2"
                  style={{ background: "oklch(0.72 0.12 75)" }}
                />
                <span className="text-white/60 text-xs tracking-widest uppercase">{feat}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/30 text-xs">© 2025 Lanai Lifestyle. All rights reserved.</p>
      </div>

      {/* Right login panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <Crown className="w-6 h-6" style={{ color: "oklch(0.35 0.09 145)" }} />
            <span
              className="font-semibold"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Lanai Lifestyle
            </span>
          </div>

          <h1
            className="text-3xl font-bold mb-2 text-gray-900"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Member Portal
          </h1>
          <p className="text-gray-500 mb-8 text-sm">
            Sign in to view your trips, submit requests, and connect with your advisor.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoComplete="email"
                className="bg-white border-gray-200 focus:border-gray-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wider">
                Member PIN
              </label>
              <div className="relative">
                <Input
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  placeholder="Your numeric PIN"
                  required
                  autoComplete="current-password"
                  inputMode="numeric"
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
              <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full gap-2 text-white"
              style={{ background: "oklch(0.35 0.09 145)" }}
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-200 space-y-3">
            <p className="text-xs text-gray-400 text-center">
              New member?{" "}
              <span className="text-gray-500">
                Check your email for an invitation link from your advisor.
              </span>
            </p>
            <p className="text-xs text-gray-400 text-center">
              Advisor?{" "}
              <a href="/" className="underline hover:text-gray-600">
                Go to the advisor portal
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
