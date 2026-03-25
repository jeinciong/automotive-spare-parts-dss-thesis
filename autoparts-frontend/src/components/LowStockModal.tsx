import { useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { AlertTriangle, Package, ExternalLink } from "lucide-react";
import { useInventory } from "../contexts/InventoryContext";
import { motion } from "motion/react";

interface LowStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewInventory: () => void;
}

export function LowStockModal({ isOpen, onClose, onViewInventory }: LowStockModalProps) {
  const { inventory } = useInventory();

  // Filter items that are low stock or critical
  const lowStockItems = useMemo(() => {
    return inventory.filter(item => 
      item.status === "Low Stock" || item.status === "Critical"
    );
  }, [inventory]);

  const criticalCount = lowStockItems.filter(item => item.status === "Critical").length;
  const lowStockCount = lowStockItems.filter(item => item.status === "Low Stock").length;

  const getStatusBadge = (status: string) => {
    if (status === "Critical") {
      return <Badge variant="destructive" className="text-xs">Critical</Badge>;
    }
    return <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">Low Stock</Badge>;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0 pr-8">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <DialogTitle>Low Stock Alert</DialogTitle>
              <DialogDescription>
                {criticalCount > 0 && (
                  <span className="text-red-600 font-medium">
                    {criticalCount} critical {criticalCount === 1 ? 'item' : 'items'}
                  </span>
                )}
                {criticalCount > 0 && lowStockCount > 0 && <span> • </span>}
                {lowStockCount > 0 && (
                  <span className="text-orange-600">
                    {lowStockCount} low stock {lowStockCount === 1 ? 'item' : 'items'}
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          <div className="space-y-3">
            {lowStockItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: index * 0.1 }}
              >
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h4 className="font-medium">{item.name}</h4>
                        {getStatusBadge(item.status)}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Current Stock</p>
                          <p className="font-medium text-red-600">
                            {item.currentStock} units
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Minimum Required</p>
                          <p className="font-medium">
                            {item.minimumStock} units
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">SKU</p>
                          <p className="font-mono text-xs">{item.sku}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Supplier</p>
                          <p>{item.supplier}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="text-sm">
                          <span className="text-muted-foreground">Reorder: </span>
                          <span className="font-medium">
                            {item.minimumStock - item.currentStock} units needed
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Est. Cost: </span>
                          <span className="font-medium">
                            ${((item.minimumStock - item.currentStock) * item.unitCost).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="ml-4 flex-shrink-0">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            Total estimated reorder cost: 
            <span className="font-medium ml-1">
              ${lowStockItems.reduce((total, item) => 
                total + ((item.minimumStock - item.currentStock) * item.unitCost), 0
              ).toFixed(2)}
            </span>
          </div>
          
          <div className="flex space-x-2">
            <Button variant="outline" onClick={onClose}>
              Dismiss
            </Button>
            <Button onClick={() => { onViewInventory(); onClose(); }}>
              <ExternalLink className="w-4 h-4 mr-2" />
              View Inventory
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}