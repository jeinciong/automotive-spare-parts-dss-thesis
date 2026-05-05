import { CalendarDays, Filter, LogOut, BarChart3, ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "./ui/dropdown-menu";
import { SidebarTrigger } from "./ui/sidebar";
import { motion } from "motion/react";
import { useState } from "react";
import { GlobalFilters } from "../App";

interface SalesHeaderProps {
  onLogout: () => void;
  globalFilters: GlobalFilters;
  onUpdateFilters: (updates: Partial<GlobalFilters>) => void;
  onClearFilters: () => void;
  activeView?: string;
}

const categories = ["Engine Parts", "Brake System", "Filters", "Suspension", "Electrical", "Lighting"];
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
  const [localCategories, setLocalCategories] = useState<string[]>(globalFilters.categories);
  const [localStatus] = useState<string[]>(globalFilters.status);
  const [localDateRange, setLocalDateRange] = useState(globalFilters.dateRange);
  const [localAnalyticsView, setLocalAnalyticsView] = useState(globalFilters.analyticsView);
  const [customDateFrom] = useState<Date | undefined>(globalFilters.customDateRange?.from);
  const [customDateTo] = useState<Date | undefined>(globalFilters.customDateRange?.to);

  const handleApplyFilters = () => {
    const updates: any = {
      categories: localCategories,
      status: localStatus,
      dateRange: localDateRange,
      analyticsView: localAnalyticsView
    };
    if (localDateRange === "custom" && customDateFrom && customDateTo) {
      updates.customDateRange = { from: customDateFrom, to: customDateTo };
    }
    onUpdateFilters(updates);
  };

  const activeFiltersCount = globalFilters.categories.length + globalFilters.status.length;

  // Updated logic: Filter only shows for Sales Report
  const isSalesReport = activeView === "sales-reports";
  const isAnalytics = activeView === "analytics";
  const isPredictions = activeView === "predictions-trends";

  return (
    <motion.div 
      className="flex items-center justify-between p-4 h-[73px] w-full"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center space-x-4">
        <SidebarTrigger className="lg:hidden" />
      </div>

      <div className="flex items-center gap-3">
        {/* Only show filter if on Sales Report view */}
        {isSalesReport && (
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
                {(isSalesReport || isAnalytics || isPredictions) && (
                  <div className="space-y-3">
                    <Label className="font-semibold flex items-center"><CalendarDays className="w-4 h-4 mr-2" /> Date Range</Label>
                    <div className="space-y-2">
                      {dateRanges.map((range) => (
                        <div key={range.value} className="flex items-center space-x-2">
                          <input 
                            type="radio" 
                            id={range.value} 
                            name="dateRange" 
                            checked={localDateRange === range.value} 
                            onChange={() => setLocalDateRange(range.value)} 
                            className="w-4 h-4 accent-[#FF6B00]" 
                          />
                          <Label htmlFor={range.value} className="text-sm cursor-pointer">{range.label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(isSalesReport || isAnalytics) && (
                  <div className="space-y-3">
                    <DropdownMenuSeparator />
                    {/* <Label className="font-semibold">Product Categories</Label>
                    <div className="grid grid-cols-1 gap-2">
                      {categories.map((cat) => (
                        <div key={cat} className="flex items-center space-x-2">
                          <Checkbox 
                            id={cat} 
                            checked={localCategories.includes(cat)} 
                            onCheckedChange={() => setLocalCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])} 
                          />
                          <Label htmlFor={cat} className="text-sm cursor-pointer">{cat}</Label>
                        </div>
                      ))}
                    </div> */}
                  </div>
                )}

                {isAnalytics && (
                  <div className="space-y-3">
                    <DropdownMenuSeparator />
                    <Label className="font-semibold flex items-center"><BarChart3 className="w-4 h-4 mr-2" /> Analytics Type</Label>
                    <div className="space-y-2">
                      {analyticsViews.map((view) => (
                        <div key={view.value} className="flex items-center space-x-2">
                          <input 
                            type="radio" 
                            id={view.value} 
                            name="type" 
                            checked={localAnalyticsView === view.value} 
                            onChange={() => setLocalAnalyticsView(view.value as any)} 
                            className="w-4 h-4 accent-[#FF6B00]" 
                          />
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