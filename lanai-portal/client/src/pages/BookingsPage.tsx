import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CalendarCheck, Plane, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:    { label: "Pending",    color: "bg-amber-50 text-amber-700",       icon: Clock },
  confirmed:  { label: "Confirmed",  color: "bg-emerald-50 text-emerald-700",   icon: CheckCircle2 },
  in_progress:{ label: "In Progress",color: "bg-blue-50 text-blue-700",         icon: Plane },
  completed:  { label: "Completed",  color: "bg-gray-100 text-gray-600",        icon: CheckCircle2 },
  cancelled:  { label: "Cancelled",  color: "bg-red-50 text-red-600",           icon: XCircle },
};

const NEXT_STATUS = ["pending", "confirmed", "in_progress", "completed", "cancelled"] as const;

export default function BookingsPage() {
  const { data: bookings, isLoading, refetch } = trpc.bookings.list.useQuery();
  const [pendingId, setPendingId] = useState<number | null>(null);

  const updateStatus = trpc.bookings.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Booking status updated — concierge tasks auto-created where applicable");
      setPendingId(null);
      refetch();
    },
    onError: () => toast.error("Failed to update booking"),
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarCheck className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>Bookings</h1>
            <p className="text-muted-foreground mt-1">
              Confirm bookings to automatically generate concierge tasks (visa checks, fast-track, villa provisioning, celebrations, transfers).
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="text-left font-medium p-3">ID</th>
              <th className="text-left font-medium p-3">Member</th>
              <th className="text-left font-medium p-3">Supplier Ref</th>
              <th className="text-left font-medium p-3">Amount</th>
              <th className="text-left font-medium p-3">Status</th>
              <th className="text-left font-medium p-3">Update</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i} className="border-t border-border/50">
                  <td colSpan={6} className="p-3"><Skeleton className="h-8 w-full" /></td>
                </tr>
              ))
            ) : bookings && bookings.length > 0 ? (
              bookings.map((b: any) => {
                const meta = STATUS_META[b.status] ?? STATUS_META.pending;
                const Icon = meta.icon;
                return (
                  <tr key={b.id} className="border-t border-border/50 hover:bg-muted/20">
                    <td className="p-3 font-medium">#{b.id}</td>
                    <td className="p-3">{b.memberId}</td>
                    <td className="p-3 text-muted-foreground">{b.referenceNumber ?? b.supplierConfirmationRef ?? "—"}</td>
                    <td className="p-3">{b.totalAmount ? `${b.currency ?? "£"}${Number(b.totalAmount).toLocaleString()}` : "—"}</td>
                    <td className="p-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1", meta.color)}>
                        <Icon className="w-3 h-3" /> {meta.label}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Select
                          defaultValue={b.status}
                          onValueChange={(val) => {
                            setPendingId(b.id);
                            updateStatus.mutate({ id: b.id, status: val as any });
                          }}
                        >
                          <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {NEXT_STATUS.map((s) => (
                              <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {pendingId === b.id && <AlertCircle className="w-4 h-4 animate-pulse text-amber-500" />}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr className="border-t border-border/50">
                <td colSpan={6} className="p-10 text-center text-muted-foreground">
                  No bookings yet. Bookings are created when a proposal is approved.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
