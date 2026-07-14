import {
  User, Plane, Users, FileText, Gift, Brain, Star,
  Edit3, Save, X, Plus, Trash2, CreditCard, Globe,
  Phone, Mail, Shield, Heart, Baby, Briefcase
} from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import TripTimelinePage from "./TripTimelinePage";
import CelebrationsPage from "./CelebrationsPage";
import AiConciergePage from "./AiConciergePage";

// ─── Section Wrapper ──────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
      </div>
      <div className="lanai-card p-5">{children}</div>
    </div>
  );
}

// ─── Field Row ────────────────────────────────────────────────────────────────
function FieldRow({ label, value, editing, onChange, type = "text", placeholder }: {
  label: string; value: string; editing: boolean;
  onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 py-2 border-b border-border/30 last:border-0">
      <div className="text-xs text-muted-foreground self-center">{label}</div>
      {editing ? (
        <Input type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? label} className="h-7 text-sm" />
      ) : (
        <div className="text-sm font-medium text-foreground truncate">{value || <span className="text-muted-foreground/50 italic">Not set</span>}</div>
      )}
    </div>
  );
}

// ─── Frequent Flyer Card ──────────────────────────────────────────────────────
function FrequentFlyerSection({ memberId }: { memberId: number }) {
  const { data: profileData, isLoading, refetch } = trpc.memberProfile.get.useQuery({ memberId });
  const ffNumbers = (profileData as { frequentFlyerNumbers?: { airline: string; number: string }[] } | null)?.frequentFlyerNumbers ?? [];
  const [adding, setAdding] = useState(false);
  const [program, setProgram] = useState("");
  const [number, setNumber] = useState("");
  const [tier, setTier] = useState("");

  const upsertProfile = trpc.memberProfile.upsert.useMutation({
    onSuccess: () => { toast.success("FF number added"); setAdding(false); setProgram(""); setNumber(""); setTier(""); refetch(); },
  });
  const removeFF = (id: number) => {
    const updated = ffNumbers.filter((_: { airline: string; number: string }, i: number) => i !== id);
    upsertProfile.mutate({ memberId, frequentFlyerNumbers: updated });
  };

  return (
    <div className="space-y-3">
      {isLoading ? <Skeleton className="h-20" /> : (
        <>
          {ffNumbers && ffNumbers.length > 0 ? (
            <div className="space-y-2">
              {ffNumbers.map((ff: { airline: string; number: string }, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                  <div>
                    <div className="text-sm font-semibold">{ff.airline}</div>
                    <div className="text-xs text-muted-foreground font-mono">{ff.number}</div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => removeFF(i)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No frequent flyer numbers added</p>
          )}
          {adding ? (
            <div className="space-y-2 p-3 bg-muted/20 rounded-lg">
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Program (e.g. BA Executive Club)" value={program} onChange={e => setProgram(e.target.value)} className="h-7 text-xs col-span-2" />
                <Input placeholder="Tier (e.g. Gold)" value={tier} onChange={e => setTier(e.target.value)} className="h-7 text-xs" />
              </div>
              <Input placeholder="Member Number" value={number} onChange={e => setNumber(e.target.value)} className="h-7 text-xs font-mono" />
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs text-white" style={{ background: "oklch(0.35 0.09 145)" }}
                  onClick={() => upsertProfile.mutate({ memberId, frequentFlyerNumbers: [...ffNumbers, { airline: program, number }] })}
                  disabled={!program || !number || upsertProfile.isPending}>
                  Save
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => setAdding(true)}>
              <Plus className="w-3 h-3" /> Add Program
            </Button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Family Members Section ───────────────────────────────────────────────────
function FamilySection({ memberId }: { memberId: number }) {
  const { data: family, isLoading, refetch } = trpc.familyMembers.list.useQuery({ memberId });
  const [adding, setAdding] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [relationship, setRelationship] = useState("spouse");
  const [dob, setDob] = useState("");
  const [dietary, setDietary] = useState("");
  const [passportExpiry, setPassportExpiry] = useState("");

  const add = trpc.familyMembers.add.useMutation({
    onSuccess: () => { toast.success("Family member added"); setAdding(false); refetch(); },
  });
  const remove = trpc.familyMembers.remove.useMutation({
    onSuccess: () => { toast.success("Removed"); refetch(); },
  });

  const relIcons: Record<string, React.ElementType> = { spouse: Heart, partner: Heart, child: Baby, parent: User, sibling: Users, other: User };

  return (
    <div className="space-y-3">
      {isLoading ? <Skeleton className="h-24" /> : (
        <>
          {family && family.length > 0 ? (
            <div className="space-y-2">
              {family.map(fm => {
                const RelIcon = relIcons[fm.relationship] ?? User;
                return (
                  <div key={fm.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <RelIcon className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{(fm as { name: string }).name}</div>
                        <div className="text-xs text-muted-foreground capitalize">{fm.relationship}</div>
                        {fm.dateOfBirth && (
                          <div className="text-xs text-muted-foreground">
                            DOB: {new Date(fm.dateOfBirth).toLocaleDateString("en-GB")}
                          </div>
                        )}
                        {fm.dietaryRequirements && (
                          <div className="text-xs text-amber-600">{fm.dietaryRequirements}</div>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => remove.mutate({ id: fm.id })}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No family members added</p>
          )}
          {adding ? (
            <div className="space-y-2 p-3 bg-muted/20 rounded-lg">
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} className="h-7 text-xs" />
                <Input placeholder="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} className="h-7 text-xs" />
                <Select value={relationship} onValueChange={setRelationship}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spouse">Spouse</SelectItem>
                    <SelectItem value="partner">Partner</SelectItem>
                    <SelectItem value="child">Child</SelectItem>
                    <SelectItem value="parent">Parent</SelectItem>
                    <SelectItem value="sibling">Sibling</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">Date of Birth</label>
                  <Input type="date" value={dob} onChange={e => setDob(e.target.value)} className="h-7 text-xs" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">Passport Expiry</label>
                  <Input type="date" value={passportExpiry} onChange={e => setPassportExpiry(e.target.value)} className="h-7 text-xs" />
                </div>
              </div>
              <Input placeholder="Dietary Requirements" value={dietary} onChange={e => setDietary(e.target.value)} className="h-7 text-xs" />
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs text-white" style={{ background: "oklch(0.35 0.09 145)" }}
                  onClick={() => add.mutate({
                    memberId,
                    name: `${firstName} ${lastName}`.trim(),
                    relationship,
                    dateOfBirth: dob || undefined,
                    passportExpiry: passportExpiry || undefined,
                    dietaryRequirements: dietary || undefined,
                  })}
                  disabled={!firstName || add.isPending}>
                  Save
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => setAdding(true)}>
              <Plus className="w-3 h-3" /> Add Family Member
            </Button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Invoices Section ─────────────────────────────────────────────────────────
function InvoicesSection({ memberId: _memberId }: { memberId: number }) {
  const { data: invoices, isLoading } = trpc.invoicing.myInvoices.useQuery();
  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    sent: "bg-blue-50 text-blue-700",
    paid: "bg-emerald-50 text-emerald-700",
    overdue: "bg-red-50 text-red-700",
    cancelled: "bg-gray-50 text-gray-400",
  };
  return (
    <div className="space-y-2">
      {isLoading ? <Skeleton className="h-20" /> : invoices && invoices.length > 0 ? (
        invoices.map(inv => (
          <div key={inv.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
            <div>
              <div className="text-sm font-semibold">{inv.invoiceNumber}</div>
              <div className="text-xs text-muted-foreground">{(inv as { description?: string | null }).description}</div>
              <div className="text-xs text-muted-foreground">
                Due: {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-GB") : "—"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold" style={{ color: "oklch(0.35 0.09 145)" }}>
                {inv.currency ?? "£"}{parseFloat(inv.totalAmount).toLocaleString()}
              </div>
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", statusColors[inv.status] ?? "bg-gray-100 text-gray-600")}>
                {inv.status}
              </span>
            </div>
          </div>
        ))
      ) : (
        <p className="text-xs text-muted-foreground">No invoices issued</p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MemberPortalEnhancedPage() {
  const { data: session } = trpc.auth.me.useQuery();
  const memberId = (session as { member?: { id: number } } | null)?.member?.id ?? 1;

  const { data: profile, isLoading, refetch } = trpc.memberProfile.get.useQuery({ memberId });
  const [editing, setEditing] = useState(false);

  // Editable fields
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [passportExpiry, setPassportExpiry] = useState("");
  const [dietaryRequirements, setDietaryRequirements] = useState("");
  const [travelStyle, setTravelStyle] = useState("");
  const [preferredPayment, setPreferredPayment] = useState("");
  const [securityLevel, setSecurityLevel] = useState("");
  const [personalAssistant, setPersonalAssistant] = useState("");
  const [familyOfficeContact, setFamilyOfficeContact] = useState("");
  const [anniversaryDate, setAnniversaryDate] = useState("");
  const [conciergeNotes, setConciergeNotes] = useState("");

  const updateProfile = trpc.memberProfile.upsert.useMutation({
    onSuccess: () => { toast.success("Profile updated"); setEditing(false); refetch(); },
    onError: () => toast.error("Failed to update profile"),
  });

  const handleSave = () => {
    updateProfile.mutate({
      memberId,
      dietaryRequirements: dietaryRequirements ? [dietaryRequirements] : undefined,
      travelStyle: travelStyle ? [travelStyle] : undefined,
      preferredPaymentMethod: preferredPayment || undefined,
      securityLevel: securityLevel as "standard" | "enhanced" | "maximum" | undefined,
      personalAssistantName: personalAssistant || undefined,
      familyOfficeContactName: familyOfficeContact || undefined,
      anniversaryDate: anniversaryDate || undefined,
      conciergeNotes: conciergeNotes || undefined,
    });
  };

  // Pre-fill when editing starts
  const startEditing = () => {
    if (profile) {
      const p = profile as {
        dateOfBirth?: string | null; passportExpiry?: string | null;
        dietaryRequirements?: string | null; travelStyle?: string | null;
        preferredPaymentMethod?: string | null; securityPrivacyLevel?: string | null;
        personalAssistantContact?: string | null; familyOfficeContact?: string | null;
        anniversaryDate?: string | null; conciergeNotes?: string | null;
      };
      setDateOfBirth(p.dateOfBirth ?? "");
      setPassportExpiry(p.passportExpiry ?? "");
      setDietaryRequirements(p.dietaryRequirements ?? "");
      setTravelStyle(p.travelStyle ?? "");
      setPreferredPayment(p.preferredPaymentMethod ?? "");
      setSecurityLevel(p.securityPrivacyLevel ?? "");
      setPersonalAssistant(p.personalAssistantContact ?? "");
      setFamilyOfficeContact(p.familyOfficeContact ?? "");
      setAnniversaryDate(p.anniversaryDate ?? "");
      setConciergeNotes(p.conciergeNotes ?? "");
    }
    setEditing(true);
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      </div>
    );
  }

  const p = profile as {
    firstName?: string; lastName?: string; email?: string; phone?: string;
    membershipTier?: string; membershipNumber?: string;
    dateOfBirth?: string | null; passportExpiry?: string | null;
    dietaryRequirements?: string | null; travelStyle?: string | null;
    preferredPaymentMethod?: string | null; securityPrivacyLevel?: string | null;
    personalAssistantContact?: string | null; familyOfficeContact?: string | null;
    anniversaryDate?: string | null; conciergeNotes?: string | null;
    favouriteDestinations?: string[] | null; roomPreferences?: string | null;
    hotelBrandPreferences?: string[] | null;
  } | null;

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
            {p?.firstName ? `${p.firstName} ${p.lastName ?? ""}` : "My Profile"}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            {p?.membershipTier && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 capitalize">
                {p.membershipTier} Member
              </span>
            )}
            {p?.membershipNumber && (
              <span className="text-xs text-muted-foreground font-mono">#{p.membershipNumber}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditing(false)}>
                <X className="w-3.5 h-3.5" /> Cancel
              </Button>
              <Button size="sm" className="gap-2 text-white" style={{ background: "oklch(0.35 0.09 145)" }}
                onClick={handleSave} disabled={updateProfile.isPending}>
                <Save className="w-3.5 h-3.5" />
                {updateProfile.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" className="gap-2" onClick={startEditing}>
              <Edit3 className="w-3.5 h-3.5" /> Edit Profile
            </Button>
          )}
        </div>
      </div>
      <hr className="lanai-divider" />

      <Tabs defaultValue="profile">
        <TabsList className="grid w-full grid-cols-5 max-w-2xl">
          <TabsTrigger value="profile" className="gap-1.5 text-xs"><User className="w-3.5 h-3.5" />Profile</TabsTrigger>
          <TabsTrigger value="family" className="gap-1.5 text-xs"><Users className="w-3.5 h-3.5" />Family</TabsTrigger>
          <TabsTrigger value="trips" className="gap-1.5 text-xs"><Plane className="w-3.5 h-3.5" />Trips</TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5 text-xs"><FileText className="w-3.5 h-3.5" />Invoices</TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5 text-xs"><Brain className="w-3.5 h-3.5" />AI</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-6 space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Personal Details */}
            <Section title="Personal Details" icon={User}>
              <FieldRow label="Date of Birth" value={editing ? dateOfBirth : p?.dateOfBirth ?? ""} editing={editing} onChange={setDateOfBirth} type="date" />
              <FieldRow label="Anniversary Date" value={editing ? anniversaryDate : p?.anniversaryDate ?? ""} editing={editing} onChange={setAnniversaryDate} type="date" />
              <FieldRow label="Passport Expiry" value={editing ? passportExpiry : p?.passportExpiry ?? ""} editing={editing} onChange={setPassportExpiry} type="date" />
              <FieldRow label="Dietary Requirements" value={editing ? dietaryRequirements : p?.dietaryRequirements ?? ""} editing={editing} onChange={setDietaryRequirements} placeholder="e.g. Vegan, Nut allergy" />
            </Section>

            {/* Travel Preferences */}
            <Section title="Travel Preferences" icon={Plane}>
              <div className="py-2 border-b border-border/30">
                <div className="text-xs text-muted-foreground mb-1.5">Travel Style</div>
                {editing ? (
                  <Select value={travelStyle} onValueChange={setTravelStyle}>
                    <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="Select style" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="luxury">Luxury</SelectItem>
                      <SelectItem value="adventure">Adventure</SelectItem>
                      <SelectItem value="cultural">Cultural</SelectItem>
                      <SelectItem value="relaxation">Relaxation</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                      <SelectItem value="family">Family</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm font-medium capitalize">{p?.travelStyle ?? <span className="text-muted-foreground/50 italic">Not set</span>}</div>
                )}
              </div>
              <FieldRow label="Room Preferences" value={editing ? (p?.roomPreferences ?? "") : (p?.roomPreferences ?? "")} editing={editing} onChange={() => {}} placeholder="e.g. High floor, King bed, Sea view" />
              <div className="py-2">
                <div className="text-xs text-muted-foreground mb-1.5">Favourite Destinations</div>
                <div className="flex flex-wrap gap-1.5">
                  {p?.favouriteDestinations?.map((d, i) => (
                    <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{d}</span>
                  )) ?? <span className="text-xs text-muted-foreground/50 italic">None added</span>}
                </div>
              </div>
            </Section>

            {/* Payment & Security */}
            <Section title="Payment & Security" icon={Shield}>
              <div className="py-2 border-b border-border/30">
                <div className="text-xs text-muted-foreground mb-1.5">Preferred Payment Method</div>
                {editing ? (
                  <Select value={preferredPayment} onValueChange={setPreferredPayment}>
                    <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="credit_card">Credit Card</SelectItem>
                      <SelectItem value="amex">Amex</SelectItem>
                      <SelectItem value="wire">Wire Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm font-medium capitalize">{p?.preferredPaymentMethod?.replace("_", " ") ?? <span className="text-muted-foreground/50 italic">Not set</span>}</div>
                )}
              </div>
              <div className="py-2">
                <div className="text-xs text-muted-foreground mb-1.5">Privacy Level</div>
                {editing ? (
                  <Select value={securityLevel} onValueChange={setSecurityLevel}>
                    <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="Select level" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="enhanced">Enhanced</SelectItem>
                      <SelectItem value="maximum">Maximum</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm font-medium capitalize">{p?.securityPrivacyLevel ?? <span className="text-muted-foreground/50 italic">Not set</span>}</div>
                )}
              </div>
            </Section>

            {/* Contacts */}
            <Section title="Personal Contacts" icon={Briefcase}>
              <FieldRow label="Personal Assistant" value={editing ? personalAssistant : p?.personalAssistantContact ?? ""} editing={editing} onChange={setPersonalAssistant} placeholder="Name, email or phone" />
              <FieldRow label="Family Office Contact" value={editing ? familyOfficeContact : p?.familyOfficeContact ?? ""} editing={editing} onChange={setFamilyOfficeContact} placeholder="Name, email or phone" />
            </Section>
          </div>

          {/* Frequent Flyer Numbers */}
          <Section title="Frequent Flyer & Hotel Loyalty" icon={CreditCard}>
            <FrequentFlyerSection memberId={memberId} />
          </Section>

          {/* Concierge Notes */}
          <Section title="Concierge Notes" icon={Edit3}>
            {editing ? (
              <Textarea value={conciergeNotes} onChange={e => setConciergeNotes(e.target.value)}
                placeholder="Internal notes for the concierge team..." className="min-h-24" />
            ) : (
              <p className="text-sm text-muted-foreground">{p?.conciergeNotes ?? <span className="italic">No notes added</span>}</p>
            )}
          </Section>
        </TabsContent>

        {/* Family Tab */}
        <TabsContent value="family" className="mt-6">
          <Section title="Family Members" icon={Users}>
            <FamilySection memberId={memberId} />
          </Section>
        </TabsContent>

        {/* Trips Tab */}
        <TabsContent value="trips" className="mt-6 -mx-6 lg:-mx-8">
          <TripTimelinePage memberId={memberId} />
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="mt-6">
          <Section title="My Invoices" icon={FileText}>
            <InvoicesSection memberId={memberId} />
          </Section>
        </TabsContent>

        {/* AI Tab */}
        <TabsContent value="ai" className="mt-6 -mx-6 lg:-mx-8">
          <AiConciergePage memberId={memberId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
