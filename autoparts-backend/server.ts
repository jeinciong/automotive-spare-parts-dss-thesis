import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Prisma, PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

dotenv.config();
const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

interface ForecastItem {
  period: string;
  predicted: number;
  upper: number | null;
  lower: number | null;
}

type RecommendationActionRow = {
  action_id: number;
  company_id: number;
  prediction_id: number | null;
  action_taken: string | null;
  status: string | null;
  executed_at: Date | string | null;
  recommendation_key?: string | null;
  product_name?: string | null;
  priority?: string | null;
  title?: string | null;
  description?: string | null;
  recommended_action?: string | null;
  impact?: string | null;
  generated_at?: Date | string | null;
  updated_at?: Date | string | null;
  completed_at?: Date | string | null;
  action_history?: string | null;
};

let recommendationActionStorageReady = false;

async function ensureRecommendationActionStorage() {
  if (recommendationActionStorageReady) return;

  const rows = await prisma.$queryRawUnsafe<Array<{ COLUMN_NAME: string }>>(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'recommendation_actions'`
  );
  const existingColumns = new Set(rows.map((row) => row.COLUMN_NAME));
  const columnsToAdd: Array<[string, string]> = [
    ['recommendation_key', 'VARCHAR(191) NULL'],
    ['product_name', 'VARCHAR(100) NULL'],
    ['priority', 'VARCHAR(20) NULL'],
    ['title', 'VARCHAR(255) NULL'],
    ['description', 'TEXT NULL'],
    ['recommended_action', 'VARCHAR(100) NULL'],
    ['impact', 'VARCHAR(255) NULL'],
    ['generated_at', 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP'],
    ['updated_at', 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'],
    ['completed_at', 'TIMESTAMP NULL DEFAULT NULL'],
    ['action_history', 'TEXT NULL'],
  ];

  for (const [columnName, columnDefinition] of columnsToAdd) {
    if (!existingColumns.has(columnName)) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE recommendation_actions ADD COLUMN ${columnName} ${columnDefinition}`
      );
    }
  }

  recommendationActionStorageReady = true;
}

function buildRecommendationHistoryEvent(type: string, details: Record<string, unknown>) {
  return {
    type,
    timestamp: new Date().toISOString(),
    ...details,
  };
}

function parseRecommendationHistory(history: string | null | undefined) {
  if (!history) return [];
  try {
    const parsed = JSON.parse(history);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// --- AUTH ROUTES ---

// Registration: Using Prisma to handle the company creation
app.post('/api/register', async (req, res) => {
    const { email, password, companyName, businessAddress } = req.body;
    try {
        const company = await prisma.companies.create({
            data: {
                company_name: companyName,
                business_address: businessAddress || "Main Office",
                email: email,
                password_hash: password 
            }
        });
        res.status(200).json({ role: 'admin', company_id: company.company_id, email });
    } catch (err: any) {
        res.status(500).json({ message: "Registration failed: " + err.message });
    }
});

// Login: Checking both tables using Prisma's findFirst
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const owner = await prisma.companies.findFirst({
            where: { email, password_hash: password }
        });

        if (owner) {
            return res.json({ 
                role: 'admin', company_id: owner.company_id, email: owner.email, user_name: owner.company_name 
            });
        }

        const staff = await prisma.users.findFirst({
            where: { email, password_hash: password }
        });

        if (staff) {
            return res.json({ 
                role: 'staff', company_id: staff.company_id, email: staff.email, user_id: staff.user_id, user_name: staff.full_name
            });
        }

        res.status(401).json({ message: "Invalid email or password" });
    } catch (err) {
        res.status(500).send(err);
    }
});

// --- INVENTORY ROUTES ---

// Fetch Inventory
app.get('/api/inventory', async (req, res) => {
    const company_id = parseInt(req.query.company_id as string);
    try {
        const inventory = await prisma.inventory.findMany({
            where: { company_id: company_id }
        });
        res.send(inventory);
    } catch (err) {
        res.status(500).send(err);
    }
});

