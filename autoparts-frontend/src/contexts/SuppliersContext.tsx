import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { toast } from "sonner";

export interface Supplier {
  reliability: any;
  id: string;
  name: string;
  category: string;
  location: string;
  rating: number;
  deliveryTime: string;
  totalOrders: number;
  totalSpent: number;
  status: string;
  contact: string;
  phone: string;
}

interface SuppliersContextType {
  suppliers: Supplier[];
  fetchSuppliers: () => Promise<void>;
  addSupplier: (supplier: any) => Promise<void>;
  updateSupplier: (id: string, updates: any) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
}

const SuppliersContext = createContext<SuppliersContextType | undefined>(undefined);
const RATING_THRESHOLD = 3.5;
const RELIABILITY_THRESHOLD = 85;

const getStatus = (rating: number, reliability: number): string => {
  if (rating >= 4.5 && reliability >= 95) return "Active";
  if (rating >= 4.0 && reliability >= 90) return "Active";
  if (rating >= 3.5 || reliability >= 85) return "Warning";
  return "Inactive";
};

const getCalculatedStatus = (rating: number, reliability: number): string => {
  if (rating <= 2.5 || reliability <= 60) return "Inactive"; // Critical failure
  if (rating < 3.5 || reliability < 85) return "Warning";   // Underperforming
  return "Active";
};

export function SuppliersProvider({ children }: { children: ReactNode }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const fetchSuppliers = async () => {
    const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
    const companyId = savedUser.company_id;
    if (!companyId) return;

    try {
      const response = await fetch(`http://localhost:5000/api/suppliers?company_id=${companyId}`);
      const data = await response.json();
      
      const mappedData = data.map((s: any) => {
        const rating = parseFloat(s.rating) || 0;
        const reliability = parseFloat(s.reliability) || 100;
        const suggestedStatus = getCalculatedStatus(rating, reliability);

        return {
          id: s.supplier_id.toString(),
          name: s.supplier_name,
          category: s.category || "",
          location: s.location || "",
          contact: s.contact_email || "",
          phone: s.contact_number || "",
          rating: rating,
          reliability: reliability,
          status: (s.status === "Active" && suggestedStatus !== "Active") ? suggestedStatus : s.status || suggestedStatus,
          deliveryTime: s.delivery_time || "3-5 days",
          totalSpent: parseFloat(s.total_spend) || 0,
          totalOrders: parseInt(s.total_orders) || 0
        };
      });
      setSuppliers(mappedData);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
    }
  };

  useEffect(() => {
    fetchSuppliers();
    const handleReFetch = () => fetchSuppliers();
    window.addEventListener("userLogin", handleReFetch);
    return () => window.removeEventListener("userLogin", handleReFetch);
  }, []);

  const addSupplier = async (supplier: any) => {
    const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
    const companyId = savedUser.company_id;

    const payload = {
      company_id: companyId,
      supplier_name: supplier.name,
      category: supplier.category,
      location: supplier.location,
      contact_email: supplier.contact,
      contact_number: supplier.phone, 
      rating: supplier.rating,
      delivery_time: supplier.deliveryTime,
      status: "Active"
    };

    try {
      const response = await fetch('http://localhost:5000/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        // IMPORTANT: Wait for the refresh so UI matches DB state
        await fetchSuppliers(); 
        toast.success("Supplier added to database!");
      } else {
        toast.error("Failed to save supplier to database");
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Connection error");
    }
  };

  const updateSupplier = async (id: string, updates: any) => {
    const payload = {
        supplier_name: updates.name,
        category: updates.category,
        location: updates.location,
        contact_email: updates.contact,
        contact_number: updates.phone,
        rating: updates.rating,
        status: updates.status,
        delivery_time: updates.deliveryTime,
        total_orders: updates.totalOrders,
        total_spend: updates.totalSpent,
    };

      try {
          const response = await fetch(`http://localhost:5000/api/suppliers/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
          });

          if (response.ok) {
              await fetchSuppliers(); 
          }
      } catch (err) {
          console.error("Context update error:", err);
      }
  };
  
  const deleteSupplier = async (id: string) => {
    const response = await fetch(`http://localhost:5000/api/suppliers/${id}`, {
      method: 'DELETE',
    });
    if (response.ok) setSuppliers(prev => prev.filter(s => s.id !== id));
  };

  return (
    <SuppliersContext.Provider value={{ suppliers, fetchSuppliers, addSupplier, updateSupplier, deleteSupplier }}>
      {children}
    </SuppliersContext.Provider>
  );
}

export const useSuppliers = () => {
  const context = useContext(SuppliersContext);
  if (!context) throw new Error("useSuppliers must be used within SuppliersProvider");
  return context;
};
