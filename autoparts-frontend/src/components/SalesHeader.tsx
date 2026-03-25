import { CalendarDays, Filter, LogOut, User, Bell, Search, BarChart3, X, ChevronDown, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
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
  { value: "september", label: "September 2025" },
  { value: "august", label: "August 2025" },
  { value: "q3", label: "Q3 2025" },
  { value: "q2", label: "Q2 2025" },
  { value: "ytd", label: "Year to Date" },
  { value: "custom", label: "Custom Range" },
  { value: "all", label: "All Time" }
];

const analyticsViews = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" }
];

export function SalesHeader({ onLogout, globalFilters, onUpdateFilters, onClearFilters, activeView }: SalesHeaderProps) {
  const [localCategories, setLocalCategories] = useState<string[]>(globalFilters.categories);
  const [localStatus, setLocalStatus] = useState<string[]>(globalFilters.status);
  const [localPriceRange, setLocalPriceRange] = useState(globalFilters.priceRange);
  const [localDateRange, setLocalDateRange] = useState(globalFilters.dateRange);
  const [localAnalyticsView, setLocalAnalyticsView] = useState(globalFilters.analyticsView);
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>(globalFilters.customDateRange?.from);
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>(globalFilters.customDateRange?.to);
  const dateRangeIdMap = new Map(dateRanges.map(r => [r.value, `date-range-${r.value}`]));
  const analyticsViewIdMap = new Map(analyticsViews.map(v => [v.value, `analytics-view-${v.value}`]));

  const handleCategoryToggle = (category: string) => {
    setLocalCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handleStatusToggle = (status: string) => {
    setLocalStatus(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
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
    } else {
      updates.customDateRange = undefined;
    }

    onUpdateFilters(updates);
  };

  const handleClearFilters = () => {
    setLocalCategories([]);
    setLocalStatus([]);
    setLocalPriceRange({ min: 0, max: 1000 });
    setLocalDateRange("october");
    setLocalAnalyticsView("monthly");
    setCustomDateFrom(undefined);
    setCustomDateTo(undefined);
    onClearFilters();
  };

  const activeFiltersCount = globalFilters.categories.length + globalFilters.status.length;
  
  const getCurrentDateLabel = () => {
    if (globalFilters.dateRange === "custom" && globalFilters.customDateRange) {
      return `${format(globalFilters.customDateRange.from, "MMM d")} - ${format(globalFilters.customDateRange.to, "MMM d, yyyy")}`;
    }
    return dateRanges.find(r => r.value === globalFilters.dateRange)?.label || "October 2025";
  };
  
  const currentDateLabel = getCurrentDateLabel();
  const currentAnalyticsLabel = analyticsViews.find(v => v.value === globalFilters.analyticsView)?.label || "Monthly";

  // Only show filters on specific views
  const showFilters = activeView === "dashboard" || activeView === "sales-reports" || activeView === "predictions-trends" || activeView === "analytics";

  return (
    <motion.div
      className="flex items-center justify-between p-4 border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center space-x-4">
        <SidebarTrigger className="lg:hidden" />
      </div>

      <div className="flex items-center gap-3">
        {/* All Filters Dropdown - Only show on specific views */}
        {showFilters && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="relative">
              <Filter className="w-4 h-4 mr-2" />
              Filters
              {activeFiltersCount > 0 && (
                <Badge className="ml-2 h-5 min-w-[20px] px-1" variant="default">
                  {activeFiltersCount}
                </Badge>
              )}
              <ChevronDown className="w-4 h-4 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Filter Options</DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            <div className="p-4 space-y-6 max-h-[500px] overflow-y-auto">
              {/* Date Range Filter */}
              <div className="space-y-3">
                <Label className="font-semibold flex items-center">
                  <CalendarDays className="w-4 h-4 mr-2" />
                  Date Range
                </Label>
                <div className="space-y-2">
                  {dateRanges.map((range) => (
                    <div key={range.value} className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id={`date-range-${range.value}-${Math.random()}`}
                        name="dateRange"
                        checked={localDateRange === range.value}
                        onChange={() => setLocalDateRange(range.value)}
                        className="w-4 h-4 text-[#FF6B00]"
                        aria-label={`Select ${range.label}`}
                      />
                      <Label
                        htmlFor={`date-range-${range.value}-${Math.random()}`}
                        className="text-sm cursor-pointer"
                      >
                        {range.label}
                      </Label>
                    </div>
                  ))}
                  
                  {/* Custom Date Range Picker */}
                  {localDateRange === "custom" && (
                    <div className="mt-3 p-3 border rounded-lg bg-gray-50 space-y-3">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold">From Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full justify-start text-left font-normal"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {customDateFrom ? format(customDateFrom, "PPP") : "Select date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={customDateFrom}
                              onSelect={setCustomDateFrom}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold">To Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full justify-start text-left font-normal"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {customDateTo ? format(customDateTo, "PPP") : "Select date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={customDateTo}
                              onSelect={setCustomDateTo}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <DropdownMenuSeparator />

              {/* Analytics View Filter */}
              <div className="space-y-3">
                <Label className="font-semibold flex items-center">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Analytics View
                </Label>
                <div className="space-y-2">
                  {analyticsViews.map((view) => (
                    <div key={view.value} className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id={`analytics-view-${view.value}`}
                        name="analyticsView"
                        checked={localAnalyticsView === view.value}
                        onChange={() => setLocalAnalyticsView(view.value as any)}
                        className="w-4 h-4 text-[#FF6B00]"
                        aria-label={`Select ${view.label}`}
                      />
                      <Label
                        htmlFor={`analytics-view-${view.value}`}
                        className="text-sm cursor-pointer"
                      >
                        {view.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <DropdownMenuSeparator />

              {/* Category Filter */}
              <div className="space-y-3">
                <Label className="font-semibold">Product Categories</Label>
                <div className="grid grid-cols-1 gap-2">
                  {categories.map((category) => (
                    <div key={category} className="flex items-center space-x-2">
                      <Checkbox
                        id={`category-${category}`}
                        checked={localCategories.includes(category)}
                        onCheckedChange={() => handleCategoryToggle(category)}
                      />
                      <Label
                        htmlFor={`category-${category}`}
                        className="text-sm cursor-pointer"
                      >
                        {category}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <DropdownMenuSeparator />

              {/* Status Filter */}
              <div className="space-y-3">
                <Label className="font-semibold">Stock Status</Label>
                <div className="grid grid-cols-1 gap-2">
                  {statuses.map((status) => (
                    <div key={status} className="flex items-center space-x-2">
                      <Checkbox
                        id={`status-${status}`}
                        checked={localStatus.includes(status)}
                        onCheckedChange={() => handleStatusToggle(status)}
                      />
                      <Label
                        htmlFor={`status-${status}`}
                        className="text-sm cursor-pointer"
                      >
                        {status}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <DropdownMenuSeparator />

              {/* Price Range Filter */}
              <div className="space-y-3">
                <Label className="font-semibold">Price Range</Label>
                <div className="space-y-4">
                  <Slider
                    min={0}
                    max={1000}
                    step={10}
                    value={[localPriceRange.min, localPriceRange.max]}
                    onValueChange={(values: number[]) => 
                      setLocalPriceRange({ min: values[0], max: values[1] })
                    }
                    className="w-full"
                  />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      ${localPriceRange.min}
                    </span>
                    <span className="text-muted-foreground">
                      ${localPriceRange.max}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <DropdownMenuSeparator />
            
            <div className="p-2 flex gap-2">
              <Button
                variant="outline"
                onClick={handleClearFilters}
                className="flex-1"
                size="sm"
              >
                Clear All
              </Button>
              <Button
                onClick={handleApplyFilters}
                className="flex-1 bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]"
                size="sm"
              >
                Apply Filters
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        )}

        {/* Show current date range and analytics view */}
        {showFilters && (
        <div className="hidden lg:flex items-center gap-2">
          <div className="flex items-center px-3 py-1.5 bg-gray-100 rounded-md text-sm">
            <CalendarDays className="w-4 h-4 mr-2 text-gray-500" />
            <span className="text-gray-700">{currentDateLabel}</span>
          </div>
          <div className="flex items-center px-3 py-1.5 bg-[#FF6B00]/10 rounded-md text-sm">
            <BarChart3 className="w-4 h-4 mr-2 text-[#FF6B00]" />
            <span className="text-gray-700">{currentAnalyticsLabel}</span>
          </div>
        </div>
        )}

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="relative">
              <Bell className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                3
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-80 overflow-y-auto">
              <DropdownMenuItem className="flex-col items-start py-3">
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-medium text-sm">Low Stock Alert</span>
                  <Badge variant="destructive" className="text-xs">Urgent</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Oil Filter Premium - Only 8 units remaining
                </p>
                <span className="text-xs text-muted-foreground mt-1">15 minutes ago</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="flex-col items-start py-3">
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-medium text-sm">Sales Milestone</span>
                  <Badge variant="secondary" className="text-xs">Success</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Monthly target achieved - $250K reached
                </p>
                <span className="text-xs text-muted-foreground mt-1">2 hours ago</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="flex-col items-start py-3">
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="font-medium text-sm">New Report Available</span>
                  <Badge variant="secondary" className="text-xs">Info</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Weekly performance report is ready for review
                </p>
                <span className="text-xs text-muted-foreground mt-1">5 hours ago</span>
              </DropdownMenuItem>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="justify-center text-primary cursor-pointer"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('changeView', { detail: 'notifications' }));
              }}
            >
              View all notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF6B00] to-[#607D8B] flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <span className="hidden md:inline">Admin</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="font-medium">Admin User</p>
                <p className="text-xs text-muted-foreground">admin@autopartspro.com</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="w-4 h-4 mr-2" />
              Profile Settings
            </DropdownMenuItem>
            <DropdownMenuItem>
              <BarChart3 className="w-4 h-4 mr-2" />
              Dashboard
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}