// Update Inventory
app.put('/api/inventory/:id', async (req, res) => {
    const productId = parseInt(req.params.id);
    
    const { 
        product_name, category, current_stock, unit_cost, 
        status, user_id, user_name, role, company_id,
        min_stock, sku, supplier, location 
    } = req.body;

    try {
        const updatedProduct = await prisma.inventory.update({
            where: { product_id: productId },
            data: {
                product_name,
                category,
                current_stock: Number(current_stock),
                unit_cost: Number(unit_cost),
                status,
                min_stock: Number(min_stock),
                sku,
                supplier,
                location
            }
        });

        await prisma.activity_logs.create({
            data: {
                company_id: Number(company_id),
                user_id: user_id && user_id !== 0 ? Number(user_id) : null,
                action_type: "Update",
                description: `${role} ${user_name} updated product: ${product_name}`
            }
        });

        res.status(200).json({ message: "Update Successful", updatedProduct });
    } catch (err: any) {
        console.error("Update Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- ADD PRODUCT ---
app.post('/api/inventory', async (req, res) => {
    try {
        const { product_name, category, current_stock, min_stock, unit_cost, sku, supplier, location, status, company_id } = req.body;
        
        const newProduct = await prisma.inventory.create({
            data: {
                product_name,
                category,
                sku,
                supplier,
                location,
                status,
                company_id: Number(company_id),
                current_stock: Number(current_stock),
                min_stock: Number(min_stock),
                unit_cost: Number(unit_cost),
            }
        });
        // Return the product_id so the frontend can create the "INV00X" ID
        res.status(200).json({ id: newProduct.product_id });
    } catch (err: any) {
        console.error("Add Error:", err);
        res.status(500).json({ message: err.message });
    }
});

// DELETE PRODUCT
app.delete('/api/inventory/:id', async (req, res) => {
    // Strip the 'INV' prefix if the frontend sends it
    const productId = parseInt(req.params.id.replace('INV', ''));
    try {
        await prisma.inventory.delete({
            where: { product_id: productId }
        });
        res.status(200).json({ message: "Deleted successfully" });
    } catch (err: any) {
        console.error("Delete Error:", err);
        res.status(500).json({ message: err.message });
    }
});

// Create Staff Member
app.post('/api/team', async (req, res) => {
    const { fullName, email, password, company_id } = req.body;
    try {
        const newUser = await prisma.users.create({
            data: {
                full_name: fullName,
                email: email,
                password_hash: password,
                company_id: Number(company_id),
                role: 'Business' 
            }
        });
        res.status(200).json(newUser);
    } catch (err: any) {
        res.status(500).json({ message: "Failed to create staff: " + err.message });
    }
});

// Fetch Team Members
app.get('/api/team', async (req, res) => {
    const company_id = parseInt(req.query.company_id as string);
    try {
        const team = await prisma.users.findMany({
            where: { company_id }
        });
        res.status(200).json(team);
    } catch (err) {
        res.status(500).send(err);
    }
});

// update staff member
app.put('/api/team/:id', async (req, res) => {
    const id = Number(req.params.id); 
    const { fullName, email, role } = req.body;
    try {
        const updatedStaff = await prisma.users.update({
            where: { user_id: id },
            data: {
                full_name: fullName,
                email: email,
                role: role
            }
        });
        res.json(updatedStaff);
    } catch (err) { 
        console.error(err);
        res.status(500).send(err); 
    }
});

// delete staff member
app.delete('/api/team/:id', async (req, res) => {
    const id = Number(req.params.id); 
    try {
        await prisma.users.delete({
            where: { user_id: id }
        });
        res.json({ message: "Staff member deleted" });
    } catch (err) { 
        console.error(err);
        res.status(500).send(err); 
    }
});

// GET: Fetch sales for a company
app.get('/api/sales', async (req, res) => {
    const company_id = parseInt(req.query.company_id as string);
    try {
        const sales = await prisma.sales_reports.findMany({
            where: { company_id: company_id },
            orderBy: { date: 'desc' } // Changed from report_date to date
        });
        res.json(sales);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Bulk Add/Import Sales
// Handles large imports (thousands of rows) by:
//   1. Inserting sales in chunks of CHUNK_SIZE via createMany (fast, no row-by-row loop)
//   2. Updating inventory in a single pass after all inserts are done
//   3. Using a generous transaction timeout per chunk so Prisma never times out
app.post('/api/sales', async (req: any, res: any) => {
    const CHUNK_SIZE = 500;

    try {
        const { reports } = req.body;
        if (!Array.isArray(reports) || reports.length === 0) {
            return res.status(400).json({ error: 'reports array is required' });
        }

        let totalInserted = 0;

        // ── Step 1: insert sales in chunks (no inventory check yet) ─────────
        for (let i = 0; i < reports.length; i += CHUNK_SIZE) {
            const chunk = reports.slice(i, i + CHUNK_SIZE);

            await prisma.$transaction(
                async (tx) => {
                    await tx.sales_reports.createMany({
                        data: chunk.map((r: any) => ({
                            company_id:     Number(r.company_id),
                            date:           new Date(r.date),
                            order_number:   String(r.order_number || `IMP-${Date.now()}-${i}`),
                            product_name:   r.product_name,
                            category:       r.category,
                            customer_type:  r.customer_type  || 'Walk-in',
                            quantity:       Number(r.quantity),
                            unit_price:     Number(r.unit_price),
                            total_amount:   Number(r.total_amount),
                            payment_method: r.payment_method || 'Cash',
                            status:         r.status         || 'Completed',
                        })),
                        skipDuplicates: false,
                    });
                    totalInserted += chunk.length;
                },
                { timeout: 60_000 }   // 60 s per chunk — safe for large batches
            );
        }

        // ── Step 2: update inventory in one aggregated pass ──────────────────
        // Sum quantities sold per (product_name, company_id) across all reports
        const soldMap: Record<string, number> = {};
        const companyId = Number(reports[0]?.company_id);
        for (const r of reports) {
            const key = String(r.product_name);
            soldMap[key] = (soldMap[key] ?? 0) + Number(r.quantity);
        }

        for (const [productName, qtySum] of Object.entries(soldMap)) {
            const invItem = await prisma.inventory.findFirst({
                where: { product_name: productName, company_id: companyId },
            });
            if (!invItem) continue;

            const newStock = (Number(invItem.current_stock) || 0) - qtySum;
            if (newStock < 0) continue;   // skip rather than error on bulk import

            const minStock  = Number(invItem.min_stock) || 0;
            const newStatus =
                newStock <= minStock        ? 'Critical'  :
                newStock <= minStock * 1.25 ? 'Low_Stock' : 'In_Stock';

            await prisma.inventory.update({
                where: { product_id: invItem.product_id },
                data:  { current_stock: newStock, status: newStatus as any },
            });
        }

        const modelTrainingResults: Array<{
            product_name: string;
            status: 'trained' | 'cached' | 'skipped';
            algorithm?: ForecastAlgorithm;
            saved_model_path?: string;
            reason?: string;
        }> = [];

        for (const productName of Object.keys(soldMap)) {
            try {
                const forecastResult = await getOrTrainForecastArtifact(companyId, productName, 6, false);
                modelTrainingResults.push({
                    product_name: productName,
                    status: forecastResult.loadedFromCache ? 'cached' : 'trained',
                    algorithm: forecastResult.algorithm,
                    saved_model_path: forecastResult.savedModelPath,
                });
            } catch (err: any) {
                modelTrainingResults.push({
                    product_name: productName,
                    status: 'skipped',
                    reason: err.message,
                });
            }
        }

        return res.status(200).json({ count: totalInserted, model_training: modelTrainingResults });

    } catch (err: any) {
        console.error('Import Error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// UPDATE a sale
app.put('/api/sales/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const { productName, quantity, company_id, reportDate, orderNumber, category, unitPrice, totalAmount, customerName, paymentMethod, status } = req.body;

    try {
        await prisma.$transaction(async (tx) => {
            // Get the current sale record before updating it
            const oldSale = await tx.sales_reports.findUnique({ 
                where: { report_id: id } 
            });

            if (!oldSale) throw new Error("Sale record not found");

            // Calculate the difference (New Qty - Old Qty)
            const diff = Number(quantity) - Number(oldSale.quantity);

            // Update the Sale Report
            await tx.sales_reports.update({
                where: { report_id: id },
                data: {
                    date: new Date(reportDate),
                    order_number: orderNumber,
                    product_name: productName,
                    category,
                    quantity: Number(quantity),
                    unit_price: Number(unitPrice),
                    total_amount: Number(totalAmount),
                    customer_type: customerName,
                    payment_method: paymentMethod,
                    status
                }
            });

            // Adjust the Inventory
            const inventoryItem = await tx.inventory.findFirst({
                where: { 
                    product_name: productName,
                    company_id: Number(company_id)
                }
            });

            if (inventoryItem) {
                const currentStock = Number(inventoryItem.current_stock);
                const minStock = Number(inventoryItem.min_stock);
                const newStock = currentStock - diff;

                if (newStock < 0) throw new Error("Insufficient stock for this adjustment");

                let newStatus: "Critical" | "Low_Stock" | "In_Stock" = "In_Stock";
                
                if (newStock <= minStock) {
                    newStatus = "Critical";
                } else if (newStock <= minStock * 1.25) {
                    newStatus = "Low_Stock";
                }

                await tx.inventory.update({
                    where: { product_id: inventoryItem.product_id },
                    data: { 
                        current_stock: newStock,
                        status: newStatus
                    }
                });
            }
        });

        res.json({ message: "Update successful and inventory adjusted" });
    } catch (err: any) {
        console.error("Update Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// DELETE a sale
app.delete('/api/sales/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    
    try {
        await prisma.$transaction(async (tx) => {
            // Find the sale record first so we know what to "refund"
            const saleToDelete = await tx.sales_reports.findUnique({
                where: { report_id: id }
            });

            if (!saleToDelete) throw new Error("Sale not found");

            const productName = saleToDelete.product_name as string; 
            const companyId = saleToDelete.company_id as number;

            //  Delete the sale record
            await tx.sales_reports.delete({
                where: { report_id: id }
            });

            // Find the product in inventory
            const inventoryItem = await tx.inventory.findFirst({
                where: { 
                    product_name: saleToDelete.product_name ?? "", 
                    company_id: saleToDelete.company_id ?? 0 
                }
            });
            
            // Add the quantity back to inventory
            if (inventoryItem) {
                const currentStock = Number(inventoryItem.current_stock);
                const quantityToRestore = Number(saleToDelete.quantity);
                const newStock = currentStock + quantityToRestore;

                await tx.inventory.update({
                    where: { product_id: inventoryItem.product_id },
                    data: { 
                        current_stock: newStock,
                        status: newStock <= Number(inventoryItem.min_stock) ? "Critical" : "In_Stock"
                    }
                });
            }
        });

        res.json({ message: "Sale deleted and stock restored" });
    } catch (err: any) {
        console.error("Delete Error:", err.message);
        res.status(500).json({ error: "Failed to delete sale and restore stock" });
    }
});

// GET Suppliers
app.get('/api/suppliers', async (req, res) => {
    const company_id = parseInt(req.query.company_id as string);
    try {
        const suppliers = await prisma.suppliers.findMany({
            where: { company_id: company_id },
            orderBy: { supplier_name: 'asc' }
        });
        res.json(suppliers);
    } catch (err) {
        res.status(500).send(err);
    }
});

// POST Supplier
app.post('/api/suppliers', async (req, res) => {
    try {
        const { company_id, supplier_name, category, location, contact_email, contact_number, rating, status, delivery_time } = req.body;
        
        const newSupplier = await prisma.suppliers.create({
            data: {
                company_id: Number(company_id),
                supplier_name,
                category,
                location,
                contact_email,
                contact_number,
                rating: Number(rating),
                status: status || "Active",
                delivery_time: delivery_time || "3-5 days",
                total_spend: new Prisma.Decimal(0)
            }
        });
        res.status(200).json(newSupplier);
    } catch (err: any) {
        console.error("Add Supplier Error:", err);
        res.status(500).json({ message: err.message });
    }
});

// PUT: Update an existing supplier
app.put('/api/suppliers/:id', async (req, res) => {
    const supplierId = parseInt(req.params.id);
    const { 
        supplier_name, 
        category, 
        location, 
        contact_email,
        contact_number, 
        rating, 
        status, 
        delivery_time,
        total_spend, 
        total_orders 
    } = req.body;

    try {
        const updatedSupplier = await prisma.suppliers.update({
            where: { supplier_id: supplierId },
            data: {
                supplier_name,
                category,
                location,
                contact_email,
                contact_number,
                rating: rating ? Number(rating) : undefined,
                status,
                delivery_time: delivery_time,
                total_spend: total_spend !== undefined ? Number(total_spend) : undefined,
                total_orders: total_orders !== undefined ? Number(total_orders) : undefined
            }
        });
        res.status(200).json(updatedSupplier);
    } catch (err: any) {
        console.error("Supplier Update Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Remove a supplier
app.delete('/api/suppliers/:id', async (req, res) => {
    const supplierId = parseInt(req.params.id);
    try {
        await prisma.suppliers.delete({
            where: { supplier_id: supplierId }
        });
        res.status(200).json({ message: "Supplier deleted" });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/purchase-orders', async (req, res) => {
    const { company_id, supplier_id, total_amount, order_date } = req.body;
    try {
        const newOrder = await prisma.purchase_orders.create({
            data: {
                company_id: Number(company_id),
                supplier_id: Number(supplier_id),
                total_amount: Number(total_amount),
                order_date: new Date(order_date),
                status: 'Pending'
            }
        });
        res.status(200).json(newOrder);
    } catch (err: any) {
        console.error("PO Creation Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/purchase-orders', async (req, res) => {
    const company_id = parseInt(req.query.company_id as string);
    try {
        const orders = await prisma.purchase_orders.findMany({
            where: { company_id },
            include: { suppliers: true },
            orderBy: { order_date: 'desc' }
        });
        res.json(orders);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// settings
// Update Business Info
app.put('/api/business/:id', async (req, res) => {
    const { id } = req.params;
    const { company_name, email, business_address } = req.body;
    try {
        const updated = await prisma.companies.update({
            where: { company_id: Number(id) },
            data: { company_name, email, business_address }
        });
        res.json(updated);
    } catch (err) { res.status(500).send(err); }
});

// Update Password with Old Password Check
app.put('/api/change-password/:id', async (req, res) => {
    const { id } = req.params;
    const { oldPassword, newPassword, isStaff } = req.body;
    try {
        const table = isStaff ? prisma.users : prisma.companies;
        const user = await (table as any).findFirst({ 
            where: { [isStaff ? 'user_id' : 'company_id']: Number(id), password_hash: oldPassword } 
        });

        if (!user) return res.status(401).json({ message: "Incorrect old password" });

        await (table as any).update({
            where: { [isStaff ? 'user_id' : 'company_id']: Number(id) },
            data: { password_hash: newPassword }
        });
        res.json({ message: "Password updated" });
    } catch (err) { res.status(500).send(err); }
});

// Delete Whole Business Account (Danger Zone)
app.delete('/api/business/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        // Prisma transaction to clean up related data if not handled by CASCADE
        await prisma.$transaction([
            prisma.inventory.deleteMany({ where: { company_id: id } }),
            prisma.users.deleteMany({ where: { company_id: id } }),
            prisma.companies.delete({ where: { company_id: id } }),
        ]);
        res.json({ message: "Account deleted" });
    } catch (err) { res.status(500).send(err); }
});

app.get('/api/export-all', async (req, res) => {
    const company_id = parseInt(req.query.company_id as string);
    
    if (!company_id) return res.status(400).json({ error: "Company ID required" });

    try {
        const [inventory, sales, suppliers, team] = await prisma.$transaction([
            prisma.inventory.findMany({ where: { company_id } }),
            prisma.sales_reports.findMany({ where: { company_id } }),
            prisma.suppliers.findMany({ where: { company_id } }),
            prisma.users.findMany({ where: { company_id } })
        ]);

        res.json({
            export_info: {
                timestamp: new Date().toISOString(),
                company_id: company_id
            },
            inventory,
            sales,
            suppliers,
            team
        });
    } catch (err: any) {
        res.status(500).json({ error: "Export failed: " + err.message });
    }
});

// ── Recommendation History Routes ─────────────────────────────
app.get('/api/recommendations', async (req: any, res: any) => {
  const company_id = Number(req.query.company_id);
  if (!company_id) {
    return res.status(400).json({ error: 'company_id required' });
  }

  try {
    await ensureRecommendationActionStorage();
    const rows = await prisma.$queryRawUnsafe<RecommendationActionRow[]>(
      `SELECT action_id, company_id, prediction_id, action_taken, status, executed_at,
              recommendation_key, product_name, priority, title, description,
              recommended_action, impact, generated_at, updated_at, completed_at, action_history
         FROM recommendation_actions
        WHERE company_id = ?
        ORDER BY FIELD(status, 'Pending', 'Done', 'Cancelled'), updated_at DESC, executed_at DESC`,
      company_id
    );

    return res.json(rows.map((row) => ({
      ...row,
      action_history: parseRecommendationHistory(row.action_history),
    })));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/recommendations/bulk', async (req: any, res: any) => {
  const { company_id, recommendations = [] } = req.body;
  if (!company_id) {
    return res.status(400).json({ error: 'company_id required' });
  }
  if (!Array.isArray(recommendations)) {
    return res.status(400).json({ error: 'recommendations must be an array' });
  }

  try {
    await ensureRecommendationActionStorage();

    for (const rec of recommendations) {
      if (!rec.id || !rec.title || !rec.action) continue;

      const existing = await prisma.$queryRawUnsafe<RecommendationActionRow[]>(
        `SELECT action_id, status, action_history
           FROM recommendation_actions
          WHERE company_id = ?
            AND recommendation_key = ?
          ORDER BY action_id DESC
          LIMIT 1`,
        Number(company_id),
        String(rec.id)
      );

      if (existing.length > 0) {
        if ((existing[0].status ?? '').toLowerCase() === 'done') {
          continue;
        }

        await prisma.$executeRawUnsafe(
          `UPDATE recommendation_actions
              SET product_name = ?,
                  priority = ?,
                  title = ?,
                  description = ?,
                  recommended_action = ?,
                  impact = ?,
                  status = 'Pending',
                  updated_at = NOW()
            WHERE action_id = ?`,
          String(rec.relatedProduct ?? ''),
          String(rec.priority ?? 'Low'),
          String(rec.title),
          String(rec.description ?? ''),
          String(rec.action),
          String(rec.impact ?? ''),
          existing[0].action_id
        );
      } else {
        const generatedHistory = JSON.stringify([
          buildRecommendationHistoryEvent('generated', {
            title: String(rec.title),
            action: String(rec.action),
            priority: String(rec.priority ?? 'Low'),
          }),
        ]);

        await prisma.$executeRawUnsafe(
          `INSERT INTO recommendation_actions
             (company_id, recommendation_key, product_name, priority, title, description,
              recommended_action, impact, status, generated_at, updated_at, action_history)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', NOW(), NOW(), ?)`,
          Number(company_id),
          String(rec.id),
          String(rec.relatedProduct ?? ''),
          String(rec.priority ?? 'Low'),
          String(rec.title),
          String(rec.description ?? ''),
          String(rec.action),
          String(rec.impact ?? ''),
          generatedHistory
        );
      }

    }

    const rows = await prisma.$queryRawUnsafe<RecommendationActionRow[]>(
      `SELECT action_id, company_id, prediction_id, action_taken, status, executed_at,
              recommendation_key, product_name, priority, title, description,
              recommended_action, impact, generated_at, updated_at, completed_at, action_history
         FROM recommendation_actions
        WHERE company_id = ?
        ORDER BY FIELD(status, 'Pending', 'Done', 'Cancelled'), updated_at DESC, executed_at DESC`,
      Number(company_id)
    );

    return res.json(rows.map((row) => ({
      ...row,
      action_history: parseRecommendationHistory(row.action_history),
    })));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/recommendations/:id/complete', async (req: any, res: any) => {
  const actionId = Number(req.params.id);
  const { company_id, action_taken } = req.body;
  if (!actionId || !company_id) {
    return res.status(400).json({ error: 'action id and company_id required' });
  }

  try {
    await ensureRecommendationActionStorage();
    const rows = await prisma.$queryRawUnsafe<RecommendationActionRow[]>(
      `SELECT action_id, title, recommended_action, action_history
         FROM recommendation_actions
        WHERE action_id = ?
          AND company_id = ?
        LIMIT 1`,
      actionId,
      Number(company_id)
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Recommendation action not found' });
    }

    const history = parseRecommendationHistory(rows[0].action_history);
    history.push(buildRecommendationHistoryEvent('completed', {
      action_taken: String(action_taken ?? rows[0].recommended_action ?? 'Completed'),
    }));

    await prisma.$executeRawUnsafe(
      `UPDATE recommendation_actions
          SET status = 'Done',
              action_taken = ?,
              executed_at = NOW(),
              completed_at = NOW(),
              updated_at = NOW(),
              action_history = ?
        WHERE action_id = ?
          AND company_id = ?`,
      String(action_taken ?? rows[0].recommended_action ?? 'Completed'),
      JSON.stringify(history),
      actionId,
      Number(company_id)
    );

    const updated = await prisma.$queryRawUnsafe<RecommendationActionRow[]>(
      `SELECT action_id, company_id, prediction_id, action_taken, status, executed_at,
              recommendation_key, product_name, priority, title, description,
              recommended_action, impact, generated_at, updated_at, completed_at, action_history
         FROM recommendation_actions
        WHERE action_id = ?`,
      actionId
    );

    return res.json({
      ...updated[0],
      action_history: parseRecommendationHistory(updated[0]?.action_history),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
// ═══════════════════════════════════════════════════════════════
// FORECAST ROUTES  — Python model integration
// ═══════════════════════════════════════════════════════════════

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PYTHON_BIN    = process.env.PYTHON_BIN ?? (process.platform === 'win32' ? 'python' : 'python3');
const PYTHON_DIR    = path.join(__dirname, 'python');
const PYTHON_TIMEOUT_MS = 90_000;
const TRAINED_MODELS_DIR = path.join(PYTHON_DIR, 'trained_models');
const FORECAST_MIN_OBS = 12;
const BUSINESS_REVENUE_FORECAST_NAME = 'monthly_total_revenue';
const REVENUE_SHARED_PRELOAD_LOOKAHEAD_MONTHS = 120;
const PRODUCT_SHARED_PRELOAD_LOOKAHEAD_MONTHS = 120;

const MODEL_SCRIPT_PATHS = {
  ARIMA_XGB: {
    train: path.join(PYTHON_DIR, 'models/arima_xgb_train_model.py'),
    predict: path.join(PYTHON_DIR, 'models/arima_xgb_predict_model.py'),
    dir: path.join(TRAINED_MODELS_DIR, 'arima_xgb'),
  },
  TSB_XGB: {
    train: path.join(PYTHON_DIR, 'models/tsb_xgb_train_model.py'),
    predict: path.join(PYTHON_DIR, 'models/tsb_xgb_predict_model.py'),
    dir: path.join(TRAINED_MODELS_DIR, 'tsb_xgb'),
  },
} as const;

const REVENUE_MODEL_SCRIPT_PATHS = {
  train: path.join(PYTHON_DIR, 'models/revenue_forecast_train_model.py'),
  predict: path.join(PYTHON_DIR, 'models/revenue_forecast_predict_model.py'),
} as const;
const LEGACY_REVENUE_MODELS_DIR = path.join(TRAINED_MODELS_DIR, 'sales_revenue');

type ForecastAlgorithm = keyof typeof MODEL_SCRIPT_PATHS;

type PreparedForecastContext = {
  dates: string[];
  quantities: number[];
  sortedKeys: string[];
  classResult: any;
  algorithm: ForecastAlgorithm;
  scriptConfig: (typeof MODEL_SCRIPT_PATHS)[ForecastAlgorithm];
  modelDir: string;
  modelPath: string;
};

function slugifyProductName(productName: string): string {
  return productName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'forecast_model';
}

function getBusinessModelDir(baseDir: string, businessId: number) {
  return path.join(baseDir, `business_${businessId}`);
}

function getLegacyCompanyModelDir(baseDir: string, businessId: number) {
  return path.join(baseDir, `company_${businessId}`);
}

async function resolveBusinessModelDir(baseDir: string, businessId: number) {
  const businessDir = getBusinessModelDir(baseDir, businessId);
  const legacyCompanyDir = getLegacyCompanyModelDir(baseDir, businessId);

  if (!(await fileExists(businessDir)) && await fileExists(legacyCompanyDir)) {
    await ensureDir(path.dirname(businessDir));
    try {
      await fs.rename(legacyCompanyDir, businessDir);
    } catch (error) {
      if (!(await fileExists(businessDir))) {
        throw error;
      }
    }
  }

  await ensureDir(businessDir);
  return businessDir;
}

async function buildBusinessModelPath(
  scriptConfig: (typeof MODEL_SCRIPT_PATHS)[ForecastAlgorithm],
  businessId: number,
  productName: string,
) {
  const modelDir = await resolveBusinessModelDir(scriptConfig.dir, businessId);
  return {
    modelDir,
    modelPath: path.join(modelDir, `${slugifyProductName(productName)}.pkl`),
  };
}

async function resolveBusinessRevenueArtifactPath(
  algorithm: ForecastAlgorithm,
  businessId: number,
) {
  const modelDir = MODEL_SCRIPT_PATHS[algorithm].dir;
  await ensureDir(modelDir);
  const modelPath = path.join(modelDir, `${BUSINESS_REVENUE_FORECAST_NAME}.pkl`);

  if (await fileExists(modelPath)) {
    return { modelDir, modelPath };
  }

  const candidateDirs = [
    MODEL_SCRIPT_PATHS[algorithm].dir,
    getBusinessModelDir(MODEL_SCRIPT_PATHS[algorithm].dir, businessId),
    getLegacyCompanyModelDir(MODEL_SCRIPT_PATHS[algorithm].dir, businessId),
    getBusinessModelDir(LEGACY_REVENUE_MODELS_DIR, businessId),
    getLegacyCompanyModelDir(LEGACY_REVENUE_MODELS_DIR, businessId),
  ];
  const legacyArtifactNames = ['monthly_total_revenue', 'monthly_total_sales_revenue'];

  for (const candidateDir of candidateDirs) {
    for (const legacyArtifactName of legacyArtifactNames) {
      const legacyPath = path.join(candidateDir, `${legacyArtifactName}.pkl`);
      if (await fileExists(legacyPath)) {
        if (normalizePathForCompare(legacyPath) !== normalizePathForCompare(modelPath)) {
          await fs.copyFile(legacyPath, modelPath);
        }
        return { modelDir, modelPath };
      }
    }
  }

  return { modelDir, modelPath };
}

async function resolveSharedRevenueArtifactPath() {
  const algorithms: ForecastAlgorithm[] = ['ARIMA_XGB', 'TSB_XGB'];
  const artifactNames = ['monthly_total_revenue', 'monthly_total_sales_revenue'];

  for (const algorithm of algorithms) {
    const modelDir = MODEL_SCRIPT_PATHS[algorithm].dir;
    for (const artifactName of artifactNames) {
      const modelPath = path.join(modelDir, `${artifactName}.pkl`);
      if (await fileExists(modelPath)) {
        return { algorithm, modelDir, modelPath };
      }
    }
  }

  return null;
}

function buildRerunModelPath(modelDir: string, productName: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(
    modelDir,
    'reruns',
    `${slugifyProductName(productName)}__rerun_${timestamp}.pkl`,
  );
}

function buildSharedProductModelPath(
  scriptConfig: (typeof MODEL_SCRIPT_PATHS)[ForecastAlgorithm],
  productName: string,
) {
  return path.join(scriptConfig.dir, `${slugifyProductName(productName)}.pkl`);
}

function keepFutureForecasts<T extends { period?: string | null }>(
  forecasts: T[],
  lastHistoryPeriod: string,
) {
  return forecasts.filter((forecast) => {
    const period = forecast.period;
    return typeof period === 'string' && period > lastHistoryPeriod;
  });
}

function buildMonthlySeries(rawSales: Array<{ date: Date; quantity: number | bigint | null }>) {
  const monthMap: Record<string, number> = {};

  rawSales.forEach((sale) => {
    const saleDate = new Date(sale.date);
    const key = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
    monthMap[key] = (monthMap[key] ?? 0) + Number(sale.quantity ?? 0);
  });

  if (rawSales.length === 0) {
    return { dates: [] as string[], quantities: [] as number[] };
  }

  const firstDate = new Date(rawSales[0].date);
  const lastDate = new Date(rawSales[rawSales.length - 1].date);
  const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  const end = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1);

  const dates: string[] = [];
  const quantities: number[] = [];

  while (cursor <= end) {
    const period = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    dates.push(period);
    quantities.push(monthMap[period] ?? 0);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return { dates, quantities };
}

function buildMonthlyRevenueSeries(rawSales: Array<{ date: Date; total_amount: Prisma.Decimal | number | null }>) {
  const monthMap: Record<string, number> = {};

  rawSales.forEach((sale) => {
    const saleDate = new Date(sale.date);
    const key = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
    monthMap[key] = (monthMap[key] ?? 0) + Number(sale.total_amount ?? 0);
  });

  if (rawSales.length === 0) {
    return { dates: [] as string[], revenues: [] as number[] };
  }

  const firstDate = new Date(rawSales[0].date);
  const lastDate = new Date(rawSales[rawSales.length - 1].date);
  const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  const end = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1);

  const dates: string[] = [];
  const revenues: number[] = [];

  while (cursor <= end) {
    const period = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    dates.push(period);
    revenues.push(monthMap[period] ?? 0);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return { dates, revenues };
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizePathForCompare(filePath: string) {
  return path.resolve(filePath).toLowerCase();
}

function isPathInsideDir(filePath: string, dirPath: string) {
  const resolvedFile = normalizePathForCompare(filePath);
  const resolvedDir = normalizePathForCompare(dirPath);
  return resolvedFile === resolvedDir || resolvedFile.startsWith(`${resolvedDir}${path.sep}`);
}

function assertModelSelectionConsistency(
  expectedAlgorithm: ForecastAlgorithm,
  expectedDir: string,
  savedModelPath: string,
  reportedAlgorithm?: string | null,
) {
  if (!savedModelPath) {
    throw new Error(`No saved model path was returned for ${expectedAlgorithm}`);
  }

  if (!isPathInsideDir(savedModelPath, expectedDir)) {
    throw new Error(
      `Saved model path mismatch: expected ${expectedAlgorithm} artifact under ${expectedDir}, got ${savedModelPath}`
    );
  }

  if (reportedAlgorithm && reportedAlgorithm !== expectedAlgorithm) {
    throw new Error(
      `Model algorithm mismatch: expected ${expectedAlgorithm}, got ${reportedAlgorithm}`
    );
  }
}

async function prepareForecastContext(companyId: number, productName: string): Promise<PreparedForecastContext> {
  const rawSales = await prisma.sales_reports.findMany({
    where: { company_id: companyId, product_name: productName },
    orderBy: { date: 'asc' },
    select: { date: true, quantity: true }
  });

  if (rawSales.length === 0) {
    throw new Error('No sales history found for this product');
  }

  const { dates, quantities } = buildMonthlySeries(rawSales);
  if (dates.length < FORECAST_MIN_OBS) {
    throw new Error(`Need >= ${FORECAST_MIN_OBS} monthly observations, got ${dates.length}`);
  }

  const classResult = await runPython(
    path.join(PYTHON_DIR, 'utils/demand_classifier.py'),
    { quantities }
  );
  if (!classResult.success) {
    throw new Error(`Classification failed: ${classResult.error}`);
  }

  const algorithm = classResult.algorithm as ForecastAlgorithm;
  const scriptConfig = MODEL_SCRIPT_PATHS[algorithm];
  const { modelDir, modelPath } = await buildBusinessModelPath(scriptConfig, companyId, productName);

  return {
    dates,
    quantities,
    sortedKeys: dates,
    classResult,
    algorithm,
    scriptConfig,
    modelDir,
    modelPath,
  };
}

async function getOrTrainForecastArtifact(
  companyId: number,
  productName: string,
  horizon = 6,
  forceRetrain = false,
) {
  const prepared = await prepareForecastContext(companyId, productName);
  const { dates, quantities, sortedKeys, classResult, algorithm, scriptConfig, modelDir, modelPath } = prepared;

  let modelResult: any = null;
  let savedModelPath = modelPath;
  let loadedFromCache = false;
  const hasCanonicalArtifact = await fileExists(modelPath);

  if (!forceRetrain && hasCanonicalArtifact) {
    const predictionHorizon = sortedKeys.length > 0
      ? Number(horizon) + PRODUCT_SHARED_PRELOAD_LOOKAHEAD_MONTHS
      : Number(horizon);

    const cachedResult = await runPython(scriptConfig.predict, {
      model_path: modelPath,
      horizon: predictionHorizon,
    });

    if (cachedResult.success) {
      assertModelSelectionConsistency(
        algorithm,
        modelDir,
        String(cachedResult.model_info?.saved_model_path ?? modelPath),
        cachedResult.model_info?.algorithm ?? null,
      );
      modelResult = cachedResult;
      loadedFromCache = true;
    } else {
      console.warn(
        `[Forecast Cache Miss] company=${companyId} | ${productName} | ${algorithm} | ${cachedResult.error}`
      );
    }
  }

  if (!forceRetrain && !modelResult && !hasCanonicalArtifact) {
    const sharedModelPath = buildSharedProductModelPath(scriptConfig, productName);
    if (await fileExists(sharedModelPath)) {
      const predictionHorizon = sortedKeys.length > 0
        ? Number(horizon) + PRODUCT_SHARED_PRELOAD_LOOKAHEAD_MONTHS
        : Number(horizon);

      const sharedResult = await runPython(scriptConfig.predict, {
        model_path: sharedModelPath,
        horizon: predictionHorizon,
      });

      if (sharedResult.success) {
        assertModelSelectionConsistency(
          algorithm,
          scriptConfig.dir,
          String(sharedResult.model_info?.saved_model_path ?? sharedModelPath),
          sharedResult.model_info?.algorithm ?? null,
        );
        modelResult = sharedResult;
        savedModelPath = sharedModelPath;
        loadedFromCache = true;
      } else {
        console.warn(
          `[Forecast Shared Preload Miss] business=${companyId} | ${productName} | ${algorithm} | ${sharedResult.error}`
        );
      }
    }
  }

  if (!modelResult) {
    const outputModelPath =
      forceRetrain && hasCanonicalArtifact
        ? buildRerunModelPath(modelDir, productName)
        : modelPath;

    await ensureDir(path.dirname(outputModelPath));

    const trainResult = await runPython(scriptConfig.train, {
      dates,
      quantities,
      horizon,
      product_name: productName,
      output_path: outputModelPath,
    });
    if (!trainResult.success) {
      throw new Error(`Training failed: ${trainResult.error}`);
    }

    assertModelSelectionConsistency(
      algorithm,
      modelDir,
      String(trainResult.saved_model_path ?? ""),
      trainResult.model_info?.algorithm ?? trainResult.algorithm ?? null,
    );

    savedModelPath = String(trainResult.saved_model_path);

    const predictedResult = await runPython(scriptConfig.predict, {
      model_path: savedModelPath,
      horizon,
    });
    if (!predictedResult.success) {
      throw new Error(`Saved model forecast failed: ${predictedResult.error}`);
    }

    assertModelSelectionConsistency(
      algorithm,
      modelDir,
      String(predictedResult.model_info?.saved_model_path ?? savedModelPath),
      predictedResult.model_info?.algorithm ?? null,
    );

    modelResult = predictedResult;
  } else {
    savedModelPath = String(modelResult.model_info?.saved_model_path ?? modelPath);
  }

  const mergedModelInfo = {
    ...(modelResult.model_info ?? {}),
    saved_model_path: savedModelPath,
    from_cache: loadedFromCache,
  };
  const filteredForecasts = keepFutureForecasts(
    Array.isArray(modelResult.forecasts) ? modelResult.forecasts : [],
    sortedKeys[sortedKeys.length - 1],
  ).slice(0, Number(horizon));

  return {
    ...prepared,
    savedModelPath,
    loadedFromCache,
    mergedModelInfo,
    filteredForecasts,
  };
}

async function getOrTrainBusinessRevenueForecastArtifact(
  companyId: number,
  horizon = 6,
  forceRetrain = false,
) {
  const rawSales = await prisma.sales_reports.findMany({
    where: { company_id: companyId },
    orderBy: { date: 'asc' },
    select: { date: true, total_amount: true },
  });

  const { dates, revenues } = rawSales.length > 0
    ? buildMonthlyRevenueSeries(rawSales)
    : { dates: [] as string[], revenues: [] as number[] };

  if (dates.length < FORECAST_MIN_OBS) {
    const sharedArtifact = await resolveSharedRevenueArtifactPath();
    if (!sharedArtifact) {
      if (rawSales.length === 0) {
        throw new Error('No sales history found for business sales revenue and no shared preload model is available');
      }
      throw new Error(`Need >= ${FORECAST_MIN_OBS} monthly observations, got ${dates.length}, and no shared preload model is available`);
    }

    const cachedResult = await runPython(REVENUE_MODEL_SCRIPT_PATHS.predict, {
      model_path: sharedArtifact.modelPath,
      horizon,
    });
    if (!cachedResult.success) {
      throw new Error(`Shared revenue preload failed: ${cachedResult.error}`);
    }

    const savedModelPath = String(cachedResult.model_info?.saved_model_path ?? sharedArtifact.modelPath);
    const mergedModelInfo = {
      ...(cachedResult.model_info ?? {}),
      saved_model_path: savedModelPath,
      from_cache: true,
      preloaded_shared: true,
    };

    return {
      dates,
      revenues,
      classResult: cachedResult.model_info ?? null,
      algorithm: sharedArtifact.algorithm,
      modelDir: sharedArtifact.modelDir,
      modelPath: sharedArtifact.modelPath,
      savedModelPath,
      loadedFromCache: true,
      mergedModelInfo,
      filteredForecasts: Array.isArray(cachedResult.forecasts) ? cachedResult.forecasts : [],
    };
  }

  const classResult = await runPython(
    path.join(PYTHON_DIR, 'utils/demand_classifier.py'),
    { quantities: revenues }
  );
  if (!classResult.success) {
    throw new Error(`Classification failed: ${classResult.error}`);
  }

  const algorithm = classResult.algorithm as ForecastAlgorithm;
  const { modelDir, modelPath } = await resolveBusinessRevenueArtifactPath(algorithm, companyId);

  let modelResult: any = null;
  let savedModelPath = modelPath;
  let loadedFromCache = false;
  const hasCanonicalArtifact = await fileExists(modelPath);

  if (!forceRetrain && hasCanonicalArtifact) {
    const predictionHorizon = dates.length > 0
      ? Number(horizon) + REVENUE_SHARED_PRELOAD_LOOKAHEAD_MONTHS
      : Number(horizon);

    const cachedResult = await runPython(REVENUE_MODEL_SCRIPT_PATHS.predict, {
      model_path: modelPath,
      horizon: predictionHorizon,
    });

    if (cachedResult.success) {
      const cachedPath = String(cachedResult.model_info?.saved_model_path ?? modelPath);
      if (!isPathInsideDir(cachedPath, modelDir)) {
        throw new Error(`Saved revenue model path mismatch: expected artifact under ${modelDir}, got ${cachedPath}`);
      }
      modelResult = cachedResult;
      loadedFromCache = true;
    } else {
      console.warn(
        `[Revenue Forecast Cache Miss] business=${companyId} | ${cachedResult.error}`
      );
    }
  }

  if (!modelResult) {
    const outputModelPath =
      forceRetrain && hasCanonicalArtifact
        ? buildRerunModelPath(getBusinessModelDir(modelDir, companyId), BUSINESS_REVENUE_FORECAST_NAME)
        : modelPath;

    await ensureDir(path.dirname(outputModelPath));

    const trainResult = await runPython(REVENUE_MODEL_SCRIPT_PATHS.train, {
      dates,
      revenues,
      horizon,
      series_name: BUSINESS_REVENUE_FORECAST_NAME,
      display_name: 'Business Sales Revenue',
      output_path: outputModelPath,
    });
    if (!trainResult.success) {
      throw new Error(`Training failed: ${trainResult.error}`);
    }

    savedModelPath = String(trainResult.saved_model_path);
    if (!isPathInsideDir(savedModelPath, modelDir)) {
      throw new Error(`Saved revenue model path mismatch: expected artifact under ${modelDir}, got ${savedModelPath}`);
    }

    const predictedResult = await runPython(REVENUE_MODEL_SCRIPT_PATHS.predict, {
      model_path: savedModelPath,
      horizon,
    });
    if (!predictedResult.success) {
      throw new Error(`Saved model forecast failed: ${predictedResult.error}`);
    }

    const predictedPath = String(predictedResult.model_info?.saved_model_path ?? savedModelPath);
    if (!isPathInsideDir(predictedPath, modelDir)) {
      throw new Error(`Saved revenue model path mismatch: expected artifact under ${modelDir}, got ${predictedPath}`);
    }

    modelResult = predictedResult;
  } else {
    savedModelPath = String(modelResult.model_info?.saved_model_path ?? modelPath);
  }

  const mergedModelInfo = {
    ...(modelResult.model_info ?? {}),
    saved_model_path: savedModelPath,
    from_cache: loadedFromCache,
  };
  const filteredForecasts = keepFutureForecasts(
    Array.isArray(modelResult.forecasts) ? modelResult.forecasts : [],
    dates[dates.length - 1],
  ).slice(0, Number(horizon));

  return {
    dates,
    revenues,
    classResult,
    algorithm,
    modelDir,
    modelPath,
    savedModelPath,
    loadedFromCache,
    mergedModelInfo,
    filteredForecasts,
  };
}

// Helper: run a Python script, pass JSON via stdin, get JSON from stdout
function runPython(scriptPath: string, payload: object): Promise<any> {
  return new Promise((resolve) => {
    const proc = spawn(PYTHON_BIN, [scriptPath]);
    let settled = false;
    let stdout = '', stderr = '';
    const finish = (result: any) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', (err) => {
      finish({ success: false, error: `Failed to start Python: ${err.message}` });
    });
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      finish({ success: false, error: 'Python script timed out' });
    }, PYTHON_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (!stdout.trim()) {
        finish({ success: false, error: stderr || `Exit code ${code}` });
        return;
      }
      try {
        finish(JSON.parse(stdout.trim()));
      } catch {
        finish({ success: false, error: `Bad output: ${stdout.slice(0, 200)}` });
      }
    });
  });
}

// POST /api/forecast/train
// Body: { company_id, product_name, horizon? }
// Trains the appropriate forecasting model and saves a .pkl artifact.
app.post('/api/forecast/train', async (req: any, res: any) => {
  const { company_id, product_name, horizon = 6 } = req.body;
  if (!company_id || !product_name) {
    return res.status(400).json({ error: 'company_id and product_name required' });
  }

  try {
    const forecastResult = await getOrTrainForecastArtifact(
      Number(company_id),
      String(product_name),
      Number(horizon),
      true,
    );

    return res.json({
      product_name,
      algorithm: forecastResult.algorithm,
      demand_type: forecastResult.classResult.demandType,
      adi: forecastResult.classResult.adi,
      cv2: forecastResult.classResult.cv2,
      saved_model_path: forecastResult.savedModelPath,
      forecasts: forecastResult.filteredForecasts,
      model_info: forecastResult.mergedModelInfo,
      history: forecastResult.sortedKeys.map((k, i) => ({ period: k, actual: forecastResult.quantities[i] })),
    });
  } catch (err: any) {
    console.error('[Forecast Train Error]', err);
    return res.status(err.message?.startsWith('No sales history') ? 404 : 400).json({ error: err.message });
  }
});

// POST /api/forecast
// Body: { company_id, product_name, horizon?, force_retrain? }
// 1. Pulls monthly sales totals for product from sales_reports
// 2. Classifies demand (ADI/CV²) → picks ARIMA_XGB or TSB_XGB
// 3. Reuses the matching saved .pkl artifact when available
// 4. Retrains only when forced, missing, or invalid
// 5. Saves results to predictions table and returns forecasts + model info
app.post('/api/forecast', async (req: any, res: any) => {
  const { company_id, product_name, horizon = 6, force_retrain = false } = req.body;
  if (!company_id || !product_name) {
    return res.status(400).json({ error: 'company_id and product_name required' });
  }

  try {
    const forecastResult = await getOrTrainForecastArtifact(
      Number(company_id),
      String(product_name),
      Number(horizon),
      Boolean(force_retrain),
    );

    // Log retrain events to server console for observability
    if (!forecastResult.loadedFromCache && forecastResult.mergedModelInfo.retrained) {
      const improved = forecastResult.mergedModelInfo.retrain_improved;
      console.log(
        `[Forecast Retrain] company=${company_id} | ${product_name} | ${forecastResult.algorithm}` +
        ` | initial MAPE: ${forecastResult.mergedModelInfo.initial_mape}%` +
        ` | final MAPE: ${forecastResult.mergedModelInfo.mape}%` +
        ` | improved: ${improved}`
      );
    }

    // 5. Upsert forecast rows into predictions table
    // Find or derive product_id from inventory
    const inventoryItem = await prisma.inventory.findFirst({
      where: { company_id: Number(company_id), product_name: String(product_name) },
      select: { product_id: true }
    });

    // Delete old predictions for this product+company before re-inserting
    if (inventoryItem) {
      await prisma.predictions.deleteMany({
        where: { company_id: Number(company_id), product_id: inventoryItem.product_id }
      });
    }

    for (const fc of forecastResult.filteredForecasts as ForecastItem[]) {
      const priority =
        (forecastResult.mergedModelInfo.mape ?? 0) <= 10 ? 'Low'
        : (forecastResult.mergedModelInfo.mape ?? 0) <= 20 ? 'Medium'
        : 'High';

      await prisma.predictions.create({
        data: {
          company_id:          Number(company_id),
          product_id:          inventoryItem?.product_id ?? null,
          forecast_date:       new Date(fc.period + '-01'),
          predicted_quantity:  fc.predicted,
          confidence_interval: fc.predicted > 0 && fc.upper !== null && fc.lower !== null
            ? Number(((fc.upper - fc.predicted) / fc.predicted * 100).toFixed(2))
            : null,
          recommendation_priority: priority as any,
        }
      });
    }

    // 6. Respond with everything the frontend needs
    return res.json({
      product_name,
      algorithm:    forecastResult.algorithm,
      demand_type:  forecastResult.classResult.demandType,
      adi:          forecastResult.classResult.adi,
      cv2:          forecastResult.classResult.cv2,
      forecasts:    forecastResult.filteredForecasts,
      model_info:   forecastResult.mergedModelInfo,
      history: forecastResult.sortedKeys.map((k, i) => ({ period: k, actual: forecastResult.quantities[i] }))
    });

  } catch (err: any) {
    console.error('[Forecast Error]', err);
    return res.status(err.message?.startsWith('No sales history') ? 404 : 400).json({ error: err.message });
  }
});

// GET /api/forecast?company_id=X&product_name=Y
// Returns the most recently stored predictions for a product (no recompute)
app.get('/api/forecast', async (req: any, res: any) => {
  const company_id   = parseInt(req.query.company_id as string);
  const product_name = req.query.product_name as string;

  if (!company_id || !product_name) {
    return res.status(400).json({ error: 'company_id and product_name required' });
  }

  try {
    const inventoryItem = await prisma.inventory.findFirst({
      where: { company_id, product_name },
      select: { product_id: true }
    });

    const preds = await prisma.predictions.findMany({
      where: {
        company_id,
        ...(inventoryItem ? { product_id: inventoryItem.product_id } : {})
      },
      orderBy: { forecast_date: 'asc' }
    });

    // Also pull history for the chart
    const rawSales = await prisma.sales_reports.findMany({
      where: { company_id, product_name },
      orderBy: { date: 'asc' },
      select: { date: true, quantity: true }
    });
    const { dates, quantities } = buildMonthlySeries(rawSales);
    const history = dates.map((period, index) => ({ period, actual: quantities[index] }));

    return res.json({ forecasts: preds, history });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/forecast/accuracy?company_id=X
// Computes overall MAPE across all products by comparing stored predictions
// to actual sales_reports. Used by the Dashboard confidence indicator.
app.get('/api/forecast/accuracy', async (req: any, res: any) => {
  const company_id = parseInt(req.query.company_id as string);
  if (!company_id) return res.status(400).json({ error: 'company_id required' });

  try {
    const preds = await prisma.predictions.findMany({
      where: { company_id },
      select: { forecast_date: true, predicted_quantity: true, product_id: true }
    });

    if (!preds.length) return res.json({ accuracy: null, mape: null, pairs: 0 });

    // Pull actual sales, aggregated monthly
    const allSales = await prisma.sales_reports.findMany({
      where: { company_id },
      select: { date: true, quantity: true, product_name: true }
    });

    // Build map: productId -> { period -> actual_qty }
    const inventoryItems = await prisma.inventory.findMany({
      where: { company_id },
      select: { product_id: true, product_name: true }
    });
    const pidToName: Record<number, string> = {};
    inventoryItems.forEach(i => { pidToName[i.product_id] = i.product_name; });

    const salesMap: Record<string, Record<string, number>> = {}; // productName -> period -> qty
    allSales.forEach(s => {
      const pname = s.product_name ?? '';
      const d = new Date(s.date);
      const period = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!salesMap[pname]) salesMap[pname] = {};
      salesMap[pname][period] = (salesMap[pname][period] ?? 0) + Number(s.quantity);
    });

    let mapeSum = 0, count = 0;
    for (const pred of preds) {
      if (!pred.product_id) continue;
      const pname = pidToName[pred.product_id];
      if (!pname) continue;
      const d = new Date(pred.forecast_date!);
      const period = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const actual = salesMap[pname]?.[period];
      if (actual === undefined || actual === 0) continue;
      const predicted = Number(pred.predicted_quantity ?? 0);
      mapeSum += Math.abs((actual - predicted) / actual);
      count++;
    }

    const mape     = count > 0 ? (mapeSum / count) * 100 : null;
    const accuracy = mape !== null ? Math.round(100 - mape) : null;
    return res.json({ accuracy, mape: mape ? Math.round(mape * 10) / 10 : null, pairs: count });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/forecast/revenue', async (req: any, res: any) => {
  const { company_id, horizon = 6, force_retrain = false } = req.body;
  if (!company_id) {
    return res.status(400).json({ error: 'company_id required' });
  }

  try {
    const forecastResult = await getOrTrainBusinessRevenueForecastArtifact(
      Number(company_id),
      Number(horizon),
      Boolean(force_retrain),
    );

    return res.json({
      series_name: 'Business Sales Revenue',
      algorithm: forecastResult.mergedModelInfo.algorithm,
      demand_type: forecastResult.mergedModelInfo.demand_type,
      adi: forecastResult.mergedModelInfo.adi,
      cv2: forecastResult.mergedModelInfo.cv2,
      forecasts: forecastResult.filteredForecasts,
      model_info: forecastResult.mergedModelInfo,
      history: forecastResult.dates.map((period, index) => ({ period, actual: forecastResult.revenues[index] })),
    });
  } catch (err: any) {
    console.error('[Revenue Forecast Error]', err);
    return res.status(err.message?.startsWith('No sales history') ? 404 : 400).json({ error: err.message });
  }
});

// ── Start server — must be LAST, after all routes are registered ──
app.listen(process.env.PORT, async () => {
    console.log(`Server running on port ${process.env.PORT}`);
    try {
        await prisma.$connect();
        console.log("Successfully connected to MySQL Database via Prisma.");
    } catch (error) {
        console.error("Database connection failed:", error);
    }
});
