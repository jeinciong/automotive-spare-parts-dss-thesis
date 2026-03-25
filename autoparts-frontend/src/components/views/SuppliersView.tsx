import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Truck, MapPin, Star, TrendingUp, AlertCircle, Plus, Search, Pencil, Trash2, TrendingDown } from "lucide-react";
import { motion } from "motion/react";
import { spring } from "motion";
import { toast } from "sonner";
import { useSuppliers, Supplier } from "../../contexts/SuppliersContext";

interface SuppliersViewProps {
  user: { role?: string } | null;
}

export function SuppliersView({ user }: SuppliersViewProps) {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier } = useSuppliers();
  const isStaff = user?.role === 'staff' || user?.role === 'Business';
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const riskySuppliers = suppliers.filter(s => s.status === "Warning" || s.status === "Inactive");

  const [searchTerm, setSearchTerm] = useState("");
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [editSupplierOpen, setEditSupplierOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  
  const fetchPO = async () => {
    const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
    const response = await fetch(`http://localhost:5000/api/purchase-orders?company_id=${savedUser.company_id}`);
    const data = await response.json();
    setPurchaseOrders(data);
  };

  useEffect(() => {
    fetchPO();
  }, []);
  
  // Form state for add supplier
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    category: "",
    location: "",
    contact: "",
    phone: "",
    deliveryTime: "",
    rating: 4.0,
    status: "Active"
  });

  // Form state for edit supplier
  const [editForm, setEditForm] = useState({
    name: "",
    category: "",
    location: "",
    contact: "",
    phone: "",
    deliveryTime: "",
    rating: 4.0,
    totalOrders: 0,
    totalSpent: 0,
    status: "Active"
  });

  const handleAddSupplier = () => {
    if (!newSupplier.name || !newSupplier.category || !newSupplier.contact) {
      toast.error("Please fill in Name, Category, and Contact");
      return;
    }
    addSupplier(newSupplier);
    toast.success(`Supplier ${newSupplier.name} added!`);
    setAddSupplierOpen(false);
    setNewSupplier({ name: "", category: "", location: "", contact: "", phone: "", deliveryTime: "", rating: 4.0, status: "Active" });
  };

  const handleEditClick = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setEditForm({
      name: supplier.name,
      category: supplier.category,
      location: supplier.location,
      contact: supplier.contact,
      phone: supplier.phone,
      deliveryTime: supplier.deliveryTime,
      rating: supplier.rating,
      totalOrders: supplier.totalOrders,
      totalSpent: supplier.totalSpent,
      status: supplier.status,
    });
    setEditSupplierOpen(true);
  };

  const handleUpdateSupplier = () => {
    if (!selectedSupplier) return;
    console.log("Updating supplier with data:", editForm);

    const updatedData = {
      ...editForm,
      rating: Number(editForm.rating),
      totalOrders: Number(editForm.totalOrders),
      totalSpent: Number(editForm.totalSpent)
    };

    updateSupplier(selectedSupplier.id, updatedData);
    toast.success("Supplier updated successfully");
    setEditSupplierOpen(false);
  };

  const handleDeleteClick = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!selectedSupplier) return;
    deleteSupplier(selectedSupplier.id);
    toast.success("Supplier deleted");
    setDeleteDialogOpen(false);
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
        type: spring,
        stiffness: 100,
        damping: 10
      }
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      "Active": "bg-green-100 text-green-700 hover:bg-green-200 border-green-200", 
      "Warning": "bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-200",
      "Inactive": "bg-red-100 text-red-700 hover:bg-red-200 border-red-200"
    } as const;

    const style = variants[status as keyof typeof variants] || "bg-gray-100 text-gray-700";

    return (
      <Badge className={`${style} transition-all border shadow-sm px-2.5 py-0.5`}> {status} </Badge>
    );
  };

  const getOrderStatusBadge = (status: string) => {
    const variants = {
      "Delivered": "secondary",
      "In Transit": "default",
      "Processing": "outline"
    } as const;
    return <Badge variant={variants[status as keyof typeof variants]}>{status}</Badge>;
  };

  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeSuppliers = suppliers.filter(s => s.status === "Active").length;
  const avgRating = suppliers.length > 0 ? (suppliers.reduce((sum, s) => sum + s.rating, 0) / suppliers.length) : 0;
  const totalSpend = suppliers.reduce((sum, s) => sum + (Number(s.totalSpent) || 0), 0);


  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div className="flex justify-between items-start" variants={itemVariants}>
        <div>
          <h1>Supplier Management</h1>
          <p className="text-muted-foreground">
            Manage relationships with automotive parts suppliers
          </p>
        </div>
        <Button onClick={() => setAddSupplierOpen(true)} className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]">
          <Plus className="w-4 h-4 mr-2" />
          Add Supplier
        </Button>
      </motion.div>

      {riskySuppliers.length > 0 && (
        <motion.div variants={itemVariants} className="mb-6">
          <Card className="border-l-4 border-l-destructive bg-destructive/5 shadow-md">
            <CardHeader className="flex flex-row items-center space-y-0 pb-2">
              <AlertCircle className="h-5 w-5 text-destructive mr-2" />
              <CardTitle className="text-sm font-bold text-destructive uppercase tracking-wide">
                Suppliers Requiring Attention
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                The DSS has flagged <strong>{riskySuppliers.length}</strong> supplier(s) due to low performance ratings or reliability issues.
              </p>
              <div className="flex flex-wrap gap-2">
                {riskySuppliers.map(s => (
                  <Badge key={s.id} variant="outline" className="bg-white border-destructive/20 text-destructive">
                    {s.name} ({s.status})
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Summary Cards - Clickable with Modals */}
      {!isStaff && (
        <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-6" variants={containerVariants}>
          <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Card 
              className="border-0 shadow-lg cursor-pointer hover:shadow-xl transition-all"
              onClick={() => setModalOpen("active")}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">Active Suppliers</CardTitle>
                <div className="p-2 bg-gradient-to-br from-[#FF6B00] to-[#FF8A50] rounded-lg">
                  <Truck className="h-4 w-4 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl mb-1">{activeSuppliers}</div>
                <p className="text-sm text-muted-foreground">
                  {suppliers.length} total suppliers
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Card 
              className="border-0 shadow-lg cursor-pointer hover:shadow-xl transition-all"
              onClick={() => setModalOpen("spend")}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">Total Spend</CardTitle>
                <div className="p-2 bg-gradient-to-br from-[#212121] to-[#424242] rounded-lg">
                  <TrendingUp className="h-4 w-4 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl mb-1">
                  {totalSpend >= 1000 
                    ? `$${(totalSpend / 1000).toFixed(1)}K` 
                    : `$${totalSpend.toLocaleString()}`}
                </div>
                <p className="text-sm text-muted-foreground">
                  This year
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}

      <Tabs defaultValue="suppliers" className="space-y-6">
        {!isStaff && (
          <TabsList>
            <TabsTrigger value="suppliers">All Suppliers</TabsTrigger>
            <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="suppliers" className="space-y-4">
          {/* Search and Filter */}
          <div className="flex items-center space-x-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search suppliers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Suppliers Table */}
          <Card className="border-0 shadow-lg">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Delivery Time</TableHead>
                    <TableHead>Total Units Ordered</TableHead>
                    <TableHead>Total Spent</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{supplier.name}</p>
                          <p className="text-sm text-muted-foreground">{supplier.id}</p>
                        </div>
                      </TableCell>
                      <TableCell>{supplier.category}</TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <MapPin className="w-3 h-3 mr-1 text-gray-400" />
                          {supplier.location}
                        </div>
                      </TableCell>
                      <TableCell>{supplier.deliveryTime}</TableCell>
                      <TableCell>{supplier.totalOrders.toLocaleString()}</TableCell>
                      <TableCell>${supplier.totalSpent.toLocaleString()}</TableCell>
                      <TableCell>{getStatusBadge(supplier.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditClick(supplier)}
                            className="hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(supplier)}
                            className="hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        {!isStaff && (
          <>
          <TabsContent value="orders" className="space-y-4">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Recent Purchase Orders</CardTitle>
                <CardDescription>
                  Latest orders placed with suppliers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Order Date</TableHead>
                      <TableHead>Expected Delivery</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseOrders.length > 0 ? (
                      purchaseOrders.map((po) => (
                        <TableRow key={po.po_id}>
                          <TableCell className="font-medium">PO-{po.po_id}</TableCell>
                          <TableCell>{po.suppliers?.supplier_name}</TableCell>
                          <TableCell>Inventory Reorder</TableCell>
                          <TableCell>${Number(po.total_amount).toLocaleString()}</TableCell>
                          <TableCell>{new Date(po.order_date).toLocaleDateString()}</TableCell>
                          <TableCell>{po.delivery_date ? new Date(po.delivery_date).toLocaleDateString() : "TBD"}</TableCell>
                          <TableCell>{getOrderStatusBadge(po.status)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10">No orders found.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Top Performing Suppliers</CardTitle>
                  <CardDescription>
                    Based on total spare parts delivered and delivery performance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {suppliers
                      .sort((a, b) => {
                        // Sort by total orders first, then by reliability
                        const orderDiff = b.totalOrders - a.totalOrders;
                        if (orderDiff !== 0) return orderDiff;
                        return b.reliability - a.reliability;
                      })
                      .slice(0, 5)
                      .map((supplier, index) => (
                        <div key={supplier.id} className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-gradient-to-br from-[#FF6B00] to-[#FF8A50] rounded-full flex items-center justify-center">
                              <span className="text-sm font-medium text-white">
                                {index + 1}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">{supplier.name}</p>
                              <p className="text-sm text-muted-foreground">{supplier.category}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{supplier.totalOrders} parts</p>
                            <p className="text-xs text-muted-foreground">{supplier.reliability}% on-time</p>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle>Delivery Performance</CardTitle>
                  <CardDescription>
                    Average delivery times by supplier
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {suppliers.map((supplier) => (
                      <div key={supplier.id} className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">{supplier.name}</span>
                          <span className="text-sm">{supplier.deliveryTime}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${
                              supplier.deliveryTime.includes('1-2') ? 'bg-green-600' :
                              supplier.deliveryTime.includes('2-3') || supplier.deliveryTime.includes('2-4') ? 'bg-blue-600' :
                              supplier.deliveryTime.includes('3-5') ? 'bg-yellow-600' : 'bg-red-600'
                            }`}
                            style={{ 
                              width: `${Math.max(20, 100 - (parseInt(supplier.deliveryTime) * 15))}%` 
                            }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          </>
        )}
      </Tabs>
      

      {/* Add Supplier Dialog */}
      <Dialog open={addSupplierOpen} onOpenChange={setAddSupplierOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Supplier</DialogTitle>
            <DialogDescription>
              Enter the details for the new supplier
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supplierName">Supplier Name *</Label>
                <Input
                  id="supplierName"
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({...newSupplier, name: e.target.value})}
                  placeholder="e.g., BrakeTech Pro"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplierCategory">Category *</Label>
                <Select value={newSupplier.category} onValueChange={(value: string) => setNewSupplier({...newSupplier, category: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Brake Systems">Brake Systems</SelectItem>
                    <SelectItem value="Engine Parts">Engine Parts</SelectItem>
                    <SelectItem value="Filters & Fluids">Filters & Fluids</SelectItem>
                    <SelectItem value="Electrical">Electrical</SelectItem>
                    <SelectItem value="Lighting">Lighting</SelectItem>
                    <SelectItem value="Suspension">Suspension</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supplierContact">Contact Email *</Label>
                <Input
                  id="supplierContact"
                  type="email"
                  value={newSupplier.contact}
                  onChange={(e) => setNewSupplier({...newSupplier, contact: e.target.value})}
                  placeholder="sales@supplier.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplierPhone">Phone Number</Label>
                <Input
                  id="supplierPhone"
                  type="tel"
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({...newSupplier, phone: e.target.value})}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supplierLocation">Location</Label>
                <Input
                  id="supplierLocation"
                  value={newSupplier.location}
                  onChange={(e) => setNewSupplier({...newSupplier, location: e.target.value})}
                  placeholder="City, State"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplierDelivery">Delivery Time</Label>
                <Select value={newSupplier.deliveryTime} onValueChange={(value: string) => setNewSupplier({...newSupplier, deliveryTime: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select delivery time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-2 days">1-2 days</SelectItem>
                    <SelectItem value="2-3 days">2-3 days</SelectItem>
                    <SelectItem value="3-5 days">3-5 days</SelectItem>
                    <SelectItem value="5-7 days">5-7 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierRating">Initial Rating</Label>
              <Select value={newSupplier.rating.toString()} onValueChange={(value: string) => setNewSupplier({...newSupplier, rating: parseFloat(value)})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5.0">5.0 - Excellent</SelectItem>
                  <SelectItem value="4.5">4.5 - Very Good</SelectItem>
                  <SelectItem value="4.0">4.0 - Good</SelectItem>
                  <SelectItem value="3.5">3.5 - Average</SelectItem>
                  <SelectItem value="3.0">3.0 - Fair</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSupplierOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSupplier} className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]">
              Add Supplier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Supplier Dialog */}
      <Dialog open={editSupplierOpen} onOpenChange={setEditSupplierOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Supplier</DialogTitle>
            <DialogDescription>
              Update supplier information
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Insert this inside the <div className="grid gap-4 py-4"> of your Edit Supplier Dialog */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editSupplierStatus">Account Status</Label>
                <Select 
                  value={editForm.status} 
                  onValueChange={(value) => setEditForm({ ...editForm, status: value })}
                >
                  <SelectTrigger id="editSupplierStatus">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Warning">Warning</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editSupplierName">Supplier Name *</Label>
                <Input
                  id="editSupplierName"
                  value={editForm.name}
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editSupplierCategory">Category *</Label>
                <Select value={editForm.category} onValueChange={(value: string) => setEditForm({...editForm, category: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Brake Systems">Brake Systems</SelectItem>
                    <SelectItem value="Engine Parts">Engine Parts</SelectItem>
                    <SelectItem value="Filters & Fluids">Filters & Fluids</SelectItem>
                    <SelectItem value="Electrical">Electrical</SelectItem>
                    <SelectItem value="Lighting">Lighting</SelectItem>
                    <SelectItem value="Suspension">Suspension</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editSupplierContact">Contact Email *</Label>
                <Input
                  id="editSupplierContact"
                  type="email"
                  value={editForm.contact}
                  onChange={(e) => setEditForm({...editForm, contact: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editSupplierPhone">Phone Number</Label>
                <Input
                  id="editSupplierPhone"
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editSupplierLocation">Location</Label>
                <Input
                  id="editSupplierLocation"
                  value={editForm.location}
                  onChange={(e) => setEditForm({...editForm, location: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editSupplierDelivery">Delivery Time</Label>
                <Select value={editForm.deliveryTime} onValueChange={(value: string) => setEditForm({...editForm, deliveryTime: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-2 days">1-2 days</SelectItem>
                    <SelectItem value="2-3 days">2-3 days</SelectItem>
                    <SelectItem value="3-5 days">3-5 days</SelectItem>
                    <SelectItem value="5-7 days">5-7 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editSupplierRating">Rating</Label>
                <Select 
                  value={editForm.rating.toString()} 
                  onValueChange={(value) => setEditForm({ ...editForm, rating: parseFloat(value) })}
                >
                  <SelectTrigger id="editSupplierRating">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5.0">5.0 - Excellent</SelectItem>
                    <SelectItem value="4.5">4.5 - Very Good</SelectItem>
                    <SelectItem value="4.0">4.0 - Good</SelectItem>
                    <SelectItem value="3.5">3.5 - Average</SelectItem>
                    <SelectItem value="3.0">3.0 - Fair</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editSupplierOrders">Total Units Orders</Label>
                <Input
                  id="editSupplierOrders"
                  type="number"
                  min="0"
                  value={editForm.totalOrders}
                  disabled
                  className="bg-gray-100 cursor-not-allowed"
                  onChange={(e) => setEditForm({...editForm, totalOrders: parseInt(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editSupplierSpent">Total Spent ($)</Label>
                <Input
                  id="editSupplierSpent"
                  type="number"
                  min="0"
                  value={editForm.totalSpent}
                  disabled
                  className="bg-gray-100 cursor-not-allowed"
                  onChange={(e) => setEditForm({...editForm, totalSpent: parseFloat(e.target.value) || 0})}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSupplierOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateSupplier} className="bg-gradient-to-r from-[#FF6B00] to-[#FF8A50]">
              Update Supplier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the supplier "{selectedSupplier?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Active Suppliers Modal */}
        <Dialog open={modalOpen === "active"} onOpenChange={() => setModalOpen(null)}>
          <DialogContent 
            style={{ maxWidth: '1100px', width: '95vw' }} 
            className="max-h-[85vh] overflow-hidden flex flex-col"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <Truck className="w-5 h-5 mr-2 text-[#FF6B00]" />
                All Active Suppliers
              </DialogTitle>
              <DialogDescription>
                Complete list of active supplier partnerships and their current metrics.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex-1 overflow-auto border rounded-lg">
              <Table className="w-full table-fixed min-w-[900px]">
                <TableHeader className="bg-slate-50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-[200px]">Supplier</TableHead>
                    <TableHead className="w-[150px]">Category</TableHead>
                    <TableHead className="w-[180px]">Location</TableHead>
                    <TableHead className="w-[100px]">Rating</TableHead>
                    <TableHead className="w-[120px]">Orders</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.length > 0 ? (
                    suppliers.map((supplier) => (
                      <TableRow key={supplier.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="font-semibold truncate" title={supplier.name}>
                          {supplier.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {supplier.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-600 truncate">
                          {supplier.location}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <Star className="w-3 h-3 text-yellow-500 mr-1 fill-yellow-500" />
                            {Number(supplier.rating).toFixed(1)}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {supplier.totalOrders} total
                        </TableCell>
                        <TableCell>{getStatusBadge(supplier.status)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">
                        No active suppliers found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <DialogFooter className="border-t pt-4 mt-2">
              <div className="mr-auto text-sm text-muted-foreground font-medium">
                Active Partnerships: <span className="text-black">{suppliers.length}</span>
              </div>
              <Button variant="outline" onClick={() => setModalOpen(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      {/* Rating Modal */}
      <Dialog open={modalOpen === "rating"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Star className="w-5 h-5 mr-2" />
              Supplier Ratings
            </DialogTitle>
            <DialogDescription>
              Performance ratings for all suppliers
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Reliability</TableHead>
                  <TableHead>Delivery Time</TableHead>
                  <TableHead>Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.sort((a, b) => b.rating - a.rating).map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Star className="w-4 h-4 text-yellow-500 mr-1" />
                        {supplier.rating}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={supplier.reliability >= 95 ? "secondary" : "default"}>
                        {supplier.reliability}%
                      </Badge>
                    </TableCell>
                    <TableCell>{supplier.deliveryTime}</TableCell>
                    <TableCell>{supplier.category}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Spend Modal */}
        <Dialog open={modalOpen === "spend"} onOpenChange={() => setModalOpen(null)}>
          <DialogContent 
            style={{ maxWidth: '1100px', width: '95vw' }} 
            className="max-h-[85vh] overflow-hidden flex flex-col"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center text-xl">
                <TrendingDown className="w-6 h-6 mr-2 text-[#212121]" />
                Total Spend Analysis
              </DialogTitle>
              <DialogDescription>
                Detailed spending breakdown and average order values by supplier for the current period.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 flex-1 overflow-auto border rounded-lg">
              <Table className="w-full table-fixed min-w-[900px]">
                <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="w-[250px]">Supplier</TableHead>
                    <TableHead className="w-[120px] text-center">Total Orders</TableHead>
                    <TableHead className="w-[180px]">Total Spent</TableHead>
                    <TableHead className="w-[180px]">Avg Order Value</TableHead>
                    <TableHead className="w-[170px]">Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.length > 0 ? (
                    suppliers.sort((a, b) => (Number(b.totalSpent) || 0) - (Number(a.totalSpent) || 0)).map((supplier) => (
                      <TableRow key={supplier.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="font-semibold py-4">
                          <div className="flex flex-col">
                            <span className="truncate" title={supplier.name}>{supplier.name}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">{supplier.id}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-medium text-slate-600">
                          {supplier.totalOrders} orders
                        </TableCell>
                        <TableCell className="font-bold text-slate-900">
                          ${(Number(supplier.totalSpent) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          <span className="bg-slate-100 px-2 py-1 rounded text-xs font-mono">
                            ${supplier.totalOrders > 0 
                              ? (Number(supplier.totalSpent) / supplier.totalOrders).toLocaleString(undefined, { minimumFractionDigits: 2 }) 
                              : "0.00"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal border-slate-300">
                            {supplier.category}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">
                        No spending data available.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <DialogFooter className="border-t pt-4 mt-2">
              <div className="mr-auto flex flex-col">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Company Procurement</span>
                <span className="text-lg font-bold text-[#FF6B00]">${totalSpend.toLocaleString()}</span>
              </div>
              <Button variant="outline" className="h-10 px-8" onClick={() => setModalOpen(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      {/* Delivery Modal */}
      <Dialog open={modalOpen === "delivery"} onOpenChange={() => setModalOpen(null)}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              On-Time Delivery Performance
            </DialogTitle>
            <DialogDescription>
              Delivery reliability and timings
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Reliability</TableHead>
                  <TableHead>Delivery Time</TableHead>
                  <TableHead>Total Orders</TableHead>
                  <TableHead>On-Time Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.sort((a, b) => b.reliability - a.reliability).map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell>
                      <Badge variant={supplier.reliability >= 95 ? "secondary" : supplier.reliability >= 90 ? "default" : "destructive"}>
                        {supplier.reliability}%
                      </Badge>
                    </TableCell>
                    <TableCell>{supplier.deliveryTime}</TableCell>
                    <TableCell>{supplier.totalOrders}</TableCell>
                    <TableCell className="text-green-600 font-medium">
                      {Math.round(supplier.totalOrders * (supplier.reliability / 100))} orders
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
