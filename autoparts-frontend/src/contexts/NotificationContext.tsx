import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { useInventory, InventoryItem } from "./InventoryContext";
import { useForecast, ProductForecast } from "./ForecastContext";

export type NotificationCategory = "inventory" | "ai_recommendations" | "forecast";

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  type: "critical" | "warning" | "info" | "recommendation";
  title: string;
  message: string;
  priority: "High" | "Medium" | "Low";
  productName?: string;
  timestamp: Date;
  read: boolean;
  readAt?: Date;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  categoryFilter: "all" | NotificationCategory;
  setCategoryFilter: (filter: "all" | NotificationCategory) => void;
  filteredNotifications: AppNotification[];
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const getBusinessId = (): number | null => {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}").business_id ?? null;
  } catch {
    return null;
  }
};

const getReadMap = (businessId: number): Map<string, string> => {
  try {
    const raw = localStorage.getItem(`notifications_read_${businessId}`);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    // Support old Set format (array of strings) → migrate to Map
    if (Array.isArray(parsed)) {
      const map = new Map<string, string>();
      const now = new Date().toISOString();
      parsed.forEach((id: string) => map.set(id, now));
      return map;
    }
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
};

const saveReadMap = (businessId: number, map: Map<string, string>) => {
  localStorage.setItem(`notifications_read_${businessId}`, JSON.stringify(Object.fromEntries(map)));
};

// Forecast helpers

interface TrendSummary {
  nextPeriodDemand: number;
  averageDemand: number;
  totalDemand: number;
  trendPercent: number;
  direction: "increasing" | "declining" | "stable";
}

const getForecastTrend = (forecasts: { period: string; predicted: number }[]): TrendSummary | null => {
  const valid = forecasts
    .filter(f => Number.isFinite(Number(f.predicted)))
    .map(f => ({ ...f, predicted: Math.max(0, Number(f.predicted)) }));

  if (valid.length === 0) return null;

  const first = valid[0].predicted;
  const last = valid[valid.length - 1].predicted;
  const totalDemand = valid.reduce((s, f) => s + f.predicted, 0);
  const averageDemand = totalDemand / valid.length;
  const trendPercent = first > 0 ? ((last - first) / first) * 100 : last > 0 ? 100 : 0;

  return {
    nextPeriodDemand: first,
    averageDemand,
    totalDemand,
    trendPercent,
    direction: trendPercent >= 10 ? "increasing" : trendPercent <= -10 ? "declining" : "stable",
  };
};

const getStockState = (status: string) => status.toLowerCase().replace(/[\s_-]/g, "");

const formatUnits = (v: number) => `${Math.ceil(Math.max(0, v)).toLocaleString()} units`;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { inventory } = useInventory();
  const { productForecasts } = useForecast();
  const [readMap, setReadMap] = useState<Map<string, string>>(new Map());
  const [categoryFilter, setCategoryFilter] = useState<"all" | NotificationCategory>("all");
  const [refreshTick, setRefreshTick] = useState(0);

  // Load read-state from localStorage on mount
  useEffect(() => {
    const bid = getBusinessId();
    if (bid) setReadMap(getReadMap(bid));
  }, []);

  // Periodic refresh every 60s
  useEffect(() => {
    const interval = setInterval(() => setRefreshTick(t => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Derive notifications from live data 
  const notifications = useMemo<AppNotification[]>(() => {
    // Force re-derive on refreshTick
    void refreshTick;

    const now = new Date();
    const result: AppNotification[] = [];

    const inventoryByName = new Map<string, InventoryItem>(
      inventory.map(item => [item.name.trim().toLowerCase(), item])
    );

    // Critical Stock Alerts
    inventory
      .filter(item => item.status === "Critical")
      .forEach(item => {
        result.push({
          id: `critical-${item.id}`,
          category: "inventory",
          type: "critical",
          title: "Critical Stock Alert",
          message: `${item.name} — Only ${item.currentStock} ${item.currentStock === 1 ? "unit" : "units"} remaining. Minimum stock is ${item.minimumStock}. Immediate restocking required.`,
          priority: "High",
          productName: item.name,
          timestamp: now,
          read: false,
        });
      });

    // Low Stock Alerts
    inventory
      .filter(item => item.status === "Low_Stock" || item.status === "Low Stock")
      .forEach(item => {
        result.push({
          id: `lowstock-${item.id}`,
          category: "inventory",
          type: "warning",
          title: "Low Stock Alert",
          message: `${item.name} — ${item.currentStock} units on hand, approaching minimum stock level of ${item.minimumStock}. Consider reordering soon.`,
          priority: "Medium",
          productName: item.name,
          timestamp: now,
          read: false,
        });
      });

    Object.values(productForecasts).forEach((forecast: ProductForecast) => {
      if (forecast.loading || forecast.error || forecast.forecasts.length === 0) return;

      const trend = getForecastTrend(forecast.forecasts);
      if (!trend) return;

      const item = inventoryByName.get(forecast.product_name.trim().toLowerCase());
      const currentStock = item?.currentStock ?? 0;
      const minimumStock = item?.minimumStock ?? 0;
      const stockState = item ? getStockState(item.status) : "";
      const isCritical = stockState === "critical" || currentStock <= minimumStock;
      const isLowStock = isCritical || stockState === "lowstock" || currentStock <= minimumStock * 1.25;
      const forecastCoverageMonths = trend.averageDemand > 0 ? currentStock / trend.averageDemand : Number.POSITIVE_INFINITY;
      const stockNeededNextPeriod = Math.max(0, trend.nextPeriodDemand + minimumStock - currentStock);
      const horizonMonths = Math.max(forecast.forecasts.length, 1);
      const stockNeededForHorizon = Math.max(0, trend.totalDemand + minimumStock - currentStock);

      // Restock Recommendations
      if (isCritical || (trend.direction === "increasing" && stockNeededNextPeriod > 0)) {
        result.push({
          id: `restock-rec-${forecast.product_name}`,
          category: "ai_recommendations",
          type: "recommendation",
          title: "Restock Recommendation",
          message: `${forecast.product_name} — AI recommends ordering ${formatUnits(Math.max(stockNeededNextPeriod, minimumStock))}. Demand trend: ${trend.trendPercent >= 0 ? "+" : ""}${trend.trendPercent.toFixed(1)}%.`,
          priority: isCritical || trend.trendPercent >= 25 ? "High" : "Medium",
          productName: forecast.product_name,
          timestamp: now,
          read: false,
        });
      }

      // High-Priority Inventory Actions (critical + increasing demand)
      if (isCritical && trend.direction === "increasing") {
        result.push({
          id: `high-priority-${forecast.product_name}`,
          category: "inventory",
          type: "critical",
          title: "High-Priority Inventory Action",
          message: `${forecast.product_name} — Stock is critical AND demand is rising by ${trend.trendPercent.toFixed(1)}%. Act immediately to prevent stockout.`,
          priority: "High",
          productName: forecast.product_name,
          timestamp: now,
          read: false,
        });
      }

      // AI-Generated Recommendations (safety stock for increasing demand)
      if (trend.direction === "increasing" && forecastCoverageMonths < 2 && !isCritical) {
        result.push({
          id: `ai-safety-${forecast.product_name}`,
          category: "ai_recommendations",
          type: "recommendation",
          title: "AI Recommendation: Increase Safety Stock",
          message: `${forecast.product_name} — Demand is rising. Current stock covers ~${forecastCoverageMonths.toFixed(1)} month(s). Raise reorder level by ${formatUnits(stockNeededForHorizon)}.`,
          priority: forecastCoverageMonths < 1 ? "High" : "Medium",
          productName: forecast.product_name,
          timestamp: now,
          read: false,
        });
      }

      // Forecast-Based Warnings (low accuracy models)
      if (forecast.model_info?.low_accuracy) {
        result.push({
          id: `forecast-warn-${forecast.product_name}`,
          category: "forecast",
          type: "warning",
          title: "Forecast Accuracy Warning",
          message: `${forecast.product_name} — Forecast accuracy is ${forecast.model_info.accuracy?.toFixed(1) ?? "N/A"}% (MAPE: ${forecast.model_info.mape?.toFixed(1) ?? "N/A"}%). Consider re-training or adding more sales data.`,
          priority: "Medium",
          productName: forecast.product_name,
          timestamp: now,
          read: false,
        });
      }

      // Fast-Moving Product Alerts
      if (trend.trendPercent >= 25) {
        result.push({
          id: `fast-moving-${forecast.product_name}`,
          category: "forecast",
          type: "info",
          title: "Fast-Moving Product Alert",
          message: `${forecast.product_name} — Demand is surging with a +${trend.trendPercent.toFixed(1)}% trend. Ensure sufficient stock to capitalize on increased sales.`,
          priority: trend.trendPercent >= 50 ? "High" : "Medium",
          productName: forecast.product_name,
          timestamp: now,
          read: false,
        });
      }

      // Slow-Moving Inventory Alerts
      if (trend.direction === "declining" && currentStock > Math.max(minimumStock, trend.totalDemand)) {
        const excessUnits = currentStock - Math.max(minimumStock, trend.totalDemand);
        result.push({
          id: `slow-moving-${forecast.product_name}`,
          category: "ai_recommendations",
          type: "info",
          title: "Slow-Moving Inventory Alert",
          message: `${forecast.product_name} — Demand declining by ${Math.abs(trend.trendPercent).toFixed(1)}%. You have ~${formatUnits(excessUnits)} excess stock. Consider pausing reorders.`,
          priority: excessUnits > trend.averageDemand * 2 ? "Medium" : "Low",
          productName: forecast.product_name,
          timestamp: now,
          read: false,
        });
      }

      // Inventory Risk Notifications
      if (forecastCoverageMonths < 1 && trend.direction !== "declining" && !isCritical) {
        result.push({
          id: `inv-risk-${forecast.product_name}`,
          category: "inventory",
          type: "warning",
          title: "Inventory Risk: Stockout Imminent",
          message: `${forecast.product_name} — Current stock covers less than 1 month of projected demand (~${forecastCoverageMonths.toFixed(1)} months). Restock urgently.`,
          priority: "High",
          productName: forecast.product_name,
          timestamp: now,
          read: false,
        });
      }

      // Product Demand Trend Recommendations (stable + low stock)
      if (trend.direction === "stable" && isLowStock && !isCritical) {
        result.push({
          id: `trend-rec-${forecast.product_name}`,
          category: "forecast",
          type: "recommendation",
          title: "Demand Trend: Top-Up Needed",
          message: `${forecast.product_name} — Demand is stable at ~${formatUnits(trend.averageDemand)}/period but stock is low. Top up to avoid disruption.`,
          priority: "Medium",
          productName: forecast.product_name,
          timestamp: now,
          read: false,
        });
      }
    });

    // Sort: High priority first, then Medium, then Low
    const priorityRank: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
    result.sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority]);

    // Deduplicate — keep first occurrence of each id
    const seen = new Set<string>();
    const deduped = result.filter(n => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });

    // Apply read state with readAt timestamp
    return deduped.map(n => {
      const readAtISO = readMap.get(n.id);
      return {
        ...n,
        read: readMap.has(n.id),
        readAt: readAtISO ? new Date(readAtISO) : undefined,
      };
    });
  }, [inventory, productForecasts, readMap, refreshTick]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (categoryFilter === "all") return notifications;
    return notifications.filter(n => n.category === categoryFilter);
  }, [notifications, categoryFilter]);

  const markAsRead = useCallback((id: string) => {
    setReadMap(prev => {
      const next = new Map(prev);
      next.set(id, new Date().toISOString());
      const bid = getBusinessId();
      if (bid) saveReadMap(bid, next);
      return next;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    setReadMap(prev => {
      const next = new Map(prev);
      const now = new Date().toISOString();
      notifications.forEach(n => { if (!next.has(n.id)) next.set(n.id, now); });
      const bid = getBusinessId();
      if (bid) saveReadMap(bid, next);
      return next;
    });
  }, [notifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        categoryFilter,
        setCategoryFilter,
        filteredNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
