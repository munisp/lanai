/**
 * Lanai — Welcome Gifts & VIP Amenities (Advisor)
 * Plan, confirm and track luxury welcome amenities per member.
 */
import { useState } from "react";
import {
  Gift, Plus, Check, Truck, Package, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

const AMENITY_TYPES = [
  { value: "welcome_gift", label: "Welcome Gift" },
  { value: "room_upgrade", label: "Room Upgrade" },
  { value: "champagne", label: "Champagne & Rosé" },
  { value: "flowers", label: "Floral Arrangement" },
  { value: "private_dining", label: "Private Dining" },
  { value: "spa_credit", label: "Spa Credit" },
  { value: "airport_transfer", label: "Airport Transfer" },
];

export default function WelcomeGiftsPage({ memberId }: { memberId?: number }) {
  const [selectedMember, setSelectedMember] = useState<number>(memberId ?? 1);
  const [type, setType] = useState("welcome_gift");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");

  const { data: members } = trpc.members.list.useQuery();
  const { data: amenities, refetch } = trpc.vipAmenities.list.useQuery(
    { memberId: selectedMember },
    { enabled: !!selectedMember }
  );

  const requestMut = trpc.vipAmenities.request.useMutation({
    onSuccess: () => { toast.success("Welcome gift requested"); setDescription(""); setCost(""); refetch(); },
    onError: e => toast.error(`Could not request: ${e.message}`),
  });
  const confirmMut = trpc.vipAmenities.confirm.useMutation({
    onSuccess: () => { toast.success("Amenity confirmed"); refetch(); },
    onError: e => toast.error(`Could not confirm: ${e.message}`),
  });
  const deliverMut = trpc.vipAmenities.markDelivered.useMutation({
    onSuccess: () => { toast.success("Marked as delivered"); refetch(); },
    onError: e => toast.error(`Could not update: ${e.message}`),
  });

  const request = () => {
    requestMut.mutate({
      memberId: selectedMember,
      amenityType: type,
      description: description.trim() || undefined,
      cost: cost.trim() || undefined,
    });
  };

  const statusOf = (a: any) => {
    if (a.deliveredAt) return { label: "Delivered", color: "bg-emerald-50 text-emerald-700", icon: Truck };
    if (a.confirmedAt) return { label: "Confirmed", color: "bg-blue-50 text-blue-700", icon: Check };
    return { label: "Requested", color: "bg-amber-50 text-amber-700", icon: Package };
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1"><Gift className="w-5 h-5 text-primary" /></div>
        <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>Welcome Gifts & VIP Amenities</h1>
        <p className="text-muted-foreground mt-1">Curate and track luxury touches that make every arrival unforgettable.</p>
      </div>
      <hr className="lanai-divider" />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Request form */}
        <div className="lanai-card p-5 space-y-4 lg:col-span-1">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />Plan an amenity</h2>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Member</label>
            <Select value={String(selectedMember)} onValueChange={v => setSelectedMember(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(members ?? []).map(m => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Amenity</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AMENITY_TYPES.map(a => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Hand-engraved silver frame with family photo" className="min-h-20" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Estimated cost (GBP)</label>
            <Input value={cost} onChange={e => setCost(e.target.value)} placeholder="e.g. 450" />
          </div>
          <Button onClick={request} disabled={requestMut.isPending} className="w-full gap-1 text-white" style={{ background: "oklch(0.35 0.09 145)" }}>
            <Plus className="w-4 h-4" /> Request Amenity
          </Button>
        </div>

        {/* List */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-lg font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>Amenities for this member</h2>
          {!amenities || amenities.length === 0 ? (
            <div className="lanai-card p-8 text-center text-muted-foreground">
              <Gift className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No amenities planned yet.</p>
            </div>
          ) : (
            amenities.map((a: any) => {
              const st = statusOf(a);
              const StatusIcon = st.icon;
              return (
                <div key={a.id} className="lanai-card p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold capitalize">{a.amenityType.replace("_", " ")}</span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1", st.color)}>
                        <StatusIcon className="w-3 h-3" />{st.label}
                      </span>
                    </div>
                    {a.description && <p className="text-sm text-muted-foreground mt-1">{a.description}</p>}
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {a.cost && <span>£{Number(a.cost).toLocaleString()} {a.currency}</span>}
                      <span>{new Date(a.createdAt).toLocaleDateString("en-GB")}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {!a.confirmedAt && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => confirmMut.mutate({ amenityId: a.id })} disabled={confirmMut.isPending}>
                        <Check className="w-3.5 h-3.5" /> Confirm
                      </Button>
                    )}
                    {a.confirmedAt && !a.deliveredAt && (
                      <Button size="sm" className="gap-1 text-white" style={{ background: "oklch(0.35 0.09 145)" }} onClick={() => deliverMut.mutate({ amenityId: a.id })} disabled={deliverMut.isPending}>
                        <Truck className="w-3.5 h-3.5" /> Mark Delivered
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
