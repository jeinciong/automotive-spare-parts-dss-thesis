import { LogOut } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "./ui/dropdown-menu";
import { SidebarTrigger } from "./ui/sidebar";
import { motion } from "motion/react";
import { GlobalFilters } from "../App";
import { NotificationBell } from "./NotificationBell";

interface SalesHeaderProps {
  onLogout: () => void;
  globalFilters: GlobalFilters;
  onUpdateFilters: (updates: Partial<GlobalFilters>) => void;
  onClearFilters: () => void;
  activeView?: string;
  onViewChange?: (view: string) => void;
}

export function SalesHeader({ onLogout, onViewChange }: SalesHeaderProps) {
  const user = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); }
    catch { return {}; }
  })();
  const userEmail = user.email || "user@autopartspro.com";
  const userInitial = (user.user_name || user.email || "U")[0].toUpperCase();

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
        <NotificationBell onNavigate={onViewChange} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center space-x-2 border-orange-200">
              <div className="w-6 h-6 rounded-full bg-[#FF6B00] flex items-center justify-center text-white text-[10px] font-bold">{userInitial}</div>
              <span className="hidden md:inline text-xs">Login to another account</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs truncate">{userEmail}</DropdownMenuLabel>
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