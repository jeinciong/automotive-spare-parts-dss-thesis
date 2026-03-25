import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Lightbulb, TrendingUp, Users, DollarSign, Target, Zap, Star, ArrowRight, CheckCircle, Package, AlertTriangle, TrendingDown } from "lucide-react";
import { GlobalFilters } from "../../App";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useInventory } from "../../contexts/InventoryContext";

// Predictions and trends data (simulating from PredictionsTrendsView)
const categoryTrends = [
  { category: "Brake Parts", growth: 12, trend: "growing" },
  { category: "Engine Parts", growth: 17, trend: "growing" },
  { category: "Filters", growth: 14, trend: "growing" },
  { category: "Lighting", growth: -21, trend: "declining" },
  { category: "Suspension", growth: 22, trend: "growing" },
];

const forecastData = {
  nextMonth: 285000,
  nextQuarter: 890000,
  growthRate: 15,
  confidence: 92
};

const aiInsights = [
  {
    insight: "Customer Behavior Pattern",
    description: "Customers who buy brake pads are 73% likely to purchase brake fluid within 30 days",
    opportunity: "Bundle these products for increased sales"
  },
  {
    insight: "Seasonal Demand Shift",
    description: "Electrical component sales peak 3 weeks before major holidays due to travel preparations",
    opportunity: "Adjust inventory timing and promotional campaigns"
  },
  {
    insight: "Price Sensitivity Analysis",
    description: "Engine oil sales drop 23% when priced above $8.50 but remain stable below this threshold",
    opportunity: "Optimize pricing for maximum volume and profit"
  }
];

interface RecommendationsViewProps {
  globalFilters?: GlobalFilters;
}

