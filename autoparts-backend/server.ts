import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Prisma, PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

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

        return res.status(200).json({ count: totalInserted });

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
// ═══════════════════════════════════════════════════════════════
// FORECAST ROUTES  — Python model integration
// ═══════════════════════════════════════════════════════════════

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PYTHON_BIN    = process.env.PYTHON_BIN ?? 'python3';
const PYTHON_DIR    = path.join(__dirname, 'python');
const PYTHON_TIMEOUT_MS = 90_000;

// Helper: run a Python script, pass JSON via stdin, get JSON from stdout
function runPython(scriptPath: string, payload: object): Promise<any> {
  return new Promise((resolve) => {
    const proc = spawn(PYTHON_BIN, [scriptPath]);
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({ success: false, error: 'Python script timed out' });
    }, PYTHON_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (!stdout.trim()) {
        resolve({ success: false, error: stderr || `Exit code ${code}` });
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        resolve({ success: false, error: `Bad output: ${stdout.slice(0, 200)}` });
      }
    });
  });
}

// POST /api/forecast
// Body: { company_id, product_name, horizon? }
// 1. Pulls monthly sales totals for product from sales_reports
// 2. Classifies demand (ADI/CV²) → picks ARIMA_XGB or TSB_XGB
// 3. Runs model, saves results to predictions table
// 4. Returns forecasts + model info
app.post('/api/forecast', async (req: any, res: any) => {
  const { company_id, product_name, horizon = 6 } = req.body;
  if (!company_id || !product_name) {
    return res.status(400).json({ error: 'company_id and product_name required' });
  }

  try {
    // 1. Pull ALL historical sales for this product, aggregated by month
    const rawSales = await prisma.sales_reports.findMany({
      where: { company_id: Number(company_id), product_name: String(product_name) },
      orderBy: { date: 'asc' },
      select: { date: true, quantity: true }
    });

    if (rawSales.length === 0) {
      return res.status(404).json({ error: 'No sales history found for this product' });
    }

    // Aggregate to monthly totals: { "2024-01": 120, ... }
    const monthMap: Record<string, number> = {};
    rawSales.forEach(r => {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = (monthMap[key] ?? 0) + Number(r.quantity);
    });
    const sortedKeys = Object.keys(monthMap).sort();
    const dates      = sortedKeys;
    const quantities = sortedKeys.map(k => monthMap[k]);

    // 2. Classify demand type
    const classResult = await runPython(
      path.join(PYTHON_DIR, 'utils/demand_classifier.py'),
      { quantities }
    );
    if (!classResult.success) {
      return res.status(500).json({ error: `Classification failed: ${classResult.error}` });
    }
    const algorithm: string = classResult.algorithm; // "ARIMA_XGB" or "TSB_XGB"

    // 3. Run the appropriate model
    const scriptPath = algorithm === 'ARIMA_XGB'
      ? path.join(PYTHON_DIR, 'models/arima_xgb_model.py')
      : path.join(PYTHON_DIR, 'models/tsb_xgb_model.py');

    const modelResult = await runPython(scriptPath, { dates, quantities, horizon });
    if (!modelResult.success) {
      return res.status(500).json({ error: `Model failed: ${modelResult.error}` });
    }

    // Log retrain events to server console for observability
    if (modelResult.model_info?.retrained) {
      const improved = modelResult.model_info.retrain_improved;
      console.log(
        `[Forecast Retrain] ${product_name} | ${algorithm}` +
        ` | initial MAPE: ${modelResult.model_info.initial_mape}%` +
        ` | final MAPE: ${modelResult.model_info.mape}%` +
        ` | improved: ${improved}`
      );
    }

    // 4. Upsert forecast rows into predictions table
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

    for (const fc of modelResult.forecasts) {
      const priority =
        (modelResult.model_info.mape ?? 0) <= 10 ? 'Low'
        : (modelResult.model_info.mape ?? 0) <= 20 ? 'Medium'
        : 'High';

      await prisma.predictions.create({
        data: {
          company_id:          Number(company_id),
          product_id:          inventoryItem?.product_id ?? null,
          forecast_date:       new Date(fc.period + '-01'),
          predicted_quantity:  fc.predicted,
          confidence_interval: fc.upper !== null && fc.lower !== null
            ? Number(((fc.upper - fc.predicted) / fc.predicted * 100).toFixed(2))
            : null,
          recommendation_priority: priority as any,
        }
      });
    }

    // 5. Respond with everything the frontend needs
    return res.json({
      product_name,
      algorithm,
      demand_type:  classResult.demandType,
      adi:          classResult.adi,
      cv2:          classResult.cv2,
      forecasts:    modelResult.forecasts,
      model_info:   modelResult.model_info, // includes retrained, retrain_improved, low_accuracy, initial_mape
      history: sortedKeys.map((k, i) => ({ period: k, actual: quantities[i] }))
    });

  } catch (err: any) {
    console.error('[Forecast Error]', err);
    return res.status(500).json({ error: err.message });
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
    const monthMap: Record<string, number> = {};
    rawSales.forEach(r => {
      const d = new Date(r.date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[k] = (monthMap[k] ?? 0) + Number(r.quantity);
    });
    const history = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, actual]) => ({ period, actual }));

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

// ── POST /api/seasonal ────────────────────────────────────────
// Body: { company_id, product_name? }
// Runs STL seasonal decomposition on monthly sales.
// If product_name is omitted, aggregates ALL products for the company.
app.post('/api/seasonal', async (req: any, res: any) => {
  const { company_id, product_name } = req.body;
  if (!company_id) return res.status(400).json({ error: 'company_id required' });

  try {
    const where: any = { company_id: Number(company_id) };
    if (product_name) where.product_name = String(product_name);

    const rawSales = await prisma.sales_reports.findMany({
      where,
      orderBy: { date: 'asc' },
      select: { date: true, quantity: true }
    });

    if (rawSales.length === 0) {
      return res.status(404).json({ error: 'No sales history found' });
    }

    // Aggregate to monthly totals
    const monthMap: Record<string, number> = {};
    rawSales.forEach(r => {
      const d   = new Date(r.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = (monthMap[key] ?? 0) + Number(r.quantity);
    });
    const sortedKeys = Object.keys(monthMap).sort();
    const dates      = sortedKeys;
    const quantities = sortedKeys.map(k => monthMap[k]);

    const scriptPath = path.join(PYTHON_DIR, 'models/seasonal_model.py');
    const result     = await runPython(scriptPath, { dates, quantities });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    return res.json({ ...result, product_name: product_name ?? null });
  } catch (err: any) {
    console.error('[Seasonal Error]', err);
    return res.status(500).json({ error: err.message });
  }
});
