import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Package, AlertTriangle, TrendingDown, Search, Plus, DollarSign, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, ShoppingCart } from "lucide-react";
import { GlobalFilters } from "../../App";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useInventory, InventoryItem } from "../../contexts/InventoryContext";
import { useSuppliers } from "../../contexts/SuppliersContext";

interface InventoryViewProps {
  globalFilters?: GlobalFilters;
}

export function InventoryView({ globalFilters }: InventoryViewProps) {
  const { suppliers, updateSupplier } = useSuppliers();
  const { inventory, addProduct, updateProduct, deleteProduct } = useInventory();
  const [searchTerm, setSearchTerm] = useState("");
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [editProductOpen, setEditProductOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [reorderModalOpen, setReorderModalOpen] = useState(false);
  const [reorderData, setReorderData] = useState<{item: InventoryItem, quantity: number} | null>(null);
  
  // Form state for add/edit product
  const [productForm, setProductForm] = useState({
    name: "",
    category: "",
    sku: "",
    currentStock: "",
    minimumStock: "",
    unitCost: "",
    supplier: "",
    location: ""
  });

  const resetForm = () => {
    setProductForm({
      name: "",
      category: "",
      sku: "",
      currentStock: "",
      minimumStock: "",
      unitCost: "",
      supplier: "",
      location: ""
    });
  };

  const handleAddProduct = () => {
    if (!productForm.name || !productForm.category || !productForm.sku) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    addProduct({
      name: productForm.name,
      category: productForm.category,
      sku: productForm.sku,
      currentStock: parseInt(productForm.currentStock) || 0,
      minimumStock: parseInt(productForm.minimumStock) || 0,
      unitCost: parseFloat(productForm.unitCost) || 0,
      supplier: productForm.supplier,
      location: productForm.location
    });
    
    toast.success(`Product "${productForm.name}" added successfully!`);
    setAddProductOpen(false);
    resetForm();
  };

  const handleEditClick = (product: InventoryItem) => {
    setSelectedProduct(product);
    setProductForm({
      name: product.name,
      category: product.category,
      sku: product.sku,
      currentStock: product.currentStock.toString(),
      minimumStock: product.minimumStock.toString(),

      unitCost: product.unitCost.toString(),
      supplier: product.supplier,
      location: product.location
    });
    setEditProductOpen(true);
  };

  const handleUpdateProduct = async () => {
    // Validation: Ensure required fields are present
    if (!selectedProduct || !productForm.name || !productForm.category || !productForm.sku || !productForm.supplier) {
      toast.error("Please fill in all required fields (Name, Category, SKU, and Supplier)");
      return;
    }

    // Data Preparation: Convert strings from form state to correct types for Database
    const currentStockNum = parseInt(productForm.currentStock) || 0;
    const minimumStockNum = parseInt(productForm.minimumStock) || 0;
    const unitCostNum = parseFloat(productForm.unitCost) || 0;

    const calculatedStatus = currentStockNum <= minimumStockNum ? "Critical" : "In_Stock";

    try {
      await updateProduct(selectedProduct.id, {
        name: productForm.name.trim(),
        category: productForm.category,
        sku: productForm.sku.trim().toUpperCase(),
        currentStock: currentStockNum,
        minimumStock: minimumStockNum,
        unitCost: unitCostNum,
        supplier: productForm.supplier,
        location: productForm.location.trim() || "N/A",
        status: calculatedStatus
      });

      toast.success(`Product "${productForm.name}" updated and synced to database!`);
      setEditProductOpen(false);
      setSelectedProduct(null);
      resetForm();
    } catch (error) {
      console.error("Update failed:", error);
      toast.error("Failed to update product in the database.");
    }
  };

  const handleDeleteProduct = (product: InventoryItem) => {
    if (confirm(`Are you sure you want to delete "${product.name}"?`)) {
      deleteProduct(product.id);
      toast.success(`Product "${product.name}" deleted successfully!`);
    }
  };

  const handleReorder = (item: InventoryItem) => {
    const suggestedQty = Math.max(1, (item.minimumStock * 2) - item.currentStock);
    setReorderData({ item, quantity: suggestedQty });
    setReorderModalOpen(true);
  };

  const confirmReorder = async () => {
    if (!reorderData) return;
    const savedUser = JSON.parse(localStorage.getItem("user") || "{}");

    const quantityToOrder = Number(reorderData.quantity);
    const unitCost = Number(reorderData.item.unitCost);
    const totalCostOfThisOrder = quantityToOrder * unitCost;
    const newStock = reorderData.item.currentStock + quantityToOrder;

    try {
      // Update Inventory Stock and Status
      await updateProduct(reorderData.item.id, {
        currentStock: newStock,
        status: newStock <= reorderData.item.minimumStock ? "Critical" : "In_Stock"
      });

      // Find the Supplier
      const supplier = suppliers.find(s => 
        s.name.trim().toLowerCase() === reorderData.item.supplier.trim().toLowerCase()
      );
      
      if (supplier) {
        const currentTotalUnits = Number(supplier.totalOrders) || 0;
        const currentSpent = Number(supplier.totalSpent) || 0;
        
        const updatedOrders = currentTotalUnits + quantityToOrder; 
        const updatedSpent = currentSpent + totalCostOfThisOrder;

        // Update Supplier Cumulative Stats
        await updateSupplier(supplier.id, {
            ...supplier,
            totalSpent: updatedSpent,
            totalOrders: updatedOrders
        });

        // NEW: Create a Purchase Order Record in the database
        await fetch('http://localhost:5000/api/purchase-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                company_id: savedUser.company_id,
                supplier_id: supplier.id,
                total_amount: totalCostOfThisOrder,
                order_date: new Date().toISOString().split('T')[0] // Formats as YYYY-MM-DD
            })
        });
          
        toast.success(`Success! Ordered ${quantityToOrder} units from ${supplier.name}`);
      }

      setReorderModalOpen(false);
      setReorderData(null);
    } catch (error) {
      console.error("Reorder error:", error);
      toast.error("Failed to process reorder.");
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Render sort icon
  const renderSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-4 h-4 ml-1 inline opacity-40" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="w-4 h-4 ml-1 inline text-[#FF6B00]" />
      : <ArrowDown className="w-4 h-4 ml-1 inline text-[#FF6B00]" />;
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Critical":
        return <Badge variant="destructive" className="bg-red-600">Critical</Badge>;
      case "Low_Stock":
      case "Low Stock": // Handle both just in case
        return <Badge className="bg-[#FF6B00] text-white border-none">Low Stock</Badge>;
      case "In_Stock":
      case "In Stock":
      default:
        return <Badge variant="secondary">In Stock</Badge>;
    }
  };

  const filteredInventory = useMemo(() => {
    let result = [...inventory];
    
    // Apply local search
    const activeSearchTerm = globalFilters?.searchTerm || searchTerm;
    if (activeSearchTerm) {
      result = result.filter(item =>
        item.name.toLowerCase().includes(activeSearchTerm.toLowerCase()) ||
        item.sku.toLowerCase().includes(activeSearchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(activeSearchTerm.toLowerCase())
      );
    }
    
    // Apply global category filter
    if (globalFilters?.categories && globalFilters.categories.length > 0) {
      result = result.filter(item => globalFilters.categories.includes(item.category));
    }
    
    // Apply global status filter
    if (globalFilters?.status && globalFilters.status.length > 0) {
      result = result.filter(item => globalFilters.status.includes(item.status));
    }
    
    // Apply price range filter
    if (globalFilters?.priceRange) {
      result = result.filter(item => 
        item.unitCost >= globalFilters.priceRange.min && 
        item.unitCost <= globalFilters.priceRange.max
      );
    }

    // Apply sorting
    if (sortColumn) {
      result.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortColumn) {
          case "product":
            aValue = a.name.toLowerCase();
            bValue = b.name.toLowerCase();
            break;
          case "sku":
            aValue = a.sku.toLowerCase();
            bValue = b.sku.toLowerCase();
            break;
          case "category":
            aValue = a.category.toLowerCase();
            bValue = b.category.toLowerCase();
            break;
          case "currentStock":
            aValue = a.currentStock;
            bValue = b.currentStock;
            break;
          case "minStock":
            aValue = a.minimumStock;
            bValue = b.minimumStock;
            break;
          case "unitCost":
            aValue = a.unitCost;
            bValue = b.unitCost;
            break;
          case "supplier":
            aValue = a.supplier.toLowerCase();
            bValue = b.supplier.toLowerCase();
            break;
          case "status":
            aValue = a.status.toLowerCase();
            bValue = b.status.toLowerCase();
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }
    
    return result;
  }, [searchTerm, globalFilters, inventory, sortColumn, sortDirection]);
  
  const getLowStockData = () => {
    return inventory.filter(item => 
      item.status === "Low_Stock" || 
      item.status === "Low Stock"
    );
  };
  const getCriticalStockData = () => {
    return inventory.filter(item => item.status === "Critical");
  };
  const getInventoryValueData = () => inventory.map(item => ({
    ...item,
    totalValue: item.currentStock * item.unitCost
  })).sort((a, b) => b.totalValue - a.totalValue);

  const lowStockData = getLowStockData();
  const lowStockItemsCount = inventory.filter(item => item.status === "Low_Stock").length;
  const criticalItemsCount = inventory.filter(item => item.status === "Critical").length;
  const totalItems = inventory.length;
  const totalValue = inventory.reduce((sum, item) => sum + (item.currentStock * Number(item.unitCost)), 0);

  // Get detailed data for modals
  const getTotalItemsData = () => inventory.map(item => ({
    ...item,
    totalValue: item.currentStock * item.unitCost
  }));

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div className="flex justify-between items-start" variants={itemVariants}>
        <div>
          <h1>Inventory Management</h1>
          <p className="text-muted-foreground">
            Monitor stock levels and manage automotive parts inventory
          </p>
        </div>
        <Button onClick={() => setAddProductOpen(true)} className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]">
          <Plus className="w-4 h-4 mr-2" />
          Add Product
        </Button>
      </motion.div>

      {/* Summary Cards - Horizontal and Clickable */}
      <motion.div className="grid grid-cols-1 md:grid-cols-4 gap-6" variants={containerVariants}>
        <motion.div 
          variants={itemVariants} 
          whileHover={{ scale: 1.02 }} 
          whileTap={{ scale: 0.98 }}
        >
          <Card 
            className="cursor-pointer hover:shadow-xl transition-all border-0 shadow-lg"
            onClick={() => setModalOpen("total")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Total Items</CardTitle>
              <div className="p-2 bg-gradient-to-br from-[#FF6B00] to-[#FF8A50] rounded-lg">
                <Package className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">{totalItems}</div>
              <p className="text-sm text-muted-foreground">
                Active products
              </p>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div 
          variants={itemVariants} 
          whileHover={{ scale: 1.02 }} 
          whileTap={{ scale: 0.98 }}
          className="w-full"
        >
          <Card 
            className="cursor-pointer hover:shadow-xl transition-all border-0 shadow-lg h-full"
              onClick={() => setModalOpen("lowstock")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Low Stock</CardTitle>  
              <div className="p-2 bg-gradient-to-br from-[#607D8B] to-[#B0BEC5] rounded-lg">
                <TrendingDown className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">{lowStockItemsCount}</div>
              <p className="text-sm text-muted-foreground">Need reordering</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          variants={itemVariants} 
          whileHover={{ scale: 1.02 }} 
          whileTap={{ scale: 0.98 }}
          className="w-full"
        >
          <Card 
            className="cursor-pointer hover:shadow-xl transition-all border-0 shadow-lg"
            onClick={() => setModalOpen("critical")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Critical Stock</CardTitle>
              <div className="p-2 bg-gradient-to-br from-[#212121] to-[#424242] rounded-lg">
                <AlertTriangle className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">{criticalItemsCount}</div>
              <p className="text-sm text-muted-foreground">Urgent action needed</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          variants={itemVariants} 
          whileHover={{ scale: 1.02 }} 
          whileTap={{ scale: 0.98 }}
        >
          <Card 
            className="cursor-pointer hover:shadow-xl transition-all border-0 shadow-lg"
            onClick={() => setModalOpen("value")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Inventory Value</CardTitle>
              <div className="p-2 bg-gradient-to-br from-[#FFA726] to-[#FF6B00] rounded-lg">
                <DollarSign className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              <p className="text-sm text-muted-foreground">
                Total stock value
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Search */}
      <motion.div className="flex items-center space-x-4" variants={itemVariants}>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search inventory..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </motion.div>

      {/* Inventory Table */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Current Inventory</CardTitle>
            <CardDescription>
              All automotive parts with current stock levels
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("product")}
                  >
                    Product {renderSortIcon("product")}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("sku")}
                  >
                    SKU {renderSortIcon("sku")}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("category")}
                  >
                    Category {renderSortIcon("category")}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("currentStock")}
                  >
                    Current Stock {renderSortIcon("currentStock")}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("minStock")}
                  >
                    Min Stock {renderSortIcon("minStock")}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("unitCost")}
                  >
                    Unit Cost {renderSortIcon("unitCost")}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("supplier")}
                  >
                    Supplier {renderSortIcon("supplier")}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={() => handleSort("status")}
                  >
                    Status {renderSortIcon("status")}
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInventory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">{item.id}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>
                      <span className={`font-medium ${
                        item.currentStock <= item.minimumStock ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {item.currentStock} units
                      </span>
                    </TableCell>
                    <TableCell>{item.minimumStock} units</TableCell>
                    <TableCell>${item.unitCost}</TableCell>
                    <TableCell>{item.supplier}</TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditClick(item)}
                        >
                          <Pencil className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteProduct(item)}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>

      {/* Modals - Total, Low Stock, Critical, Value */}
      <Dialog open={modalOpen === "total"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent 
          style={{ maxWidth: '1200px', width: '95vw' }} 
          className="max-h-[85vh] overflow-hidden flex flex-col"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Package className="w-5 h-5 mr-2" />
              All Inventory Items
            </DialogTitle>
            <DialogDescription>
              Complete list of all products with value calculations
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex-1 overflow-auto border rounded-lg">
            <Table className="w-full table-fixed min-w-[1000px]">
              <TableHeader className="bg-slate-50 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-[200px]">Product</TableHead>
                  <TableHead className="w-[140px]">SKU</TableHead>
                  <TableHead className="w-[150px]">Category</TableHead>
                  <TableHead className="w-[100px]">Stock</TableHead>
                  <TableHead className="w-[100px]">Unit Cost</TableHead>
                  <TableHead className="w-[120px]">Total Value</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[200px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getTotalItemsData().map((item) => (
                  <TableRow key={item.id} className="hover:bg-slate-50/50">
                    <TableCell className="font-medium truncate" title={item.name}>
                      {item.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                    <TableCell className="truncate">{item.category}</TableCell>
                    <TableCell>{item.currentStock} units</TableCell>
                    <TableCell>${Number(item.unitCost).toFixed(2)}</TableCell>
                    <TableCell className="font-semibold text-slate-700">
                      ${item.totalValue.toFixed(2)}
                    </TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {Number(item.currentStock) <= Number(item.minimumStock) && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 border-orange-500 text-orange-500 hover:bg-orange-50 font-semibold"
                            onClick={() => handleReorder(item)}
                          >
                            Reorder
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => {
                            setModalOpen(null);
                            handleEditClick(item);
                          }}
                        >
                          <Pencil className="w-3 h-3 mr-1" />
                          Edit
                        </Button>

                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setModalOpen(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalOpen === "lowstock"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent 
          style={{ maxWidth: '1000px', width: '95vw' }} 
          className="max-h-[85vh] overflow-hidden flex flex-col"
        >
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center text-xl">
              <TrendingDown className="w-6 h-6 mr-2 text-orange-600" />
              Low Stock Items
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto border rounded-lg mt-4">
            <Table className="w-full table-fixed min-w-[800px]">
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-[200px]">Product</TableHead>
                  <TableHead className="w-[120px]">SKU</TableHead>
                  <TableHead className="w-[100px] text-center">Stock</TableHead>
                  <TableHead className="w-[100px] text-center">Min</TableHead>
                  <TableHead className="w-[150px]">Supplier</TableHead>
                  <TableHead className="w-[130px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getLowStockData().map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="truncate font-bold">{item.name}</TableCell>
                    <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                    <TableCell className="text-center">
                      <span className="text-orange-600">{item.currentStock}</span>
                    </TableCell>
                    <TableCell className="text-center text-slate-500">{item.minimumStock}</TableCell>
                    <TableCell className="truncate text-slate-600">{item.supplier}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="sm" 
                        className="bg-[#FF6B00] hover:bg-[#e66000] text-white px-2"
                        onClick={() => {
                          setModalOpen(null);
                          handleReorder(item);
                        }}
                      >
                        <ShoppingCart className="w-3 h-3 mr-1" />
                        Reorder
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="flex justify-between items-center border-t pt-4 mt-4">
            <div className="text-xs text-slate-500">
              Items requiring attention: <strong>{getLowStockData().length}</strong>
            </div>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalOpen === "critical"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent 
          style={{ maxWidth: '1100px', width: '95vw' }} 
          className="max-h-[85vh] overflow-hidden flex flex-col"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center text-red-600">
              <AlertTriangle className="w-5 h-5 mr-2" />
              Critical Stock Alerts
            </DialogTitle>
            <DialogDescription> 
              Urgent: Products requiring immediate attention as they are at or below minimum levels 
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex-1 overflow-auto border rounded-lg">
            <Table className="w-full table-fixed min-w-[900px]">
              <TableHeader className="bg-red-50 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-[200px]">Product</TableHead>
                  <TableHead className="w-[120px]">Current Stock</TableHead>
                  <TableHead className="w-[150px]">Min Required</TableHead>
                  <TableHead className="w-[150px]">Supplier</TableHead>
                  <TableHead className="w-[120px]">Location</TableHead>
                  <TableHead className="w-[150px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getCriticalStockData().length > 0 ? (
                  getCriticalStockData().map((item) => (
                    <TableRow key={item.id} className="bg-red-50/30 hover:bg-red-50/50 transition-colors">
                      <TableCell className="font-medium truncate" title={item.name}>
                        {item.name}
                      </TableCell>
                      <TableCell className="text-red-600 font-bold">
                        {item.currentStock} units
                      </TableCell>
                      <TableCell>{item.minimumStock} units</TableCell>
                      <TableCell className="truncate">{item.supplier}</TableCell>
                      <TableCell className="font-mono text-xs">{item.location}</TableCell>
                      <TableCell className="text-right">
                        <Button 
                          size="sm" 
                          variant="destructive"
                          className="h-8 whitespace-nowrap shadow-sm"
                          onClick={() => {
                            setModalOpen(null); 
                            handleReorder(item);
                          }}
                        >
                          <ShoppingCart className="w-3.5 h-3.5 mr-2" />
                          Urgent Reorder
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">
                      No items are currently at critical levels.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="border-t pt-4 mt-2">
            <div className="text-sm font-semibold text-red-600 mr-auto">
              Critical items found: {getCriticalStockData().length}
            </div>
            <Button variant="outline" onClick={() => setModalOpen(null)}>
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalOpen === "value"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent 
          style={{ maxWidth: '1200px', width: '95vw' }} 
          className="max-h-[85vh] overflow-hidden flex flex-col"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <DollarSign className="w-5 h-5 mr-2 text-[#FFA726]" />
              Inventory Value Breakdown
            </DialogTitle>
            <DialogDescription>
              Products sorted by total inventory value (Stock × Unit Cost)
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex-1 overflow-auto border rounded-lg">
            <Table className="w-full table-fixed min-w-[1000px]">
              <TableHeader className="bg-slate-50 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-[250px]">Product</TableHead>
                  <TableHead className="w-[150px]">Category</TableHead>
                  <TableHead className="w-[120px]">Stock Quantity</TableHead>
                  <TableHead className="w-[120px]">Unit Cost</TableHead>
                  <TableHead className="w-[140px]">Total Value</TableHead>
                  <TableHead className="w-[180px]">% of Total</TableHead>
                  <TableHead className="w-[100px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getInventoryValueData().map((item) => (
                  <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell className="font-medium truncate" title={item.name}>
                      <div>
                        <p className="truncate">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{item.id}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">{item.category}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{item.currentStock} units</TableCell>
                    <TableCell className="text-slate-600">${Number(item.unitCost).toFixed(2)}</TableCell>
                    <TableCell className="font-bold text-slate-900">${item.totalValue.toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-[#FFA726] to-[#FF6B00] h-full" 
                            style={{ width: `${((item.totalValue / totalValue) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono w-10 text-right">
                          {((item.totalValue / totalValue) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 hover:bg-orange-50 hover:text-[#FF6B00]"
                        onClick={() => { 
                          setModalOpen(null); 
                          handleEditClick(item); 
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          <DialogFooter className="border-t pt-4">
            <div className="mr-auto text-sm text-muted-foreground">
              Grand Total Inventory Value: <span className="font-bold text-slate-900">${totalValue.toLocaleString()}</span>
            </div>
            <Button variant="outline" onClick={() => setModalOpen(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reorderModalOpen} onOpenChange={setReorderModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-[#FF6B00]" />
              Confirm Reorder
            </DialogTitle>
            <DialogDescription>
              Placing an order for <strong>{reorderData?.item.name}</strong>
            </DialogDescription>
          </DialogHeader>

          {reorderData && (
            <div className="space-y-4 py-4">
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                <p className="text-sm text-orange-800">
                  <strong>Supplier:</strong> {reorderData.item.supplier}
                </p>
                <p className="text-sm text-orange-800">
                  <strong>Unit Cost:</strong> ${reorderData.item.unitCost}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reorderQty">Quantity to Order</Label>
                <Input 
                  id="reorderQty"
                  type="number"
                  value={reorderData.quantity}
                  onChange={(e) => setReorderData({...reorderData, quantity: parseInt(e.target.value) || 0})}
                />
              </div>

              <div className="pt-2 border-t flex justify-between items-center">
                <span className="text-sm font-medium">Estimated Total:</span>
                <span className="text-xl font-bold text-[#FF6B00]">
                  ${(reorderData.quantity * reorderData.item.unitCost).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReorderModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={confirmReorder}
              className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]"
            >
              Place Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Product Dialog */}
      <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Product</DialogTitle>
            <DialogDescription>
              Enter the details for the new inventory item
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Product Name *</Label>
                <Input
                  id="name"
                  value={productForm.name}
                  onChange={(e) => setProductForm({...productForm, name: e.target.value})}
                  placeholder="e.g., Ceramic Brake Pads"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="category">Category *</Label>
                <Select value={productForm.category} onValueChange={(value: string) => setProductForm({...productForm, category: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Engine Parts">Engine Parts</SelectItem>
                    <SelectItem value="Brake System">Brake System</SelectItem>
                    <SelectItem value="Filters">Filters</SelectItem>
                    <SelectItem value="Suspension">Suspension</SelectItem>
                    <SelectItem value="Electrical">Electrical</SelectItem>
                    <SelectItem value="Lighting">Lighting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU *</Label>
                <Input
                  id="sku"
                  value={productForm.sku}
                  onChange={(e) => setProductForm({...productForm, sku: e.target.value})}
                  placeholder="e.g., BP-CER-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier">Supplier *</Label>
                <Select 
                  value={productForm.supplier} 
                  onValueChange={(value) => setProductForm({...productForm, supplier: value})}
                >
                  <SelectTrigger id="supplier">
                    <SelectValue placeholder="Choose a Supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.length > 0 ? (
                      suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.name}>
                          {s.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>No suppliers found. Add one first!</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currentStock">Current Stock</Label>
                <Input
                  id="currentStock"
                  type="number"
                  value={productForm.currentStock}
                  onChange={(e) => setProductForm({...productForm, currentStock: e.target.value})}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minimumStock">Min Stock</Label>
                <Input
                  id="minimumStock"
                  type="number"
                  value={productForm.minimumStock}
                  onChange={(e) => setProductForm({...productForm, minimumStock: e.target.value})}
                  placeholder="0"
                />
              </div>
              {/* <div className="space-y-2">
                <Label htmlFor="reorderPoint">Reorder Point</Label>
                <Input
                  id="reorderPoint"
                  type="number"
                  value={productForm.reorderPoint}
                  onChange={(e) => setProductForm({...productForm, reorderPoint: e.target.value})}
                  placeholder="0"
                />
              </div> */}
              <div className="space-y-2">
                <Label htmlFor="unitCost">Unit Cost ($)</Label>
                <Input
                  id="unitCost"
                  type="number"
                  step="0.01"
                  value={productForm.unitCost}
                  onChange={(e) => setProductForm({...productForm, unitCost: e.target.value})}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Warehouse Location</Label>
              <Input
                id="location"
                value={productForm.location}
                onChange={(e) => setProductForm({...productForm, location: e.target.value})}
                placeholder="e.g., A1-B3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {setAddProductOpen(false); resetForm();}}>
              Cancel
            </Button>
            <Button onClick={handleAddProduct} className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]">
              Add Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog open={editProductOpen} onOpenChange={setEditProductOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>
              Update the product details for your inventory
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Product Name *</Label>
                <Input
                  id="edit-name"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  placeholder="e.g., Ceramic Brake Pads"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-category">Category *</Label>
                <Select 
                  value={productForm.category} 
                  onValueChange={(value: string) => setProductForm({ ...productForm, category: value })}
                >
                  <SelectTrigger id="edit-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Engine Parts">Engine Parts</SelectItem>
                    <SelectItem value="Brake System">Brake System</SelectItem>
                    <SelectItem value="Filters">Filters</SelectItem>
                    <SelectItem value="Suspension">Suspension</SelectItem>
                    <SelectItem value="Electrical">Electrical</SelectItem>
                    <SelectItem value="Lighting">Lighting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-sku">SKU *</Label>
                <Input
                  id="edit-sku"
                  value={productForm.sku}
                  onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                  placeholder="e.g., BP-CER-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-supplier">Supplier *</Label>
                <Select 
                  value={productForm.supplier} 
                  onValueChange={(value) => setProductForm({ ...productForm, supplier: value })}
                >
                  <SelectTrigger id="edit-supplier">
                    <SelectValue placeholder="Select Supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.length > 0 ? (
                      suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.name}>
                          {s.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>No suppliers found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-currentStock">Current Stock</Label>
                <Input
                  id="edit-currentStock"
                  type="number"
                  value={productForm.currentStock}
                  onChange={(e) => setProductForm({ ...productForm, currentStock: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-minimumStock">Min Stock</Label>
                <Input
                  id="edit-minimumStock"
                  type="number"
                  value={productForm.minimumStock}
                  onChange={(e) => setProductForm({ ...productForm, minimumStock: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-unitCost">Unit Cost ($)</Label>
                <Input
                  id="edit-unitCost"
                  type="number"
                  step="0.01"
                  value={productForm.unitCost}
                  onChange={(e) => setProductForm({ ...productForm, unitCost: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-location">Warehouse Location</Label>
              <Input
                id="edit-location"
                value={productForm.location}
                onChange={(e) => setProductForm({ ...productForm, location: e.target.value })}
                placeholder="e.g., A1-B3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => { setEditProductOpen(false); setSelectedProduct(null); resetForm(); }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateProduct} 
              className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]"
            >
              Update Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
