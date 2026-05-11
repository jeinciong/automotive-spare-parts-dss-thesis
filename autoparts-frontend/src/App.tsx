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
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSalesReports } from "./contexts/SalesReportsContext";

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
function ImportProgressOverlay() {
  const { importProgress, importBatch } = useSalesReports();
  const [displayProgress, setDisplayProgress] = useState(0);
  const animFrameRef = useRef<number | null>(null);
  const displayProgressRef = useRef(0);  // ← tracks current value without stale closure

  // In App.tsx - ImportProgressOverlay

  useEffect(() => {
    if (importProgress === null) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      displayProgressRef.current = 0;
      setDisplayProgress(0);
      return;
    }

    const target = importProgress;
    const start = displayProgressRef.current;
    const diff = target - start;
    if (diff <= 0) return;

    // Much faster animation — 15ms per percent step max
    const duration = Math.min(diff * 15, 400);
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(start + diff * eased);

      displayProgressRef.current = current;
      setDisplayProgress(current);

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setTimeout(() => {
      animFrameRef.current = requestAnimationFrame(animate);
    }, 50);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [importProgress]);

  return createPortal(
    <AnimatePresence>
      {importProgress !== null && (
        <motion.div
          key="import-overlay"
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, width: 300 }}
          className="bg-white rounded-xl shadow-2xl border border-gray-100 p-4 space-y-3"
        >
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg
                className="flex-shrink-0"
                width="16" height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ animation: "spin 0.75s linear infinite" }}
              >
                <circle cx="8" cy="8" r="6" stroke="#e5e7eb" strokeWidth="2.5" />
                <path d="M8 2 A6 6 0 0 1 14 8" stroke="#FF6B00" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span className="text-sm font-semibold text-gray-800">Importing records…</span>
            </div>
            <span className="text-sm font-bold text-[#FF6B00]">
              {displayProgress}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
            <motion.div
              className="h-2.5 rounded-full relative overflow-hidden bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]"
              initial={{ width: "0%" }}
              animate={{ width: `${displayProgress}%` }}
              transition={{ ease: "linear", duration: 0.05 }}
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                animate={{ x: ["-100%", "200%"] }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
              />
            </motion.div>
          </div>

          {/* Batch info row */}
          {importBatch && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Please don't close the page</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-orange-50 border border-orange-200 text-[#FF6B00] font-semibold">
                Batch {importBatch.current}/{importBatch.total}
              </span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
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
            <ImportProgressOverlay />
            <AppContent />
          </ForecastProvider>
        </SalesReportsProvider>
      </SuppliersProvider>
    </InventoryProvider>
  );
}