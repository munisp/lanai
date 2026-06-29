/**
 * Lanai — Member Management (Advisor Portal)
 * Route: /member-management
 * Allows advisors to invite new members, view pending invitations,
 * and manage existing member accounts (tier, CRM link, active status).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Crown,
  UserPlus,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  Copy,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const TIER_COLORS: Record<string, string> = {
  platinum: "bg-purple-100 text-purple-800 border-purple-200",
  gold: "bg-amber-100 text-amber-800 border-amber-200",
  silver: "bg-gray-100 text-gray-700 border-gray-200",
};

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-red-100 text-red-800 border-red-200",
  senior_advisor: "bg-blue-100 text-blue-800 border-blue-200",
  advisor: "bg-green-100 text-green-800 border-green-200",
};

export default function MemberManagementPage() {
  const { user } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    name: "",
    tier: "gold" as "platinum" | "gold" | "silver",
    crmPersonId: "",
  });
  const [inviteResult, setInviteResult] = useState<{ inviteUrl: string; expiresAt: Date } | null>(null);

  const utils = trpc.useUtils();

  const { data: members, isLoading: loadingMembers } = trpc.members.list.useQuery();
  const { data: pending, isLoading: loadingPending } = trpc.members.pendingInvites.useQuery();
  const { data: advisors, isLoading: loadingAdvisors } = trpc.advisors.list.useQuery();

  const inviteMutation = trpc.members.invite.useMutation({
    onSuccess: (data) => {
      setInviteResult({ inviteUrl: data.inviteUrl, expiresAt: new Date(data.expiresAt) });
      utils.members.pendingInvites.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMemberMutation = trpc.members.update.useMutation({
    onSuccess: () => {
      utils.members.list.invalidate();
      toast.success("Member updated.");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateRoleMutation = trpc.advisors.updateRole.useMutation({
    onSuccess: () => {
      utils.advisors.list.invalidate();
      toast.success("Role updated.");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    inviteMutation.mutate({
      ...inviteForm,
      crmPersonId: inviteForm.crmPersonId || undefined,
      origin: window.location.origin,
    });
  };

  const copyInviteUrl = () => {
    if (inviteResult) {
      navigator.clipboard.writeText(inviteResult.inviteUrl);
      toast.success("Invite link copied to clipboard.");
    }
  };

  const resetInviteForm = () => {
    setInviteForm({ email: "", name: "", tier: "gold", crmPersonId: "" });
    setInviteResult(null);
    setInviteOpen(false);
  };

  const isAdmin = user?.role === "admin" || user?.role === "senior_advisor";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold text-gray-900"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Member Management
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Invite clients, manage memberships, and control portal access.
          </p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={(o) => { if (!o) resetInviteForm(); setInviteOpen(o); }}>
          <DialogTrigger asChild>
            <Button
              className="gap-2 text-white"
              style={{ background: "oklch(0.25 0.06 145)" }}
            >
              <UserPlus className="w-4 h-4" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Crown className="w-5 h-5" style={{ color: "oklch(0.35 0.09 145)" }} />
                Invite New Member
              </DialogTitle>
            </DialogHeader>

            {inviteResult ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-4 py-3">
                  <CheckCircle className="w-5 h-5 shrink-0" />
                  <span className="text-sm font-medium">Invitation created successfully</span>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">
                    Share this link with the member
                  </label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={inviteResult.inviteUrl}
                      className="text-xs font-mono bg-gray-50"
                    />
                    <Button variant="outline" size="icon" onClick={copyInviteUrl}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Expires: {inviteResult.expiresAt.toLocaleString()}
                  </p>
                </div>
                <Button
                  className="w-full text-white"
                  style={{ background: "oklch(0.25 0.06 145)" }}
                  onClick={resetInviteForm}
                >
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-700 uppercase tracking-wider block mb-1">
                    Email Address *
                  </label>
                  <Input
                    type="email"
                    required
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="member@example.com"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 uppercase tracking-wider block mb-1">
                    Full Name *
                  </label>
                  <Input
                    required
                    value={inviteForm.name}
                    onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. James Whitfield"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 uppercase tracking-wider block mb-1">
                    Membership Tier
                  </label>
                  <Select
                    value={inviteForm.tier}
                    onValueChange={(v) =>
                      setInviteForm((f) => ({ ...f, tier: v as "platinum" | "gold" | "silver" }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="platinum">Platinum — Document vault + priority messaging</SelectItem>
                      <SelectItem value="gold">Gold — Standard features</SelectItem>
                      <SelectItem value="silver">Silver — Basic features</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 uppercase tracking-wider block mb-1">
                    CRM Person ID{" "}
                    <span className="text-gray-400 normal-case font-normal">(optional — auto-detected from email)</span>
                  </label>
                  <Input
                    value={inviteForm.crmPersonId}
                    onChange={(e) => setInviteForm((f) => ({ ...f, crmPersonId: e.target.value }))}
                    placeholder="Twenty CRM UUID"
                    className="font-mono text-xs"
                  />
                </div>

                {inviteMutation.error && (
                  <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {inviteMutation.error.message}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={inviteMutation.isPending}
                  className="w-full gap-2 text-white"
                  style={{ background: "oklch(0.25 0.06 145)" }}
                >
                  {inviteMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                  ) : (
                    <><Mail className="w-4 h-4" /> Send Invitation</>
                  )}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Pending Invitations */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Pending Invitations
          {loadingPending && <Loader2 className="w-3 h-3 animate-spin" />}
        </h2>
        {!loadingPending && (!pending || pending.length === 0) ? (
          <p className="text-sm text-gray-400 italic">No pending invitations.</p>
        ) : (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tier</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pending?.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{inv.email}</td>
                    <td className="px-4 py-3 text-gray-900">{inv.name}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs capitalize ${TIER_COLORS[inv.tier]}`}>{inv.tier}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(inv.expiresAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Active Members */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Crown className="w-4 h-4" />
          Active Members
          {loadingMembers && <Loader2 className="w-3 h-3 animate-spin" />}
          <button
            onClick={() => utils.members.list.invalidate()}
            className="ml-auto text-gray-400 hover:text-gray-600"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </h2>
        {!loadingMembers && (!members || members.length === 0) ? (
          <p className="text-sm text-gray-400 italic">No members yet. Invite your first client above.</p>
        ) : (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tier</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">CRM Linked</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Login</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members?.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">{m.email}</td>
                    <td className="px-4 py-3">
                      <Select
                        value={m.tier}
                        onValueChange={(v) =>
                          updateMemberMutation.mutate({
                            memberId: m.id,
                            tier: v as "platinum" | "gold" | "silver",
                          })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="platinum">Platinum</SelectItem>
                          <SelectItem value="gold">Gold</SelectItem>
                          <SelectItem value="silver">Silver</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      {m.crmPersonId ? (
                        <span className="flex items-center gap-1 text-green-600 text-xs">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Linked
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-gray-400 text-xs">
                          <XCircle className="w-3.5 h-3.5" />
                          Not linked
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={`text-xs ${m.active ? "bg-green-100 text-green-800 border-green-200" : "bg-red-100 text-red-800 border-red-200"}`}
                      >
                        {m.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {m.lastSignedIn ? new Date(m.lastSignedIn).toLocaleDateString() : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() =>
                          updateMemberMutation.mutate({
                            memberId: m.id,
                            active: !m.active,
                          })
                        }
                      >
                        {m.active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Advisor Role Management (admin/senior_advisor only) */}
      {isAdmin && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Advisor Role Management
          </h2>
          {loadingAdvisors ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Role</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Change Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {advisors?.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{a.name ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">{a.email ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs capitalize ${ROLE_BADGE[a.role] ?? ""}`}>
                          {a.role.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {user?.id !== a.id ? (
                          <Select
                            value={a.role}
                            onValueChange={(v) =>
                              updateRoleMutation.mutate({
                                userId: a.id,
                                role: v as "advisor" | "senior_advisor" | "admin",
                              })
                            }
                          >
                            <SelectTrigger className="h-7 text-xs w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="advisor">Advisor</SelectItem>
                              <SelectItem value="senior_advisor">Senior Advisor</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-gray-400 italic">You</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
