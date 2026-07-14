import {
  Plane, MapPin, Calendar, DollarSign, Star, Clock,
  Hotel, Anchor, Car, Home, Building, Plus, ChevronRight
} from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Category Icons ───────────────────────────────────────────────────────────
const CAT_ICONS: Record<string, React.ElementType> = {
  hotel: Hotel, villa: Home, yacht: Anchor, jet: Plane,
  transfer: Car, experience: Star, apartment: Building, other: MapPin,
};
const CAT_COLORS: Record<string, string> = {
  hotel: "bg-blue-50 text-blue-600", villa: "bg-emerald-50 text-emerald-600",
  yacht: "bg-purple-50 text-purple-600", jet: "bg-amber-50 text-amber-600",
  transfer: "bg-gray-50 text-gray-600", experience: "bg-pink-50 text-pink-600",
  apartment: "bg-teal-50 text-teal-600", other: "bg-gray-50 text-gray-600",
};

// ─── Trip Card ────────────────────────────────────────────────────────────────
function TripCard({ trip }: {
  trip: {
    id: number; destination: string; tripCategory: string; startDate: string; endDate: string;
    totalSpend?: string | null; currency?: string | null; satisfactionScore?: string | null;
    supplierName?: string | null; notes?: string | null; bookingId?: number | null;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = CAT_ICONS[trip.tripCategory] ?? MapPin;
  const nights = Math.ceil(
    (new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  const isPast = new Date(trip.endDate) < new Date();

  return (
    <div className={cn("lanai-card overflow-hidden", !isPast && "ring-1 ring-primary/20")}>
      <div
        className="flex items-start gap-4 p-5 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0", CAT_COLORS[trip.tripCategory])}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-foreground flex items-center gap-2">
                {trip.destination}
                {!isPast && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Upcoming</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                {trip.tripCategory.replace("_", " ")}
                {trip.supplierName ? ` · ${trip.supplierName}` : ""}
              </div>
            </div>
            <ChevronRight className={cn("w-4 h-4 text-muted-foreground flex-shrink-0 mt-1 transition-transform", expanded && "rotate-90")} />
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(trip.startDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
              {" – "}
              {new Date(trip.endDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {nights} night{nights !== 1 ? "s" : ""}
            </span>
            {trip.totalSpend && (
              <span className="flex items-center gap-1 font-semibold text-foreground">
                <DollarSign className="w-3 h-3" />
                {trip.currency ?? "£"}{parseFloat(trip.totalSpend).toLocaleString()}
              </span>
            )}
            {trip.satisfactionScore && (
              <span className="flex items-center gap-1 text-amber-500 font-semibold">
                <Star className="w-3 h-3 fill-amber-400" />
                {parseFloat(trip.satisfactionScore).toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>
      {expanded && trip.notes && (
        <div className="px-5 pb-4 border-t border-border/50">
          <p className="text-sm text-muted-foreground mt-3">{trip.notes}</p>
        </div>
      )}
    </div>
  );
}

// ─── Add Trip Dialog ──────────────────────────────────────────────────────────
function AddTripDialog({ memberId, onAdded }: { memberId: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [category, setCategory] = useState("hotel");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [totalSpend, setTotalSpend] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [satisfactionScore, setSatisfactionScore] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [notes, setNotes] = useState("");

  const addTrip = trpc.tripTimeline.add.useMutation({
    onSuccess: () => { toast.success("Trip added to timeline"); setOpen(false); onAdded(); },
    onError: () => toast.error("Failed to add trip"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 text-white" style={{ background: "oklch(0.35 0.09 145)" }}>
          <Plus className="w-4 h-4" /> Add Trip
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Playfair Display', serif" }}>Add Trip to Timeline</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Destination</label>
            <Input value={destination} onChange={e => setDestination(e.target.value)} placeholder="e.g. Maldives, Aman Resorts" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hotel">Hotel</SelectItem>
                  <SelectItem value="villa">Villa</SelectItem>
                  <SelectItem value="yacht">Yacht</SelectItem>
                  <SelectItem value="jet">Private Jet</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="experience">Experience</SelectItem>
                  <SelectItem value="apartment">Apartment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Supplier</label>
              <Input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="e.g. Aman Resorts" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Start Date</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">End Date</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Total Spend</label>
              <Input type="number" value={totalSpend} onChange={e => setTotalSpend(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Currency</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GBP">GBP £</SelectItem>
                  <SelectItem value="EUR">EUR €</SelectItem>
                  <SelectItem value="USD">USD $</SelectItem>
                  <SelectItem value="AED">AED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Satisfaction (0–5)</label>
              <Input type="number" min="0" max="5" step="0.1" value={satisfactionScore} onChange={e => setSatisfactionScore(e.target.value)} placeholder="e.g. 4.8" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Concierge notes..." />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addTrip.mutate({
                memberId,
                title: `${category.charAt(0).toUpperCase() + category.slice(1)} - ${destination}`,
                destination,
                departureDate: startDate,
                returnDate: endDate,
                totalSpend: totalSpend || undefined,
                currency,
                satisfactionScore: satisfactionScore ? parseInt(satisfactionScore) : undefined,
                memberFeedback: notes || undefined,
              })}
              disabled={!destination || !startDate || !endDate || addTrip.isPending}
              className="text-white" style={{ background: "oklch(0.35 0.09 145)" }}
            >
              {addTrip.isPending ? "Adding..." : "Add Trip"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TripTimelinePage({ memberId }: { memberId?: number }) {
  const id = memberId ?? 1;
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: trips, isLoading, refetch } = trpc.tripTimeline.getForMember.useQuery({ memberId: id });

  const { data: stats } = trpc.tripTimeline.memberStats.useQuery({ memberId: id });

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1"><Plane className="w-5 h-5 text-primary" /></div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
            Trip Timeline
          </h1>
          <p className="text-muted-foreground mt-1">Complete travel history, spending, and satisfaction tracking</p>
        </div>
        <AddTripDialog memberId={id} onAdded={refetch} />
      </div>
      <hr className="lanai-divider" />

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="lanai-card p-4 text-center">
            <div className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.35 0.09 145)" }}>
              {stats.totalTrips}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Total Trips</div>
          </div>
          <div className="lanai-card p-4 text-center">
            <div className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.72 0.12 75)" }}>
              £{parseFloat(stats.totalSpend ?? "0").toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Total Spend</div>
          </div>
          <div className="lanai-card p-4 text-center">
            <div className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.35 0.09 145)" }}>
              {(stats as { totalNights?: number }).totalNights ?? "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Total Nights</div>
          </div>
          <div className="lanai-card p-4 text-center">
            <div className="text-2xl font-bold text-amber-500" style={{ fontFamily: "'Playfair Display', serif" }}>
              {parseFloat(stats.avgSatisfaction ?? "0").toFixed(1)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Avg Satisfaction</div>
          </div>
        </div>
      )}

      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap">
        {["all", "hotel", "villa", "yacht", "jet", "experience"].map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize",
              categoryFilter === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {cat === "all" ? "All Trips" : cat}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      ) : trips && trips.length > 0 ? (
        <div className="space-y-4">
          {trips.map(trip => (
            <TripCard key={trip.id} trip={trip as unknown as {
              id: number; destination: string; tripCategory: string; startDate: string; endDate: string;
              totalSpend?: string | null; currency?: string | null; satisfactionScore?: string | null;
              supplierName?: string | null; notes?: string | null; bookingId?: number | null;
            }} />
          ))}
        </div>
      ) : (
        <div className="lanai-card p-12 text-center text-muted-foreground">
          <Plane className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No trips recorded yet</p>
        </div>
      )}
    </div>
  );
}
