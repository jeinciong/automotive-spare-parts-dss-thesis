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
  otherExpenses: number;
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
  importFromCSV: (csvData: string, onProgress?: (percent: number) => void) => Promise<void>;
  deleteAllSalesReports: () => Promise<boolean>;
  fetchSales: () => Promise<void>;
  importProgress: number | null;
  importBatch: { current: number; total: number } | null;
}

const SalesReportsContext = createContext<SalesReportsContextType | undefined>(undefined);

export function SalesReportsProvider({ children }: { children: ReactNode }) {
  const [salesReports, setSalesReports] = useState<SalesReport[]>([]);
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const [importBatch, setImportBatch] = useState<{ current: number; total: number } | null>(null);
  const { fetchInventory } = useInventory();
  const deleteAllSalesReports = async () => {
    console.log("RAW localStorage user:", localStorage.getItem("user"));
    const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
    console.log("Parsed user:", savedUser);
    console.log("business_id:", savedUser.business_id);
    const businessId = savedUser.business_id;

  if (!businessId) {
    toast.error("User session not found. Please log in.");
    return false;
  }

  try {
    // business_id goes in the query string — server reads req.query.business_id
    const response = await fetch(apiUrl(`/api/sales/all?business_id=${businessId}`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      setSalesReports([]);
      toast.success("All sales reports deleted successfully");
      await fetchSales();
      await fetchInventory();
      return true;
    } else {
      const err = await response.json().catch(() => ({ error: "Unknown error" }));
      toast.error("Failed to delete: " + (err.error || "Unknown error"));
      return false;
    }
  } catch (err) {
    toast.error("Network error: Could not reach server");
    return false;
  }
};

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
        otherExpenses: Number(s.other_expenses) || 0,
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
        other_expenses: report.otherExpenses ?? 0,
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
  const importFromCSV = async (csvData: string, onProgress?: (percent: number) => void) => {
    const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
    if (!savedUser.business_id) return;

    const lines = csvData.trim().split('\n');

    const normalizeHeader = (header: string) =>
      header
        .trim()
        .replace(/["\r]/g, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toLowerCase();

    const readNumber = (value: unknown, fallback: number) => {
      if (value === undefined || value === null || String(value).trim() === "") {
        return fallback;
      }

      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    // Strip quotes/\r from headers and accept both snake_case and camelCase CSVs.
    const headers = lines[0].split(',').map(normalizeHeader);

    const reportsToImport = lines.slice(1).map(line => {
      if (!line.trim()) return null;

      const values = line.split(',').map(v => v.trim().replace(/["\r]/g, ''));
      const row: any = {};
      headers.forEach((header, index) => { row[header] = values[index]; });

      const quantity = readNumber(row.quantity, 0);
      const unitPrice = readNumber(row.unit_price, 0);
      const totalAmount = row.total_amount !== undefined && String(row.total_amount).trim() !== ""
        ? readNumber(row.total_amount, 0)
        : row.total !== undefined && String(row.total).trim() !== ""
          ? readNumber(row.total, 0)
          : quantity * unitPrice;

      return {
        date:           row.date           || new Date().toISOString().split('T')[0],
        product_name:   row.product_name   || row.product_line  || "Unknown",
        category:       row.category       || row.product_line  || "General",
        quantity:       Number(row.quantity)    || 1,
        unit_price:     Number(row.unit_price)  || 0,
        other_expenses: Number(row.other_expenses) || 0,
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

    const combinedProgress = (percent: number) => {
      setImportProgress(percent);
      onProgress?.(percent);
    };


    const CHUNK = 1000;
    const totalChunks = Math.ceil(reportsToImport.length / CHUNK);
    let totalImported = 0;
    setImportProgress(0);
    setImportBatch({ current: 0, total: totalChunks });

    try {
      for (let i = 0; i < reportsToImport.length; i += CHUNK) {
        const chunk = reportsToImport.slice(i, i + CHUNK);
        const chunkNum = Math.floor(i / CHUNK) + 1;

        // Calculate the percent range this batch covers
        const batchStartPercent = Math.round((i / reportsToImport.length) * 100);
        const batchEndPercent = Math.round((Math.min(i + CHUNK, reportsToImport.length) / reportsToImport.length) * 100);

        // Simulate ascending progress DURING the fetch using an interval
        let currentSimulated = batchStartPercent;
        setImportProgress(batchStartPercent);
        setImportBatch({ current: chunkNum, total: totalChunks });

        const simulationInterval = setInterval(() => {
          // Creep up to 95% of this batch's range — leave the last 5% for when fetch actually completes
          const ceiling = batchStartPercent + Math.round((batchEndPercent - batchStartPercent) * 0.95);
          if (currentSimulated < ceiling) {
            currentSimulated += 1;
            setImportProgress(currentSimulated);
          }
        }, 80); // tick every 80ms → smooth ascending count

        const response = await fetch(apiUrl("/api/sales"), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: savedUser.business_id, reports: chunk }),
        });

        clearInterval(simulationInterval);

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Unknown error" }));
          toast.error(`Import failed at batch ${chunkNum}: ${err.error}`);
          setImportProgress(null);
          setImportBatch(null);
          return;
        }

        const data = await response.json();
        totalImported += data.count ?? chunk.length;

        // Snap to the real end percent for this batch
        setImportProgress(batchEndPercent);
        setImportBatch({ current: chunkNum, total: totalChunks });

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      setImportProgress(100);
      await fetchSales();
      setTimeout(() => {
        setImportProgress(null);
        setImportBatch(null);
        toast.success(`Imported ${totalImported.toLocaleString()} records!`);
        <p className="text-xs text-green-600 font-medium">
              All {importBatch?.total ?? ""} batch{(importBatch?.total ?? 0) > 1 ? "es" : ""} processed successfully!
        </p>
      }, 300);

    } catch (err) {
      toast.error("Import failed — check your connection and try again");
      setImportProgress(null);
      setImportBatch(null);
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
          otherExpenses: report.otherExpenses ?? 0,
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
    <SalesReportsContext.Provider value={{ salesReports, addSalesReport, updateSalesReport, deleteSalesReport, importFromCSV, deleteAllSalesReports,fetchSales,importProgress,importBatch, }}>
      {children}
    </SalesReportsContext.Provider>
  );
}

export const useSalesReports = () => {
  const context = useContext(SalesReportsContext);
  if (!context) throw new Error("useSalesReports must be used within SalesReportsProvider");
  return context;
};