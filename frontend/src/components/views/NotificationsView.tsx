import { JSX, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { motion } from "motion/react";
import {
  Bell,
  AlertTriangle,
  TrendingUp,
  Package,
  Brain,
  CheckCircle,
  Check,
  Clock,
  ChevronDown,
  ChevronUp,
  MailOpen
} from "lucide-react";
import { useNotifications, AppNotification, NotificationCategory } from "../../contexts/NotificationContext";

interface NotificationsViewProps {
  onNavigate?: (view: string) => void;
}

// Map notification type → icon + colors
const typeConfig = (type: string) => {
  switch (type) {
    case "critical":
      return { icon: <AlertTriangle className="w-4 h-4 text-red-600" />, borderColor: "#f87171", iconBg: "#fef2f2" };
    case "warning":
      return { icon: <Package className="w-4 h-4 text-amber-600" />, borderColor: "#fbbf24", iconBg: "#fffbeb" };
    case "recommendation":
      return { icon: <Brain className="w-4 h-4 text-blue-600" />, borderColor: "#60a5fa", iconBg: "#eff6ff" };
    default:
      return { icon: <TrendingUp className="w-4 h-4 text-emerald-600" />, borderColor: "#34d399", iconBg: "#ecfdf5" };
  }
};

// Map category → sidebar route
const categoryRoute: Record<string, string> = {
  inventory: "inventory",
  ai_recommendations: "recommendations",
  forecast: "predictions-trends",
};

// Format a Date for display
const formatDateTime = (d: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const formatReadAt = (d: Date): string => {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

export function NotificationsView({ onNavigate }: NotificationsViewProps) {
  const { notifications, unreadCount, markAsRead, markAsUnread, markAllAsRead } = useNotifications();
  const [activeTab, setActiveTab] = useState("all");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const ITEMS_PER_GROUP = 5;

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === "all") return true;
    if (activeTab === "unread") return !n.read;
    if (activeTab === "read") return n.read;
    return true;
  });

  // Group notifications by category
  const categoryOrder: { key: NotificationCategory; label: string; icon: JSX.Element }[] = [
    { key: "inventory", label: "Inventory Alerts", icon: <Package className="w-4 h-4 text-amber-600" /> },
    { key: "ai_recommendations", label: "AI Recommendations", icon: <Brain className="w-4 h-4 text-blue-600" /> },
    { key: "forecast", label: "Forecast & Trends", icon: <TrendingUp className="w-4 h-4 text-emerald-600" /> },
  ];

  const groupedNotifications = categoryOrder.map(cat => ({
    ...cat,
    items: filteredNotifications.filter(n => n.category === cat.key),
  })).filter(g => g.items.length > 0);

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const highPriorityCount = notifications.filter(n => n.priority === "High").length;

  const handleNotificationClick = (n: AppNotification) => {
    if (!n.read) markAsRead(n.id);
    const route = categoryRoute[n.category];
    if (route && onNavigate) onNavigate(route);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.06 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <motion.div className="space-y-6 p-6" variants={containerVariants} initial="hidden" animate="visible">

      {/* Header */}
      <motion.div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3" variants={itemVariants}>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500">
            View and manage alerts from Inventory, AI Recommendations, and Forecast
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={markAllAsRead}
          disabled={unreadCount === 0}
          className="border-gray-200"
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          Mark All as Read
        </Button>
      </motion.div>

      {/* Stats */}
      <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-4" variants={containerVariants}>
        {[
          { label: "Total", value: notifications.length, sub: "Across all categories", color: "#FF6B00", Icon: Bell },
          { label: "Unread", value: unreadCount, sub: "Require attention", color: "#607D8B", Icon: Bell },
          { label: "High Priority", value: highPriorityCount, sub: "Need immediate action", color: "#dc2626", Icon: AlertTriangle },
        ].map(s => (
          <motion.div key={s.label} variants={itemVariants}>
            <Card className="border border-gray-100 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">{s.label}</CardTitle>
                <div className="p-2 rounded-lg" style={{ backgroundColor: s.color }}>
                  <s.Icon className="h-4 w-4 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900">{s.value}</div>
                <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Notifications List */}
      <motion.div variants={itemVariants}>
        <Card className="border border-gray-100 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-gray-800">All Notifications</CardTitle>
            <CardDescription className="text-sm text-gray-400">Click a notification to navigate to its module</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="all">All ({notifications.length})</TabsTrigger>
                <TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger>
                <TabsTrigger value="read">Read ({notifications.length - unreadCount})</TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-2">
                <div className="space-y-2">
                  {groupedNotifications.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                      <Bell className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-medium">No notifications in this category</p>
                    </div>
                  ) : (
                    groupedNotifications.map(group => {
                      const isExpanded = expandedCategories.has(group.key);
                      const visibleItems = isExpanded ? group.items : group.items.slice(0, ITEMS_PER_GROUP);
                      const hasMore = group.items.length > ITEMS_PER_GROUP;
                      const hiddenCount = group.items.length - ITEMS_PER_GROUP;

                      return (
                        <div key={group.key} className="mb-5 last:mb-0">
                          {/* Category Header */}
                          <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-gray-100">
                            {group.icon}
                            <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{group.label}</span>
                            <span className="text-[10px] font-semibold text-gray-400 ml-auto">{group.items.length}</span>
                          </div>

                          {/* Notification Items */}
                          <div className="flex flex-col" style={{ gap: "7px" }}>
                            {visibleItems.map((n, i) => {
                              const config = typeConfig(n.type);
                              return (
                                <motion.div
                                  key={n.id}
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.03 }}
                                  className={`group flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${!n.read
                                      ? "border-gray-200 hover:bg-gray-100/60"
                                      : "border-gray-100 hover:bg-gray-50"
                                    }`}
                                  style={{
                                    borderLeft: `3px solid ${config.borderColor}`,
                                    backgroundColor: !n.read ? "#f3f4f6" : "transparent",
                                  }}
                                  onClick={() => handleNotificationClick(n)}
                                >
                                  {/* Icon */}
                                  <div
                                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5"
                                    style={{ backgroundColor: config.iconBg }}
                                  >
                                    {config.icon}
                                  </div>

                                  {/* Content */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      {!n.read && (
                                        <span className="inline-block w-2 h-2 rounded-full bg-[#FF6B00] flex-shrink-0" />
                                      )}
                                      <span className={`text-sm leading-tight ${!n.read ? "font-bold text-gray-900" : "font-medium text-gray-500"
                                        }`}>
                                        {n.title}
                                      </span>
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${n.priority === "High"
                                          ? "bg-red-100 text-red-700"
                                          : n.priority === "Medium"
                                            ? "bg-amber-100 text-amber-700"
                                            : "bg-gray-100 text-gray-500"
                                        }`}>
                                        {n.priority}
                                      </span>
                                    </div>
                                    <p className={`text-xs leading-relaxed mb-1 ${!n.read ? "text-gray-700" : "text-gray-400"
                                      }`}>
                                      {n.message}
                                    </p>
                                    <div className="flex items-center gap-3 text-[11px] text-gray-400">
                                      {n.productName && (
                                        <span>{n.productName}</span>
                                      )}
                                      <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {formatDateTime(n.timestamp)}
                                      </span>
                                      {n.read && n.readAt && (
                                        <span className="flex items-center gap-1 text-green-600">
                                          <Check className="w-3 h-3" />
                                          Read {formatReadAt(n.readAt)}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Mark as Read / Unread button */}
                                  {!n.read ? (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                                      className="flex-shrink-0 px-3 py-1 text-[11px] font-semibold rounded flex items-center gap-1 hover:opacity-80 transition-opacity"
                                      style={{ color: "#16a34a", backgroundColor: "#f0fdf4" }}
                                    >
                                      <CheckCircle className="w-3 h-3" />
                                      Read
                                    </button>
                                  ) : (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); markAsUnread(n.id); }}
                                      className="flex-shrink-0 px-3 py-1 text-[11px] font-semibold rounded flex items-center gap-1 hover:opacity-80 transition-opacity"
                                      style={{ color: "#ea580c", backgroundColor: "#fff7ed" }}
                                    >
                                      <MailOpen className="w-3 h-3" />
                                      Unread
                                    </button>
                                  )}
                                </motion.div>
                              );
                            })}
                          </div>

                          {/* Show More / Show Less */}
                          {hasMore && (
                            <button
                              onClick={() => toggleCategory(group.key)}
                              className="w-full mt-2 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors flex items-center justify-center gap-1"
                            >
                              {isExpanded ? (
                                <>
                                  Show Less
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </>
                              ) : (
                                <>
                                  Show {hiddenCount} More
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
