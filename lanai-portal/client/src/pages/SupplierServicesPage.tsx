import {
  Building2, Plus, Search, Star, Globe, DollarSign,
  Send, Clock, CheckCircle, XCircle, Filter, ChevronDown
} from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Service Card ─────────────────────────────────────────────────────────────
function ServiceCard({ service }: {
  service: {
    id: number; serviceName: string; serviceCategory: string; description?: string | null;
    basePrice?: string | null; currency?: string | null; isAvailable?: boolean | null;
    supplierName?: string | null;
  };
}) {
  const catColors: Record<string, string> = {
    hotel_room: "bg-blue-50 text-blue-700",
    villa_rental: "bg-emerald-50 text-emerald-700",
    yacht_charter: "bg-purple-50 text-purple-700",
    private_jet: "bg-amber-50 text-amber-700",
    transfer: "bg-gray-50 text-gray-700",
    dining: "bg-red-50 text-red-700",
    spa: "bg-pink-50 text-pink-700",
    experience: "bg-teal-50 text-teal-700",
    other: "bg-gray-50 text-gray-700",
  };

  return (
    <div className="lanai-card p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-foreground">{service.serviceName}</div>
          {service.supplierName && (
            <div className="text-xs text-muted-foreground mt-0.5">{service.supplierName}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", catColors[service.serviceCategory] ?? "bg-gray-100 text-gray-600")}>
            {service.serviceCategory.replace("_", " ")}
          </span>
          {service.isAvailable !== null && (
            <span className={cn("text-xs", service.isAvailable ? "text-emerald-600" : "text-red-500")}>
              {service.isAvailable ? "● Available" : "● Unavailable"}
            </span>
          )}
        </div>
      </div>
      {service.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{service.description}</p>
      )}
      {service.basePrice && (
        <div className="text-sm font-semibold" style={{ color: "oklch(0.35 0.09 145)" }}>
          From {service.currency ?? "£"}{parseFloat(service.basePrice).toLocaleString()}
        </div>
      )}
    </div>
  );
}

// ─── Inquiry Row ──────────────────────────────────────────────────────────────
function InquiryRow({ inquiry }: {
  inquiry: {
    id: number; requestDetails: string; status: string; quotedPrice?: string | null;
    currency?: string | null; responseNotes?: string | null; createdAt: Date;
    supplierName?: string | null; serviceName?: string | null;
  };
}) {
  const statusMap: Record<string, { color: string; icon: React.ElementType }> = {
    pending: { color: "bg-amber-50 text-amber-700", icon: Clock },
    responded: { color: "bg-blue-50 text-blue-700", icon: CheckCircle },
    accepted: { color: "bg-emerald-50 text-emerald-700", icon: CheckCircle },
    declined: { color: "bg-red-50 text-red-500", icon: XCircle },
    expired: { color: "bg-gray-50 text-gray-500", icon: XCircle },
  };
  const { color, icon: StatusIcon } = statusMap[inquiry.status] ?? { color: "bg-gray-100 text-gray-600", icon: Clock };

  return (
    <div className="flex items-start gap-4 p-4 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {inquiry.supplierName && <span className="text-sm font-semibold">{inquiry.supplierName}</span>}
          {inquiry.serviceName && <span className="text-xs text-muted-foreground">· {inquiry.serviceName}</span>}
          <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium", color)}>
            <StatusIcon className="w-3 h-3" />
            {inquiry.status.charAt(0).toUpperCase() + inquiry.status.slice(1)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{inquiry.requestDetails}</p>
        {inquiry.responseNotes && (
          <p className="text-xs text-foreground mt-1 bg-muted/30 rounded p-2">{inquiry.responseNotes}</p>
        )}
        <div className="text-xs text-muted-foreground mt-1">
          {new Date(inquiry.createdAt).toLocaleDateString("en-GB")}
        </div>
      </div>
      {inquiry.quotedPrice && (
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.35 0.09 145)" }}>
            {inquiry.currency ?? "£"}{parseFloat(inquiry.quotedPrice).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Quoted</div>
        </div>
      )}
    </div>
  );
}

// ─── Add Service Dialog ───────────────────────────────────────────────────────
function AddServiceDialog({ supplierId, onAdded }: { supplierId: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("hotel_room");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [currency, setCurrency] = useState("GBP");

  const addService = trpc.supplierServices.addService.useMutation({
    onSuccess: () => { toast.success("Service added"); setOpen(false); onAdded(); },
    onError: () => toast.error("Failed to add service"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="w-3.5 h-3.5" /> Add Service
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Playfair Display', serif" }}>Add Supplier Service</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Service Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Deluxe Ocean Suite" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hotel_room">Hotel Room</SelectItem>
                <SelectItem value="villa_rental">Villa Rental</SelectItem>
                <SelectItem value="yacht_charter">Yacht Charter</SelectItem>
                <SelectItem value="private_jet">Private Jet</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
                <SelectItem value="dining">Dining</SelectItem>
                <SelectItem value="spa">Spa</SelectItem>
                <SelectItem value="experience">Experience</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Service details..." className="min-h-16" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Base Price</label>
              <Input type="number" value={basePrice} onChange={e => setBasePrice(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Currency</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addService.mutate({
                supplierId,
                serviceType: `${category}: ${name}`,
                description: description || undefined,
                basePrice: basePrice || undefined,
                currency,
              })}
              disabled={!name || addService.isPending}
              className="text-white" style={{ background: "oklch(0.35 0.09 145)" }}
            >
              {addService.isPending ? "Adding..." : "Add Service"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Submit Inquiry Dialog ────────────────────────────────────────────────────
function SubmitInquiryDialog({ memberId, onSubmitted }: { memberId: number; onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [details, setDetails] = useState("");
  const [requestedDate, setRequestedDate] = useState("");
  const [budget, setBudget] = useState("");

  const submitInquiry = trpc.supplierServices.submitPricingInquiry.useMutation({
    onSuccess: () => { toast.success("Pricing inquiry submitted"); setOpen(false); onSubmitted(); },
    onError: () => toast.error("Failed to submit inquiry"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 text-white" style={{ background: "oklch(0.35 0.09 145)" }}>
          <Send className="w-4 h-4" /> Submit Inquiry
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Playfair Display', serif" }}>Submit Pricing Inquiry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Supplier ID</label>
              <Input type="number" value={supplierId} onChange={e => setSupplierId(e.target.value)} placeholder="Supplier ID" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Service ID (optional)</label>
              <Input type="number" value={serviceId} onChange={e => setServiceId(e.target.value)} placeholder="Service ID" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Request Details</label>
            <Textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="Describe the specific requirements..." className="min-h-24" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Requested Date</label>
              <Input type="date" value={requestedDate} onChange={e => setRequestedDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Budget (£)</label>
              <Input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => submitInquiry.mutate({
                supplierId: parseInt(supplierId),
                serviceType: "general",
                requestDetails: details,
                checkInDate: requestedDate || undefined,
                budget: budget || undefined,
              })}
              disabled={!supplierId || !details || submitInquiry.isPending}
              className="text-white" style={{ background: "oklch(0.35 0.09 145)" }}
            >
              {submitInquiry.isPending ? "Submitting..." : "Submit Inquiry"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SupplierServicesPage() {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");

  const { data: services, isLoading: servicesLoading, refetch: refetchServices } =
    trpc.supplierServices.listForSupplier.useQuery({ supplierId: 1 });

  const { data: inquiries, isLoading: inquiriesLoading, refetch: refetchInquiries } =
    trpc.supplierServices.listInquiries.useQuery({});

  const filteredServices = (services ?? []).filter((s: { serviceType: string }) =>
    search === "" || s.serviceType.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1"><Building2 className="w-5 h-5 text-primary" /></div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
            Supplier Services
          </h1>
          <p className="text-muted-foreground mt-1">Service catalogue and pricing inquiry management</p>
        </div>
        <div className="flex gap-2">
          <AddServiceDialog supplierId={1} onAdded={refetchServices} />
          <SubmitInquiryDialog memberId={1} onSubmitted={refetchInquiries} />
        </div>
      </div>
      <hr className="lanai-divider" />

      <Tabs defaultValue="services">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="services">Service Catalogue</TabsTrigger>
          <TabsTrigger value="inquiries">Pricing Inquiries</TabsTrigger>
        </TabsList>

        {/* Services Tab */}
        <TabsContent value="services" className="mt-4 space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search services…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-44">
                <Filter className="w-3.5 h-3.5 mr-2" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="hotel_room">Hotel Rooms</SelectItem>
                <SelectItem value="villa_rental">Villas</SelectItem>
                <SelectItem value="yacht_charter">Yachts</SelectItem>
                <SelectItem value="private_jet">Private Jets</SelectItem>
                <SelectItem value="dining">Dining</SelectItem>
                <SelectItem value="spa">Spa</SelectItem>
                <SelectItem value="experience">Experiences</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {servicesLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)}
            </div>
          ) : filteredServices.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredServices.map(s => (
                <ServiceCard key={s.id} service={s as unknown as {
                  id: number; serviceName: string; serviceCategory: string; description?: string | null;
                  basePrice?: string | null; currency?: string | null; isAvailable?: boolean | null;
                  supplierName?: string | null;
                }} />
              ))}
            </div>
          ) : (
            <div className="lanai-card p-12 text-center text-muted-foreground">
              <Building2 className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No services found</p>
            </div>
          )}
        </TabsContent>

        {/* Inquiries Tab */}
        <TabsContent value="inquiries" className="mt-4">
          <div className="lanai-card overflow-hidden">
            {inquiriesLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}
              </div>
            ) : inquiries && inquiries.length > 0 ? (
              inquiries.map(inq => (
                <InquiryRow key={inq.id} inquiry={inq as {
                  id: number; requestDetails: string; status: string; quotedPrice?: string | null;
                  currency?: string | null; responseNotes?: string | null; createdAt: Date;
                  supplierName?: string | null; serviceName?: string | null;
                }} />
              ))
            ) : (
              <div className="p-12 text-center text-muted-foreground">
                <Send className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No pricing inquiries submitted yet</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
