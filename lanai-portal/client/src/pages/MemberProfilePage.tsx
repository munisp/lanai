import {
  User, Plane, Hotel, CreditCard, Shield, Phone, Globe, Heart,
  Plus, Trash2, Save, ChevronDown, ChevronUp, Star, UserCheck,
  Briefcase, AlertCircle, Users
} from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Section Wrapper ──────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="lanai-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <span className="font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
            {title}
          </span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-border">{children}</div>}
    </div>
  );
}

// ─── Field Row ────────────────────────────────────────────────────────────────
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 items-start py-3 border-b border-border/50 last:border-0">
      <label className="text-sm font-medium text-muted-foreground pt-2">{label}</label>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

// ─── Frequent Flyer Entry ─────────────────────────────────────────────────────
function FrequentFlyerEntry({
  entry, onChange, onRemove,
}: {
  entry: { airline: string; number: string };
  onChange: (v: { airline: string; number: string }) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-2 items-center">
      <Input
        placeholder="Airline (e.g. British Airways)"
        value={entry.airline}
        onChange={e => onChange({ ...entry, airline: e.target.value })}
        className="flex-1"
      />
      <Input
        placeholder="Number"
        value={entry.number}
        onChange={e => onChange({ ...entry, number: e.target.value })}
        className="w-40"
      />
      <Button variant="ghost" size="icon" onClick={onRemove} className="text-destructive hover:text-destructive">
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ─── Hotel Loyalty Entry ──────────────────────────────────────────────────────
function HotelLoyaltyEntry({
  entry, onChange, onRemove,
}: {
  entry: { chain: string; number: string; tier?: string };
  onChange: (v: { chain: string; number: string; tier?: string }) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-2 items-center">
      <Input
        placeholder="Hotel Chain (e.g. Marriott Bonvoy)"
        value={entry.chain}
        onChange={e => onChange({ ...entry, chain: e.target.value })}
        className="flex-1"
      />
      <Input
        placeholder="Number"
        value={entry.number}
        onChange={e => onChange({ ...entry, number: e.target.value })}
        className="w-36"
      />
      <Input
        placeholder="Tier"
        value={entry.tier ?? ""}
        onChange={e => onChange({ ...entry, tier: e.target.value })}
        className="w-28"
      />
      <Button variant="ghost" size="icon" onClick={onRemove} className="text-destructive hover:text-destructive">
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ─── Family Member Card ───────────────────────────────────────────────────────
function FamilyMemberCard({ member, onRemove }: {
  member: { id: number; name: string; relationship: string; dateOfBirth?: string | null; nationality?: string | null };
  onRemove: (id: number) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
          {member.name[0]}
        </div>
        <div>
          <div className="text-sm font-medium">{member.name}</div>
          <div className="text-xs text-muted-foreground capitalize">{member.relationship}
            {member.dateOfBirth ? ` · DOB: ${member.dateOfBirth}` : ""}
            {member.nationality ? ` · ${member.nationality}` : ""}
          </div>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={() => onRemove(member.id)} className="text-destructive hover:text-destructive">
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MemberProfilePage({ memberId }: { memberId?: number }) {
  const id = memberId ?? 1;

  const { data: profileRaw, isLoading } = trpc.memberProfile.get.useQuery({ memberId: id });
  // Cast to any to access all extended profile fields (union type from offline fallback)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = profileRaw as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: family, refetch: refetchFamily } = trpc.familyMembers.list.useQuery({ memberId: id });

  const upsertProfile = trpc.memberProfile.upsert.useMutation({
    onSuccess: () => toast.success("Profile updated successfully"),
    onError: () => toast.error("Failed to update profile"),
  });
  const updateRevenue = trpc.memberProfile.updateRevenue.useMutation({
    onSuccess: () => toast.success("Revenue metrics updated"),
  });
  const addFamilyMember = trpc.familyMembers.add.useMutation({
    onSuccess: () => { toast.success("Family member added"); refetchFamily(); },
  });
  const removeFamilyMember = trpc.familyMembers.remove.useMutation({
    onSuccess: () => { toast.success("Family member removed"); refetchFamily(); },
  });

  // Form state
  const [ffNumbers, setFfNumbers] = useState<{ airline: string; number: string }[]>(
    (profile?.frequentFlyerNumbers as { airline: string; number: string }[] | null) ?? []
  );
  const [hotelLoyalty, setHotelLoyalty] = useState<{ chain: string; number: string; tier?: string }[]>(
    (profile?.hotelLoyaltyNumbers as { chain: string; number: string; tier?: string }[] | null) ?? []
  );
  const [cabinClass, setCabinClass] = useState(profile?.cabinClass ?? "business");
  const [seatPref, setSeatPref] = useState(profile?.seatPreference ?? "window");
  const [securityLevel, setSecurityLevel] = useState(profile?.securityLevel ?? "standard");
  const [conciergeNotes, setConciergeNotes] = useState(profile?.conciergeNotes ?? "");
  const [paName, setPaName] = useState(profile?.personalAssistantName ?? "");
  const [paEmail, setPaEmail] = useState(profile?.personalAssistantEmail ?? "");
  const [paPhone, setPaPhone] = useState(profile?.personalAssistantPhone ?? "");
  const [foName, setFoName] = useState(profile?.familyOfficeContactName ?? "");
  const [foEmail, setFoEmail] = useState(profile?.familyOfficeContactEmail ?? "");
  const [paymentMethod, setPaymentMethod] = useState(profile?.preferredPaymentMethod ?? "");
  const [lifetimeRevenue, setLifetimeRevenue] = useState(profile?.lifetimeRevenue ?? "");
  const [annualRevenue, setAnnualRevenue] = useState(profile?.annualRevenue ?? "");
  const [membershipFees, setMembershipFees] = useState(profile?.membershipFeesPaid ?? "");
  const [satisfactionScore, setSatisfactionScore] = useState(profile?.satisfactionScore ?? "");

  // New family member form
  const [newFamilyName, setNewFamilyName] = useState("");
  const [newFamilyRelationship, setNewFamilyRelationship] = useState("spouse");
  const [newFamilyDob, setNewFamilyDob] = useState("");
  const [newFamilyNationality, setNewFamilyNationality] = useState("");

  const handleSaveProfile = () => {
    upsertProfile.mutate({
      memberId: id,
      frequentFlyerNumbers: ffNumbers,
      hotelLoyaltyNumbers: hotelLoyalty,
      cabinClass: cabinClass as "economy" | "business" | "first",
      seatPreference: seatPref as "window" | "aisle" | "middle",
      securityLevel: securityLevel as "standard" | "enhanced" | "maximum",
      conciergeNotes,
      personalAssistantName: paName || undefined,
      personalAssistantEmail: paEmail || undefined,
      personalAssistantPhone: paPhone || undefined,
      familyOfficeContactName: foName || undefined,
      familyOfficeContactEmail: foEmail || undefined,
      preferredPaymentMethod: paymentMethod || undefined,
    });
  };

  const handleSaveRevenue = () => {
    updateRevenue.mutate({
      memberId: id,
      lifetimeRevenue: lifetimeRevenue || undefined,
      annualRevenue: annualRevenue || undefined,
      membershipFeesPaid: membershipFees || undefined,
      satisfactionScore: satisfactionScore || undefined,
    });
  };

  const handleAddFamilyMember = () => {
    if (!newFamilyName) return;
    addFamilyMember.mutate({
      memberId: id,
      name: newFamilyName,
      relationship: newFamilyRelationship as "spouse" | "partner" | "child" | "parent" | "sibling" | "other",
      dateOfBirth: newFamilyDob || undefined,
      nationality: newFamilyNationality || undefined,
    });
    setNewFamilyName(""); setNewFamilyDob(""); setNewFamilyNationality("");
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1"><User className="w-5 h-5 text-primary" /></div>
        <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
          Extended Member Profile
        </h1>
        <p className="text-muted-foreground mt-1">Comprehensive data capture for personalised concierge service</p>
      </div>
      <hr className="lanai-divider" />

      {/* Travel Preferences */}
      <Section title="Travel Preferences" icon={Plane}>
        <div className="pt-4 space-y-0">
          <FieldRow label="Cabin Class">
            <Select value={cabinClass} onValueChange={setCabinClass}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="economy">Economy</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="first">First Class</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Seat Preference">
            <Select value={seatPref} onValueChange={setSeatPref}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="window">Window</SelectItem>
                <SelectItem value="aisle">Aisle</SelectItem>
                <SelectItem value="middle">Middle</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Frequent Flyer Numbers">
            <div className="space-y-2">
              {ffNumbers.map((ff, i) => (
                <FrequentFlyerEntry
                  key={i} entry={ff}
                  onChange={v => setFfNumbers(prev => prev.map((x, j) => j === i ? v : x))}
                  onRemove={() => setFfNumbers(prev => prev.filter((_, j) => j !== i))}
                />
              ))}
              <Button variant="outline" size="sm" className="gap-2 mt-1" onClick={() => setFfNumbers(prev => [...prev, { airline: "", number: "" }])}>
                <Plus className="w-3.5 h-3.5" /> Add Frequent Flyer
              </Button>
            </div>
          </FieldRow>
        </div>
      </Section>

      {/* Hotel Preferences */}
      <Section title="Hotel & Accommodation Preferences" icon={Hotel}>
        <div className="pt-4 space-y-0">
          <FieldRow label="Loyalty Numbers">
            <div className="space-y-2">
              {hotelLoyalty.map((hl, i) => (
                <HotelLoyaltyEntry
                  key={i} entry={hl}
                  onChange={v => setHotelLoyalty(prev => prev.map((x, j) => j === i ? v : x))}
                  onRemove={() => setHotelLoyalty(prev => prev.filter((_, j) => j !== i))}
                />
              ))}
              <Button variant="outline" size="sm" className="gap-2 mt-1" onClick={() => setHotelLoyalty(prev => [...prev, { chain: "", number: "", tier: "" }])}>
                <Plus className="w-3.5 h-3.5" /> Add Hotel Loyalty
              </Button>
            </div>
          </FieldRow>
        </div>
      </Section>

      {/* Security & Privacy */}
      <Section title="Security & Privacy" icon={Shield}>
        <div className="pt-4 space-y-0">
          <FieldRow label="Security Level">
            <Select value={securityLevel} onValueChange={setSecurityLevel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="enhanced">Enhanced</SelectItem>
                <SelectItem value="maximum">Maximum</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Preferred Payment">
            <Input value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} placeholder="e.g. Amex Centurion" />
          </FieldRow>
        </div>
      </Section>

      {/* Personal Assistant & Family Office */}
      <Section title="Personal Assistant & Family Office" icon={Briefcase}>
        <div className="pt-4 space-y-0">
          <FieldRow label="PA Name">
            <Input value={paName} onChange={e => setPaName(e.target.value)} placeholder="Full name" />
          </FieldRow>
          <FieldRow label="PA Email">
            <Input type="email" value={paEmail} onChange={e => setPaEmail(e.target.value)} placeholder="pa@familyoffice.com" />
          </FieldRow>
          <FieldRow label="PA Phone">
            <Input value={paPhone} onChange={e => setPaPhone(e.target.value)} placeholder="+44 7700 900000" />
          </FieldRow>
          <FieldRow label="Family Office Contact">
            <Input value={foName} onChange={e => setFoName(e.target.value)} placeholder="Contact name" />
          </FieldRow>
          <FieldRow label="Family Office Email">
            <Input type="email" value={foEmail} onChange={e => setFoEmail(e.target.value)} placeholder="fo@familyoffice.com" />
          </FieldRow>
        </div>
      </Section>

      {/* Concierge Notes */}
      <Section title="Concierge Notes" icon={AlertCircle}>
        <div className="pt-4">
          <Textarea
            value={conciergeNotes}
            onChange={e => setConciergeNotes(e.target.value)}
            placeholder="Internal notes visible to advisors only. Preferences, quirks, important context..."
            className="min-h-28"
          />
        </div>
      </Section>

      {/* Save Profile Button */}
      <div className="flex justify-end">
        <Button onClick={handleSaveProfile} disabled={upsertProfile.isPending} className="gap-2 text-white" style={{ background: "oklch(0.35 0.09 145)" }}>
          <Save className="w-4 h-4" />
          {upsertProfile.isPending ? "Saving..." : "Save Profile"}
        </Button>
      </div>

      {/* Revenue Metrics */}
      <Section title="Revenue & Satisfaction Metrics" icon={Star}>
        <div className="pt-4 space-y-0">
          <FieldRow label="Lifetime Revenue">
            <Input value={lifetimeRevenue} onChange={e => setLifetimeRevenue(e.target.value)} placeholder="0.00" type="number" />
          </FieldRow>
          <FieldRow label="Annual Revenue">
            <Input value={annualRevenue} onChange={e => setAnnualRevenue(e.target.value)} placeholder="0.00" type="number" />
          </FieldRow>
          <FieldRow label="Membership Fees Paid">
            <Input value={membershipFees} onChange={e => setMembershipFees(e.target.value)} placeholder="0.00" type="number" />
          </FieldRow>
          <FieldRow label="Satisfaction Score">
            <Input value={satisfactionScore} onChange={e => setSatisfactionScore(e.target.value)} placeholder="0.0 – 5.0" type="number" min="0" max="5" step="0.1" />
          </FieldRow>
        </div>
        <div className="flex justify-end pt-3">
          <Button onClick={handleSaveRevenue} disabled={updateRevenue.isPending} variant="outline" className="gap-2">
            <Save className="w-4 h-4" />
            {updateRevenue.isPending ? "Saving..." : "Update Revenue"}
          </Button>
        </div>
      </Section>

      {/* Family Members */}
      <Section title="Family Members" icon={Users}>
        <div className="pt-4 space-y-3">
          {family && family.length > 0 ? (
            family.map(fm => (
              <FamilyMemberCard
                key={fm.id}
                member={fm as { id: number; name: string; relationship: string; dateOfBirth?: string | null; nationality?: string | null }}
                onRemove={id => removeFamilyMember.mutate({ id })}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No family members added yet.</p>
          )}

          {/* Add new family member */}
          <div className="border border-dashed border-border rounded-lg p-4 space-y-3 mt-4">
            <p className="text-sm font-medium text-muted-foreground">Add Family Member</p>
            <div className="grid grid-cols-2 gap-3">
              <Input value={newFamilyName} onChange={e => setNewFamilyName(e.target.value)} placeholder="Full name" />
              <Select value={newFamilyRelationship} onValueChange={setNewFamilyRelationship}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="spouse">Spouse</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                  <SelectItem value="child">Child</SelectItem>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="sibling">Sibling</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Input type="date" value={newFamilyDob} onChange={e => setNewFamilyDob(e.target.value)} placeholder="Date of birth" />
              <Input value={newFamilyNationality} onChange={e => setNewFamilyNationality(e.target.value)} placeholder="Nationality" />
            </div>
            <Button
              onClick={handleAddFamilyMember}
              disabled={!newFamilyName || addFamilyMember.isPending}
              size="sm" className="gap-2 text-white" style={{ background: "oklch(0.35 0.09 145)" }}
            >
              <Plus className="w-3.5 h-3.5" />
              {addFamilyMember.isPending ? "Adding..." : "Add Family Member"}
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}
