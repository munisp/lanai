import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Loader2, Wand2, Send, Copy } from "lucide-react";

type Member = {
  id: number;
  name: string;
  email: string | null;
  tier: string | null;
};

type Extraction = {
  property_name?: string | null;
  supplier?: string | null;
  client_name?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  room_category?: string | null;
  booking_reference?: string | null;
  amount?: string | null;
  virtuoso_perks?: string[] | null;
  notes?: string | null;
};

const SAMPLE = `From: reservations@fourseasons.com
Subject: Reservation Confirmation - FS8475621

Dear Travel Advisor,

We are pleased to confirm the following reservation:

Guest: Aisha Okoye
Property: Four Seasons Hotel George V, Paris
Room: Deluxe King Park View
Arrival: 2026-09-14
Departure: 2026-09-18
Confirmation number: FS8475621
Total: EUR 4,820.00

Virtuoso benefits included:
- Room upgrade at check-in (subject to availability)
- Daily breakfast for two
- 4pm late checkout
- USD 100 food and beverage credit

Kind regards,
Four Seasons Reservations`;

function fmtDate(v: string | null | undefined): string {
  if (!v) return "TBC";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function renderDraft(e: Extraction, clientName: string): string {
  const first = clientName.split(" ")[0] || "there";
  const perks = (e.virtuoso_perks ?? []).map((p) => `  - ${p}`).join("\n");
  const property = e.property_name ?? "your stay";
  const room = e.room_category ? ` (${e.room_category})` : "";
  return `Dear ${first},

We are delighted to confirm ${property}${room}.
Dates: ${fmtDate(e.check_in)} to ${fmtDate(e.check_out)}.
Booking reference: ${e.booking_reference ?? "TBC"}.
${e.amount ? `Total: ${e.amount}.` : ""}
${perks ? `Your Virtuoso benefits:\n${perks}\n` : ""}Should you need anything at all, simply reply and I will be right with you.

Warm regards,
Bolanle
Lanai Lifestyle, Private Client Services`.trim();
}

export default function ConfirmationRebranderPage() {
  const [memberId, setMemberId] = useState<number | null>(null);
  const [raw, setRaw] = useState(SAMPLE);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const members = trpc.members.list.useQuery();
  const memberList = (members.data ?? []) as Member[];
  const member = memberList.find((m) => m.id === memberId) ?? null;

  const handleExtract = async () => {
    if (!raw.trim()) {
      toast.error("Paste a confirmation email");
      return;
    }
    setBusy(true);
    setExtraction(null);
    setDraft("");
    try {
      const resp = await fetch("/api/supplier/extract-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_email: raw,
          client_name: member?.name ?? undefined,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = (await resp.json()) as { structured?: Extraction };
      const ext = data.structured ?? null;
      if (!ext) throw new Error("No extraction returned");
      setExtraction(ext);
      setDraft(renderDraft(ext, member?.name ?? "there"));
      toast.success("Extracted and re-branded");
    } catch (e) {
      toast.error(
        e instanceof Error ? `Failed: ${e.message}` : "Extraction failed",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSendEmail = async () => {
    if (!member?.email || !extraction) {
      toast.error("Select a member with an email");
      return;
    }
    setBusy(true);
    try {
      const resp = await fetch("/api/supplier/send-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toEmail: member.email,
          toName: member.name,
          extraction,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      toast.success(`Confirmation email sent to ${member.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? `Failed: ${e.message}` : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const copyDraft = () => {
    navigator.clipboard
      .writeText(draft)
      .then(() => toast.success("Draft copied to clipboard"));
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Wand2 className="w-6 h-6 text-amber-500" />
          Confirmation Re-brander
        </h1>
        <p className="text-sm text-muted-foreground">
          Paste a supplier confirmation email. The AI extracts the details and
          re-brands them into a clean Lanai client confirmation. Review, then
          send by email or copy for WhatsApp.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="text-sm flex flex-col gap-1">
            Client
            <select
              className="border rounded px-2 py-1.5 text-sm bg-background min-w-[180px]"
              value={memberId ?? ""}
              onChange={(e) => setMemberId(Number(e.target.value))}
            >
              <option value="">Select a member</option>
              {memberList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm flex flex-col gap-1">
            Supplier confirmation email
            <Textarea
              rows={14}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className="text-xs font-mono"
            />
          </label>
          <Button
            onClick={handleExtract}
            disabled={busy}
            className="gap-2 text-white"
            style={{ background: "oklch(0.35 0.09 145)" }}
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            Extract and re-brand
          </Button>
        </div>

        <div className="space-y-3">
          {extraction ? (
            <>
              <div className="rounded-md overflow-hidden border border-border/60">
                <div style={{ background: "#1a2e1a" }} className="p-4">
                  <p className="text-[11px] tracking-[3px] uppercase text-[#c9a84c] font-sans m-0">
                    Lanai Lifestyle
                  </p>
                  <h3 className="text-white text-lg font-normal m-2 mt-1">
                    Your booking is confirmed
                    {extraction.client_name
                      ? `, ${extraction.client_name.split(" ")[0]}`
                      : ""}
                    .
                  </h3>
                </div>
                <div className="p-4 bg-white text-sm space-y-1">
                  <Row label="Property" value={extraction.property_name} />
                  <Row label="Room" value={extraction.room_category} />
                  <Row label="Check in" value={fmtDate(extraction.check_in)} />
                  <Row label="Check out" value={fmtDate(extraction.check_out)} />
                  <Row
                    label="Booking reference"
                    value={extraction.booking_reference}
                  />
                  <Row label="Total" value={extraction.amount} />
                  {extraction.virtuoso_perks?.length ? (
                    <div className="pt-2">
                      <p className="text-[11px] uppercase tracking-[1px] text-[#1a2e1a] font-sans m-0 mb-1">
                        Your Virtuoso benefits
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {extraction.virtuoso_perks.map((p) => (
                          <Badge key={p} variant="secondary" className="font-normal text-xs">
                            {p}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <label className="text-sm flex flex-col gap-1">
                Draft message (editable)
                <Textarea
                  rows={8}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="text-sm"
                />
              </label>
              <div className="flex gap-2">
                <Button onClick={copyDraft} variant="outline" size="sm" className="gap-2">
                  <Copy className="w-4 h-4" /> Copy for WhatsApp
                </Button>
                <Button
                  onClick={handleSendEmail}
                  disabled={busy || !member?.email}
                  size="sm"
                  className="gap-2 text-white"
                  style={{ background: "oklch(0.35 0.09 145)" }}
                >
                  <Send className="w-4 h-4" /> Send email
                </Button>
              </div>
            </>
          ) : (
            <div className="lanai-card p-8 text-center text-sm text-muted-foreground">
              The re-branded confirmation and a ready-to-send draft will appear
              here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <span className="text-muted-foreground w-32 text-xs">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
