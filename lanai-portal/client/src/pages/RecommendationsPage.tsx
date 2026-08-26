import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Loader2, Sparkles, Check, Star } from "lucide-react";

type Member = {
  id: number;
  name: string;
  tier: string | null;
  email: string | null;
};

type RecItem = {
  supplierId: number;
  rank: number;
  rationale: string;
  roomTier: string | null;
  estimatedStartingRate: string | null;
  supplier: {
    supplierId: number;
    name: string;
    propertyType: string | null;
    rating: number | null;
    city: string | null;
    roomTiers: { tier: string; from: string }[];
    amenities: string[];
  } | null;
};

const PROPERTY_TYPES = ["hotel", "villa", "yacht"] as const;
type PropertyType = (typeof PROPERTY_TYPES)[number] | "";

export default function RecommendationsPage() {
  const [memberId, setMemberId] = useState<number | null>(null);
  const [destination, setDestination] = useState("Paris");
  const [propertyType, setPropertyType] = useState<PropertyType>("hotel");
  const [items, setItems] = useState<RecItem[]>([]);
  const [shortlistId, setShortlistId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const members = trpc.members.list.useQuery();
  const memberList = (members.data ?? []) as Member[];

  const generate =
    trpc.supplierRecommendations.recommendSuppliersForMember.useMutation({
      onSuccess: (d) => {
        setItems(d.items as RecItem[]);
        setShortlistId(d.shortlistId);
        setSelected(new Set());
        toast.success("Virtuoso shortlist generated");
      },
      onError: (e) => toast.error(`Failed: ${e.message}`),
    });
  const approve =
    trpc.supplierRecommendations.selectTopRecommendations.useMutation({
      onSuccess: (d) =>
        toast.success(`Approved top ${d.selectedSupplierIds.length}`),
      onError: (e) => toast.error(`Failed: ${e.message}`),
    });

  const handleGenerate = () => {
    if (!memberId) {
      toast.error("Select a member first");
      return;
    }
    if (!destination.trim()) {
      toast.error("Enter a destination");
      return;
    }
    generate.mutate({
      memberId,
      destination: destination.trim(),
      propertyType: propertyType || undefined,
    });
  };

  const toggle = (id: number) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else if (n.size < 3) n.add(id);
      else toast.error("Select up to 3 to approve");
      return n;
    });
  };

  const handleApprove = () => {
    if (!shortlistId || selected.size === 0) {
      toast.error("Select recommendations to approve");
      return;
    }
    approve.mutate({ shortlistId, supplierIds: [...selected] });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-amber-500" />
          Virtuoso Recommendations
        </h1>
        <p className="text-sm text-muted-foreground">
          AI-curated shortlist of luxury Virtuoso properties for a member's
          trip. Approve the top 3 to present to the client.
        </p>
      </div>

      <div className="lanai-card p-4 flex flex-wrap items-end gap-3">
        <label className="text-sm flex flex-col gap-1">
          Member
          <select
            className="border rounded px-2 py-1.5 text-sm bg-background min-w-[180px]"
            value={memberId ?? ""}
            onChange={(e) => setMemberId(Number(e.target.value))}
          >
            <option value="">Select a member</option>
            {memberList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.tier ?? "standard"})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm flex flex-col gap-1">
          Destination (city)
          <Input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Paris"
            className="w-40"
          />
        </label>
        <label className="text-sm flex flex-col gap-1">
          Property type
          <select
            className="border rounded px-2 py-1.5 text-sm bg-background"
            value={propertyType}
            onChange={(e) =>
              setPropertyType(e.target.value as PropertyType)
            }
          >
            <option value="hotel">Hotel</option>
            <option value="villa">Villa</option>
            <option value="yacht">Yacht</option>
            <option value="">Any</option>
          </select>
        </label>
        <Button
          onClick={handleGenerate}
          disabled={generate.isPending}
          className="gap-2 text-white"
          style={{ background: "oklch(0.35 0.09 145)" }}
        >
          {generate.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          Generate shortlist
        </Button>
      </div>

      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              Shortlist for {destination} ({items.length})
            </h2>
            <Button
              onClick={handleApprove}
              disabled={approve.isPending || selected.size === 0}
              className="gap-2"
              size="sm"
            >
              <Check className="w-4 h-4" /> Approve top {selected.size || 3}
            </Button>
          </div>
          {items.map((it) => {
            const s = it.supplier;
            const isSel = selected.has(it.supplierId);
            return (
              <div
                key={it.supplierId}
                className={`lanai-card p-4 flex gap-4 cursor-pointer border-2 ${
                  isSel ? "border-primary" : "border-transparent"
                }`}
                onClick={() => toggle(it.supplierId)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-muted-foreground">
                      #{it.rank}
                    </span>
                    <span className="font-semibold">
                      {s?.name ?? "Unknown"}
                    </span>
                    {s?.rating ? (
                      <span className="flex items-center gap-0.5 text-xs">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        {s.rating}
                      </span>
                    ) : null}
                    {s?.propertyType ? (
                      <Badge variant="outline">{s.propertyType}</Badge>
                    ) : null}
                    {isSel ? <Badge>Selected</Badge> : null}
                  </div>
                  {it.rationale ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      {it.rationale}
                    </p>
                  ) : null}
                  {s?.roomTiers?.length ? (
                    <div className="flex flex-wrap gap-2 mt-2 text-xs">
                      {s.roomTiers.map((r) => (
                        <span
                          key={r.tier}
                          className="rounded bg-muted px-1.5 py-0.5"
                        >
                          {r.tier}: from £{Number(r.from).toLocaleString()}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {s?.amenities?.length ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {s.amenities.map((a) => (
                        <Badge
                          key={a}
                          variant="secondary"
                          className="font-normal text-xs"
                        >
                          {a}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
