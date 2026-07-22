import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

function StateBadge({ state }: { state: string }) {
  const className =
    state === "synced" || state === "processed"
      ? "bg-emerald-100 text-emerald-800"
      : state === "conflicted" || state === "failed" || state === "dead_letter"
        ? "bg-rose-100 text-rose-800"
        : state === "detached"
          ? "bg-slate-200 text-slate-700"
          : "bg-amber-100 text-amber-800";
  return <Badge className={className}>{state.replaceAll("_", " ")}</Badge>;
}

export default function CrmSyncPage() {
  const utils = trpc.useUtils();
  const [busyLink, setBusyLink] = useState<number | null>(null);
  const summary = trpc.crmSync.summary.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const links = trpc.crmSync.links.useQuery({ limit: 100 });
  const conflicts = trpc.crmSync.conflicts.useQuery({ limit: 100 });
  const deliveries = trpc.crmSync.deliveries.useQuery({ limit: 40 });
  const inboundEvents = trpc.crmSync.inboundEvents.useQuery({ limit: 40 });

  const invalidate = async () => {
    await Promise.all([
      utils.crmSync.summary.invalidate(),
      utils.crmSync.links.invalidate(),
      utils.crmSync.conflicts.invalidate(),
      utils.crmSync.deliveries.invalidate(),
      utils.crmSync.inboundEvents.invalidate(),
    ]);
  };

  const resync = trpc.crmSync.resyncLink.useMutation({
    onSuccess: async () => {
      toast.success("Lanai projection queued and synchronized with Twenty CRM");
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const reconcile = trpc.crmSync.reconcileLink.useMutation({
    onSuccess: async (result) => {
      result.success
        ? toast.success("CRM link reconciled")
        : toast.error(result.error ?? "CRM link reconciliation failed");
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const resolve = trpc.crmSync.resolveConflict.useMutation({
    onSuccess: async () => {
      toast.success("CRM field conflict resolved");
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const summaryRows = [
    ...(summary.data?.links ?? []).map((item) => ({
      label: `Links: ${item.state}`,
      value: item.count,
      state: item.state,
    })),
    ...(summary.data?.deliveries ?? []).map((item) => ({
      label: `Deliveries: ${item.state}`,
      value: item.count,
      state: item.state,
    })),
  ];

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">
            Integration operations
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Twenty CRM Synchronization
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Monitor durable Lanai-to-Twenty deliveries, verify object links, and
            resolve field ownership conflicts. Sensitive concierge and financial
            fields are never displayed or exported here.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void invalidate()}
          disabled={summary.isFetching}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${summary.isFetching ? "animate-spin" : ""}`}
          />{" "}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open field conflicts</CardDescription>
            <CardTitle className="text-3xl text-rose-700">
              {summary.data?.openConflicts ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Require an explicit advisor decision.
          </CardContent>
        </Card>
        {summaryRows.slice(0, 3).map((row) => (
          <Card key={row.label}>
            <CardHeader className="pb-2">
              <CardDescription>{row.label}</CardDescription>
              <CardTitle className="flex items-center gap-2 text-3xl">
                <span>{row.value}</span>
                <StateBadge state={row.state} />
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="conflicts" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
          <TabsTrigger value="conflicts">
            Conflicts ({conflicts.data?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="links">Object links</TabsTrigger>
          <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
          <TabsTrigger value="inbound">Inbound webhooks</TabsTrigger>
        </TabsList>

        <TabsContent value="conflicts">
          <Card>
            <CardHeader>
              <CardTitle>Field ownership conflicts</CardTitle>
              <CardDescription>
                Choose the authoritative version. Selecting Lanai republishs the
                approved CRM-safe projection; selecting CRM applies only
                supported CRM-owned fields.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!conflicts.data?.length && (
                <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <CheckCircle2 className="h-4 w-4" /> No unresolved field
                  conflicts.
                </div>
              )}
              {conflicts.data?.map((conflict) => (
                <div key={conflict.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{conflict.fieldName}</p>
                      <p className="text-xs text-muted-foreground">
                        Policy: {conflict.policy.replaceAll("_", " ")} ·{" "}
                        {new Date(conflict.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <StateBadge state={conflict.status} />
                  </div>
                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                    <pre className="overflow-auto rounded bg-muted p-2 text-xs">
                      Lanai: {JSON.stringify(conflict.lanaiValue, null, 2)}
                    </pre>
                    <pre className="overflow-auto rounded bg-muted p-2 text-xs">
                      Twenty: {JSON.stringify(conflict.crmValue, null, 2)}
                    </pre>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        resolve.mutate({
                          conflictId: conflict.id,
                          resolution: "resolved_lanai",
                        })
                      }
                      disabled={resolve.isPending}
                    >
                      Keep Lanai value
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        resolve.mutate({
                          conflictId: conflict.id,
                          resolution: "resolved_crm",
                        })
                      }
                      disabled={resolve.isPending}
                    >
                      Accept CRM value
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        resolve.mutate({
                          conflictId: conflict.id,
                          resolution: "ignored",
                        })
                      }
                      disabled={resolve.isPending}
                    >
                      Ignore
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="links">
          <Card>
            <CardHeader>
              <CardTitle>Linked CRM objects</CardTitle>
              <CardDescription>
                Reconcile performs a remote existence and revision check. Resync
                rebuilds the CRM-safe projection from Lanai as the source of
                truth.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {links.data?.map((link) => (
                <div
                  key={link.id}
                  className="flex flex-col gap-3 rounded-lg border p-3 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {link.lanaiObjectType} #{link.lanaiObjectId}
                      </span>
                      <StateBadge state={link.syncState} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Twenty {link.crmObjectType} #{link.crmObjectId} · last
                      sync{" "}
                      {link.lastSyncedAt
                        ? new Date(link.lastSyncedAt).toLocaleString()
                        : "never"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyLink === link.id || reconcile.isPending}
                      onClick={() => {
                        setBusyLink(link.id);
                        reconcile.mutate(
                          { linkId: link.id },
                          { onSettled: () => setBusyLink(null) },
                        );
                      }}
                    >
                      Reconcile
                    </Button>
                    <Button
                      size="sm"
                      disabled={busyLink === link.id || resync.isPending}
                      onClick={() => {
                        setBusyLink(link.id);
                        resync.mutate(
                          { linkId: link.id },
                          { onSettled: () => setBusyLink(null) },
                        );
                      }}
                    >
                      Resync
                    </Button>
                  </div>
                </div>
              ))}
              {!links.data?.length && (
                <p className="text-sm text-muted-foreground">
                  No CRM object links have been created. Enable Twenty
                  synchronization and deliver an eligible business event to
                  establish links.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deliveries">
          <Card>
            <CardHeader>
              <CardTitle>Recent CRM deliveries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {deliveries.data?.map((delivery) => (
                <div
                  key={delivery.id}
                  className="flex items-center justify-between gap-3 rounded border p-3 text-sm"
                >
                  <span>
                    #{delivery.id} · {delivery.operation} · attempts{" "}
                    {delivery.attempts}
                  </span>
                  <StateBadge state={delivery.status} />
                </div>
              ))}
              {!deliveries.data?.length && (
                <p className="text-sm text-muted-foreground">
                  No CRM delivery attempts recorded.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="inbound">
          <Card>
            <CardHeader>
              <CardTitle>Recent signed inbound events</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {inboundEvents.data?.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between gap-3 rounded border p-3 text-sm"
                >
                  <span>
                    {event.eventType} · {event.crmObjectType} #
                    {event.crmObjectId}
                  </span>
                  <div className="flex items-center gap-2">
                    {event.signatureValid ? (
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-rose-600" />
                    )}
                    <StateBadge state={event.status} />
                  </div>
                </div>
              ))}
              {!inboundEvents.data?.length && (
                <p className="text-sm text-muted-foreground">
                  No inbound Twenty webhooks have been recorded.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
