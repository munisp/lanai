import {
  Gift, Plus, Calendar, Bell, Star, Heart, PartyPopper,
  Cake, Anchor, CheckCircle, Clock, Trash2, Edit
} from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Celebration Type Icons ───────────────────────────────────────────────────
const CELEBRATION_ICONS: Record<string, React.ElementType> = {
  birthday: Cake,
  anniversary: Heart,
  honeymoon: Heart,
  graduation: Star,
  milestone: Star,
  holiday: PartyPopper,
  other: Gift,
};

const CELEBRATION_COLORS: Record<string, string> = {
  birthday: "bg-pink-50 text-pink-600",
  anniversary: "bg-red-50 text-red-600",
  honeymoon: "bg-rose-50 text-rose-600",
  graduation: "bg-purple-50 text-purple-600",
  milestone: "bg-amber-50 text-amber-600",
  holiday: "bg-blue-50 text-blue-600",
  other: "bg-gray-50 text-gray-600",
};

// ─── Celebration Card ─────────────────────────────────────────────────────────
function CelebrationCard({
  celebration, onDelete,
}: {
  celebration: {
    id: number; celebrationType: string; celebrationDate: string; title: string;
    notes?: string | null; reminderDaysBefore?: number | null; isRecurring?: boolean | null;
    giftBudget?: string | null; giftStatus?: string | null;
  };
  onDelete: (id: number) => void;
}) {
  const Icon = CELEBRATION_ICONS[celebration.celebrationType] ?? Gift;
  const daysUntil = Math.ceil(
    (new Date(celebration.celebrationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const isUpcoming = daysUntil >= 0 && daysUntil <= 30;

  return (
    <div className={cn("lanai-card p-5 space-y-3", isUpcoming && "ring-2 ring-amber-300")}>
      {isUpcoming && (
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full w-fit">
          <Bell className="w-3 h-3" />
          {daysUntil === 0 ? "Today!" : `In ${daysUntil} days`}
        </div>
      )}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", CELEBRATION_COLORS[celebration.celebrationType])}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-foreground">{celebration.title}</div>
            <div className="text-xs text-muted-foreground capitalize">{celebration.celebrationType}</div>
          </div>
        </div>
        <Button
          variant="ghost" size="icon"
          className="text-destructive hover:text-destructive h-8 w-8"
          onClick={() => onDelete(celebration.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-muted-foreground mb-0.5">Date</div>
          <div className="font-medium flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(celebration.celebrationDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
          </div>
        </div>
        {celebration.reminderDaysBefore && (
          <div>
            <div className="text-muted-foreground mb-0.5">Reminder</div>
            <div className="font-medium flex items-center gap-1">
              <Bell className="w-3 h-3" />
              {celebration.reminderDaysBefore} days before
            </div>
          </div>
        )}
        {celebration.giftBudget && (
          <div>
            <div className="text-muted-foreground mb-0.5">Gift Budget</div>
            <div className="font-medium">£{parseFloat(celebration.giftBudget).toLocaleString()}</div>
          </div>
        )}
        {celebration.giftStatus && (
          <div>
            <div className="text-muted-foreground mb-0.5">Gift Status</div>
            <div className={cn("font-medium capitalize", celebration.giftStatus === "arranged" ? "text-emerald-600" : "text-amber-600")}>
              {celebration.giftStatus}
            </div>
          </div>
        )}
      </div>

      {celebration.isRecurring && (
        <div className="flex items-center gap-1 text-xs text-primary">
          <CheckCircle className="w-3 h-3" /> Recurring annually
        </div>
      )}

      {celebration.notes && (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">{celebration.notes}</div>
      )}
    </div>
  );
}

// ─── VIP Amenity Card ─────────────────────────────────────────────────────────
function VipAmenityCard({ amenity, onUpdateStatus }: {
  amenity: {
    id: number; amenityType: string; description?: string | null; status: string;
    cost?: string | null; confirmedAt?: Date | null; bookingId?: number | null;
  };
  onUpdateStatus: (id: number, status: string) => void;
}) {
  const statusColors: Record<string, string> = {
    requested: "bg-blue-50 text-blue-700",
    confirmed: "bg-emerald-50 text-emerald-700",
    delivered: "bg-gray-50 text-gray-600",
    cancelled: "bg-red-50 text-red-500",
  };
  return (
    <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
          <Star className="w-4 h-4" />
        </div>
        <div>
          <div className="text-sm font-medium capitalize">{amenity.amenityType.replace("_", " ")}</div>
          {amenity.description && <div className="text-xs text-muted-foreground">{amenity.description}</div>}
          {amenity.cost && <div className="text-xs text-muted-foreground">Cost: £{parseFloat(amenity.cost).toLocaleString()}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusColors[amenity.status] ?? "bg-gray-100 text-gray-600")}>
          {amenity.status}
        </span>
        {amenity.status === "requested" && (
          <Button size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => onUpdateStatus(amenity.id, "confirmed")}>
            Confirm
          </Button>
        )}
        {amenity.status === "confirmed" && (
          <Button size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => onUpdateStatus(amenity.id, "delivered")}>
            Delivered
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Add Celebration Dialog ───────────────────────────────────────────────────
function AddCelebrationDialog({ memberId, onAdded }: { memberId: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("birthday");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [reminderDays, setReminderDays] = useState("14");
  const [recurring, setRecurring] = useState(true);
  const [giftBudget, setGiftBudget] = useState("");

  const addCelebration = trpc.celebrations.add.useMutation({
    onSuccess: () => { toast.success("Celebration added"); setOpen(false); onAdded(); },
    onError: () => toast.error("Failed to add celebration"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 text-white" style={{ background: "oklch(0.35 0.09 145)" }}>
          <Plus className="w-4 h-4" /> Add Celebration
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Playfair Display', serif" }}>Add Celebration</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="birthday">Birthday</SelectItem>
                <SelectItem value="anniversary">Anniversary</SelectItem>
                <SelectItem value="honeymoon">Honeymoon</SelectItem>
                <SelectItem value="graduation">Graduation</SelectItem>
                <SelectItem value="retirement">Retirement</SelectItem>
                <SelectItem value="promotion">Promotion</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Title</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 50th Birthday" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Date</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Reminder (days before)</label>
              <Input type="number" value={reminderDays} onChange={e => setReminderDays(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Gift Budget (£)</label>
              <Input type="number" value={giftBudget} onChange={e => setGiftBudget(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="recurring" checked={recurring} onChange={e => setRecurring(e.target.checked)} className="rounded" />
            <label htmlFor="recurring" className="text-sm">Recurring annually</label>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Special instructions..." className="min-h-16" />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addCelebration.mutate({
                memberId,
                celebrationType: type as "birthday" | "anniversary" | "honeymoon" | "graduation" | "retirement" | "promotion" | "other",
                title,
                celebrationDate: date,
                notes: notes || undefined,
                reminderDaysBefore: reminderDays ? parseInt(reminderDays) : undefined,
                isRecurring: recurring,
                // giftBudget not in schema
              })}
              disabled={!title || !date || addCelebration.isPending}
              className="text-white" style={{ background: "oklch(0.35 0.09 145)" }}
            >
              {addCelebration.isPending ? "Adding..." : "Add Celebration"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CelebrationsPage({ memberId }: { memberId?: number }) {
  const id = memberId ?? 1;

  const { data: celebrations, isLoading: celebLoading, refetch: refetchCeleb } =
    trpc.celebrations.list.useQuery({ memberId: id });

  const { data: upcoming } = trpc.celebrations.upcoming.useQuery({ daysAhead: 30 });

  const { data: amenities, isLoading: amenitiesLoading, refetch: refetchAmenities } =
    trpc.vipAmenities.list.useQuery({ memberId: id });

  const deleteCelebration = trpc.celebrations.delete.useMutation({
    onSuccess: () => { toast.success("Celebration removed"); refetchCeleb(); },
  });

  const confirmAmenity = trpc.vipAmenities.confirm.useMutation({
    onSuccess: () => { toast.success("Amenity confirmed"); refetchAmenities(); },
  });
  const deliverAmenity = trpc.vipAmenities.markDelivered.useMutation({
    onSuccess: () => { toast.success("Amenity delivered"); refetchAmenities(); },
  });

  const [amenityType, setAmenityType] = useState("champagne");
  const [amenityDesc, setAmenityDesc] = useState("");
  const [amenityCost, setAmenityCost] = useState("");
  const addAmenity = trpc.vipAmenities.request.useMutation({
    onSuccess: () => { toast.success("VIP amenity requested"); refetchAmenities(); setAmenityDesc(""); setAmenityCost(""); },
  });

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1"><Gift className="w-5 h-5 text-primary" /></div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
            Celebrations & Experience
          </h1>
          <p className="text-muted-foreground mt-1">Automated reminders, VIP amenities, and personalised experiences</p>
        </div>
        <AddCelebrationDialog memberId={id} onAdded={refetchCeleb} />
      </div>
      <hr className="lanai-divider" />

      {/* Upcoming Reminders Banner */}
      {upcoming && upcoming.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">Upcoming Celebrations (Next 30 Days)</span>
          </div>
          <div className="space-y-2">
            {upcoming.map(c => {
              const Icon = CELEBRATION_ICONS[c.celebrationType] ?? Gift;
              const daysUntil = Math.ceil((new Date(c.celebrationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return (
                <div key={c.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-amber-600" />
                    <span className="font-medium">{c.title}</span>
                  </div>
                  <span className="text-xs text-amber-700 font-medium">
                    {daysUntil === 0 ? "Today!" : `${daysUntil} days`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Celebrations Grid */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          All Celebrations
        </h2>
        {celebLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
          </div>
        ) : celebrations && celebrations.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {celebrations.map(c => (
              <CelebrationCard
                key={c.id}
                celebration={c as unknown as {
                  id: number; celebrationType: string; celebrationDate: string; title: string;
                  notes?: string | null; reminderDaysBefore?: number | null; isRecurring?: boolean | null;
                  giftBudget?: string | null; giftStatus?: string | null;
                }}
                onDelete={id => deleteCelebration.mutate({ celebrationId: id })}
              />
            ))}
          </div>
        ) : (
          <div className="lanai-card p-12 text-center text-muted-foreground">
            <Gift className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No celebrations added yet</p>
          </div>
        )}
      </div>

      {/* VIP Amenities */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">VIP Amenities</h2>
        </div>

        {/* Quick Add Amenity */}
        <div className="lanai-card p-4 mb-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Amenity Type</label>
              <Select value={amenityType} onValueChange={setAmenityType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="champagne">Champagne on Arrival</SelectItem>
                  <SelectItem value="flowers">Flowers</SelectItem>
                  <SelectItem value="room_upgrade">Room Upgrade</SelectItem>
                  <SelectItem value="early_checkin">Early Check-in</SelectItem>
                  <SelectItem value="late_checkout">Late Check-out</SelectItem>
                  <SelectItem value="spa_credit">Spa Credit</SelectItem>
                  <SelectItem value="dining_credit">Dining Credit</SelectItem>
                  <SelectItem value="welcome_gift">Welcome Gift</SelectItem>
                  <SelectItem value="birthday_cake">Birthday Cake</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
              <Input value={amenityDesc} onChange={e => setAmenityDesc(e.target.value)} placeholder="Details..." />
            </div>
            <div className="w-28">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cost (£)</label>
              <Input type="number" value={amenityCost} onChange={e => setAmenityCost(e.target.value)} placeholder="0.00" />
            </div>
            <Button
              onClick={() => addAmenity.mutate({
                memberId: id,
                amenityType,
                description: amenityDesc || undefined,
                cost: amenityCost || undefined,
              })}
              disabled={addAmenity.isPending}
              className="gap-2 text-white whitespace-nowrap" style={{ background: "oklch(0.35 0.09 145)" }}
            >
              <Plus className="w-4 h-4" /> Request
            </Button>
          </div>
        </div>

        {amenitiesLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : amenities && amenities.length > 0 ? (
          <div className="space-y-2">
            {amenities.map(a => (
              <VipAmenityCard
                key={a.id}
                amenity={a as unknown as {
                  id: number; amenityType: string; description?: string | null; status: string;
                  cost?: string | null; confirmedAt?: Date | null; bookingId?: number | null;
                }}
                onUpdateStatus={(id, status) => status === "confirmed" ? confirmAmenity.mutate({ amenityId: id }) : deliverAmenity.mutate({ amenityId: id })}
              />
            ))}
          </div>
        ) : (
          <div className="lanai-card p-8 text-center text-muted-foreground">
            <Star className="w-6 h-6 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No VIP amenities requested</p>
          </div>
        )}
      </div>
    </div>
  );
}
