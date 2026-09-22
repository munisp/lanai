/**
 * Lanai — Custom Itineraries (Advisor)
 * Build bespoke day-by-day itineraries for a member and share them to the portal.
 */
import { useState } from "react";
import {
  MapPin, Plus, Save, Send, Calendar, Clock, Trash2, CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

interface Activity { time?: string; title: string; description?: string; category?: string; }
interface Day { day: number; date?: string; title?: string; activities: Activity[]; }

function ActivityRow({ act, onChange, onRemove }: {
  act: Activity; onChange: (a: Activity) => void; onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-2 p-2 bg-muted/30 rounded-lg">
      <Input
        value={act.time ?? ""}
        onChange={e => onChange({ ...act, time: e.target.value })}
        placeholder="09:00"
        className="w-20 h-8 text-xs"
      />
      <div className="flex-1 space-y-1">
        <Input
          value={act.title}
          onChange={e => onChange({ ...act, title: e.target.value })}
          placeholder="Activity title"
          className="h-8 text-sm"
        />
        <Input
          value={act.description ?? ""}
          onChange={e => onChange({ ...act, description: e.target.value })}
          placeholder="Detail (optional)"
          className="h-8 text-xs"
        />
      </div>
      <Button variant="ghost" size="sm" className="text-red-500 h-8" onClick={onRemove}>
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default function CustomItinerariesPage({ memberId }: { memberId?: number }) {
  const [selectedMember, setSelectedMember] = useState<number>(memberId ?? 1);
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [days, setDays] = useState<Day[]>([]);

  const { data: members } = trpc.members.list.useQuery();
  const { data: itineraries, refetch } = trpc.itineraries.listForMember.useQuery(
    { memberId: selectedMember },
    { enabled: !!selectedMember }
  );

  const createMut = trpc.itineraries.create.useMutation({
    onSuccess: () => {
      toast.success("Itinerary saved");
      setTitle(""); setDestination(""); setNotes(""); setDays([]);
      refetch();
    },
    onError: e => toast.error(`Could not save: ${e.message}`),
  });
  const updateMut = trpc.itineraries.update.useMutation({
    onSuccess: () => { toast.success("Itinerary updated"); refetch(); },
    onError: e => toast.error(`Could not update: ${e.message}`),
  });
  const deleteMut = trpc.itineraries.delete.useMutation({
    onSuccess: () => { toast.success("Itinerary deleted"); refetch(); },
    onError: e => toast.error(`Could not delete: ${e.message}`),
  });

  const loadIntoEditor = (it: any) => {
    setTitle(it.title ?? "");
    setDestination(it.destination ?? "");
    setNotes(it.notes ?? "");
    setDays(it.days ?? []);
  };

  const addDay = () => setDays(d => [...d, { day: d.length + 1, activities: [] }]);
  const addActivity = (dayIdx: number) =>
    setDays(d => d.map((day, i) => i === dayIdx
      ? { ...day, activities: [...day.activities, { title: "" }] }
      : day));
  const updateActivity = (dayIdx: number, actIdx: number, a: Activity) =>
    setDays(d => d.map((day, i) => i === dayIdx
      ? { ...day, activities: day.activities.map((act, j) => j === actIdx ? a : act) }
      : day));
  const removeActivity = (dayIdx: number, actIdx: number) =>
    setDays(d => d.map((day, i) => i === dayIdx
      ? { ...day, activities: day.activities.filter((_, j) => j !== actIdx) }
      : day));

  const save = (status: "draft" | "shared") => {
    if (!title.trim()) { toast.error("Add a title first"); return; }
    createMut.mutate({
      memberId: selectedMember,
      title: title.trim(),
      destination: destination.trim() || undefined,
      notes: notes.trim() || undefined,
      days,
      status,
    });
  };

  const shareExisting = (id: number, current: string) =>
    updateMut.mutate({ id, status: current === "shared" ? "draft" : "shared" });

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1"><MapPin className="w-5 h-5 text-primary" /></div>
        <h1 className="text-3xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>Custom Itineraries</h1>
        <p className="text-muted-foreground mt-1">Craft bespoke day-by-day journeys and share them to the member portal.</p>
      </div>
      <hr className="lanai-divider" />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Builder */}
        <div className="space-y-4">
          <div className="lanai-card p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
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
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Destination</label>
                <Input value={destination} onChange={e => setDestination(e.target.value)} placeholder="e.g. Amalfi Coast" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Itinerary Title</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Bella Vita — 7 Days in Italy" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes for advisor</label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes…" className="min-h-16" />
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Days ({days.length})</h3>
              <Button size="sm" variant="outline" className="gap-1" onClick={addDay}>
                <Plus className="w-4 h-4" /> Add Day
              </Button>
            </div>

            <div className="space-y-3">
              {days.map((day, di) => (
                <div key={di} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    <Input
                      value={day.title ?? ""}
                      onChange={e => setDays(d => d.map((dd, i) => i === di ? { ...dd, title: e.target.value } : dd))}
                      placeholder={`Day ${day.day} — e.g. Arrival & Welcome Dinner`}
                      className="h-8 text-sm font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    {day.activities.map((act, ai) => (
                      <ActivityRow
                        key={ai}
                        act={act}
                        onChange={a => updateActivity(di, ai, a)}
                        onRemove={() => removeActivity(di, ai)}
                      />
                    ))}
                  </div>
                  <Button size="sm" variant="ghost" className="text-xs gap-1 text-primary" onClick={() => addActivity(di)}>
                    <Clock className="w-3.5 h-3.5" /> Add activity
                  </Button>
                </div>
              ))}
              {days.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No days yet — add a day to start building the itinerary.
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => save("draft")} disabled={createMut.isPending} className="gap-1">
                <Save className="w-4 h-4" /> Save Draft
              </Button>
              <Button onClick={() => save("shared")} disabled={createMut.isPending} className="gap-1 text-white" style={{ background: "oklch(0.35 0.09 145)" }}>
                <Send className="w-4 h-4" /> Save & Share to Portal
              </Button>
            </div>
          </div>
        </div>

        {/* Existing */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>Itineraries for this member</h2>
          {!itineraries || itineraries.length === 0 ? (
            <div className="lanai-card p-8 text-center text-muted-foreground">
              <MapPin className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No itineraries yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {itineraries.map((it: any) => (
                <div key={it.id} className="lanai-card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{it.title}</p>
                      {it.destination && <p className="text-xs text-muted-foreground">{it.destination}</p>}
                    </div>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium capitalize",
                      it.status === "shared" ? "bg-emerald-50 text-emerald-700"
                        : it.status === "final" ? "bg-blue-50 text-blue-700"
                        : "bg-gray-100 text-gray-600"
                    )}>{it.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(it.days?.length ?? 0)} day(s)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => shareExisting(it.id, it.status)}
                      disabled={updateMut.isPending}
                    >
                      {it.status === "shared" ? "Unshare" : (<><CheckCircle className="w-3.5 h-3.5" /> Share to Portal</>)}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => loadIntoEditor(it)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-red-500 border-red-200 hover:bg-red-50"
                      onClick={() => { if (confirm("Delete this itinerary?")) deleteMut.mutate({ id: it.id }); }}
                      disabled={deleteMut.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
