import {
  BarChart3,
  Package,
  TrendingUp,
  Brain,
  Settings,
  Truck,
  Home,
  ChevronRight,
  LineChart,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "./ui/sidebar";
import { Badge } from "./ui/badge"; 
import { ForwardRefExoticComponent, RefAttributes } from "react";
import { LucideProps } from "lucide-react";

interface AppSidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  // Updated user type to include the role from your database
  user: { user_name?: string; role?: string } | null; 
}

export function AppSidebar({ activeView, onViewChange, user }: AppSidebarProps) {
  // Check if the role is 'staff' or 'Business' (Staff role in your DB)
  const isStaff = user?.role === 'staff' || user?.role === 'Business';

  interface MenuItem {
    title: string;
    icon: ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;
    key: string;
  }

  // Menu structure with conditional filtering
  const menuItems = [
    {
      title: "Overview",
      items: isStaff ? [] : [
        { title: "Dashboard", icon: Home, key: "dashboard" },
      ],
    },
    {
      title: "Sales & Analytics",
      // Staff cannot see the advanced DSS features (Predictions, Analytics, etc.)
      items: isStaff ? [] : [
        { title: "Sales Reports", icon: BarChart3, key: "sales-reports" },
        { title: "Predictions & Trends", icon: LineChart, key: "predictions-trends" },
        { title: "Analytics", icon: TrendingUp, key: "analytics" },
        { title: "Recommendations", icon: Brain, key: "recommendations" },
      ],
    },
    {
      title: "Inventory Management",
      // We add "Sales Reports" here for Staff so they have access to CRUD actions
      items: [
        ...(isStaff ? [{ title: "Sales Reports", icon: BarChart3, key: "sales-reports" }] : []),
        { title: "Inventory", icon: Package, key: "inventory" },
        { title: "Suppliers", icon: Truck, key: "suppliers" },
      ],
    },
    {
      title: "Configuration",
      items: isStaff ? [] : [
        { title: "Settings", icon: Settings, key: "settings" },
      ],
    },
  ].filter(group => group.items.length > 0);

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center space-x-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6B00] to-[#607D8B] flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sidebar-foreground">AutoParts Pro</h3>
              {isStaff && (
                <Badge variant="outline" className="text-[10px] uppercase border-orange-500 text-orange-500 px-1 py-0">
                  Staff
                </Badge>
              )}
            </div>
            <p className="text-xs text-[#B0BEC5] truncate max-w-[120px]">
              {user?.user_name || "Business Owner"}
            </p>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        {menuItems.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      onClick={() => onViewChange(item.key)}
                      className={activeView === item.key ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                      {activeView === item.key && <ChevronRight className="w-4 h-4 ml-auto" />}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}