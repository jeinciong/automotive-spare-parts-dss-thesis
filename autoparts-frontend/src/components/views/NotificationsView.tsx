import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { motion } from "motion/react";
import { 
  Bell, 
  AlertTriangle, 
  TrendingUp, 
  FileText, 
  Package, 
  DollarSign,
  CheckCircle,
  X,
  Archive,
  Trash2
} from "lucide-react";

interface Notification {
  id: string;
  type: "alert" | "success" | "info" | "warning";
  title: string;
  message: string;
  time: string;
  read: boolean;
  priority: "low" | "medium" | "high" | "urgent";
}

const allNotifications: Notification[] = [
  {
    id: "1",
    type: "alert",
    title: "Low Stock Alert",
    message: "Oil Filter Premium - Only 8 units remaining. Reorder recommended.",
    time: "15 minutes ago",
    read: false,
    priority: "urgent"
  },
  {
    id: "2",
    type: "success",
    title: "Sales Milestone",
    message: "Monthly target achieved - $250K reached with 5 days remaining.",
    time: "2 hours ago",
    read: false,
    priority: "low"
  },
  {
    id: "3",
    type: "info",
    title: "New Report Available",
    message: "Weekly performance report is ready for review in the Analytics section.",
    time: "5 hours ago",
    read: false,
    priority: "medium"
  },
  {
    id: "4",
    type: "alert",
    title: "Critical Stock Alert",
    message: "Brake Pads - Only 3 units left. Immediate action required.",
    time: "1 day ago",
    read: true,
    priority: "urgent"
  },
  {
    id: "5",
    type: "warning",
    title: "Price Update",
    message: "Supplier increased prices for Engine Parts category by 5%.",
    time: "1 day ago",
    read: true,
    priority: "medium"
  },
  {
    id: "6",
    type: "success",
    title: "Order Completed",
    message: "Order #1845 from Quick Fix Auto has been completed successfully.",
    time: "2 days ago",
    read: true,
    priority: "low"
  },
  {
    id: "7",
    type: "info",
    title: "Inventory Update",
    message: "45 new items added to inventory across 3 categories.",
    time: "2 days ago",
    read: true,
    priority: "low"
  },
  {
    id: "8",
    type: "success",
    title: "Revenue Goal Achieved",
    message: "Quarterly revenue goal exceeded by 12%. Great work!",
    time: "3 days ago",
    read: true,
    priority: "medium"
  }
];

export function NotificationsView() {
  const [notifications, setNotifications] = useState(allNotifications);
  const [activeTab, setActiveTab] = useState("all");

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "alert":
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case "success":
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "warning":
        return <Package className="w-5 h-5 text-orange-600" />;
      default:
        return <FileText className="w-5 h-5 text-blue-600" />;
    }
  };

  const getNotificationBg = (type: string) => {
    switch (type) {
      case "alert":
        return "bg-red-50 border-red-100";
      case "success":
        return "bg-green-50 border-green-100";
      case "warning":
        return "bg-orange-50 border-orange-100";
      default:
        return "bg-blue-50 border-blue-100";
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <Badge variant="destructive" className="text-xs">Urgent</Badge>;
      case "high":
        return <Badge className="text-xs bg-orange-600">High</Badge>;
      case "medium":
        return <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">Medium</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Low</Badge>;
    }
  };

  const markAsRead = (id: string) => {
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(notifications.filter(n => n.id !== id));
  };

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === "all") return true;
    if (activeTab === "unread") return !n.read;
    if (activeTab === "alerts") return n.type === "alert" || n.type === "warning";
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        stiffness: 100,
        damping: 10
      }
    }
  };

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div className="flex items-center justify-between" variants={itemVariants}>
        <div>
          <h1>Notifications</h1>
          <p className="text-muted-foreground">
            Stay updated with alerts, reports, and system notifications
          </p>
        </div>
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Mark All Read
          </Button>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-6" variants={containerVariants}>
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Total Notifications</CardTitle>
              <div className="p-2 bg-gradient-to-br from-[#FF6B00] to-[#FF8A50] rounded-lg">
                <Bell className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">{notifications.length}</div>
              <p className="text-sm text-muted-foreground">Across all categories</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Unread</CardTitle>
              <div className="p-2 bg-gradient-to-br from-[#607D8B] to-[#B0BEC5] rounded-lg">
                <Bell className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">{unreadCount}</div>
              <p className="text-sm text-muted-foreground">Require attention</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Urgent Alerts</CardTitle>
              <div className="p-2 bg-gradient-to-br from-red-600 to-red-700 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">
                {notifications.filter(n => n.priority === "urgent").length}
              </div>
              <p className="text-sm text-muted-foreground">Need immediate action</p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Notifications List */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>All Notifications</CardTitle>
            <CardDescription>View and manage your notifications</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all">
                  All ({notifications.length})
                </TabsTrigger>
                <TabsTrigger value="unread">
                  Unread ({unreadCount})
                </TabsTrigger>
                <TabsTrigger value="alerts">
                  Alerts ({notifications.filter(n => n.type === "alert" || n.type === "warning").length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-6">
                <div className="space-y-3">
                  {filteredNotifications.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>No notifications in this category</p>
                    </div>
                  ) : (
                    filteredNotifications.map((notification, index) => (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`p-4 rounded-lg border ${getNotificationBg(notification.type)} ${
                          !notification.read ? "border-l-4 border-l-[#FF6B00]" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3 flex-1">
                            <div className="flex-shrink-0 mt-1">
                              {getNotificationIcon(notification.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-1">
                                <h4 className={`font-medium ${!notification.read ? "font-semibold" : ""}`}>
                                  {notification.title}
                                </h4>
                                {getPriorityBadge(notification.priority)}
                                {!notification.read && (
                                  <div className="w-2 h-2 bg-[#FF6B00] rounded-full"></div>
                                )}
                              </div>
                              <p className="text-sm text-gray-700 mb-2">{notification.message}</p>
                              <span className="text-xs text-muted-foreground">{notification.time}</span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-1 ml-4">
                            {!notification.read && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => markAsRead(notification.id)}
                                className="h-8 w-8 p-0"
                                title="Mark as read"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteNotification(notification.id)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ))
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
