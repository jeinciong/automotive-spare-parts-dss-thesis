import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { TrendingUp, Zap, ArrowRight, CheckCircle, Package, AlertTriangle, TrendingDown, ShieldCheck, Clock, ChevronDown } from "lucide-react";
import { GlobalFilters } from "../../App";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useInventory } from "../../contexts/InventoryContext";
import { useForecast } from "../../contexts/ForecastContext";
import { formatCurrencyCompact } from "../../lib/currency";
import { apiUrl } from "../../lib/api";

interface RecommendationsViewProps {
  globalFilters?: GlobalFilters;
}

type Priority = "High" | "Medium" | "Low";
type TrendDirection = "increasing" | "declining" | "stable";
type SavedStatus = "Pending" | "Done" | "Cancelled";

interface TrendSummary {
  nextPeriodDemand: number;
  averageDemand: number;
  totalDemand: number;
  trendPercent: number;
  direction: TrendDirection;
}

interface Recommendation {
  id: string;
  priority: Priority;
  title: string;
  description: string;
  impact: string;
  impactValue: number;
  action: string;
  icon: typeof AlertTriangle;
  category: string;
  relatedProduct: string;
  trendPercent: number;
}

interface SavedRecommendationAction {
  action_id: number;
  recommendation_key: string | null;
  product_name: string | null;
  priority: Priority | null;
  title: string | null;
  description: string | null;
  recommended_action: string | null;
  impact: string | null;
  status: SavedStatus | string | null;
  action_taken: string | null;
  generated_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  executed_at: string | null;
  action_history?: Array<{ type: string; timestamp: string; action_taken?: string; title?: string; action?: string; priority?: string }>;
}

interface QuickWin {
  title: string;
  description: string;
  effort: "Low" | "Medium";
  impact: Priority;
  timeframe: string;
  recommendation: Recommendation;
}

const priorityRank: Record<Priority, number> = { High: 3, Medium: 2, Low: 1 };

const formatUnits = (value: number) => `${Math.ceil(Math.max(0, value)).toLocaleString()} units`;

const getStockState = (status: string) => status.toLowerCase().replace(/[\s_-]/g, "");

const getForecastTrend = (forecasts: { period: string; predicted: number }[]): TrendSummary | null => {
  const validForecasts = forecasts
    .filter((forecast) => Number.isFinite(Number(forecast.predicted)))
    .map((forecast) => ({ ...forecast, predicted: Math.max(0, Number(forecast.predicted)) }));

  if (validForecasts.length === 0) {
    return null;
  }

  const firstForecast = validForecasts[0].predicted;
  const lastForecast = validForecasts[validForecasts.length - 1].predicted;
  const totalDemand = validForecasts.reduce((sum, forecast) => sum + forecast.predicted, 0);
  const averageDemand = totalDemand / validForecasts.length;
  const trendPercent = firstForecast > 0
    ? ((lastForecast - firstForecast) / firstForecast) * 100
    : lastForecast > 0 ? 100 : 0;

  return {
    nextPeriodDemand: firstForecast,
    averageDemand,
    totalDemand,
    trendPercent,
    direction: trendPercent >= 10 ? "increasing" : trendPercent <= -10 ? "declining" : "stable",
  };
};

