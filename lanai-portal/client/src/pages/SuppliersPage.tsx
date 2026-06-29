import { Building2, Search, Star, Globe, Phone } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SUPPLIERS = [
  { id:"1", name:"Aman Resorts",           category:"Hotels & Resorts",  region:"Global",       rating:5, commission:"12%", status:"Preferred", contact:"reservations@aman.com" },
  { id:"2", name:"Six Senses",             category:"Hotels & Resorts",  region:"Global",       rating:5, commission:"10%", status:"Preferred", contact:"trade@sixsenses.com" },
  { id:"3", name:"Singita Safaris",        category:"Safari Operator",   region:"East Africa",  rating:5, commission:"15%", status:"Preferred", contact:"reservations@singita.com" },
  { id:"4", name:"Abercrombie & Kent",     category:"Ground Operator",   region:"Global",       rating:4, commission:"8%",  status:"Active",    contact:"trade@abercrombiekent.com" },
  { id:"5", name:"Little Emperors",        category:"Hotel Membership",  region:"Global",       rating:4, commission:"10%", status:"Active",    contact:"api@littleemperors.com" },
  { id:"6", name:"Burgess Yachts",         category:"Yacht Charter",     region:"Mediterranean",rating:5, commission:"10%", status:"Preferred", contact:"charter@burgessyachts.com" },
  { id:"7", name:"Quintessentially Travel",category:"Concierge Network", region:"Global",       rating:4, commission:"5%",  status:"Active",    contact:"travel@quintessentially.com" },
  { id:"8", name:"Virtuoso",               category:"Travel Network",    region:"Global",       rating:5, commission:"10%", status:"Preferred", contact:"trade@virtuoso.com" },
];

const STATUS_COLORS: Record<string,string> = { Preferred:"bg-emerald-50 text-emerald-700", Active:"bg-blue-50 text-blue-700", Inactive:"bg-gray-50 text-gray-500" };

export default function SuppliersPage() {
  const [search, setSearch] = useState("");
  const filtered = SUPPLIERS.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.category.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 mb-1"><Building2 className="w-5 h-5 text-primary" /></div>
        <h1 className="text-3xl font-bold" style={{ fontFamily:"'Playfair Display', serif" }}>Suppliers</h1>
        <p className="text-muted-foreground mt-1">{SUPPLIERS.length} supplier relationships in the Lanai network</p>
      </div>
      <hr className="lanai-divider" />
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search suppliers…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(s => (
          <div key={s.id} className="lanai-card p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-foreground">{s.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.category}</div>
              </div>
              <span className={cn("px-2 py-0.5 rounded text-xs font-medium", STATUS_COLORS[s.status])}>{s.status}</span>
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={cn("w-3 h-3", i < s.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><div className="text-muted-foreground mb-0.5">Region</div><div className="flex items-center gap-1 font-medium"><Globe className="w-3 h-3" />{s.region}</div></div>
              <div><div className="text-muted-foreground mb-0.5">Commission</div><div className="font-medium font-mono" style={{ color:"oklch(0.35 0.09 145)" }}>{s.commission}</div></div>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 truncate"><Phone className="w-3 h-3 flex-shrink-0" />{s.contact}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
