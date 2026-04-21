import React, { useState, useEffect } from 'react';
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
  const [user, setUser] = useState<{ role: string; company_id: number; email: string; user_name?: string } | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true); 

  const [activeView, setActiveView] = useState(() => {
    const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
    
    // If USER is staff, set default view to 'sales-reports'
    //if user is business, set default view to 'sales-reports'
    return (savedUser.role === 'staff' || savedUser.role === 'Business') 
      ? "sales-reports" 
      : "dashboard";
  });
  const [showLowStockModal, setShowLowStockModal] = useState(false);
  const { inventory, setInventory } = useInventory(); 

  const [globalFilters, setGlobalFilters] = useState<GlobalFilters>({
    searchTerm: "",
    dateRange: "all", // Change this from "october" to "all"
    analyticsView: "monthly",
    categories: [],
    status: [],
    priceRange: { min: 0, max: 1000 }
  });

  // Check localStorage on Mount
  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        setIsAuthenticated(false); 
      } catch (e) {
        console.error("Failed to parse saved user", e);
        localStorage.removeItem("user");
      }
    }
    // Ensure checking state is disabled after the check
    setIsCheckingAuth(false);
  }, []);

  // Single handleLogin to trigger immediate transition
  const handleLogin = (userData: any) => {
      // Save to local storage
      localStorage.setItem("user", JSON.stringify(userData)); 
      
      // Dispatch the event
      window.dispatchEvent(new Event("userLogin")); 
      
      // Update App state
      setUser(userData);
      setIsAuthenticated(true);

      // Redirect based on role
      const isStaff = userData.role === 'staff' || userData.role === 'Business';
      setActiveView(isStaff ? "sales-reports" : "dashboard");
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    // Clear inventory state so the next business doesn't see old data
    if (setInventory) setInventory([]); 
    setIsAuthenticated(false);
    setUser(null);
    window.location.href = "/"; 
  };

  // Monitor user changes for debugging/tracking
  useEffect(() => {
    if (isAuthenticated && user?.company_id) {
        console.log("Active session for company:", user.company_id);
    }
  }, [user, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && inventory.length > 0) {
      const lowStockItems = inventory.filter(item => 
        item.status === "Critical" || item.status === "Low Stock"
      );

      if (lowStockItems.length > 0) {
        setShowLowStockModal(true);
      }
    }
  }, [isAuthenticated, inventory]);

  useEffect(() => {
    const handleFilterUpdate = (event: any) => updateFilters(event.detail);
    const handleViewChange = (event: any) => setActiveView(event.detail);

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
        // Role-based access control
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
        <div className="min-h-screen flex w-full">
          <AppSidebar 
            activeView={activeView} 
            onViewChange={setActiveView} 
            user={user} 
          />
          <SidebarInset className="flex-1">
            <SalesHeader
              onLogout={handleLogout}
              globalFilters={globalFilters}
              onUpdateFilters={updateFilters}
              onClearFilters={() => {}}
              activeView={activeView}
            />
            <main className="flex-1 p-6 bg-background">
              {renderView()}
            </main>
          </SidebarInset>

          <LowStockModal
            isOpen={showLowStockModal}
            onClose={() => setShowLowStockModal(false)}
            onViewInventory={() => setActiveView("inventory")}
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