export function RecommendationsView(_props: RecommendationsViewProps) {
  const { inventory } = useInventory();
  const { productForecasts } = useForecast();
  const [savedActions, setSavedActions] = useState<SavedRecommendationAction[]>([]);
  const [actionModal, setActionModal] = useState<{open: boolean; recommendation: Recommendation; savedActionId?: number} | null>(null);
  const [needsActionOpen, setNeedsActionOpen] = useState(true);
  const [doneRecommendationsOpen, setDoneRecommendationsOpen] = useState(true);
  const [showMoreNeedsAction, setShowMoreNeedsAction] = useState(false);
  const [showMoreDoneRecommendations, setShowMoreDoneRecommendations] = useState(false);

  const businessId = useMemo(() => {
    return JSON.parse(localStorage.getItem("user") || "{}").business_id;
  }, []);

  const recommendations = useMemo(() => {
    const inventoryByProduct = new Map(
      inventory.map((item) => [item.name.trim().toLowerCase(), item])
    );

    const recs = Object.values(productForecasts).flatMap((forecast) => {
      if (forecast.loading || forecast.error || forecast.forecasts.length === 0) {
        return [];
      }

      const trend = getForecastTrend(forecast.forecasts);
      if (!trend) {
        return [];
      }

      const item = inventoryByProduct.get(forecast.product_name.trim().toLowerCase());
      const currentStock = item?.currentStock ?? 0;
      const minimumStock = item?.minimumStock ?? 0;
      const unitCost = item?.unitCost ?? 0;
      const stockState = item ? getStockState(item.status) : "";
      const isCritical = stockState === "critical" || currentStock <= minimumStock;
      const isLowStock = isCritical || stockState === "lowstock" || currentStock <= minimumStock * 1.25;
      const horizonMonths = Math.max(forecast.forecasts.length, 1);
      const forecastCoverageMonths = trend.averageDemand > 0 ? currentStock / trend.averageDemand : Number.POSITIVE_INFINITY;
      const stockNeededForHorizon = Math.max(0, trend.totalDemand + minimumStock - currentStock);
      const stockNeededNextPeriod = Math.max(0, trend.nextPeriodDemand + minimumStock - currentStock);
      const valueAtRisk = Math.max(stockNeededNextPeriod, stockNeededForHorizon / horizonMonths) * unitCost;
      const productCategory = item?.category ?? forecast.demand_type ?? "Forecasted Product";
      const trendLabel = `${trend.trendPercent >= 0 ? "+" : ""}${trend.trendPercent.toFixed(1)}%`;

      const productRecs: Recommendation[] = [];

      if (isCritical || (trend.direction === "increasing" && stockNeededNextPeriod > 0)) {
        let trendMessage = `Sales are expected to go up by ${trendLabel}.`;
        if (trend.direction === "declining") {
          trendMessage = `Sales are expected to go down by ${Math.abs(trend.trendPercent).toFixed(1)}%, but stock is critically low.`;
        } else if (trend.direction === "stable") {
          trendMessage = `Sales are expected to remain steady, but stock is critically low.`;
        }

        productRecs.push({
          id: `restock-${forecast.product_name}`,
          priority: isCritical || trend.trendPercent >= 25 ? "High" : "Medium",
          title: `Order more ${forecast.product_name}`,
          description: `${trendMessage} You only have ${formatUnits(currentStock)} on hand. To avoid running out, prepare an order for about ${formatUnits(Math.max(stockNeededNextPeriod, minimumStock))}.`,
          impact: valueAtRisk > 0 ? `${formatCurrencyCompact(valueAtRisk)} worth of stock may be needed` : `${formatUnits(stockNeededNextPeriod)} possible shortage`,
          impactValue: valueAtRisk,
          action: "Create Reorder Plan",
          icon: AlertTriangle,
          category: productCategory,
          relatedProduct: forecast.product_name,
          trendPercent: trend.trendPercent,
        });
      }

      if (trend.direction === "increasing" && forecastCoverageMonths < 2) {
        productRecs.push({
          id: `safety-stock-${forecast.product_name}`,
          priority: forecastCoverageMonths < 1 ? "High" : "Medium",
          title: `Keep extra stock for ${forecast.product_name}`,
          description: `Demand is increasing, and your current stock may last only ${forecastCoverageMonths.toFixed(1)} month${forecastCoverageMonths === 1 ? "" : "s"}. Raise the reorder level so you have enough before the next busy period.`,
          impact: `${formatUnits(stockNeededForHorizon)} suggested extra stock`,
          impactValue: stockNeededForHorizon * unitCost,
          action: "Adjust Reorder Level",
          icon: TrendingUp,
          category: productCategory,
          relatedProduct: forecast.product_name,
          trendPercent: trend.trendPercent,
        });
      }

      if (trend.direction === "declining" && currentStock > Math.max(minimumStock, trend.totalDemand)) {
        const excessUnits = currentStock - Math.max(minimumStock, trend.totalDemand);
        productRecs.push({
          id: `reduce-purchasing-${forecast.product_name}`,
          priority: excessUnits > trend.averageDemand * 2 ? "Medium" : "Low",
          title: `Buy less ${forecast.product_name} for now`,
          description: `Sales are expected to slow down by ${Math.abs(trend.trendPercent).toFixed(1)}%. You already have enough stock, so delay the next purchase and sell through about ${formatUnits(excessUnits)} first.`,
          impact: `${formatCurrencyCompact(excessUnits * unitCost)} excess stock to control`,
          impactValue: excessUnits * unitCost,
          action: "Pause Reorder",
          icon: TrendingDown,
          category: productCategory,
          relatedProduct: forecast.product_name,
          trendPercent: trend.trendPercent,
        });
      }

      if (productRecs.length === 0 && trend.direction === "stable" && isLowStock) {
        productRecs.push({
          id: `maintain-stock-${forecast.product_name}`,
          priority: isCritical ? "High" : "Medium",
          title: `Top up ${forecast.product_name}`,
          description: `Sales are expected to stay steady at around ${formatUnits(trend.averageDemand)} per period, but stock is close to the minimum level. Add stock now so normal sales do not cause a stockout.`,
          impact: `${formatUnits(Math.max(stockNeededNextPeriod, minimumStock))} suggested replenishment`,
          impactValue: Math.max(stockNeededNextPeriod, minimumStock) * unitCost,
          action: "Schedule Replenishment",
          icon: ShieldCheck,
          category: productCategory,
          relatedProduct: forecast.product_name,
          trendPercent: trend.trendPercent,
        });
      }

      return productRecs;
    });

    return recs.sort((a, b) => {
      const priorityDifference = priorityRank[b.priority] - priorityRank[a.priority];
      if (priorityDifference !== 0) return priorityDifference;
      return Math.abs(b.trendPercent) - Math.abs(a.trendPercent);
    });
  }, [inventory, productForecasts]);

  const savedActionsByKey = useMemo(() => {
    return new Map(savedActions.map((action) => [action.recommendation_key, action]));
  }, [savedActions]);

  const pendingRecommendations = useMemo(() => {
    return recommendations.filter((recommendation) => {
      const savedAction = savedActionsByKey.get(recommendation.id);
      return (savedAction?.status ?? "Pending") !== "Done";
    });
  }, [recommendations, savedActionsByKey]);

  const completedActions = useMemo(() => {
    return savedActions
      .filter((action) => action.status === "Done")
      .sort((a, b) => new Date(b.completed_at ?? b.executed_at ?? 0).getTime() - new Date(a.completed_at ?? a.executed_at ?? 0).getTime());
  }, [savedActions]);

  const quickWins = useMemo<QuickWin[]>(() => {
    return pendingRecommendations.slice(0, 3).map((recommendation) => ({
      title: recommendation.title,
      description: recommendation.description,
      effort: recommendation.action === "Pause Reorder" ? "Low" : "Medium",
      impact: recommendation.priority,
      timeframe: recommendation.priority === "High" ? "Today" : "This week",
      recommendation,
    }));
  }, [pendingRecommendations]);

  useEffect(() => {
    if (!businessId) return;

    fetch(apiUrl(`/api/recommendations?business_id=${businessId}`))
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data)) setSavedActions(data);
      })
      .catch(() => {});
  }, [businessId]);

  useEffect(() => {
    if (!businessId || recommendations.length === 0) return;

    const controller = new AbortController();
    fetch(apiUrl("/api/recommendations/bulk"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        business_id: businessId,
        recommendations: recommendations.map((recommendation) => ({
          id: recommendation.id,
          relatedProduct: recommendation.relatedProduct,
          priority: recommendation.priority,
          title: recommendation.title,
          description: recommendation.description,
          action: recommendation.action,
          impact: recommendation.impact,
        })),
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data)) setSavedActions(data);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [businessId, recommendations]);

  const handleAction = (recommendation: Recommendation) => {
    const savedAction = savedActionsByKey.get(recommendation.id);
    setActionModal({ open: true, recommendation, savedActionId: savedAction?.action_id });
  };

  const confirmAction = async () => {
    if (actionModal) {
      if (!actionModal.savedActionId) {
        toast.error("This recommendation is still being saved. Please try again in a moment.");
        return;
      }

      try {
        const response = await fetch(apiUrl(`/api/recommendations/${actionModal.savedActionId}/complete`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            business_id: businessId,
            action_taken: actionModal.recommendation.action,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Failed to save action");

        setSavedActions((prev) => prev.map((action) => (
          action.action_id === data.action_id ? data : action
        )));
        toast.success(`Marked as done: ${actionModal.recommendation.title}`);
      } catch (err) {
        toast.error("Could not save this action. Please try again.");
      }
      setActionModal(null);
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

  const getPriorityBadge = (priority: Priority) => {
    const variants = {
      High: "destructive",
      Medium: "default",
      Low: "secondary"
    } as const;
    return <Badge variant={variants[priority]}>{priority} Priority</Badge>;
  };

  const getStatusBadge = (status: string | null | undefined) => {
    if (status === "Done") {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Done
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="border-yellow-300 text-yellow-700">
        <Clock className="w-3 h-3 mr-1" />
        Needs action
      </Badge>
    );
  };

  const formatTimestamp = (value: string | null | undefined) => {
    if (!value) return "No timestamp";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "No timestamp";
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const totalRecommendations = pendingRecommendations.length;
  const highPriorityCount = pendingRecommendations.filter(r => r.priority === "High").length;
  const forecastedProductCount = Object.values(productForecasts).filter((forecast) => forecast.forecasts.length > 0 && !forecast.error).length;
  const loadingForecastCount = Object.values(productForecasts).filter((forecast) => forecast.loading).length;
  const protectedInventoryValue = pendingRecommendations.reduce((sum, recommendation) => sum + recommendation.impactValue, 0);

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
          Simple inventory actions based on predicted sales for each product
        </p>
      </motion.div>

      {highPriorityCount > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950/20">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <div>
                  <p className="font-medium text-red-900 dark:text-red-100">
                    {highPriorityCount} High Priority Inventory Action{highPriorityCount > 1 ? "s" : ""}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-200">
                    These are shown first because they can affect stock availability soon
                  </p>
                </div>
              </div>
              <Badge variant="destructive">Highest Priority</Badge>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Zap className="w-5 h-5 mr-2 text-yellow-600" />
              Quick Inventory Wins
            </CardTitle>
            <CardDescription>
              The most urgent inventory tasks to handle first
            </CardDescription>
          </CardHeader>
          <CardContent>
            {quickWins.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {quickWins.map((win, index) => (
                  <motion.div
                    key={`${win.title}-${index}`}
                    className="p-4 border rounded-lg space-y-3 hover:shadow-md transition-shadow"
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="font-medium">{win.title}</h4>
                      <Badge variant="outline" className="text-xs">
                        {win.timeframe}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{win.description}</p>
                    <div className="flex items-center justify-between gap-3">
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
                        onClick={() => handleAction(win.recommendation)}
                        className="hover:bg-[#FF6B00] hover:text-white"
                      >
                        Mark Done
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {loadingForecastCount > 0
                  ? "Forecasts are loading. Recommendations will appear once product trends are available."
                  : "No pending inventory actions are needed from the current product forecasts."}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <div className="space-y-4">
        <Collapsible open={needsActionOpen} onOpenChange={setNeedsActionOpen}>
          <CollapsibleTrigger asChild>
            <motion.div className="flex items-center justify-between gap-3 cursor-pointer group" variants={itemVariants}>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">Needs Action</h2>
                <ChevronDown className="w-5 h-5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </div>
              <Badge variant="outline" className="text-sm">
                <Package className="w-3 h-3 mr-1" />
                {totalRecommendations} pending actions from {forecastedProductCount} forecasted products
              </Badge>
            </motion.div>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-4">
            <div className="space-y-4">
              {pendingRecommendations
                .slice(0, showMoreNeedsAction ? undefined : 3)
                .map((rec) => (
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
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="font-medium">{rec.title}</h3>
                              <p className="text-sm text-muted-foreground">
                                {rec.category} - {rec.relatedProduct}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2">
                              {getStatusBadge(savedActionsByKey.get(rec.id)?.status)}
                              {getPriorityBadge(rec.priority)}
                            </div>
                          </div>
                          <p className="text-sm text-gray-700">{rec.description}</p>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-green-600">
                              {rec.impact}
                            </span>
                            <Button
                              size="sm"
                              onClick={() => handleAction(rec)}
                              className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50] hover:from-[#FF8A50] hover:to-[#FF6B00]"
                            >
                              Mark Done
                              <ArrowRight className="w-4 h-4 ml-1" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
              {pendingRecommendations.length === 0 && (
                <Card className="border-dashed">
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    All current inventory recommendations are marked done.
                  </CardContent>
                </Card>
              )}
              {pendingRecommendations.length > 3 && (
                <div className="flex justify-center mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowMoreNeedsAction(!showMoreNeedsAction)}
                    className="text-sm"
                  >
                    {showMoreNeedsAction ? "Show less" : `Show more (${pendingRecommendations.length - 3} more)`}
                  </Button>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="space-y-4">
        <Collapsible open={doneRecommendationsOpen} onOpenChange={setDoneRecommendationsOpen}>
          <CollapsibleTrigger asChild>
            <motion.div className="flex items-center justify-between gap-3 cursor-pointer group" variants={itemVariants}>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">Done Recommendations</h2>
                <ChevronDown className="w-5 h-5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </div>
              <Badge variant="outline" className="text-sm">
                <CheckCircle className="w-3 h-3 mr-1" />
                {completedActions.length} completed
              </Badge>
            </motion.div>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-4">
            <div className="space-y-4">
              {completedActions
                .slice(0, showMoreDoneRecommendations ? undefined : 3)
                .map((action) => (
                <motion.div
                  key={action.action_id}
                  variants={itemVariants}
                  whileHover={{ scale: 1.01 }}
                >
                  <Card className="transition-all hover:shadow-lg border-0 shadow-md">
                    <CardContent className="p-6">
                      <div className="flex items-start space-x-4">
                        <div className="p-2 bg-green-100 rounded-lg">
                          <CheckCircle className="w-5 h-5 text-green-700" />
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="font-medium">
                                {action.title ?? "Completed recommendation"}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                {action.product_name || "Not specified"} - completed {formatTimestamp(action.completed_at ?? action.executed_at)}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2">
                              {getStatusBadge(action.status)}
                              <Badge variant="outline">{action.priority ?? "Low"} Priority</Badge>
                            </div>
                          </div>
                          {action.description && (
                            <p className="text-sm text-gray-700">{action.description}</p>
                          )}
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-green-700">
                              Action taken: {action.action_taken ?? action.recommended_action ?? "Marked as done"}
                            </span>
                            <span className="text-xs text-muted-foreground text-right">
                              Saved {formatTimestamp(action.updated_at ?? action.completed_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
              {completedActions.length === 0 && (
                <Card className="border-dashed">
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    Completed inventory recommendations will appear here after you mark an action as done.
                  </CardContent>
                </Card>
              )}
              {completedActions.length > 3 && (
                <div className="flex justify-center mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowMoreDoneRecommendations(!showMoreDoneRecommendations)}
                    className="text-sm"
                  >
                    {showMoreDoneRecommendations ? "Show less" : `Show more (${completedActions.length - 3} more)`}
                  </Button>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Recommendation Impact</CardTitle>
              <CardDescription>
                Inventory planning impact from forecast-based actions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span>Forecasted Products Covered</span>
                <span className="font-medium text-green-600">{forecastedProductCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>High Priority Actions</span>
                <span className="font-medium text-red-600">{highPriorityCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Inventory Value Flagged</span>
                <span className="font-medium text-blue-600">{formatCurrencyCompact(protectedInventoryValue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Priority Sorting</span>
                <span className="font-medium text-orange-600">High to Low</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Implementation Timeline</CardTitle>
              <CardDescription>
                Inventory rollout schedule by priority level
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium">Today: High Priority</p>
                    <p className="text-xs text-muted-foreground">Create reorder plans for products with rising demand or stockout risk</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium">This Week: Medium Priority</p>
                    <p className="text-xs text-muted-foreground">Adjust reorder levels and reduce excess purchasing</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium">Next Cycle: Low Priority</p>
                    <p className="text-xs text-muted-foreground">Monitor stable or declining products before new purchase orders</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Dialog open={actionModal?.open || false} onOpenChange={() => setActionModal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-[#FF6B00]" />
              Mark Recommendation Done
            </DialogTitle>
            <DialogDescription>
              Confirm that this inventory action has been handled
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-semibold mb-2">{actionModal?.recommendation.title}</h4>
              <p className="text-sm text-muted-foreground">{actionModal?.recommendation.description}</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">What happens next?</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>The recommendation status will change to Done</li>
                <li>The completed action will be saved with the current timestamp</li>
                <li>The item will move to the done recommendations section</li>
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
              Mark as Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </motion.div>
  );
}
