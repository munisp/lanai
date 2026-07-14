import {
  CheckSquare, Plus, Clock, User, AlertCircle, CheckCircle,
  Plane, Anchor, Home, Utensils, Globe, Gift, Trash2, Play
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

// ─── Template Category Icons ──────────────────────────────────────────────────
const CAT_ICONS: Record<string, React.ElementType> = {
  airport_fasttrack: Plane,
  villa_provisioning: Home,
  yacht_charter: Anchor,
  restaurant_reservation: Utensils,
  celebration_planning: Gift,
  visa_check: Globe,
  general: CheckSquare,
};

const CAT_COLORS: Record<string, string> = {
  airport_fasttrack: "bg-blue-50 text-blue-600",
  villa_provisioning: "bg-emerald-50 text-emerald-600",
  yacht_charter: "bg-purple-50 text-purple-600",
  restaurant_reservation: "bg-red-50 text-red-600",
  celebration_planning: "bg-pink-50 text-pink-600",
  visa_check: "bg-amber-50 text-amber-600",
  general: "bg-gray-50 text-gray-600",
};

// ─── Priority Badge ───────────────────────────────────────────────────────────
function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    low: "bg-gray-100 text-gray-600",
    medium: "bg-amber-50 text-amber-700",
    high: "bg-orange-50 text-orange-700",
    urgent: "bg-red-50 text-red-700",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", map[priority] ?? "bg-gray-100 text-gray-600")}>
      {priority}
    </span>
  );
}

