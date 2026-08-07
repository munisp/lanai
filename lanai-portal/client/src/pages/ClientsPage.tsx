/**
 * Lanai — Clients (People) page
 * Data: Live from Twenty CRM via /crm GraphQL proxy + Postgres `clients` table.
 * Advisors can add clients directly (saved to Postgres).
 */
import { useState, useEffect, useCallback } from "react";
import { Users, Search, Phone, Mail, RefreshCw, AlertCircle, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchClients, timeAgo, type CRMPerson } from "@/lib/crmApi";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type LocalClient = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  company?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function AddClientDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");

  const createClient = trpc.clients.create.useMutation({
    onSuccess: () => {
      toast.success("Client created");
      setOpen(false);
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setCity("");
      setCountry("");
      setCompany("");
      setNotes("");
      onCreated();
    },
    onError: (e) => toast.error(e.message || "Failed to create client"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createClient.mutate({
      firstName,
      lastName,
      email,
      phone: phone || undefined,
      city: city || undefined,
      country: country || undefined,
      company: company || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 text-white" style={{ background: "oklch(0.35 0.09 145)" }}>
          <UserPlus className="w-4 h-4" /> Add Client
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Playfair Display', serif" }}>
            Add New Client
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">First Name</label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Alexandra" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Last Name</label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Reed" required />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Phone</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44…" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Company</label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">City</label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="London" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Country</label>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="United Kingdom" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Preferences, notes…"
              className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
          </div>
          {createClient.error && (
            <p className="text-red-600 text-sm">{createClient.error.message}</p>
          )}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              type="submit"
              disabled={!firstName || !lastName || !email || createClient.isPending}
              className="text-white"
              style={{ background: "oklch(0.35 0.09 145)" }}
            >
              {createClient.isPending ? "Creating…" : "Create Client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<CRMPerson[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: envConfig } = trpc.system.env.useQuery();
  const {
    data: localClients = [],
    refetch: refetchLocal,
  } = trpc.clients.list.useQuery();

  const load = useCallback(async () => {
    if (!envConfig?.crmEnabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchClients(200);
      setClients(res.clients);
      setTotalCount(res.totalCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, [envConfig?.crmEnabled]);

  useEffect(() => { if (envConfig !== undefined) load(); }, [load, envConfig]);

  // Merge Postgres clients into the CRM list so newly added clients appear.
  const merged: Array<{
    key: string;
    fullName: string;
    email: string;
    phone: string;
    city: string;
    createdAt: string | Date;
    updatedAt: string | Date;
    source: "crm" | "local";
  }> = [
    ...clients.map((c) => ({
      key: c.id,
      fullName: `${c.name.firstName} ${c.name.lastName}`,
      email: c.emails?.primaryEmail ?? "",
      phone: c.phones?.primaryPhoneNumber ?? "",
      city: c.city ?? "",
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      source: "crm" as const,
    })),
    ...localClients.map((c: LocalClient) => ({
      key: `local-${c.id}`,
      fullName: `${c.firstName} ${c.lastName}`,
      email: c.email,
      phone: c.phone ?? "",
      city: c.city ?? "",
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
      updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : String(c.updatedAt),
      source: "local" as const,
    })),
  ];

  const filtered = merged.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.fullName.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q)
    );
  });

  const initials = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    const f = parts[0]?.[0] ?? "";
    const l = parts[1]?.[0] ?? "";
    return (f + l).toUpperCase() || "?";
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1"><Users className="w-5 h-5 text-primary" /></div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>Clients</h1>
          <p className="text-muted-foreground mt-1">
            {loading ? "Loading…" : `${(totalCount + localClients.length).toLocaleString()} client records`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AddClientDialog onCreated={() => refetchLocal()} />
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>
      <hr className="lanai-divider" />

      {error && (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>CRM error: {error}. <button onClick={load} className="underline">Retry</button></span>
        </div>
      )}

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name, email, city…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {search && <span className="text-sm text-muted-foreground self-center">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>}
      </div>

      <div className="lanai-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Client</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden md:table-cell">Contact</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden lg:table-cell">City</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hidden lg:table-cell">Added</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">Last Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 12 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-32" /></td>
                  <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-40" /></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-muted rounded animate-pulse w-16" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-16" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  {search ? `No clients matching "${search}"` : "No clients found"}
                </td>
              </tr>
            ) : filtered.map((client) => (
              <tr key={client.key} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                      {initials(client.fullName)}
                    </div>
                    <span className="font-medium text-foreground">
                      {client.fullName}
                    </span>
                    {client.source === "local" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                        Local
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="space-y-0.5">
                    {client.email && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="w-3 h-3" />{client.email}
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" />{client.phone}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">{client.city || "—"}</td>
                <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">{timeAgo(String(client.createdAt))}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(String(client.updatedAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            Showing {filtered.length} of {(totalCount + localClients.length).toLocaleString()} clients
          </div>
        )}
      </div>
    </div>
  );
}