export function RecommendationsView({ globalFilters }: RecommendationsViewProps) {
  const { inventory } = useInventory();
  const [actionModal, setActionModal] = useState<{open: boolean; title: string; action: string; description: string} | null>(null);
  const [quickWinModal, setQuickWinModal] = useState<{open: boolean; title: string; description: string} | null>(null);

  // Generate dynamic recommendations based on inventory and trends
  const recommendations = useMemo(() => {
    const recs: any[] = [];

    // Low stock recommendations
    const lowStockItems = inventory.filter(item => item.status === "Low Stock" || item.status === "Critical");
    lowStockItems.forEach(item => {
      recs.push({
        id: `low-stock-${item.id}`,
        type: "inventory",
        priority: item.status === "Critical" ? "High" : "Medium",
        title: `Urgent: Restock ${item.name}`,
        description: `Current stock (${item.currentStock} units) is ${item.status === "Critical" ? "critically" : ""} below minimum threshold of ${item.minimumStock}. Based on seasonal trends, demand is expected to increase by ${forecastData.growthRate}% next month.`,
        impact: `$${(item.unitCost * (item.minimumStock - item.currentStock) * 1.5).toLocaleString()} potential revenue at risk`,
        action: "Order Now",
        icon: AlertTriangle,
        category: "Inventory Optimization",
        relatedProduct: item.name
      });
    });

    // Growing category recommendations
    const fastestGrowingCategory = categoryTrends.reduce((max, cat) => cat.growth > max.growth ? cat : max, categoryTrends[0]);
    if (fastestGrowingCategory && fastestGrowingCategory.growth > 15) {
      recs.push({
        id: "growing-category",
        type: "inventory",
        priority: "High",
        title: `Expand ${fastestGrowingCategory.category} Inventory`,
        description: `${fastestGrowingCategory.category} showing strong growth trend at +${fastestGrowingCategory.growth}% YoY. Market demand indicates this category will continue expanding through Q2 2025.`,
        impact: `$${(forecastData.nextMonth * 0.15).toLocaleString()} additional revenue opportunity`,
        action: "Review Catalog",
        icon: TrendingUp,
        category: "Product Expansion"
      });
    }

    // Declining category recommendations
    const decliningCategories = categoryTrends.filter(cat => cat.growth < 0);
    decliningCategories.forEach(cat => {
      recs.push({
        id: `declining-${cat.category}`,
        type: "marketing",
        priority: "Medium",
        title: `Address ${cat.category} Decline`,
        description: `${cat.category} experiencing ${Math.abs(cat.growth)}% decline. Consider promotional campaigns, product refresh, or strategic partnerships to reverse trend.`,
        impact: "Prevent revenue loss",
        action: "Create Strategy",
        icon: TrendingDown,
        category: "Revenue Protection"
      });
    });

    // Pricing optimization based on inventory
    const overStockedItems = inventory.filter(item => item.currentStock > /*item.reorderPoint */ 1.5);
    if (overStockedItems.length > 0) {
      recs.push({
        id: "pricing-overstocked",
        type: "pricing",
        priority: "Medium",
        title: "Optimize Pricing for Overstocked Items",
        description: `${overStockedItems.length} products are significantly overstocked. Strategic pricing adjustments can accelerate turnover while maintaining margins.`,
        impact: "Improve cash flow by 12%",
        action: "Review Pricing",
        icon: DollarSign,
        category: "Pricing Strategy"
      });
    }

    // Supplier diversification based on inventory categories
    const uniqueSuppliers = new Set(inventory.map(item => item.supplier)).size;
    const uniqueCategories = new Set(inventory.map(item => item.category)).size;
    if (uniqueSuppliers < uniqueCategories * 1.5) {
      recs.push({
        id: "supplier-diversification",
        type: "operations",
        priority: "Low",
        title: "Diversify Supplier Base",
        description: `Current supplier-to-category ratio suggests concentration risk. Adding 2-3 alternative suppliers can reduce delivery time and improve pricing flexibility.`,
        impact: "2-day faster delivery, 3% better margins",
        action: "Contact Suppliers",
        icon: Target,
        category: "Supply Chain"
      });
    }

    // Bundle opportunity based on AI insights
    recs.push({
      id: "bundle-opportunity",
      type: "marketing",
      priority: "High",
      title: "Create Product Bundles",
      description: "AI analysis shows strong correlation between brake system purchases. Customers buying brake pads have 73% likelihood of buying brake fluid within 30 days.",
      impact: "$8,900 projected increase",
      action: "Launch Campaign",
      icon: Users,
      category: "Customer Acquisition"
    });

    // Forecast-based recommendation
    if (forecastData.confidence > 90) {
      recs.push({
        id: "forecast-inventory",
        type: "inventory",
        priority: "High",
        title: "Prepare for Seasonal Peak",
        description: `High-confidence forecast (${forecastData.confidence}%) predicts ${forecastData.growthRate}% sales increase next month. Recommend increasing inventory levels by 18% across top categories.`,
        impact: `$${(forecastData.nextMonth * 0.18).toLocaleString()} revenue opportunity`,
        action: "Plan Inventory",
        icon: Lightbulb,
        category: "Inventory Planning"
      });
    }

    return recs;
  }, [inventory]);

  // Generate quick wins based on current data
  const quickWins = useMemo(() => {
    const wins: any[] = [];

    // Check for critical stock items
    const criticalItems = inventory.filter(item => item.status === "Critical");
    if (criticalItems.length > 0) {
      wins.push({
        title: `Reorder ${criticalItems[0].name}`,
        description: `Critical stock level (${criticalItems[0].currentStock} units). Order from ${criticalItems[0].supplier} today to prevent stockout.`,
        effort: "Low",
        impact: "High",
        timeframe: "Today"
      });
    }

    // Cross-sell opportunity
    const filterItems = inventory.filter(item => item.category === "Filters");
    if (filterItems.length > 0) {
      wins.push({
        title: "Cross-sell Air Filters",
        description: "Customers buying oil filters have 89% conversion rate for air filters when offered together",
        effort: "Low",
        impact: "High",
        timeframe: "This week"
      });
    }

    // Product photo update for low-performing items
    const lightingItems = inventory.filter(item => item.category === "Lighting");
    if (lightingItems.length > 0) {
      wins.push({
        title: "Update Product Photos",
        description: "Products with updated photos see 34% more clicks and 18% higher conversion. Start with declining Lighting category.",
        effort: "Medium",
        impact: "Medium",
        timeframe: "Next week"
      });
    }

    return wins;
  }, [inventory]);

  const handleAction = (action: string, title: string, description: string) => {
    setActionModal({ open: true, title, action, description });
  };

  const handleQuickWin = (title: string, description: string) => {
    setQuickWinModal({ open: true, title, description });
  };

  const confirmAction = () => {
    if (actionModal) {
      toast.success(`${actionModal.action} initiated successfully for: ${actionModal.title}`);
      setActionModal(null);
    }
  };

  const confirmQuickWin = () => {
    if (quickWinModal) {
      toast.success(`Quick win action started: ${quickWinModal.title}`);
      setQuickWinModal(null);
    }
  };

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
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        stiffness: 100,
        damping: 10
      }
    }
  };

  const getPriorityBadge = (priority: string) => {
    const variants = {
      "High": "destructive",
      "Medium": "default", 
      "Low": "secondary"
    } as const;
    return <Badge variant={variants[priority as keyof typeof variants]}>{priority} Priority</Badge>;
  };

  // Calculate impact metrics
  const totalRecommendations = recommendations.length;
  const highPriorityCount = recommendations.filter(r => r.priority === "High").length;
  const lowStockCount = inventory.filter(item => item.status === "Low Stock" || item.status === "Critical").length;

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants}>
        <h1>AI Recommendations</h1>
        <p className="text-muted-foreground">
          Data-driven insights powered by inventory analysis, sales trends, and AI predictions
        </p>
      </motion.div>

      {/* Alert Banner for Critical Items */}
      {lowStockCount > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950/20">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <div>
                  <p className="font-medium text-red-900 dark:text-red-100">
                    {lowStockCount} Product{lowStockCount > 1 ? 's' : ''} Require Immediate Attention
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-200">
                    Low stock items detected - review recommendations below
                  </p>
                </div>
              </div>
              <Badge variant="destructive">{highPriorityCount} High Priority</Badge>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Quick Wins Section */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Zap className="w-5 h-5 mr-2 text-yellow-600" />
              Quick Wins
            </CardTitle>
            <CardDescription>
              High-impact actions you can take immediately
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {quickWins.map((win, index) => (
                <motion.div 
                  key={index} 
                  className="p-4 border rounded-lg space-y-3 hover:shadow-md transition-shadow"
                  whileHover={{ scale: 1.02 }}
                >
                  <div className="flex items-start justify-between">
                    <h4 className="font-medium">{win.title}</h4>
                    <Badge variant="outline" className="text-xs">
                      {win.timeframe}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{win.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex space-x-2">
                      <Badge variant="secondary" className="text-xs">
                        {win.effort} effort
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {win.impact} impact
                      </Badge>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleQuickWin(win.title, win.description)}
                      className="hover:bg-[#FF6B00] hover:text-white"
                    >
                      Act Now
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Main Recommendations */}
      <div className="space-y-4">
        <motion.div className="flex items-center justify-between" variants={itemVariants}>
          <h2 className="text-xl font-semibold">Strategic Recommendations</h2>
          <Badge variant="outline" className="text-sm">
            <Package className="w-3 h-3 mr-1" />
            {totalRecommendations} recommendations based on live data
          </Badge>
        </motion.div>
        <div className="space-y-4">
          {recommendations.map((rec) => (
            <motion.div
              key={rec.id}
              variants={itemVariants}
              whileHover={{ scale: 1.01 }}
            >
              <Card className="transition-all hover:shadow-lg border-0 shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <div className="p-2 bg-gradient-to-br from-[#FF6B00]/10 to-[#FF8A50]/10 rounded-lg">
                      <rec.icon className="w-5 h-5 text-[#FF6B00]" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-medium">{rec.title}</h3>
                          <p className="text-sm text-muted-foreground">{rec.category}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          {getPriorityBadge(rec.priority)}
                        </div>
                      </div>
                      <p className="text-sm text-gray-700">{rec.description}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <span className="text-sm font-medium text-green-600">
                            {rec.impact}
                          </span>
                        </div>
                        <Button 
                          size="sm"
                          onClick={() => handleAction(rec.action, rec.title, rec.description)}
                          className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50] hover:from-[#FF8A50] hover:to-[#FF6B00]"
                        >
                          {rec.action}
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* AI Insights */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Star className="w-5 h-5 mr-2 text-purple-600" />
              AI-Powered Insights
            </CardTitle>
            <CardDescription>
              Machine learning insights from your sales data and market trends
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {aiInsights.map((insight, index) => (
                <div key={index} className="border-l-4 border-purple-500 pl-4 space-y-2">
                  <h4 className="font-medium">{insight.insight}</h4>
                  <p className="text-sm text-muted-foreground">{insight.description}</p>
                  <p className="text-sm text-purple-700 font-medium">
                    💡 Opportunity: {insight.opportunity}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Performance Impact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Recommendation Impact</CardTitle>
              <CardDescription>
                Projected business impact if all recommendations are implemented
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span>Revenue Increase</span>
                <span className="font-medium text-green-600">+${(forecastData.nextMonth * 0.15 / 1000).toFixed(1)}K</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Operational Efficiency</span>
                <span className="font-medium text-blue-600">+18%</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Customer Satisfaction</span>
                <span className="font-medium text-purple-600">+12%</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Inventory Optimization</span>
                <span className="font-medium text-orange-600">+15%</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Implementation Timeline</CardTitle>
              <CardDescription>
                Suggested rollout schedule for maximum impact
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium">Week 1-2: High Priority Items</p>
                    <p className="text-xs text-muted-foreground">Critical stock and quick wins ({highPriorityCount} items)</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium">Week 3-4: Medium Priority</p>
                    <p className="text-xs text-muted-foreground">Pricing and product expansion</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium">Month 2+: Strategic Initiatives</p>
                    <p className="text-xs text-muted-foreground">Long-term optimization and partnerships</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Action Confirmation Modal */}
      <Dialog open={actionModal?.open || false} onOpenChange={() => setActionModal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-[#FF6B00]" />
              Confirm Action: {actionModal?.action}
            </DialogTitle>
            <DialogDescription>
              Review and confirm this recommendation action
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-semibold mb-2">{actionModal?.title}</h4>
              <p className="text-sm text-muted-foreground">{actionModal?.description}</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">What happens next?</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>The recommendation will be added to your action queue</li>
                <li>Relevant team members will be notified</li>
                <li>You'll receive updates on implementation progress</li>
                <li>Impact metrics will be tracked automatically</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionModal(null)}>
              Cancel
            </Button>
            <Button 
              onClick={confirmAction}
              className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]"
            >
              Confirm & Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Win Confirmation Modal */}
      <Dialog open={quickWinModal?.open || false} onOpenChange={() => setQuickWinModal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Zap className="w-5 h-5 mr-2 text-yellow-600" />
              Quick Win Action
            </DialogTitle>
            <DialogDescription>
              Confirm this immediate action item
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <div className="p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded">
              <h4 className="font-semibold mb-2 flex items-center">
                <Zap className="w-4 h-4 mr-2 text-yellow-600" />
                {quickWinModal?.title}
              </h4>
              <p className="text-sm text-muted-foreground">{quickWinModal?.description}</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Immediate Benefits:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Quick implementation with minimal resources</li>
                <li>Immediate positive impact on operations</li>
                <li>Low risk, high reward opportunity</li>
                <li>Results visible within days</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickWinModal(null)}>
              Not Now
            </Button>
            <Button 
              onClick={confirmQuickWin}
              className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700"
            >
              Take Action Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
