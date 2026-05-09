import React, { useState, useEffect, useRef } from 'react';
import { LoginPage } from "./components/LoginPage";
import { SalesHeader } from "./components/SalesHeader";
import { AppSidebar } from "./components/AppSidebar";
import { SidebarProvider, SidebarInset } from "./components/ui/sidebar";
import { LowStockModal } from "./components/LowStockModal";
import { Toaster } from "./components/ui/sonner";
import { InventoryProvider, useInventory } from "./contexts/InventoryContext";
import { SuppliersProvider } from "./contexts/SuppliersContext";
import { SalesReportsProvider } from "./contexts/SalesReportsContext";
import { ForecastProvider } from "./contexts/ForecastContext";

// Import all view components
import { DashboardView } from "./components/views/DashboardView";
import { SalesReportsView } from "./components/views/SalesReportsView";
import { PredictionsTrendsView } from "./components/views/PredictionsTrendsView";
import { RecommendationsView } from "./components/views/RecommendationsView";
import { InventoryView } from "./components/views/InventoryView";
import { AnalyticsView } from "./components/views/AnalyticsView";
import { SuppliersView } from "./components/views/SuppliersView";
import { SettingsView } from "./components/views/SettingsView";
import { NotificationsView } from "./components/views/NotificationsView";

export interface GlobalFilters {
  searchTerm: string;
  dateRange: string;
  customDateRange?: { from: Date; to: Date };
  analyticsView: "daily" | "weekly" | "monthly" | "quarterly" | "annually";
  categories: string[];
  status: string[];
  priceRange: { min: number; max: number };
}

