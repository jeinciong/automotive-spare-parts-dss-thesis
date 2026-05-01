import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { toast } from "sonner";
import { useInventory } from "./InventoryContext";
import { apiUrl } from "../lib/api";

export interface SalesReport {
  id: string;
  reportDate: string;
  productName: string;
  category: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  customerName: string;
  paymentMethod: string;
  status: "Completed" | "Pending" | "Cancelled";
  orderNumber: string;
  notes?: string;
}

interface SalesReportsContextType {
  salesReports: SalesReport[];
  addSalesReport: (report: any) => Promise<void>;
  updateSalesReport: (id: string, report: any) => Promise<void>;
  deleteSalesReport: (id: string) => Promise<void>;
  importFromCSV: (csvData: string) => Promise<void>;
  fetchSales: () => Promise<void>;
}

const SalesReportsContext = createContext<SalesReportsContextType | undefined>(undefined);

export function SalesReportsProvider({ children }: { children: ReactNode }) {
  const [salesReports, setSalesReports] = useState<SalesReport[]>([]);
  const { fetchInventory } = useInventory();

  const fetchSales = useCallback(async () => {
    const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
    const businessId = savedUser.business_id;

    if (!businessId) {
      setSalesReports([]);
      return;
    }

    try {
      const response = await fetch(apiUrl(`/api/sales?business_id=${businessId}`));
      if (!response.ok) throw new Error("Failed to fetch");
      
      const data = await response.json();
      
      const mapped = data.map((s: any) => ({
        id: `SR-${String(s.report_id || s.id).padStart(3, "0")}`,
        reportDate: s.date ? new Date(s.date).toISOString().split('T')[0] : "2026-01-01",
        productName: s.product_name || "Unknown",
        category: s.category || "General",
        quantity: Number(s.quantity) || 0,
        unitPrice: Number(s.unit_price) || 0,
        totalAmount: Number(s.total_amount) || 0,
        customerName: s.customer_type || "Walk-in",
        paymentMethod: s.payment_method || "Cash",
        orderNumber: s.order_number || "N/A",
        status: s.status || "Completed"
      }));
      
      setSalesReports(mapped);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }, []);

  useEffect(() => {
    fetchSales();
    const handleLogin = () => fetchSales();
    window.addEventListener("userLogin", handleLogin);
    return () => window.removeEventListener("userLogin", handleLogin);
  }, [fetchSales]);

  const addSalesReport = async (report: any) => {
    const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
    try {
      const dbReport = {
        date: report.reportDate,
        product_name: report.productName,
        category: report.category,
        quantity: report.quantity,
        unit_price: report.unitPrice,
        total_amount: report.totalAmount,
        customer_type: report.customerName,
        payment_method: report.paymentMethod,
        order_number: report.orderNumber,
        business_id: savedUser.business_id,
        status: report.status || "Completed"
      };

      const response = await fetch(apiUrl("/api/sales"), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: savedUser.business_id, reports: [dbReport] }),
      });

      if (response.ok) {
        toast.success("Sale recorded successfully!");
        await fetchSales();
        await fetchInventory();
      }
    } catch (err) {
      toast.error("Failed to save to database");
    }
  };

  // IMPORT CSV 
  const importFromCSV = async (csvData: string) => {
    const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
    if (!savedUser.business_id) return;

    const lines = csvData.trim().split('\n');

    // Strip quotes and \r from headers
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/["\r]/g, ''));

    const reportsToImport = lines.slice(1).map(line => {
      if (!line.trim()) return null;

      const values = line.split(',').map(v => v.trim().replace(/["\r]/g, ''));
      const row: any = {};
      headers.forEach((header, index) => { row[header] = values[index]; });

      return {
        date:           row.date           || new Date().toISOString().split('T')[0],
        product_name:   row.product_name   || row.product_line  || "Unknown",
        category:       row.category       || row.product_line  || "General",
        quantity:       Number(row.quantity)    || 1,
        unit_price:     Number(row.unit_price)  || 0,
        total_amount:   Number(row.total_amount) || Number(row.total) || 0,
        customer_type:  row.customer_type  || row.client_type   || "Retail",
        payment_method: row.payment_method || row.payment       || "Cash",
        order_number:   row.order_number   || `IMP-${Date.now()}`,
        status:         row.status         || "Completed",
        business_id:     savedUser.business_id,
      };
    }).filter(Boolean) as any[];

    if (reportsToImport.length === 0) {
      toast.error("No valid rows found in file");
      return;
    }

    // Send in chunks of 1000 rows so the browser and server stay responsive
    const CHUNK = 1000;
    const totalChunks = Math.ceil(reportsToImport.length / CHUNK);
    let totalImported = 0;

    try {
      for (let i = 0; i < reportsToImport.length; i += CHUNK) {
        const chunk     = reportsToImport.slice(i, i + CHUNK);
        const chunkNum  = Math.floor(i / CHUNK) + 1;

        // Show progress toast on chunks after the first
        if (totalChunks > 1) {
          toast.loading(`Importing… ${chunkNum}/${totalChunks} batches`, { id: "import-progress" });
        }

        const response = await fetch(apiUrl("/api/sales"), {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ business_id: savedUser.business_id, reports: chunk }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Unknown error" }));
          toast.dismiss("import-progress");
          toast.error(`Import failed at batch ${chunkNum}: ${err.error}`);
          return;
        }

        const data = await response.json();
        totalImported += data.count ?? chunk.length;
      }

      toast.dismiss("import-progress");
      toast.success(`Imported ${totalImported.toLocaleString()} records!`);
      await fetchSales();
    } catch (err) {
      toast.dismiss("import-progress");
      toast.error("Import failed — check your connection and try again");
    }
  };

  const updateSalesReport = async (id: string, report: any) => {
    // Extract the numeric ID from "SR-001"
    const dbId = id.replace("SR-", "");
    const savedUser = JSON.parse(localStorage.getItem("user") || "{}"); // Get business_id
    
    try {
      const response = await fetch(apiUrl(`/api/sales/${dbId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportDate: report.reportDate,
          orderNumber: report.orderNumber,
          productName: report.productName,
          category: report.category,
          quantity: report.quantity,
          unitPrice: report.unitPrice,
          totalAmount: report.totalAmount,
          customerName: report.customerName,
          paymentMethod: report.paymentMethod,
          status: report.status,
          business_id: savedUser.business_id
        }),
      });

      if (response.ok) {
        toast.success("Report updated successfully");
        await fetchSales();
        await fetchInventory();
      } else {
        const errorData = await response.json();
        console.error("Server Error:", errorData);
        toast.error("Failed to update on server");
      }
    } catch (err) {
      console.error("Network Error:", err);
      toast.error("Network error: Could not reach server");
    }
  };

  const deleteSalesReport = async (id: string) => {
    const dbId = id.replace("SR-", "");
    const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
      try {
          const response = await fetch(apiUrl(`/api/sales/${dbId}?business_id=${savedUser.business_id}`), {
              method: 'DELETE' 
          });

          if (response.ok) { 
              await fetchSales(); 
              await fetchInventory(); 
              toast.success("Sale deleted and stock restored"); 
          }
      } catch (err) { 
          toast.error("Delete failed"); 
      }
  };

  return (
    <SalesReportsContext.Provider value={{ salesReports, addSalesReport, updateSalesReport, deleteSalesReport, importFromCSV, fetchSales }}>
      {children}
    </SalesReportsContext.Provider>
  );
}

export const useSalesReports = () => {
  const context = useContext(SalesReportsContext);
  if (!context) throw new Error("useSalesReports must be used within SalesReportsProvider");
  return context;
};
