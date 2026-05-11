import { useState, useMemo, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Package, AlertTriangle, TrendingDown, Search, Plus, DollarSign, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, ShoppingCart, Upload, Download, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, PhilippinePeso, Wand2 } from "lucide-react";
import { GlobalFilters } from "../../App";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useInventory, InventoryItem } from "../../contexts/InventoryContext";
import { useSuppliers } from "../../contexts/SuppliersContext";
import { formatCurrency, PESO_SYMBOL } from "../../lib/currency";
import { apiUrl } from "../../lib/api";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [deleteAllModalOpen, setDeleteAllModalOpen] = useState(false);
  const [deleteProductModalOpen, setDeleteProductModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<InventoryItem | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Pagination state for main table
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.trim().split("\n");
      const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
      const rows = lines.slice(1);
      let imported = 0;
      for (const row of rows) {
        const values = row.split(",").map(v => v.trim().replace(/"/g, ""));
        const obj: any = {};
        headers.forEach((h, i) => { obj[h] = values[i] ?? ""; });
        if (!obj.name && !obj.product_name) continue;
        try {
          await addProduct({
            name: obj.name || obj.product_name,
            category: obj.category || "Engine Parts",
            sku: obj.sku || "",
            currentStock: parseInt(obj.currentStock || obj.current_stock) || 0,
            minimumStock: parseInt(obj.minimumStock || obj.min_stock) || 0,
            unitCost: parseFloat(obj.unitCost || obj.unit_cost) || 0,
            supplier: obj.supplier || "",
            location: obj.location || "",
          });
          imported++;
        } catch {}
      }
      toast.success(`Imported ${imported} product(s) successfully!`);
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  const processImportFile = async (file: File) => {
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.trim().split("\n");
      const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
      const rows = lines.slice(1);
      let imported = 0;
      for (const row of rows) {
        const values = row.split(",").map(v => v.trim().replace(/"/g, ""));
        const obj: any = {};
        headers.forEach((h, i) => { obj[h] = values[i] ?? ""; });
        if (!obj.name && !obj.product_name) continue;
        try {
          await addProduct({
            name: obj.name || obj.product_name,
            category: obj.category || "Engine Parts",
            sku: obj.sku || generateSKU(obj.name || obj.product_name, obj.category || "Engine Parts"),
            currentStock: parseInt(obj.currentStock || obj.current_stock) || 0,
            minimumStock: parseInt(obj.minimumStock || obj.min_stock) || 0,
            unitCost: parseFloat(obj.unitCost || obj.unit_cost) || 0,
            supplier: obj.supplier || "",
            location: obj.location || "",
          });
          imported++;
        } catch {}
      }
      toast.success(`Imported ${imported} product(s) successfully!`);
      setIsImporting(false);
      setImportModalOpen(false);
      setImportFile(null);
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const headers = ["name","category","sku","currentStock","minimumStock","unitCost","supplier","location"];
    const sample = ["Ceramic Brake Pads","Brake System","BRK-CBP-001","50","10","850.00","AutoParts Co.","A1-B3"];
    const csv = [headers.join(","), sample.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    const headers = ["name","sku","category","currentStock","minimumStock","unitCost","supplier","location","status"];
    const rows = inventory.map(item =>
      [item.name, item.sku, item.category, item.currentStock, item.minimumStock, item.unitCost, item.supplier, item.location, item.status]
        .map(v => `"${v}"`).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Inventory exported successfully!");
  };

  const handleDeleteAll = async () => {
    setIsDeletingAll(true);
    let deleted = 0;
    for (const item of inventory) {
      try { await deleteProduct(item.id); deleted++; } catch {}
    }
    toast.success(`Deleted ${deleted} item(s) from inventory.`);
    setIsDeletingAll(false);
    setDeleteAllModalOpen(false);
  };

  const generateSKU = useCallback((name: string, category: string) => {
    const categoryMap: Record<string, string> = {
      "Engine Parts": "ENG",
      "Brake System": "BRK",
      "Filters": "FLT",
      "Suspension": "SUS",
      "Electrical": "ELC",
      "Lighting": "LGT",
    };
    const catCode = categoryMap[category] || category.slice(0, 3).toUpperCase();
    const nameCode = name.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 3) || "PRD";
    const rand = Math.floor(100 + Math.random() * 900);
    return `${catCode}-${nameCode}-${rand}`;
  }, []);
  
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
  const [skuMode, setSkuMode] = useState<"auto" | "manual">("auto");

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
    if (!productForm.name || !productForm.category) {
      toast.error("Please fill in Product Name and Category");
      return;
    }
    if (productForm.currentStock === "" || productForm.minimumStock === "" || productForm.unitCost === "") {
      toast.error("Please fill in Current Stock, Minimum Stock, and Unit Cost");
      return;
    }
    if (parseFloat(productForm.unitCost) <= 0) {
      toast.error("Unit Cost must be greater than 0");
      return;
    }

    const finalSKU = productForm.sku || generateSKU(productForm.name, productForm.category);

    addProduct({
      name: productForm.name,
      category: productForm.category,
      sku: finalSKU,
      currentStock: parseInt(productForm.currentStock) || 0,
      minimumStock: parseInt(productForm.minimumStock) || 0,
      unitCost: parseFloat(productForm.unitCost) || 0,
      supplier: productForm.supplier,
      location: productForm.location
    });
    
    toast.success(`Product "${productForm.name}" added successfully!`);
    setAddProductOpen(false);
    resetForm();
    setSkuMode("auto");
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
    if (!selectedProduct || !productForm.name || !productForm.category || !productForm.sku) {
      toast.error("Please fill in all required fields (Name, Category, and SKU)");
      return;
    }

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
    setProductToDelete(product);
    setDeleteProductModalOpen(true);
  };

  const confirmDeleteProduct = () => {
    if (!productToDelete) return;
    deleteProduct(productToDelete.id);
    toast.success(`Product "${productToDelete.name}" deleted successfully!`);
    setDeleteProductModalOpen(false);
    setProductToDelete(null);
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
      await updateProduct(reorderData.item.id, {
        currentStock: newStock,
        status: newStock <= reorderData.item.minimumStock ? "Critical" : "In_Stock"
      });

      const supplier = suppliers.find(s => 
        s.name.trim().toLowerCase() === reorderData.item.supplier.trim().toLowerCase()
      );
      
      if (supplier) {
        const currentTotalUnits = Number(supplier.totalOrders) || 0;
        const currentSpent = Number(supplier.totalSpent) || 0;
        
        const updatedOrders = currentTotalUnits + quantityToOrder; 
        const updatedSpent = currentSpent + totalCostOfThisOrder;

        await updateSupplier(supplier.id, {
            ...supplier,
            totalSpent: updatedSpent,
            totalOrders: updatedOrders
        });

        await fetch(apiUrl("/api/purchase-orders"), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                business_id: savedUser.business_id,
                supplier_id: supplier.id,
                total_amount: totalCostOfThisOrder,
                order_date: new Date().toISOString().split('T')[0]
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
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

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
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { stiffness: 100, damping: 10 }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Critical":
        return <Badge variant="destructive" className="bg-red-600">Critical</Badge>;
      case "Low_Stock":
      case "Low Stock":
        return <Badge className="bg-[#FF6B00] text-white border-none">Low Stock</Badge>;
      case "In_Stock":
      case "In Stock":
      default:
        return <Badge variant="secondary">In Stock</Badge>;
    }
  };

  const filteredInventory = useMemo(() => {
    let result = [...inventory];
    
    const activeSearchTerm = globalFilters?.searchTerm || searchTerm;
    if (activeSearchTerm) {
      result = result.filter(item =>
        item.name.toLowerCase().includes(activeSearchTerm.toLowerCase()) ||
        item.sku.toLowerCase().includes(activeSearchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(activeSearchTerm.toLowerCase())
      );
    }

    if (globalFilters?.categories && globalFilters.categories.length > 0) {
      result = result.filter(item => globalFilters.categories.includes(item.category));
    }
    
    if (globalFilters?.status && globalFilters.status.length > 0) {
      result = result.filter(item => globalFilters.status.includes(item.status));
    }
    
    if (globalFilters?.priceRange) {
      result = result.filter(item => 
        item.unitCost >= globalFilters.priceRange.min && 
        item.unitCost <= globalFilters.priceRange.max
      );
    }

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

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredInventory.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedInventory = filteredInventory.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  const handleRowsPerPageChange = (value: string) => {
    setRowsPerPage(parseInt(value));
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  // Page number buttons helper
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safePage > 3) pages.push("...");
      for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) {
        pages.push(i);
      }
      if (safePage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };
  
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

  const lowStockItemsCount = inventory.filter(item => item.status === "Low_Stock").length;
  const criticalItemsCount = inventory.filter(item => item.status === "Critical").length;
  const totalItems = inventory.length;
  const totalValue = inventory.reduce((sum, item) => sum + (item.currentStock * Number(item.unitCost)), 0);

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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportModalOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button
            variant="outline"
            className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
            onClick={() => setDeleteAllModalOpen(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete All
          </Button>
          <Button onClick={() => setAddProductOpen(true)} className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]">
            <Plus className="w-4 h-4 mr-2" />
            Add Product
          </Button>
        </div>
      </motion.div>

      {/* Import Modal */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">Import Inventory</DialogTitle>
            <DialogDescription>
              Upload a CSV file to import inventory products
            </DialogDescription>
          </DialogHeader>

          <div
            className={`mt-2 border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
              isDragging ? "border-[#FF6B00] bg-orange-50" : "border-gray-200 hover:border-gray-300 bg-gray-50"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) setImportFile(file);
            }}
          >
            <div className="text-gray-400 mb-3">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="8" y="4" width="24" height="32" rx="2" stroke="#9CA3AF" strokeWidth="2" fill="none"/>
                <path d="M28 4v8h8" stroke="#9CA3AF" strokeWidth="2" fill="none"/>
                <path d="M14 20h16M14 26h10" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="36" cy="36" r="8" fill="white" stroke="#9CA3AF" strokeWidth="2"/>
                <path d="M36 32v8M33 35l3-3 3 3" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {importFile ? (
              <p className="text-sm font-medium text-[#FF6B00]">{importFile.name}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700">Click to upload or drag and drop</p>
                <p className="text-xs text-gray-400 mt-1">Supports CSV files</p>
              </>
            )}
            <Button variant="outline" className="mt-4" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
              Choose File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setImportFile(file);
                e.target.value = "";
              }}
            />
          </div>

          <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-700 mb-1">Expected Format:</p>
            <p className="text-xs text-blue-600 mb-1">Your file should include these columns:</p>
            <p className="text-xs font-mono text-blue-600 leading-relaxed">
              name, category, sku, currentStock, minimumStock,<br />
              unitCost, supplier, location
            </p>
          </div>

          <DialogFooter className="mt-4 flex justify-between items-center">
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Download Template
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setImportModalOpen(false); setImportFile(null); }}>
                Close
              </Button>
              <Button
                className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]"
                disabled={!importFile || isImporting}
                onClick={() => importFile && processImportFile(importFile)}
              >
                {isImporting ? "Importing..." : "Import"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete All Confirmation Modal */}
      <Dialog open={deleteAllModalOpen} onOpenChange={setDeleteAllModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Delete All Inventory?</DialogTitle>
            <DialogDescription className="text-sm text-gray-600 mt-1">
              This action cannot be undone. All {inventory.length} inventory items will be permanently deleted from the system.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteAllModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeletingAll}
              onClick={handleDeleteAll}
            >
              {isDeletingAll ? "Deleting..." : "Delete All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Product Confirmation Modal */}
      <Dialog open={deleteProductModalOpen} onOpenChange={(open) => { setDeleteProductModalOpen(open); if (!open) setProductToDelete(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Trash2 className="w-5 h-5 text-red-600" />
              Delete Product?
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600 mt-1">
              Are you sure you want to delete <span className="font-semibold text-gray-800">"{productToDelete?.name}"</span>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setDeleteProductModalOpen(false); setProductToDelete(null); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmDeleteProduct}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Summary Cards */}
      <motion.div className="grid grid-cols-1 md:grid-cols-4 gap-6" variants={containerVariants}>
        <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Card className="cursor-pointer hover:shadow-xl transition-all border-0 shadow-lg" onClick={() => setModalOpen("total")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Total Items</CardTitle>
              <div className="p-2 bg-gradient-to-br from-[#FF6B00] to-[#FF8A50] rounded-lg">
                <Package className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">{totalItems}</div>
              <p className="text-sm text-muted-foreground">Active products</p>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full">
          <Card className="cursor-pointer hover:shadow-xl transition-all border-0 shadow-lg h-full" onClick={() => setModalOpen("lowstock")}>
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

        <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full">
          <Card className="cursor-pointer hover:shadow-xl transition-all border-0 shadow-lg" onClick={() => setModalOpen("critical")}>
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

        <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Card className="cursor-pointer hover:shadow-xl transition-all border-0 shadow-lg" onClick={() => setModalOpen("value")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Inventory Value</CardTitle>
              <div className="p-2 bg-gradient-to-br from-[#FFA726] to-[#FF6B00] rounded-lg">
                <DollarSign className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">{formatCurrency(totalValue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
              <p className="text-sm text-muted-foreground">Total stock value</p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Search + Rows Per Page */}
      <motion.div className="flex items-center gap-3 flex-wrap" variants={itemVariants}>
        {/* Show X rows */}
        <div className="flex items-center gap-2 text-[15px] text-slate-500">
          <span>Show</span>
          <Select value={rowsPerPage.toString()} onValueChange={handleRowsPerPageChange}>
            <SelectTrigger className="w-[70px] h-9 rounded-xl border-slate-200 text-orange-600 font-medium focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <span>rows</span>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            placeholder="Search inventory..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 h-10 rounded-xl border-slate-200 bg-slate-50/50 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-slate-300"
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
                  <TableHead className="cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("product")}>
                    Product {renderSortIcon("product")}
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("sku")}>
                    SKU {renderSortIcon("sku")}
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("category")}>
                    Category {renderSortIcon("category")}
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("currentStock")}>
                    Current Stock {renderSortIcon("currentStock")}
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("minStock")}>
                    Min Stock {renderSortIcon("minStock")}
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("unitCost")}>
                    Unit Cost {renderSortIcon("unitCost")}
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("supplier")}>
                    Supplier {renderSortIcon("supplier")}
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort("status")}>
                    Status {renderSortIcon("status")}
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedInventory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground italic">
                      No items found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedInventory.map((item) => (
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
                      <TableCell>{formatCurrency(item.unitCost)}</TableCell>
                      <TableCell>{item.supplier}</TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleEditClick(item)}>
                            <Pencil className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDeleteProduct(item)}>
                            <Trash2 className="w-3 h-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {filteredInventory.length === 0 ? 0 : (safePage - 1) * rowsPerPage + 1}–{Math.min(safePage * rowsPerPage, filteredInventory.length)} of {filteredInventory.length} item{filteredInventory.length !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-1">
                {/* First page */}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(1)}
                  disabled={safePage === 1}
                >
                  <ChevronFirst className="w-4 h-4" />
                </Button>
                {/* Prev */}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                {/* Page numbers */}
                {getPageNumbers().map((page, idx) =>
                  page === "..." ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-sm text-muted-foreground">...</span>
                  ) : (
                    <Button
                      key={page}
                      variant={safePage === page ? "default" : "outline"}
                      size="icon"
                      className={`h-8 w-8 text-sm ${safePage === page ? "bg-[#FF6B00] hover:bg-[#e66000] border-[#FF6B00]" : ""}`}
                      onClick={() => setCurrentPage(page as number)}
                    >
                      {page}
                    </Button>
                  )
                )}

                {/* Next */}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                {/* Last page */}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={safePage === totalPages}
                >
                  <ChevronLast className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* MODAL: Total Items */}
      <Dialog open={modalOpen === "total"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent style={{ maxWidth: '1200px', width: '95vw', maxHeight: '85vh' }} className="flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Package className="w-5 h-5 mr-2" />
              All Inventory Items
            </DialogTitle>
            <DialogDescription>
              Complete list of all products with value calculations
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable table area — capped at ~10 rows then scrolls */}
          <div className="mt-4 overflow-auto border rounded-lg" style={{ maxHeight: '420px' }}>
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
                    <TableCell className="font-medium truncate" title={item.name}>{item.name}</TableCell>
                    <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                    <TableCell className="truncate">{item.category}</TableCell>
                    <TableCell>{item.currentStock} units</TableCell>
                    <TableCell>{formatCurrency(Number(item.unitCost))}</TableCell>
                    <TableCell className="font-semibold text-slate-700">{formatCurrency(item.totalValue)}</TableCell>
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
                          onClick={() => { setModalOpen(null); handleEditClick(item); }}
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
          
          <DialogFooter className="border-t pt-4 mt-2">
            <span className="mr-auto text-sm text-muted-foreground">{getTotalItemsData().length} item(s) total</span>
            <Button variant="outline" onClick={() => setModalOpen(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Low Stock */}
      <Dialog open={modalOpen === "lowstock"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent style={{ maxWidth: '1000px', width: '95vw', maxHeight: '85vh' }} className="flex flex-col">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center text-xl">
              <TrendingDown className="w-6 h-6 mr-2 text-orange-600" />
              Low Stock Items
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-auto border rounded-lg mt-4" style={{ maxHeight: '420px' }}>
            <Table className="w-full table-fixed min-w-[800px]">
              <TableHeader className="bg-slate-50 sticky top-0 z-10">
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
                {getLowStockData().length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground italic">No low stock items.</TableCell>
                  </TableRow>
                ) : (
                  getLowStockData().map((item) => (
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
                          onClick={() => { setModalOpen(null); handleReorder(item); }}
                        >
                          <ShoppingCart className="w-3 h-3 mr-1" />
                          Reorder
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="flex justify-between items-center border-t pt-4 mt-4">
            <div className="text-xs text-slate-500">
              Items requiring attention: <strong>{getLowStockData().length}</strong>
            </div>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Critical Stock */}
      <Dialog open={modalOpen === "critical"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent style={{ maxWidth: '1100px', width: '95vw', maxHeight: '85vh' }} className="flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center text-red-600">
              <AlertTriangle className="w-5 h-5 mr-2" />
              Critical Stock Alerts
            </DialogTitle>
            <DialogDescription>
              Urgent: Products requiring immediate attention as they are at or below minimum levels
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 overflow-auto border rounded-lg" style={{ maxHeight: '420px' }}>
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
                      <TableCell className="font-medium truncate" title={item.name}>{item.name}</TableCell>
                      <TableCell className="text-red-600 font-bold">{item.currentStock} units</TableCell>
                      <TableCell>{item.minimumStock} units</TableCell>
                      <TableCell className="truncate">{item.supplier}</TableCell>
                      <TableCell className="font-mono text-xs">{item.location}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 whitespace-nowrap shadow-sm"
                          onClick={() => { setModalOpen(null); handleReorder(item); }}
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
            <Button variant="outline" onClick={() => setModalOpen(null)}>Dismiss</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Inventory Value */}
      <Dialog open={modalOpen === "value"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent style={{ maxWidth: '1200px', width: '95vw', maxHeight: '85vh' }} className="flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <PhilippinePeso className="h-5 w-5" />
            </div>
              Inventory Value Breakdown
            </DialogTitle>
            <DialogDescription>
              Products sorted by total inventory value (Stock × Unit Cost)
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 overflow-auto border rounded-lg" style={{ maxHeight: '420px' }}>
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
                    <TableCell className="text-slate-600">{formatCurrency(Number(item.unitCost))}</TableCell>
                    <TableCell className="font-bold text-slate-900">{formatCurrency(item.totalValue)}</TableCell>
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
                        onClick={() => { setModalOpen(null); handleEditClick(item); }}
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
              Grand Total Inventory Value: <span className="font-bold text-slate-900">{formatCurrency(totalValue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
            <Button variant="outline" onClick={() => setModalOpen(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*Reorder Modal*/}
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
                  <strong>Unit Cost:</strong> {formatCurrency(reorderData.item.unitCost)}
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
                  {formatCurrency(reorderData.quantity * reorderData.item.unitCost, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReorderModalOpen(false)}>Cancel</Button>
            <Button onClick={confirmReorder} className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]">
              Place Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Product Dialog*/}
      <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Product</DialogTitle>
            <DialogDescription>Enter the details for the new inventory item</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                value={productForm.name}
                onChange={(e) => {
                  const newName = e.target.value;
                  setProductForm(prev => ({
                    ...prev,
                    name: newName,
                    sku: skuMode === "auto" && prev.category
                      ? generateSKU(newName, prev.category)
                      : prev.sku
                  }));
                }}
                placeholder="e.g., Ceramic Brake Pads"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select
                  value={productForm.category}
                  onValueChange={(value: string) => setProductForm(prev => ({
                    ...prev,
                    category: value,
                    sku: skuMode === "auto" && prev.name
                      ? generateSKU(prev.name, value)
                      : prev.sku
                  }))}
                >
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
              <div className="space-y-2">
                <Label htmlFor="supplier">Supplier</Label>
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
                        <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>No suppliers found. Add one first!</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>SKU</Label>
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setSkuMode("auto");
                        if (productForm.name && productForm.category) {
                          setProductForm(prev => ({ ...prev, sku: generateSKU(prev.name, prev.category) }));
                        }
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
                        skuMode === "auto"
                          ? "bg-white text-[#FF6B00] shadow-sm border border-orange-100"
                          : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Wand2 className="w-3 h-3" />
                      Auto-generate
                    </button>
                    <button
                      type="button"
                      onClick={() => setSkuMode("manual")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
                        skuMode === "manual"
                          ? "bg-white text-[#FF6B00] shadow-sm border border-orange-100"
                          : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Pencil className="w-3 h-3" />
                      Manual
                    </button>
                  </div>
                </div>
              </div>

              {skuMode === "auto" ? (
                <div className="flex items-center h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm text-muted-foreground font-mono select-none">
                  {productForm.sku || <span className="italic opacity-50">Fill in name & category first</span>}
                </div>
              ) : (
                <Input
                  placeholder="e.g., BRK-CBP-001"
                  value={productForm.sku}
                  onChange={(e) => setProductForm(prev => ({ ...prev, sku: e.target.value.toUpperCase() }))}
                  className="font-mono"
                />
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currentStock">Current Stock *</Label>
                <Input id="currentStock" type="number" value={productForm.currentStock} onChange={(e) => setProductForm({...productForm, currentStock: e.target.value})} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minimumStock">Min Stock *</Label>
                <Input id="minimumStock" type="number" value={productForm.minimumStock} onChange={(e) => setProductForm({...productForm, minimumStock: e.target.value})} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unitCost">Unit Cost ({PESO_SYMBOL}) *</Label>
                <Input id="unitCost" type="number" step="0.01" value={productForm.unitCost} onChange={(e) => setProductForm({...productForm, unitCost: e.target.value})} placeholder="0.00" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Warehouse Location</Label>
              <Input id="location" value={productForm.location} onChange={(e) => setProductForm({...productForm, location: e.target.value})} placeholder="e.g., A1-B3" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {setAddProductOpen(false); resetForm(); setSkuMode("auto");}}>Cancel</Button>
            <Button onClick={handleAddProduct} className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]">Add Product</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog open={editProductOpen} onOpenChange={setEditProductOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>Update the product details for your inventory</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Product Name *</Label>
                <Input id="edit-name" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} placeholder="e.g., Ceramic Brake Pads" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-category">Category *</Label>
                <Select value={productForm.category} onValueChange={(value: string) => setProductForm({ ...productForm, category: value })}>
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
                <Input id="edit-sku" value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} placeholder="e.g., BP-CER-001" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-supplier">Supplier *</Label>
                <Select value={productForm.supplier} onValueChange={(value) => setProductForm({ ...productForm, supplier: value })}>
                  <SelectTrigger id="edit-supplier">
                    <SelectValue placeholder="Select Supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.length > 0 ? (
                      suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
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
                <Input id="edit-currentStock" type="number" value={productForm.currentStock} onChange={(e) => setProductForm({ ...productForm, currentStock: e.target.value })} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-minimumStock">Min Stock</Label>
                <Input id="edit-minimumStock" type="number" value={productForm.minimumStock} onChange={(e) => setProductForm({ ...productForm, minimumStock: e.target.value })} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-unitCost">Unit Cost ({PESO_SYMBOL})</Label>
                <Input id="edit-unitCost" type="number" step="0.01" value={productForm.unitCost} onChange={(e) => setProductForm({ ...productForm, unitCost: e.target.value })} placeholder="0.00" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-location">Warehouse Location</Label>
              <Input id="edit-location" value={productForm.location} onChange={(e) => setProductForm({ ...productForm, location: e.target.value })} placeholder="e.g., A1-B3" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditProductOpen(false); setSelectedProduct(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleUpdateProduct} className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]">Update Product</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}