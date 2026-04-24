import { CalendarDays, Filter, LogOut, User, Bell, Search, BarChart3, X, ChevronDown, Calendar as CalendarIcon, CheckCircle2 } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Slider } from "./ui/slider";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from "./ui/dropdown-menu";
import { SidebarTrigger } from "./ui/sidebar";
import { GlobalFilters } from "../App";
import { useState } from "react";
import { formatCurrencyCompact } from "../lib/currency";

interface SalesHeaderProps {
  onLogout: () => void;
  globalFilters: GlobalFilters;
  onUpdateFilters: (updates: Partial<GlobalFilters>) => void;
  onClearFilters: () => void;
  activeView?: string;
}

const categories = ["Engine Parts", "Brake System", "Filters", "Suspension", "Electrical", "Lighting"];
const statuses = ["In Stock", "Low Stock", "Critical", "Out of Stock"];
const dateRanges = [
  { value: "today", label: "Today" },
  { value: "thisweek", label: "This Week" },
  { value: "october", label: "October 2025" },
  { value: "ytd", label: "Year to Date" },
  { value: "custom", label: "Custom Range" },
  { value: "all", label: "All Time" }
];

const analyticsViews = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" }
];

export function SalesHeader({ onLogout, globalFilters, onUpdateFilters, onClearFilters, activeView }: SalesHeaderProps) {
  // Notification State
  const [notifications, setNotifications] = useState([
    { id: 1, title: "Low Stock Alert", desc: "Oil Filter Premium - Only 8 units remaining", type: "urgent", time: "15m ago" },
    { id: 2, title: "Sales Milestone", desc: "Monthly target achieved - ₱250K reached", type: "success", time: "2h ago" },
    { id: 3, title: "New Report Available", desc: "Weekly performance report is ready", type: "info", time: "5h ago" }
  ]);

  const [localCategories, setLocalCategories] = useState<string[]>(globalFilters.categories);
  const [localStatus, setLocalStatus] = useState<string[]>(globalFilters.status);
  const [localPriceRange, setLocalPriceRange] = useState(globalFilters.priceRange);
  const [localDateRange, setLocalDateRange] = useState(globalFilters.dateRange);
  const [localAnalyticsView, setLocalAnalyticsView] = useState(globalFilters.analyticsView);
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>(globalFilters.customDateRange?.from);
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>(globalFilters.customDateRange?.to);

  const handleRemoveNotif = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleApplyFilters = () => {
    const updates: any = {
      categories: localCategories,
      status: localStatus,
      priceRange: localPriceRange,
      dateRange: localDateRange,
      analyticsView: localAnalyticsView
    };
    if (localDateRange === "custom" && customDateFrom && customDateTo) {
      updates.customDateRange = { from: customDateFrom, to: customDateTo };
    }
    onUpdateFilters(updates);
  };

  const activeFiltersCount = globalFilters.categories.length + globalFilters.status.length;

  // --- LOGIC FOR FEATURE-BASED FILTERS ---
  const isDashboard = activeView === "dashboard";
  const isSalesReport = activeView === "sales-reports";
  const isAnalytics = activeView === "analytics";
  const isPredictions = activeView === "predictions-trends";

  return (
    <motion.div className="flex items-center justify-between p-4 border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center space-x-4">
        <SidebarTrigger className="lg:hidden" />
      </div>

      <div className="flex items-center gap-3">
        {/* FILTERS: Only visible if NOT dashboard */}
        {!isDashboard && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="relative border-orange-200 hover:bg-orange-50">
                <Filter className="w-4 h-4 mr-2 text-[#FF6B00]" />
                Filters
                {activeFiltersCount > 0 && (
                  <Badge className="ml-2 h-5 min-w-[20px] px-1 bg-[#FF6B00]" variant="default">
                    {activeFiltersCount}
                  </Badge>
                )}
                <ChevronDown className="w-4 h-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Filter by {activeView?.replace('-', ' ')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="p-4 space-y-6 max-h-[500px] overflow-y-auto">
                
                {/* DATE RANGE: Visible in Sales Report, Analytics, and Predictions */}
                {(isSalesReport || isAnalytics || isPredictions) && (
                  <div className="space-y-3">
                    <Label className="font-semibold flex items-center"><CalendarDays className="w-4 h-4 mr-2" /> Date Range</Label>
                    <div className="space-y-2">
                      {dateRanges.map((range) => (
                        <div key={range.value} className="flex items-center space-x-2">
                          <input type="radio" id={range.value} name="dateRange" checked={localDateRange === range.value} onChange={() => setLocalDateRange(range.value)} className="w-4 h-4 accent-[#FF6B00]" />
                          <Label htmlFor={range.value} className="text-sm cursor-pointer">{range.label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* PRODUCT CATEGORIES: Visible in Sales Report and Analytics */}
                {(isSalesReport || isAnalytics) && (
                  <div className="space-y-3">
                    <DropdownMenuSeparator />
                    <Label className="font-semibold">Product Categories</Label>
                    <div className="grid grid-cols-1 gap-2">
                      {categories.map((cat) => (
                        <div key={cat} className="flex items-center space-x-2">
                          <Checkbox id={cat} checked={localCategories.includes(cat)} onCheckedChange={() => setLocalCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])} />
                          <Label htmlFor={cat} className="text-sm cursor-pointer">{cat}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ANALYTICS VIEW: Visible only in Analytics */}
                {isAnalytics && (
                  <div className="space-y-3">
                    <DropdownMenuSeparator />
                    <Label className="font-semibold flex items-center"><BarChart3 className="w-4 h-4 mr-2" /> Analytics Type</Label>
                    <div className="space-y-2">
                      {analyticsViews.map((view) => (
                        <div key={view.value} className="flex items-center space-x-2">
                          <input type="radio" id={view.value} name="type" checked={localAnalyticsView === view.value} onChange={() => setLocalAnalyticsView(view.value as any)} className="w-4 h-4 accent-[#FF6B00]" />
                          <Label htmlFor={view.value} className="text-sm cursor-pointer">{view.label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <DropdownMenuSeparator />
              <div className="p-2 flex gap-2">
                <Button variant="outline" onClick={onClearFilters} className="flex-1" size="sm">Clear</Button>
                <Button onClick={handleApplyFilters} className="flex-1 bg-[#FF6B00] hover:bg-[#e16620] text-white border-none" size="sm">Apply</Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* NOTIFICATIONS: Functioning state */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="relative">
              <Bell className="w-4 h-4" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center animate-pulse">
                  {notifications.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex justify-between items-center">
              Notifications
              {notifications.length > 0 && <span className="text-[10px] font-normal text-muted-foreground">Click to dismiss</span>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No new notifications</div>
              ) : (
                notifications.map((n) => (
                  <DropdownMenuItem 
                    key={n.id} 
                    className="flex-col items-start py-3 cursor-pointer hover:bg-orange-50 focus:bg-orange-50"
                    onClick={() => handleRemoveNotif(n.id)}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-medium text-sm">{n.title}</span>
                      <Badge className={`text-[10px] ${n.type === 'urgent' ? 'bg-red-500' : 'bg-blue-500'}`}>{n.type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{n.desc}</p>
                    <span className="text-[10px] text-muted-foreground mt-1">{n.time}</span>
                  </DropdownMenuItem>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ADMIN USER: Simplified */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center space-x-2 border-orange-200">
              <div className="w-6 h-6 rounded-full bg-[#FF6B00] flex items-center justify-center text-white text-[10px] font-bold">A</div>
              <span className="hidden md:inline text-xs">Admin</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs">admin@autopartspro.com</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive cursor-pointer">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}