function AppContent() {
  // Authentication and User States
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ role: string; business_id: number; email: string; user_name?: string } | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const isFirstLogin = useRef(false);

  const [activeView, setActiveView] = useState(() => {
    const savedView = localStorage.getItem("activeView");
    if (savedView) return savedView;
    const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
    return (savedUser.role === 'staff' || savedUser.role === 'Business')
      ? "sales-reports"
      : "dashboard";
  });

  const changeView = (view: string) => {
    localStorage.setItem("activeView", view);
    setActiveView(view);
  };

  const [showLowStockModal, setShowLowStockModal] = useState(false);
  const { inventory, setInventory } = useInventory();

  const [globalFilters, setGlobalFilters] = useState<GlobalFilters>({
    searchTerm: "",
    dateRange: "all",
    analyticsView: "monthly",
    categories: [],
    status: [],
    priceRange: { min: 0, max: 1000 }
  });

  useEffect(() => {
    const isPageRefresh = sessionStorage.getItem("appSession") === "active";

    if (isPageRefresh) {
      // Refresh: restore saved session
      const savedUser = localStorage.getItem("user");
      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
          setIsAuthenticated(true);
        } catch (e) {
          console.error("Failed to parse saved user", e);
          localStorage.removeItem("user");
          localStorage.removeItem("activeView");
        }
      }
    } else {
      // Fresh start: force login
      localStorage.removeItem("user");
      localStorage.removeItem("activeView");
      // Mark this tab as having an active session so refreshes are detected
      sessionStorage.setItem("appSession", "active");
    }

    setIsCheckingAuth(false);
  }, []);

  // Single handleLogin to trigger immediate transition
  const handleLogin = (userData: any) => {
    isFirstLogin.current = true;
    localStorage.setItem("user", JSON.stringify(userData));
    sessionStorage.setItem("appSession", "active"); // ensure refresh flag is set
    window.dispatchEvent(new Event("userLogin"));
    setUser(userData);
    setIsAuthenticated(true);
    const isStaff = userData.role === 'staff' || userData.role === 'Business';
    changeView(isStaff ? "sales-reports" : "dashboard");
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("activeView");
    sessionStorage.removeItem("appSession"); // clear session so next open = login
    if (setInventory) setInventory([]);
    setIsAuthenticated(false);
    setUser(null);
    window.location.href = "/";
  };

  // Monitor user changes for debugging/tracking
  useEffect(() => {
    if (isAuthenticated && user?.business_id) {
      console.log("Active session for business:", user.business_id);
    }
  }, [user, isAuthenticated]);

  // Low stock modal — only on fresh login, not on refresh
  useEffect(() => {
    if (isAuthenticated && inventory.length > 0 && isFirstLogin.current) {
      const lowStockItems = inventory.filter(item =>
        item.status === "Critical" || item.status === "Low Stock"
      );
      if (lowStockItems.length > 0) {
        setShowLowStockModal(true);
        isFirstLogin.current = false;
      }
    }
  }, [isAuthenticated, inventory]);

  useEffect(() => {
    const handleFilterUpdate = (event: any) => updateFilters(event.detail);
    const handleViewChange = (event: any) => changeView(event.detail);

    window.addEventListener('updateFilters', handleFilterUpdate as EventListener);
    window.addEventListener('changeView', handleViewChange as EventListener);
    return () => {
      window.removeEventListener('updateFilters', handleFilterUpdate as EventListener);
      window.removeEventListener('changeView', handleViewChange as EventListener);
    };
  }, []);

  const updateFilters = (updates: Partial<GlobalFilters>) => {
    setGlobalFilters(prev => ({ ...prev, ...updates }));
  };

  const renderView = () => {
    const isStaff = user?.role === 'staff' || user?.role === 'Business';
    switch (activeView) {
      case "dashboard":
        return isStaff ? <InventoryView globalFilters={globalFilters} /> : <DashboardView globalFilters={globalFilters} />;
      case "sales-reports":
        return <SalesReportsView globalFilters={globalFilters} user={user} />;
      case "predictions-trends":
        return <PredictionsTrendsView />;
      case "analytics":
        return <AnalyticsView globalFilters={globalFilters} />;
      case "recommendations":
        return <RecommendationsView globalFilters={globalFilters} />;
      case "inventory":
        return <InventoryView globalFilters={globalFilters} />;
      case "suppliers":
        return <SuppliersView user={user} />;
      case "settings":
        if (user?.role === 'admin') {
          return <SettingsView />;
        }
        return <DashboardView globalFilters={globalFilters} />;
      case "notifications":
        return <NotificationsView />;
      default:
        return <DashboardView globalFilters={globalFilters} />;
    }
  };

  // LOADING GUARD: Prevents dashboard flicker
  if (isCheckingAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#212121]">
        <div className="text-white text-xl animate-pulse">Checking Session...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <>
      <SidebarProvider>
        <div className="flex h-screen w-full bg-background overflow-hidden">

          <AppSidebar
            activeView={activeView}
            onViewChange={changeView}
            user={user}
          />

          <SidebarInset className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden bg-slate-50">

            <header className="sticky top-0 z-20 w-full bg-white border-b flex-shrink-0">
              <SalesHeader
                onLogout={handleLogout}
                globalFilters={globalFilters}
                onUpdateFilters={updateFilters}
                onClearFilters={() => {}}
                activeView={activeView}
              />
            </header>

            <main className="flex-1 w-full overflow-y-auto p-4 md:p-6 scroll-smooth">
              <div className="mx-auto w-full min-h-full">
                {renderView()}
              </div>
            </main>

          </SidebarInset>

          <LowStockModal
            isOpen={showLowStockModal}
            onClose={() => setShowLowStockModal(false)}
            onViewInventory={() => changeView("inventory")}
          />
        </div>
      </SidebarProvider>
      <Toaster position="top-right" richColors />
    </>
  );
}

export default function App() {
  return (
    <InventoryProvider>
      <SuppliersProvider>
        <SalesReportsProvider>
          <ForecastProvider>
            <AppContent />
          </ForecastProvider>
        </SalesReportsProvider>
      </SuppliersProvider>
    </InventoryProvider>
  );
}