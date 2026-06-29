/**
 * Lanai — Member Onboarding
 * Reached via /client/onboard?token=<invite_token>
 * Validates the invitation token and lets the member set their PIN.
 */
import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Crown, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

export default function ClientPortalOnboard() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [validationError, setValidationError] = useState("");

  const acceptMutation = trpc.memberAuth.acceptInvite.useMutation({
    onSuccess: () => {
      navigate("/client/dashboard");
    },
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(0.97 0.015 80)" }}>
        <div className="text-center max-w-sm px-8">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-400" />
          <h1 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
            Invalid Invitation
          </h1>
          <p className="text-gray-500 text-sm">
            This invitation link is missing or malformed. Please check your email for the correct link.
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    if (pin.length < 6) {
      setValidationError("PIN must be at least 6 digits.");
      return;
    }
    if (!/^\d+$/.test(pin)) {
      setValidationError("PIN must contain only digits.");
      return;
    }
    if (pin !== confirmPin) {
      setValidationError("PINs do not match.");
      return;
    }

    acceptMutation.mutate({ token, pin });
  };

  const isLoading = acceptMutation.isPending;
  const serverError = acceptMutation.error?.message;

  return (
    <div className="min-h-screen flex" style={{ background: "oklch(0.97 0.015 80)" }}>
      {/* Left branding panel */}
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
          <h2 className="text-white text-3xl font-bold mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
            Welcome to your<br />member portal.
          </h2>
          <p className="text-white/60 text-sm leading-relaxed">
            Your dedicated advisor has invited you to access your bespoke travel dashboard.
            Set your PIN to get started — you'll use it every time you sign in.
          </p>
        </div>
        <p className="text-white/30 text-xs">© 2025 Lanai Lifestyle. All rights reserved.</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <Crown className="w-6 h-6" style={{ color: "oklch(0.35 0.09 145)" }} />
            <span className="font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>Lanai Lifestyle</span>
          </div>

          <h1 className="text-3xl font-bold mb-2 text-gray-900" style={{ fontFamily: "'Playfair Display', serif" }}>
            Set Your PIN
          </h1>
          <p className="text-gray-500 mb-8 text-sm">
            Choose a secure PIN (minimum 6 digits) to protect your member account.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wider">
                Choose a PIN
              </label>
              <div className="relative">
                <Input
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  placeholder="Minimum 6 digits"
                  required
                  className="bg-white border-gray-200 focus:border-gray-400 pr-10"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {pin.length > 0 && (
                <div className="mt-1.5 flex gap-1">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full transition-colors"
                      style={{
                        background: pin.length > i
                          ? pin.length >= 6 ? "oklch(0.55 0.15 145)" : "oklch(0.72 0.12 75)"
                          : "oklch(0.9 0 0)",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5 uppercase tracking-wider">
                Confirm PIN
              </label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  placeholder="Re-enter your PIN"
                  required
                  className="bg-white border-gray-200 focus:border-gray-400 pr-10"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {confirmPin.length > 0 && pin === confirmPin && (
                  <CheckCircle className="absolute right-9 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                )}
              </div>
            </div>

            {(validationError || serverError) && (
              <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{validationError || serverError}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full gap-2 text-white"
              style={{ background: "oklch(0.25 0.06 145)" }}
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Setting up your account…</>
              ) : (
                "Activate My Account"
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Having trouble?{" "}
            <a href="mailto:concierge@lanai.com" className="underline hover:text-gray-600">
              Contact your advisor
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
