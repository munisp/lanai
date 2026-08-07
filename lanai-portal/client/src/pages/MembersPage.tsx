/**
 * Lanai — Members page
 * Data: Postgres `members` table (canonical member store).
 * Advisors can add members directly (saved to Postgres) and invite them to onboard.
 */
import { useState } from "react";
import {
  Crown,
  Search,
  Star,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  UserPlus,
  CheckCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TIER_COLORS: Record<string, string> = {
  platinum: "bg-purple-50 text-purple-700",
  gold: "bg-amber-50 text-amber-700",
  silver: "bg-gray-50 text-gray-600",
};

function AddMemberDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState("gold");
  const [phone, setPhone] = useState("");
  const [nationality, setNationality] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");

  const createMember = trpc.members.create.useMutation({
    onSuccess: (data) => {
      toast.success("Member created");
      setInviteUrl(data.inviteUrl ?? "");
      setName("");
      setEmail("");
      setTier("gold");
      setPhone("");
      setNationality("");
      onCreated();
    },
    onError: (e) => toast.error(e.message || "Failed to create member"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createMember.mutate({
      name,
      email,
      tier: tier as "platinum" | "gold" | "silver",
      phone: phone || undefined,
      nationality: nationality || undefined,
      origin: window.location.origin,
    });
  };

  const copyInvite = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 text-white" style={{ background: "oklch(0.35 0.09 145)" }}>
          <UserPlus className="w-4 h-4" /> Add Member
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Playfair Display', serif" }}>
            Add New Member
          </DialogTitle>
        </DialogHeader>
        {inviteUrl ? (
          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">
              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Member created. Share this invite link so they can set a PIN and
                sign in.
              </span>
            </div>
            <div className="flex gap-2">
              <Input readOnly value={inviteUrl} className="font-mono text-xs" />
              <Button type="button" variant="outline" size="sm" onClick={copyInvite} className="shrink-0">
                Copy
              </Button>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setInviteUrl("");
                  setOpen(false);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Full Name
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alexandra Reed" required />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Email
            </label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="member@example.com" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Tier
              </label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="platinum">Platinum</SelectItem>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="silver">Silver</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Phone
              </label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44…" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Nationality
            </label>
            <Input value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="e.g. British" />
          </div>
          {createMember.error && (
            <p className="text-red-600 text-sm">{createMember.error.message}</p>
          )}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name || !email || createMember.isPending}
              className="text-white"
              style={{ background: "oklch(0.35 0.09 145)" }}
            >
              {createMember.isPending ? "Creating…" : "Create Member"}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function MembersPage() {
  const [search, setSearch] = useState("");
  const { data: members = [], isLoading, refetch, error } = trpc.members.list.useQuery();

  const filtered = members.filter((m) => {
    const q = search.toLowerCase();
    return (
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
    );
  });

  const platinum = members.filter((m) => m.tier === "platinum").length;
  const gold = members.filter((m) => m.tier === "gold").length;
  const silver = members.filter((m) => m.tier === "silver").length;

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1"><Crown className="w-5 h-5 text-primary" /></div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>Members</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? "Loading members…" : `Lanai Lifestyle membership programme — ${members.length} active members`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AddMemberDialog onCreated={() => refetch()} />
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            {isLoading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>
      <hr className="lanai-divider" />

      {error && (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Error loading members: {error.message}. <button onClick={() => refetch()} className="underline">Retry</button></span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Platinum", value: isLoading ? "…" : platinum, color: "oklch(0.55 0.18 300)" },
          { label: "Gold", value: isLoading ? "…" : gold, color: "oklch(0.72 0.12 75)" },
          { label: "Silver", value: isLoading ? "…" : silver, color: "oklch(0.6 0 0)" },
          { label: "Total Members", value: isLoading ? "…" : members.length, color: "oklch(0.35 0.09 145)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="lanai-card p-4 text-center">
            <div className="text-2xl font-bold mb-1" style={{ color, fontFamily: "'Playfair Display', serif" }}>{value}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search members…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="lanai-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Member</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Tier</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden md:table-cell">Email</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden lg:table-cell">Phone</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden lg:table-cell">Nationality</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-40" /></td>
                  <td className="px-4 py-3"><div className="h-5 bg-muted rounded animate-pulse w-16" /></td>
                  <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-32" /></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-24" /></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-16" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  {search ? `No members matching "${search}"` : "No members found. Add your first member."}
                </td>
              </tr>
            ) : filtered.map((m) => (
              <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                      <Crown className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-medium text-foreground">{m.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 w-fit capitalize", TIER_COLORS[m.tier] ?? TIER_COLORS.silver)}>
                    <Star className="w-3 h-3" />{m.tier}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-sm text-muted-foreground">{m.email}</td>
                <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">{m.phone || "—"}</td>
                <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">{m.nationality || "—"}</td>
                <td className="px-4 py-3">
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    m.onboardingComplete ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
                  )}>
                    {m.onboardingComplete ? "Onboarded" : "Pending PIN"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
            <span>Showing {filtered.length} of {members.length} members</span>
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Stored in Postgres
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
