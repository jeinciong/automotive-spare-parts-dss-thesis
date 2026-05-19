import { useState, useRef, useEffect } from "react";
import { Bell, Check, AlertTriangle, TrendingUp, Brain, Package, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useNotifications, NotificationCategory, AppNotification } from "../contexts/NotificationContext";

interface NotificationBellProps {
  onNavigate?: (view: string) => void;
}

const categoryLabels: Record<"all" | NotificationCategory, string> = {
  all: "All",
  inventory: "Inventory",
  ai_recommendations: "AI Recs",
  forecast: "Forecast",
};

const categoryKeys: ("all" | NotificationCategory)[] = ["all", "inventory", "ai_recommendations", "forecast"];

// Map category → sidebar route for click-to-navigate
const categoryRoute: Record<NotificationCategory, string> = {
  inventory: "inventory",
  ai_recommendations: "recommendations",
  forecast: "predictions-trends",
};

const typeStyles = (type: string) => {
  switch (type) {
    case "critical":
      return { icon: <AlertTriangle className="w-3.5 h-3.5 text-red-600" />, iconBg: "#fef2f2", borderColor: "#f87171" };
    case "warning":
      return { icon: <Package className="w-3.5 h-3.5 text-amber-600" />, iconBg: "#fffbeb", borderColor: "#fbbf24" };
    case "recommendation":
      return { icon: <Brain className="w-3.5 h-3.5 text-blue-600" />, iconBg: "#eff6ff", borderColor: "#60a5fa" };
    default:
      return { icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />, iconBg: "#ecfdf5", borderColor: "#34d399" };
  }
};

export function NotificationBell({ onNavigate }: NotificationBellProps) {
  const {
    unreadCount,
    markAsRead,
    markAllAsRead,
    categoryFilter,
    setCategoryFilter,
    filteredNotifications,
  } = useNotifications();

  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [categoryFilter]);

  const visibleNotifications = filteredNotifications.slice(0, 50);

  const handleNotificationClick = (n: AppNotification) => {
    if (!n.read) markAsRead(n.id);
    setOpen(false);
    const route = categoryRoute[n.category];
    if (route && onNavigate) {
      onNavigate(route);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id="notification-bell-trigger"
          variant="ghost"
          size="sm"
          className="relative w-8 h-8 p-0 rounded-full hover:bg-gray-100"
        >
          <Bell className="w-[16px] h-[16px] text-gray-500" />
          {unreadCount > 0 && (
            <span
              className="absolute flex items-center justify-center rounded-full bg-[#FF6B00] text-white font-semibold"
              style={{
                top: "0px",
                right: "0px",
                minWidth: unreadCount > 9 ? "17px" : "15px",
                height: "15px",
                fontSize: "9px",
                lineHeight: 1,
                padding: "0 3px",
              }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="p-0 border border-gray-200 shadow-lg rounded-lg"
        style={{ width: "360px", maxWidth: "calc(100vw - 24px)" }}
      >
        {/* Header  */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
          <span className="text-sm font-bold text-gray-800">Notifications</span>
          {unreadCount > 0 && (
            <button
              className="text-[11px] font-semibold text-[#FF6B00] hover:text-orange-700 transition-colors"
              onClick={markAllAsRead}
            >
              Mark All as Read
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex px-3 py-1.5 gap-0.5 border-b border-gray-200">
          {categoryKeys.map(key => (
            <button
              key={key}
              onClick={() => setCategoryFilter(key)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${categoryFilter === key
                  ? "bg-gray-200 text-gray-900"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
            >
              {categoryLabels[key]}
            </button>
          ))}
        </div>

        {/* Notification List  */}
        <div
          ref={scrollRef}
          className="overflow-y-auto"
          style={{ maxHeight: "340px" }}
        >
          {visibleNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <Bell className="w-6 h-6 mb-1.5 opacity-20" />
              <p className="text-xs font-medium">No notifications</p>
            </div>
          ) : (
            visibleNotifications.map(n => {
              const style = typeStyles(n.type);
              return (
                <div
                  key={n.id}
                  className={`group flex items-start gap-2.5 px-4 py-2.5 border-b border-gray-100 cursor-pointer transition-colors ${!n.read
                      ? "hover:bg-gray-200/50"
                      : "hover:bg-gray-50"
                    }`}
                  style={{
                    borderLeft: `3px solid ${style.borderColor}`,
                    backgroundColor: !n.read ? "#f3f4f6" : "transparent",
                  }}
                  onClick={() => handleNotificationClick(n)}
                >
                  {/* Icon */}
                  <div
                    className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: style.iconBg }}
                  >
                    {style.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {!n.read && (
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full bg-[#FF6B00] flex-shrink-0"
                        />
                      )}
                      <span className={`text-xs leading-tight truncate ${!n.read ? "font-bold text-gray-900" : "font-medium text-gray-500"
                        }`}>
                        {n.title}
                      </span>
                    </div>
                    <p className={`text-[11px] leading-snug mt-0.5 line-clamp-2 ${!n.read ? "text-gray-700" : "text-gray-400"
                      }`}>
                      {n.message}
                    </p>
                    {n.productName && (
                      <span className={`text-[10px] mt-0.5 inline-block ${!n.read ? "text-gray-500" : "text-gray-400"
                        }`}>
                        {n.productName}
                      </span>
                    )}
                  </div>

                  {/* Mark as Read button */}
                  {!n.read && (
                    <button
                      className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-300"
                      onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                      title="Mark as Read"
                    >
                      <Check className="w-3 h-3 text-gray-600" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer  */}
        <div className="border-t border-gray-200">
          <button
            className="w-full px-4 py-2.5 text-[11px] font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
            onClick={() => {
              setOpen(false);
              onNavigate?.("notifications");
            }}
          >
            View All Notifications
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
