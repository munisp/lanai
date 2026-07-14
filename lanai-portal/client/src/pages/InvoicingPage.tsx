import {
  FileText, Plus, Search, Filter, Send, CheckCircle, Clock,
  AlertTriangle, Download, Eye, Building2, User, Trash2, DollarSign
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

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    sent: "bg-blue-50 text-blue-700",
    paid: "bg-emerald-50 text-emerald-700",
    overdue: "bg-red-50 text-red-700",
    voided: "bg-gray-50 text-gray-400",
    disputed: "bg-amber-50 text-amber-700",
  };
  const icons: Record<string, React.ElementType> = {
    draft: Clock, sent: Send, paid: CheckCircle, overdue: AlertTriangle, voided: FileText, disputed: AlertTriangle,
  };
  const Icon = icons[status] ?? FileText;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", map[status] ?? "bg-gray-100 text-gray-600")}>
      <Icon className="w-3 h-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Invoice Row ──────────────────────────────────────────────────────────────
function InvoiceRow({ invoice, onView }: {
  invoice: {
    id: number; invoiceNumber: string; invoiceType: string; status: string;
    totalAmount: string; currency: string; dueDate?: string | null; createdAt: Date;
  };
  onView: (id: number) => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors border-b border-border/50 last:border-0">
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center",
          invoice.invoiceType === "commission" ? "bg-purple-50 text-purple-600" : "bg-blue-50 text-blue-600"
        )}>
          {invoice.invoiceType === "commission" ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
        </div>
        <div>
          <div className="font-semibold text-sm">{invoice.invoiceNumber}</div>
          <div className="text-xs text-muted-foreground capitalize">
            {invoice.invoiceType === "commission" ? "Commission Invoice" : "Client Invoice"}
            {invoice.dueDate ? ` · Due ${new Date(invoice.dueDate).toLocaleDateString("en-GB")}` : ""}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="font-bold text-sm" style={{ fontFamily: "'Playfair Display', serif" }}>
            {invoice.currency} {parseFloat(invoice.totalAmount).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(invoice.createdAt).toLocaleDateString("en-GB")}
          </div>
        </div>
        <StatusBadge status={invoice.status} />
        <Button variant="ghost" size="icon" onClick={() => onView(invoice.id)}>
          <Eye className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Line Item Form ───────────────────────────────────────────────────────────
type LineItem = {
  itemType: string; description: string; quantity: string; unitPrice: string;
  commissionRate?: string; bookingId?: number;
};

function LineItemRow({ item, onChange, onRemove }: {
  item: LineItem;
  onChange: (v: LineItem) => void;
  onRemove: () => void;
}) {
  const total = (parseFloat(item.quantity || "0") * parseFloat(item.unitPrice || "0")).toFixed(2);
  return (
    <div className="grid grid-cols-12 gap-2 items-start p-3 bg-muted/20 rounded-lg">
      <div className="col-span-2">
        <Select value={item.itemType} onValueChange={v => onChange({ ...item, itemType: v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="hotel">Hotel</SelectItem>
            <SelectItem value="villa">Villa</SelectItem>
            <SelectItem value="apartment">Apartment</SelectItem>
            <SelectItem value="yacht">Yacht</SelectItem>
            <SelectItem value="jet">Private Jet</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
            <SelectItem value="experience">Experience</SelectItem>
            <SelectItem value="membership_fee">Membership Fee</SelectItem>
            <SelectItem value="ancillary">Ancillary</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-4">
        <Input className="h-8 text-xs" placeholder="Description" value={item.description} onChange={e => onChange({ ...item, description: e.target.value })} />
      </div>
      <div className="col-span-1">
        <Input className="h-8 text-xs" placeholder="Qty" type="number" value={item.quantity} onChange={e => onChange({ ...item, quantity: e.target.value })} />
      </div>
      <div className="col-span-2">
        <Input className="h-8 text-xs" placeholder="Unit Price" type="number" value={item.unitPrice} onChange={e => onChange({ ...item, unitPrice: e.target.value })} />
      </div>
      <div className="col-span-2">
        <div className="h-8 flex items-center px-2 bg-muted rounded text-xs font-mono font-semibold">
          £{total}
        </div>
      </div>
      <div className="col-span-1 flex justify-center">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onRemove}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Create Invoice Dialog ────────────────────────────────────────────────────
function CreateInvoiceDialog({ type, onCreated }: { type: "client_service" | "commission"; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { itemType: "hotel", description: "", quantity: "1", unitPrice: "" }
  ]);

  const createClient = trpc.invoicing.createClientInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice created"); setOpen(false); onCreated(); },
    onError: () => toast.error("Failed to create invoice"),
  });
  const createCommission = trpc.invoicing.createCommissionInvoice.useMutation({
    onSuccess: () => { toast.success("Commission invoice created"); setOpen(false); onCreated(); },
    onError: () => toast.error("Failed to create invoice"),
  });

  const total = lineItems.reduce((sum, item) => sum + parseFloat(item.quantity || "0") * parseFloat(item.unitPrice || "0"), 0);

  const handleCreate = () => {
    if (type === "client_service") {
      createClient.mutate({
        memberId: parseInt(memberId),
        lineItems: lineItems.map(li => ({ itemType: li.itemType as "hotel" | "flight" | "villa" | "apartment" | "yacht" | "jet" | "transfer" | "restaurant" | "event" | "experience" | "membership_fee" | "ancillary" | "other", description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, commissionRate: li.commissionRate })),
        currency,
        notes: notes || undefined,
        dueDate: dueDate || undefined,
      });
    } else {
      createCommission.mutate({
        supplierId: parseInt(supplierId),
        lineItems: lineItems.map(li => ({ ...li, commissionRate: li.commissionRate || "10" })),
        currency,
        notes: notes || undefined,
        dueDate: dueDate || undefined,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 text-white" style={{ background: "oklch(0.35 0.09 145)" }}>
          <Plus className="w-4 h-4" />
          {type === "commission" ? "Commission Invoice" : "Client Invoice"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Playfair Display', serif" }}>
            {type === "commission" ? "Create Commission Invoice" : "Create Client Invoice"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            {type === "client_service" ? (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Member ID</label>
                <Input value={memberId} onChange={e => setMemberId(e.target.value)} placeholder="Member ID" type="number" />
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Supplier ID</label>
                <Input value={supplierId} onChange={e => setSupplierId(e.target.value)} placeholder="Supplier ID" type="number" />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Currency</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GBP">GBP £</SelectItem>
                  <SelectItem value="EUR">EUR €</SelectItem>
                  <SelectItem value="USD">USD $</SelectItem>
                  <SelectItem value="AED">AED د.إ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Due Date</label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Line Items</label>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setLineItems(prev => [...prev, { itemType: "hotel", description: "", quantity: "1", unitPrice: "" }])}>
                <Plus className="w-3 h-3" /> Add Line
              </Button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-3 text-xs text-muted-foreground font-medium">
                <div className="col-span-2">Type</div>
                <div className="col-span-4">Description</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-2">Unit Price</div>
                <div className="col-span-2">Total</div>
                <div className="col-span-1"></div>
              </div>
              {lineItems.map((item, i) => (
                <LineItemRow
                  key={i} item={item}
                  onChange={v => setLineItems(prev => prev.map((x, j) => j === i ? v : x))}
                  onRemove={() => setLineItems(prev => prev.filter((_, j) => j !== i))}
                />
              ))}
              <div className="flex justify-end pr-10 pt-2 border-t border-border">
                <div className="text-sm font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Total: {currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes..." className="min-h-16" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={createClient.isPending || createCommission.isPending}
              className="text-white" style={{ background: "oklch(0.35 0.09 145)" }}
            >
              {createClient.isPending || createCommission.isPending ? "Creating..." : "Create Invoice"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InvoicingPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewingId, setViewingId] = useState<number | null>(null);

  const { data: clientInvoices, isLoading: clientLoading, refetch: refetchClient } =
    trpc.invoicing.list.useQuery({ invoiceType: "client_service" });

  const { data: commissionInvoices, isLoading: commissionLoading, refetch: refetchCommission } =
    trpc.invoicing.list.useQuery({ invoiceType: "commission" });

  const { data: viewingInvoice } = trpc.invoicing.getWithLineItems.useQuery(
    { invoiceId: viewingId! },
    { enabled: viewingId !== null }
  );

  const updateStatus = trpc.invoicing.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status updated"); refetchClient(); refetchCommission(); },
  });

  const filterInvoices = (invoices: typeof clientInvoices) =>
    (invoices ?? []).filter(inv => {
      const matchSearch = search === "" || inv.invoiceNumber.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || inv.status === statusFilter;
      return matchSearch && matchStatus;
    });

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1"><FileText className="w-5 h-5 text-primary" /></div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>Invoicing</h1>
          <p className="text-muted-foreground mt-1">Client invoices and supplier commission reconciliation</p>
        </div>
        <div className="flex gap-2">
          <CreateInvoiceDialog type="client_service" onCreated={() => refetchClient()} />
          <CreateInvoiceDialog type="commission" onCreated={() => refetchCommission()} />
        </div>
      </div>
      <hr className="lanai-divider" />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search invoices…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <Filter className="w-3.5 h-3.5 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="disputed">Disputed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="client">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="client" className="gap-2">
            <User className="w-3.5 h-3.5" /> Client Invoices
          </TabsTrigger>
          <TabsTrigger value="commission" className="gap-2">
            <Building2 className="w-3.5 h-3.5" /> Commission
          </TabsTrigger>
        </TabsList>

        {/* Client Invoices */}
        <TabsContent value="client" className="mt-4">
          <div className="lanai-card overflow-hidden">
            {clientLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : filterInvoices(clientInvoices).length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No client invoices found</p>
              </div>
            ) : (
              filterInvoices(clientInvoices).map(inv => (
                <InvoiceRow key={inv.id} invoice={inv as unknown as { id: number; invoiceNumber: string; invoiceType: string; status: string; totalAmount: string; currency: string; dueDate?: string | null; createdAt: Date }} onView={setViewingId} />
              ))
            )}
          </div>
        </TabsContent>

        {/* Commission Invoices */}
        <TabsContent value="commission" className="mt-4">
          <div className="lanai-card overflow-hidden">
            {commissionLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : filterInvoices(commissionInvoices).length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Building2 className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No commission invoices found</p>
              </div>
            ) : (
              filterInvoices(commissionInvoices).map(inv => (
                <InvoiceRow key={inv.id} invoice={inv as unknown as { id: number; invoiceNumber: string; invoiceType: string; status: string; totalAmount: string; currency: string; dueDate?: string | null; createdAt: Date }} onView={setViewingId} />
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Invoice Detail Dialog */}
      {viewingId && (
        <Dialog open={viewingId !== null} onOpenChange={() => setViewingId(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: "'Playfair Display', serif" }}>
                Invoice {viewingInvoice?.invoiceNumber ?? "…"}
              </DialogTitle>
            </DialogHeader>
            {viewingInvoice ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <StatusBadge status={viewingInvoice.status} />
                  <div className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
                    {viewingInvoice.currency} {parseFloat(viewingInvoice.totalAmount).toLocaleString()}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Type:</span> <span className="capitalize">{viewingInvoice.invoiceType}</span></div>
                  <div><span className="text-muted-foreground">Due:</span> {viewingInvoice.dueDate ? new Date(viewingInvoice.dueDate).toLocaleDateString("en-GB") : "—"}</div>
                  <div><span className="text-muted-foreground">Created:</span> {new Date(viewingInvoice.createdAt).toLocaleDateString("en-GB")}</div>
                </div>
                {viewingInvoice.notes && (
                  <div className="bg-muted/30 rounded-lg p-3 text-sm">{viewingInvoice.notes}</div>
                )}
                {/* Line items */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Line Items</h3>
                  <div className="space-y-2">
                    {(viewingInvoice.lineItems as { description: string; quantity: string; unitPrice: string; totalPrice: string }[])?.map((li, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted/20 rounded text-sm">
                        <div>
                          <div className="font-medium">{li.description}</div>
                          <div className="text-xs text-muted-foreground">Qty: {li.quantity} × £{li.unitPrice}</div>
                        </div>
                        <div className="font-semibold font-mono">£{parseFloat(li.totalPrice).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-border">
                  {viewingInvoice.status === "draft" && (
                    <Button size="sm" className="gap-2 text-white" style={{ background: "oklch(0.35 0.09 145)" }}
                      onClick={() => updateStatus.mutate({ invoiceId: viewingId, status: "sent", issuedAt: new Date().toISOString() })}>
                      <Send className="w-3.5 h-3.5" /> Mark as Sent
                    </Button>
                  )}
                  {viewingInvoice.status === "sent" && (
                    <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => updateStatus.mutate({ invoiceId: viewingId, status: "paid", paidAt: new Date().toISOString() })}>
                      <CheckCircle className="w-3.5 h-3.5" /> Mark as Paid
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="gap-2">
                    <Download className="w-3.5 h-3.5" /> Download PDF
                  </Button>
                </div>
              </div>
            ) : (
              <Skeleton className="h-48" />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
