import { useState, useMemo } from "react";
import { ArrowUpDown, Search, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const salesData = [
  {
    id: "BP-001",
    product: "Premium Brake Pads Set",
    category: "Brake System",
    unitsSold: 425,
    unitPrice: 89.99,
    revenue: 38246.75,
    margin: "28%",
    status: "In Stock"
  },
  {
    id: "OF-102",
    product: "High Performance Oil Filter",
    category: "Filters",
    unitsSold: 380,
    unitPrice: 24.99,
    revenue: 9496.20,
    margin: "35%",
    status: "In Stock"
  },
  {
    id: "SP-203",
    product: "Platinum Spark Plugs (4-pack)",
    category: "Engine Parts",
    unitsSold: 320,
    unitPrice: 45.99,
    revenue: 14716.80,
    margin: "42%",
    status: "Low Stock"
  },
  {
    id: "AF-304",
    product: "Air Filter Assembly",
    category: "Filters",
    unitsSold: 280,
    unitPrice: 32.99,
    revenue: 9237.20,
    margin: "38%",
    status: "In Stock"
  },
  {
    id: "BR-405",
    product: "Brake Rotor Set (Front)",
    category: "Brake System",
    unitsSold: 185,
    unitPrice: 159.99,
    revenue: 29598.15,
    margin: "25%",
    status: "In Stock"
  },
  {
    id: "AB-506",
    product: "Shock Absorber Pair",
    category: "Suspension",
    unitsSold: 165,
    unitPrice: 124.99,
    revenue: 20623.35,
    margin: "30%",
    status: "In Stock"
  },
  {
    id: "FF-607",
    product: "Fuel Filter",
    category: "Filters",
    unitsSold: 145,
    unitPrice: 18.99,
    revenue: 2753.55,
    margin: "45%",
    status: "Low Stock"
  },
  {
    id: "TB-708",
    product: "Timing Belt Kit",
    category: "Engine Parts",
    unitsSold: 98,
    unitPrice: 89.99,
    revenue: 8819.02,
    margin: "32%",
    status: "In Stock"
  }
];

type SortField = "id" | "product" | "unitsSold" | "revenue";
type SortDirection = "asc" | "desc" | null;

export function SalesTable() {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Get unique categories and statuses
  const categories = Array.from(new Set(salesData.map(item => item.category)));
  const statuses = Array.from(new Set(salesData.map(item => item.status)));

  // Handle sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction or reset
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortDirection(null);
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let result = [...salesData];

    // Apply search filter
    if (searchTerm) {
      result = result.filter(item =>
        item.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply category filter
    if (categoryFilter !== "all") {
      result = result.filter(item => item.category === categoryFilter);
    }

    // Apply status filter
    if (statusFilter !== "all") {
      result = result.filter(item => item.status === statusFilter);
    }

    // Apply sorting
    if (sortField && sortDirection) {
      result.sort((a, b) => {
        let aValue = a[sortField];
        let bValue = b[sortField];

        // Convert to string for text comparison
        if (typeof aValue === "string") {
          aValue = aValue.toLowerCase();
          bValue = (bValue as string).toLowerCase();
        }

        if (sortDirection === "asc") {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });
    }

    return result;
  }, [searchTerm, categoryFilter, statusFilter, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-2 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" />
    );
  };

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Detailed Sales Report</CardTitle>
            <div className="flex items-center gap-4">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input 
                  placeholder="Search products..." 
                  className="pl-10 w-64"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Category Filter */}
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {statuses.map(status => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleSort("id")}
                    >
                      Product ID
                      <SortIcon field="id" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleSort("product")}
                    >
                      Product Name
                      <SortIcon field="product" />
                    </Button>
                  </TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleSort("unitsSold")}
                    >
                      Units Sold
                      <SortIcon field="unitsSold" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleSort("revenue")}
                    >
                      Revenue
                      <SortIcon field="revenue" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedData.length > 0 ? (
                  filteredAndSortedData.map((item) => (
                    <TableRow key={item.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">{item.id}</TableCell>
                      <TableCell>{item.product}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{item.unitsSold.toLocaleString()}</TableCell>
                      <TableCell className="text-right">${item.unitPrice}</TableCell>
                      <TableCell className="text-right">${item.revenue.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-green-600">{item.margin}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={item.status === "In Stock" ? "default" : "destructive"}
                          className={item.status === "In Stock" ? "bg-green-100 text-green-800" : ""}
                        >
                          {item.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                      No products found matching your filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between space-x-2 py-4">
            <div className="text-sm text-gray-500">
              Showing {filteredAndSortedData.length} of {salesData.length} products
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