// ─── Template Card ────────────────────────────────────────────────────────────
function TemplateCard({ template, onInstantiate }: {
  template: {
    id: number; templateName: string; templateCategory: string; description?: string | null;
    defaultPriority: string; estimatedHours?: string | null;
    checklistItems?: string[] | null;
  };
  onInstantiate: (id: number) => void;
}) {
  const Icon = CAT_ICONS[template.templateCategory] ?? CheckSquare;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="lanai-card overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", CAT_COLORS[template.templateCategory])}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-foreground">{template.templateName}</div>
              <div className="text-xs text-muted-foreground capitalize mt-0.5">
                {template.templateCategory.replace("_", " ")}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <PriorityBadge priority={template.defaultPriority} />
            {template.estimatedHours && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {template.estimatedHours}h
              </span>
            )}
          </div>
        </div>

        {template.description && (
          <p className="text-sm text-muted-foreground mt-3">{template.description}</p>
        )}

        {template.checklistItems && template.checklistItems.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-primary font-medium hover:underline"
            >
              {expanded ? "Hide" : "Show"} checklist ({template.checklistItems.length} items)
            </button>
            {expanded && (
              <ul className="mt-2 space-y-1">
                {template.checklistItems.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="px-5 pb-4">
        <Button
          size="sm"
          className="gap-2 text-white w-full"
          style={{ background: "oklch(0.35 0.09 145)" }}
          onClick={() => onInstantiate(template.id)}
        >
          <Play className="w-3.5 h-3.5" />
          Use Template
        </Button>
      </div>
    </div>
  );
}

// ─── Active Task Row ──────────────────────────────────────────────────────────
function ActiveTaskRow({ task }: {
  task: {
    id: number; title: string; status: string; priority: string;
    dueAt?: Date | null; assigneeName?: string | null; completedAt?: Date | null;
  };
}) {
  const statusColors: Record<string, string> = {
    pending: "bg-gray-100 text-gray-600",
    in_progress: "bg-blue-50 text-blue-700",
    completed: "bg-emerald-50 text-emerald-700",
    cancelled: "bg-red-50 text-red-500",
  };
  const StatusIcon = task.status === "completed" ? CheckCircle : task.status === "in_progress" ? Clock : AlertCircle;

  return (
    <div className="flex items-center justify-between p-4 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
      <div className="flex items-center gap-3">
        <StatusIcon className={cn("w-4 h-4 flex-shrink-0",
          task.status === "completed" ? "text-emerald-500" :
          task.status === "in_progress" ? "text-blue-500" : "text-muted-foreground"
        )} />
        <div>
          <div className="text-sm font-medium">{task.title}</div>
          <div className="flex items-center gap-2 mt-0.5">
            {task.assigneeName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="w-3 h-3" /> {task.assigneeName}
              </span>
            )}
            {task.dueAt && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(task.dueAt).toLocaleDateString("en-GB")}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <PriorityBadge priority={task.priority} />
        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", statusColors[task.status] ?? "bg-gray-100 text-gray-600")}>
          {task.status.replace("_", " ")}
        </span>
      </div>
    </div>
  );
}

// ─── Create Template Dialog ───────────────────────────────────────────────────
function CreateTemplateDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("general");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [checklistText, setChecklistText] = useState("");

  const createTemplate = trpc.taskTemplates.create.useMutation({
    onSuccess: () => { toast.success("Template created"); setOpen(false); onCreated(); },
    onError: () => toast.error("Failed to create template"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 text-white" style={{ background: "oklch(0.35 0.09 145)" }}>
          <Plus className="w-4 h-4" /> Create Template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Playfair Display', serif" }}>Create Task Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Template Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Airport Fast-Track VIP" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="airport_fasttrack">Airport Fast-Track</SelectItem>
                  <SelectItem value="villa_provisioning">Villa Provisioning</SelectItem>
                  <SelectItem value="yacht_charter">Yacht Charter</SelectItem>
                  <SelectItem value="restaurant_reservation">Restaurant Reservation</SelectItem>
                  <SelectItem value="celebration_planning">Celebration Planning</SelectItem>
                  <SelectItem value="visa_check">Visa Check</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Default Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Template description..." className="min-h-16" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Estimated Hours</label>
            <Input type="number" value={estimatedHours} onChange={e => setEstimatedHours(e.target.value)} placeholder="e.g. 2" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Checklist Items (one per line)
            </label>
            <Textarea
              value={checklistText}
              onChange={e => setChecklistText(e.target.value)}
              placeholder={"Contact airport lounge\nArrange meet & greet\nConfirm baggage handling\nNotify driver"}
              className="min-h-24 font-mono text-xs"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createTemplate.mutate({
                templateType: category as "airport_fast_track" | "villa_provisioning" | "yacht_charter" | "restaurant_reservation" | "celebration_planning" | "visa_check" | "welcome_gift" | "vip_amenity" | "jet_charter" | "transfer_arrangement" | "custom",
                name,
                description: description || undefined,
                defaultPriority: priority as "low" | "medium" | "high" | "urgent",
                checklistItems: checklistText ? checklistText.split("\n").filter(Boolean).map(item => ({ item, required: true })) : undefined,
              })}
              disabled={!name || createTemplate.isPending}
              className="text-white" style={{ background: "oklch(0.35 0.09 145)" }}
            >
              {createTemplate.isPending ? "Creating..." : "Create Template"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TaskTemplatesPage() {
  const { data: templates, isLoading: templatesLoading, refetch: refetchTemplates } =
    trpc.taskTemplates.list.useQuery();

  // Active tasks shown from platform tasks
  const activeTasks: { id: number; title: string; status: string; priority: string; dueAt?: Date | null; assigneeName?: string | null; completedAt?: Date | null }[] = [];
  const tasksLoading = false;

  const instantiate = trpc.taskTemplates.instantiateFromTemplate.useMutation({
    onSuccess: () => toast.success("Task created from template"),
    onError: () => toast.error("Failed to instantiate template"),
  });

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1"><CheckSquare className="w-5 h-5 text-primary" /></div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
            Task & Workflow Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Concierge-specific task templates with automated creation linked to booking stages
          </p>
        </div>
        <CreateTemplateDialog onCreated={refetchTemplates} />
      </div>
      <hr className="lanai-divider" />

      <Tabs defaultValue="templates">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="active">Active Tasks</TabsTrigger>
        </TabsList>

        {/* Templates */}
        <TabsContent value="templates" className="mt-4">
          {templatesLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
            </div>
          ) : templates && templates.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(t => (
                <TemplateCard
                  key={t.id}
                  template={t as unknown as {
                    id: number; templateName: string; templateCategory: string; description?: string | null;
                    defaultPriority: string; estimatedHours?: string | null;
                    checklistItems?: string[] | null;
                  }}
                  onInstantiate={id => instantiate.mutate({ templateId: id, assignedToUserId: 1, memberId: 1 })}
                />
              ))}
            </div>
          ) : (
            <div className="lanai-card p-12 text-center text-muted-foreground">
              <CheckSquare className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No templates created yet</p>
              <p className="text-xs mt-1">Create templates for airport fast-track, villa provisioning, and more</p>
            </div>
          )}
        </TabsContent>

        {/* Active Tasks */}
        <TabsContent value="active" className="mt-4">
          <div className="lanai-card overflow-hidden">
            {tasksLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : activeTasks && activeTasks.length > 0 ? (
              activeTasks.map(task => (
                <ActiveTaskRow key={task.id} task={task as {
                  id: number; title: string; status: string; priority: string;
                  dueAt?: Date | null; assigneeName?: string | null; completedAt?: Date | null;
                }} />
              ))
            ) : (
              <div className="p-12 text-center text-muted-foreground">
                <CheckCircle className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No active tasks</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
