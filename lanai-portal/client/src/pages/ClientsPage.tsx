/**
 * Lanai — Clients (People) page
 * Data: Live from Twenty CRM via /crm GraphQL proxy
 */
import { useState, useEffect, useCallback } from "react";
import { Users, Search, Phone, Mail, RefreshCw, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchClients, timeAgo, type CRMPerson } from "@/lib/crmApi";
import { trpc } from "@/lib/trpc";

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<CRMPerson[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: envConfig } = trpc.system.env.useQuery();

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

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const fullName = `${c.name.firstName} ${c.name.lastName}`.toLowerCase();
    return fullName.includes(q) || (c.emails?.primaryEmail ?? "").toLowerCase().includes(q) || (c.city ?? "").toLowerCase().includes(q);
  });

  const initials = (p: CRMPerson) => {
    const f = p.name.firstName?.[0] ?? "";
    const l = p.name.lastName?.[0] ?? "";
    return (f + l).toUpperCase() || "?";
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1"><Users className="w-5 h-5 text-primary" /></div>
          <h1 className="text-3xl font-bold" style={{ fontFamily:"'Playfair Display', serif" }}>Clients</h1>
          <p className="text-muted-foreground mt-1">
            {loading ? "Loading…" : `${totalCount.toLocaleString()} client records in CRM`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          {loading ? "Loading…" : "Refresh"}
        </Button>
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
          <Input className="pl-9" placeholder="Search by name, email, city…" value={search} onChange={e => setSearch(e.target.value)} />
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
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-muted animate-pulse shrink-0" />
                      <div className="h-4 bg-muted rounded animate-pulse w-32" />
                    </div>
                  </td>
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
            ) : filtered.map(client => (
              <tr key={client.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                      {initials(client)}
                    </div>
                    <span className="font-medium text-foreground">
                      {client.name.firstName} {client.name.lastName}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="space-y-0.5">
                    {client.emails?.primaryEmail && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="w-3 h-3" />{client.emails.primaryEmail}
                      </div>
                    )}
                    {client.phones?.primaryPhoneNumber && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" />{client.phones.primaryPhoneNumber}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">{client.city || "—"}</td>
                <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">{timeAgo(client.createdAt)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(client.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            Showing {filtered.length} of {totalCount.toLocaleString()} clients
          </div>
        )}
      </div>
    </div>
  );
}
