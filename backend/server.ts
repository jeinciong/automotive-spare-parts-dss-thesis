import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Prisma, PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

dotenv.config();
const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

// Reaches both the API service and the database so deployment health checks
// only pass when the application is genuinely ready to handle requests.
app.get('/api/health', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'database_unavailable' });
  }
});

interface ForecastItem {
  period: string;
  predicted: number;
  upper: number | null;
  lower: number | null;
}

type RecommendationActionRow = {
  action_id: number;
  business_id: number;
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

app.get('/api/register/availability', async (req, res) => {
  const rawEmail = String(req.query.email ?? '').trim().toLowerCase();
  const rawBusinessName = String(req.query.businessName ?? '').trim();

  try {
    const [existingBusinessByEmail, existingUserByEmail, existingBusinessByName] = await Promise.all([
      rawEmail
        ? prisma.businesses.findFirst({ where: { email: rawEmail }, select: { business_id: true } })
        : Promise.resolve(null),
      rawEmail
        ? prisma.users.findFirst({ where: { email: rawEmail }, select: { user_id: true } })
        : Promise.resolve(null),
      rawBusinessName
        ? prisma.businesses.findFirst({ where: { business_name: rawBusinessName }, select: { business_id: true } })
        : Promise.resolve(null),
    ]);

    res.json({
      emailExists: Boolean(existingBusinessByEmail || existingUserByEmail),
      businessExists: Boolean(existingBusinessByName),
    });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to check registration availability', error: err.message });
  }
});

// Registration: Using Prisma to handle the business creation
app.post('/api/register', async (req, res) => {
  const { email, password, businessName, businessAddress } = req.body;
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  const normalizedBusinessName = String(businessName ?? '').trim();
  const normalizedBusinessAddress = String(businessAddress ?? '').trim();

  if (!normalizedEmail || !password || !normalizedBusinessName) {
    return res.status(400).json({ message: 'Email, password, and business name are required' });
  }

  try {
    const [existingBusinessByEmail, existingUserByEmail, existingBusinessByName] = await Promise.all([
      prisma.businesses.findFirst({ where: { email: normalizedEmail }, select: { business_id: true } }),
      prisma.users.findFirst({ where: { email: normalizedEmail }, select: { user_id: true } }),
      prisma.businesses.findFirst({ where: { business_name: normalizedBusinessName }, select: { business_id: true } }),
    ]);

    if (existingBusinessByName) {
      return res.status(409).json({ message: 'A business account with this business name already exists' });
    }

    if (existingBusinessByEmail || existingUserByEmail) {
      return res.status(409).json({ message: 'This email is already registered in the system' });
    }

    const business = await prisma.businesses.create({
      data: {
        business_name: normalizedBusinessName,
        business_address: normalizedBusinessAddress || "Main Office",
        email: normalizedEmail,
        password_hash: password
      }
    });
    res.status(200).json({
      role: 'admin',
      business_id: business.business_id,
      email: normalizedEmail,
      user_name: business.business_name,
      business_address: business.business_address
    });
  } catch (err: any) {
    res.status(500).json({ message: "Registration failed: " + err.message });
  }
});

// Login: Checking both tables using Prisma's findFirst
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email ?? '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    // Check both account types concurrently. Staff login previously waited for
    // the owner query to finish before its own database request even started.
    const [owner, staff] = await Promise.all([
      prisma.businesses.findFirst({
        where: { email: normalizedEmail, password_hash: password },
        select: {
          business_id: true,
          email: true,
          business_name: true,
          business_address: true,
        },
      }),
      prisma.users.findFirst({
        where: { email: normalizedEmail, password_hash: password },
        select: {
          user_id: true,
          business_id: true,
          email: true,
          full_name: true,
        },
      }),
    ]);

    if (owner) {
      return res.json({
        role: 'admin',
        business_id: owner.business_id,
        email: owner.email,
        user_name: owner.business_name,
        business_address: owner.business_address,
      });
    }

    if (staff) {
      return res.json({
        role: 'staff', business_id: staff.business_id, email: staff.email, user_id: staff.user_id, user_name: staff.full_name
      });
    }

    res.status(401).json({ message: "Invalid email or password" });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).json({ message: 'Login service is temporarily unavailable' });
  }
});

// --- INVENTORY ROUTES ---

// Fetch Inventory
app.get('/api/inventory', async (req, res) => {
  const business_id = parseInt(req.query.business_id as string);
  try {
    const inventory = await prisma.inventory.findMany({
      where: { business_id: business_id }
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
    status, user_id, user_name, role, business_id,
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
        business_id: Number(business_id),
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
    const { product_name, category, current_stock, min_stock, unit_cost, sku, supplier, location, status, business_id } = req.body;

    const newProduct = await prisma.inventory.create({
      data: {
        product_name,
        category,
        sku,
        supplier,
        location,
        status,
        business_id: Number(business_id),
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

app.post('/api/verify-password', async (req: any, res: any) => {
  const { business_id, password, role, user_id, account_name } = req.body;
  const normalizedAccountName = typeof account_name === 'string' ? account_name.trim() : '';

  if (!password || (!business_id && !user_id)) {
    return res.status(400).json({ valid: false, error: 'Account and password are required.' });
  }

  try {
    if (role === 'staff') {
      const user = await prisma.users.findFirst({
        where: {
          user_id: Number(user_id),
          password_hash: password,
          ...(normalizedAccountName ? { full_name: normalizedAccountName } : {})
        }
      });
      return res.json({ valid: !!user });
    } else {
      const business = await prisma.businesses.findFirst({
        where: {
          business_id: Number(business_id),
          password_hash: password,
          ...(normalizedAccountName ? { business_name: normalizedAccountName } : {})
        }
      });
      return res.json({ valid: !!business });
    }
  } catch (err: any) {
    console.error('Password verification failed:', err);
    return res.status(500).json({ valid: false, error: 'Unable to verify credentials.' });
  }
});

// Create Staff Member
app.post('/api/team', async (req, res) => {
  const { fullName, email, password, business_id } = req.body;
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  const normalizedFullName = String(fullName ?? '').trim();
  try {
    const [existingUserByEmail, existingBusinessByEmail, existingUserByName] = await Promise.all([
      prisma.users.findUnique({ where: { email: normalizedEmail } }),
      prisma.businesses.findFirst({ where: { email: normalizedEmail } }),
      prisma.users.findFirst({ where: { full_name: normalizedFullName } })
    ]);

    if (existingUserByEmail || existingBusinessByEmail) {
      return res.status(409).json({ message: "This email is already registered in the system." });
    }
    if (existingUserByName) {
      return res.status(409).json({ message: "A staff member with this name already exists in the system." });
    }

    const newUser = await prisma.users.create({
      data: {
        full_name: normalizedFullName,
        email: normalizedEmail,
        password_hash: password,
        business_id: Number(business_id),
        role: 'Business'
      }
    });
    res.status(200).json(newUser);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to create staff: " + err.message });
  }
});

// Check Team Member Availability
app.get('/api/team/availability', async (req, res) => {
  const email = String(req.query.email ?? '').trim().toLowerCase();
  const fullName = String(req.query.fullName ?? '').trim();
  const userId = req.query.excludeUserId ? Number(req.query.excludeUserId) : undefined;

  try {
    const [existingUserByEmail, existingBusinessByEmail, existingUserByName] = await Promise.all([
      email
        ? prisma.users.findFirst({
            where: {
              email,
              ...(userId ? { NOT: { user_id: userId } } : {})
            },
            select: { user_id: true }
          })
        : Promise.resolve(null),
      email
        ? prisma.businesses.findFirst({ where: { email }, select: { business_id: true } })
        : Promise.resolve(null),
      fullName
        ? prisma.users.findFirst({
            where: {
              full_name: fullName,
              ...(userId ? { NOT: { user_id: userId } } : {})
            },
            select: { user_id: true }
          })
        : Promise.resolve(null)
    ]);

    res.json({
      emailExists: Boolean(existingUserByEmail || existingBusinessByEmail),
      nameExists: Boolean(existingUserByName)
    });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to check team availability', error: err.message });
  }
});

// Fetch Team Members
app.get('/api/team', async (req, res) => {
  const business_id = parseInt(req.query.business_id as string);
  try {
    const team = await prisma.users.findMany({
      where: { business_id }
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
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  const normalizedFullName = String(fullName ?? '').trim();
  try {
    const [existingUserByEmail, existingBusinessByEmail, existingUserByName] = await Promise.all([
      prisma.users.findFirst({ where: { email: normalizedEmail, NOT: { user_id: id } } }),
      prisma.businesses.findFirst({ where: { email: normalizedEmail } }),
      prisma.users.findFirst({ where: { full_name: normalizedFullName, NOT: { user_id: id } } })
    ]);

    if (existingUserByEmail || existingBusinessByEmail) {
      return res.status(409).json({ message: "This email is already registered in the system." });
    }
    if (existingUserByName) {
      return res.status(409).json({ message: "A staff member with this name already exists in the system." });
    }

    const updatedStaff = await prisma.users.update({
      where: { user_id: id },
      data: {
        full_name: normalizedFullName,
        email: normalizedEmail,
        role: role
      }
    });
    res.json(updatedStaff);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: "Failed to update staff: " + err.message });
  }
});

// delete staff member
app.delete('/api/team/:id', async (req, res) => {
  const id = Number(req.params.id);
  const bodyPassword = req.body?.password;
  const headerPassword = req.headers['x-password'] ? decodeURIComponent(req.headers['x-password'] as string) : undefined;
  const password = bodyPassword || headerPassword;

  try {
    const staff = await prisma.users.findUnique({
      where: { user_id: id }
    });

    if (!staff) {
      return res.status(404).json({ error: "Staff member not found" });
    }

    const business = await prisma.businesses.findUnique({
      where: { business_id: staff.business_id }
    });

    if (!business) {
      return res.status(404).json({ error: "Associated business not found" });
    }

    if (business.password_hash !== password) {
      return res.status(401).json({ error: "Incorrect business account password" });
    }

    await prisma.users.delete({
      where: { user_id: id }
    });
    res.json({ message: "Staff member deleted" });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete staff member: " + err.message });
  }
});

// GET: Fetch sales for a business
app.get('/api/sales', async (req, res) => {
  const business_id = parseInt(req.query.business_id as string);
  if (!business_id) {
    return res.status(400).json({ error: 'business_id required' });
  }

  try {
    const sales = await prisma.sales_reports.findMany({
      where: { business_id: business_id },
      orderBy: { date: 'desc' } // Changed from report_date to date
    });
    res.json(sales);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Bulk Add/Import Sales
app.post('/api/sales', async (req: any, res: any) => {
  const CHUNK_SIZE = 500;

  try {
    const { reports } = req.body;
    if (!Array.isArray(reports) || reports.length === 0) {
      return res.status(400).json({ error: 'reports array is required' });
    }

    const businessId = Number(req.body.business_id ?? reports[0]?.business_id);
    if (!Number.isInteger(businessId) || businessId <= 0) {
      return res.status(400).json({ error: 'business_id required' });
    }

    const hasMismatchedBusiness = reports.some((r: any) => {
      const rowBusinessId = Number(r.business_id ?? businessId);
      return rowBusinessId !== businessId;
    });
    if (hasMismatchedBusiness) {
      return res.status(400).json({ error: 'All sales reports must match the logged-in business_id' });
    }

    let totalInserted = 0;

    // insert sales in chunks (no inventory check yet)
    for (let i = 0; i < reports.length; i += CHUNK_SIZE) {
      const chunk = reports.slice(i, i + CHUNK_SIZE);

      await prisma.$transaction(
        async (tx) => {
          await tx.sales_reports.createMany({
            data: chunk.map((r: any) => ({
              business_id: businessId,
              date: new Date(r.date),
              order_number: String(r.order_number || `IMP-${Date.now()}-${i}`),
              product_name: r.product_name,
              category: r.category,
              customer_type: r.customer_type || 'Walk-in',
              quantity: Number(r.quantity),
              unit_price: Number(r.unit_price),
              other_expenses: Number(r.other_expenses ?? 0),
              total_amount: Number(r.total_amount),
              payment_method: r.payment_method || 'Cash',
              status: r.status || 'Completed',
            })),
            skipDuplicates: false,
          });
          totalInserted += chunk.length;
        },
        { timeout: 60_000 }   // 60 s per chunk — safe for large batches
      );
    }

    // update inventory in one aggregated pass
    // Sum quantities sold per (product_name, business_id) across all reports
    const soldMap: Record<string, number> = {};
    for (const r of reports) {
      const key = String(r.product_name);
      soldMap[key] = (soldMap[key] ?? 0) + Number(r.quantity);
    }

    for (const [productName, qtySum] of Object.entries(soldMap)) {
      const invItem = await prisma.inventory.findFirst({
        where: { product_name: productName, business_id: businessId },
      });
      if (!invItem) continue;

      const newStock = (Number(invItem.current_stock) || 0) - qtySum;
      if (newStock < 0) continue;   // skip rather than error on bulk import

      const minStock = Number(invItem.min_stock) || 0;
      const newStatus =
        newStock <= minStock ? 'Critical' :
          newStock <= minStock * 1.25 ? 'Low_Stock' : 'In_Stock';

      await prisma.inventory.update({
        where: { product_id: invItem.product_id },
        data: { current_stock: newStock, status: newStatus as any },
      });
    }

    // Run model training asynchronously in the background so it doesn't block the response
    setTimeout(async () => {
      for (const productName of Object.keys(soldMap)) {
        try {
          await getOrTrainForecastArtifact(businessId, productName, 6, false);
        } catch (err: any) {
          console.error(`Background training failed for ${productName}:`, err.message);
        }
      }
    }, 0);

    return res.status(200).json({ count: totalInserted, message: 'Import successful. Models are training in the background.' });

  } catch (err: any) {
    console.error('Import Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// UPDATE a sale
app.put('/api/sales/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { productName, quantity, business_id, reportDate, orderNumber, category, unitPrice, otherExpenses, totalAmount, customerName, paymentMethod, status } = req.body;
  const businessId = Number(business_id);

  if (!Number.isInteger(businessId) || businessId <= 0) {
    return res.status(400).json({ error: 'business_id required' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Get the current sale record before updating it
      const oldSale = await tx.sales_reports.findFirst({
        where: { report_id: id, business_id: businessId }
      });

      if (!oldSale) throw new Error("Sale record not found for this business");

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
          other_expenses: Number(otherExpenses),
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
          business_id: businessId
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

app.delete('/api/sales/all', async (req, res) => {
  const businessId = Number(req.query.business_id ?? req.body?.business_id);

  if (!Number.isInteger(businessId) || businessId <= 0) {
    return res.status(400).json({ error: 'business_id required' });
  }

  try {
    // Delete recommendation_actions first (they may reference predictions)
    await prisma.recommendation_actions.deleteMany({
      where: { business_id: businessId }
    });

    // Delete predictions
    await prisma.predictions.deleteMany({
      where: { business_id: businessId }
    });

    // Now safe to delete sales
    const result = await prisma.sales_reports.deleteMany({
      where: { business_id: businessId }
    });

    res.json({
      message: 'All sales deleted',
      count: result.count
    });
  } catch (err: any) {
    console.error("Delete All Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE a sale
app.delete('/api/sales/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const businessId = Number(req.query.business_id ?? req.body?.business_id);

  if (!Number.isInteger(businessId) || businessId <= 0) {
    return res.status(400).json({ error: 'business_id required' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Find the sale record first so we know what to "refund"
      const saleToDelete = await tx.sales_reports.findFirst({
        where: { report_id: id, business_id: businessId }
      });

      if (!saleToDelete) throw new Error("Sale not found for this business");

      //  Delete the sale record
      await tx.sales_reports.delete({
        where: { report_id: id }
      });

      // Find the product in inventory
      const inventoryItem = await tx.inventory.findFirst({
        where: {
          product_name: saleToDelete.product_name ?? "",
          business_id: saleToDelete.business_id ?? 0
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
  const business_id = parseInt(req.query.business_id as string);
  try {
    const suppliers = await prisma.suppliers.findMany({
      where: { business_id: business_id },
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
    const { business_id, supplier_name, category, location, contact_email, contact_number, rating, status, delivery_time } = req.body;

    const newSupplier = await prisma.suppliers.create({
      data: {
        business_id: Number(business_id),
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
  const { business_id, supplier_id, total_amount, order_date } = req.body;
  try {
    const newOrder = await prisma.purchase_orders.create({
      data: {
        business_id: Number(business_id),
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
  const business_id = parseInt(req.query.business_id as string);
  try {
    const orders = await prisma.purchase_orders.findMany({
      where: { business_id },
      include: { suppliers: true },
      orderBy: { order_date: 'desc' }
    });
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// settings
// GET Business Info
app.get('/api/business/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const business = await prisma.businesses.findUnique({
      where: { business_id: Number(id) }
    });
    if (!business) return res.status(404).json({ error: "Business not found" });
    res.json(business);
  } catch (err) { res.status(500).send(err); }
});

// Update Business Info
app.put('/api/business/:id', async (req, res) => {
  const { id } = req.params;
  const { business_name, email, business_address } = req.body;
  try {
    const updated = await prisma.businesses.update({
      where: { business_id: Number(id) },
      data: { business_name, email, business_address }
    });
    res.json(updated);
  } catch (err) { res.status(500).send(err); }
});

// Update Password with Old Password Check
app.put('/api/change-password/:id', async (req, res) => {
  const { id } = req.params;
  const { oldPassword, newPassword, isStaff } = req.body;
  try {
    const table = isStaff ? prisma.users : prisma.businesses;
    const user = await (table as any).findFirst({
      where: { [isStaff ? 'user_id' : 'business_id']: Number(id), password_hash: oldPassword }
    });

    if (!user) return res.status(401).json({ message: "Incorrect old password" });

    await (table as any).update({
      where: { [isStaff ? 'user_id' : 'business_id']: Number(id) },
      data: { password_hash: newPassword }
    });
    res.json({ message: "Password updated" });
  } catch (err) { res.status(500).send(err); }
});

// Delete Whole Business Account (Danger Zone)
app.delete('/api/business/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const bodyPassword = req.body?.password;
    const headerPassword = req.headers['x-password'] ? decodeURIComponent(req.headers['x-password'] as string) : undefined;
    const password = bodyPassword || headerPassword;

    const business = await prisma.businesses.findUnique({
      where: { business_id: id }
    });

    if (!business) {
      return res.status(404).json({ error: "Business account not found" });
    }

    if (business.password_hash !== password) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    // Delete prediction artifacts linked to the account
    const arimaDir = path.join(process.cwd(), 'python/trained_models/arima_xgb', `business_${id}`);
    const tsbDir = path.join(process.cwd(), 'python/trained_models/tsb_xgb', `business_${id}`);

    try {
      await fs.rm(arimaDir, { recursive: true, force: true });
      await fs.rm(tsbDir, { recursive: true, force: true });
    } catch (fsErr) {
      console.warn(`Could not delete artifacts for business_${id}:`, fsErr);
    }

    await prisma.$transaction([
      //Delete all leaf-level records first
      prisma.activity_logs.deleteMany({ where: { business_id: id } }),
      prisma.predictions.deleteMany({ where: { business_id: id } }),
      prisma.recommendation_actions.deleteMany({ where: { business_id: id } }),
      prisma.sales_reports.deleteMany({ where: { business_id: id } }),

      //Delete POs before Suppliers (because POs depend on Suppliers)
      prisma.purchase_orders.deleteMany({ where: { business_id: id } }),
      prisma.suppliers.deleteMany({ where: { business_id: id } }),

      prisma.inventory.deleteMany({ where: { business_id: id } }),
      prisma.users.deleteMany({ where: { business_id: id } }),
      prisma.businesses.delete({ where: { business_id: id } }),
    ]);

    res.json({ message: "Account and all associated data deleted" });
  } catch (err) {
    console.error("Delete Business Error:", err);
    res.status(500).json({ error: "Failed to delete account. Ensure all dependencies are cleared." });
  }
});

app.get('/api/export-all', async (req, res) => {
  const business_id = parseInt(req.query.business_id as string);

  if (!business_id) return res.status(400).json({ error: "business ID required" });

  try {
    const [inventory, sales, suppliers, team] = await prisma.$transaction([
      prisma.inventory.findMany({ where: { business_id } }),
      prisma.sales_reports.findMany({ where: { business_id } }),
      prisma.suppliers.findMany({ where: { business_id } }),
      prisma.users.findMany({ where: { business_id } })
    ]);

    res.json({
      export_info: {
        timestamp: new Date().toISOString(),
        business_id: business_id
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
  const business_id = Number(req.query.business_id);
  if (!business_id) {
    return res.status(400).json({ error: 'business_id required' });
  }

  try {
    await ensureRecommendationActionStorage();
    const rows = await prisma.$queryRawUnsafe<RecommendationActionRow[]>(
      `SELECT action_id, business_id, prediction_id, action_taken, status, executed_at,
              recommendation_key, product_name, priority, title, description,
              recommended_action, impact, generated_at, updated_at, completed_at, action_history
         FROM recommendation_actions
        WHERE business_id = ?
        ORDER BY FIELD(status, 'Pending', 'Done', 'Cancelled'), updated_at DESC, executed_at DESC`,
      business_id
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
  const { business_id, recommendations = [] } = req.body;
  if (!business_id) {
    return res.status(400).json({ error: 'business_id required' });
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
          WHERE business_id = ?
            AND recommendation_key = ?
          ORDER BY action_id DESC
          LIMIT 1`,
        Number(business_id),
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
             (business_id, recommendation_key, product_name, priority, title, description,
              recommended_action, impact, status, generated_at, updated_at, action_history)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', NOW(), NOW(), ?)`,
          Number(business_id),
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
      `SELECT action_id, business_id, prediction_id, action_taken, status, executed_at,
              recommendation_key, product_name, priority, title, description,
              recommended_action, impact, generated_at, updated_at, completed_at, action_history
         FROM recommendation_actions
        WHERE business_id = ?
        ORDER BY FIELD(status, 'Pending', 'Done', 'Cancelled'), updated_at DESC, executed_at DESC`,
      Number(business_id)
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
  const { business_id, action_taken } = req.body;
  if (!actionId || !business_id) {
    return res.status(400).json({ error: 'action id and business_id required' });
  }

  try {
    await ensureRecommendationActionStorage();
    const rows = await prisma.$queryRawUnsafe<RecommendationActionRow[]>(
      `SELECT action_id, title, recommended_action, action_history
         FROM recommendation_actions
        WHERE action_id = ?
          AND business_id = ?
        LIMIT 1`,
      actionId,
      Number(business_id)
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
          AND business_id = ?`,
      String(action_taken ?? rows[0].recommended_action ?? 'Completed'),
      JSON.stringify(history),
      actionId,
      Number(business_id)
    );

    const updated = await prisma.$queryRawUnsafe<RecommendationActionRow[]>(
      `SELECT action_id, business_id, prediction_id, action_taken, status, executed_at,
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

const PYTHON_BIN = process.env.PYTHON_BIN ?? (process.platform === 'win32' ? 'python' : 'python3');
const PYTHON_DIR = path.join(process.cwd(), 'python');
const PYTHON_TIMEOUT_MS = 90_000;
const TRAINED_MODELS_DIR = path.join(PYTHON_DIR, 'trained_models');
const FORECAST_MIN_OBS = 12;
const BUSINESS_REVENUE_FORECAST_NAME = 'monthly_total_revenue';
const REVENUE_SHARED_PRELOAD_LOOKAHEAD_MONTHS = 120;
const PRODUCT_SHARED_PRELOAD_LOOKAHEAD_MONTHS = 120;
const inFlightProductForecasts = new Map<string, Promise<any>>();
const inFlightRevenueForecasts = new Map<string, Promise<any>>();

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

function getProductForecastArtifact(
  businessId: number,
  productName: string,
  horizon: number,
  forceRetrain: boolean,
) {
  const key = `${businessId}:${productName.trim().toLowerCase()}:${horizon}:${forceRetrain ? 'force' : 'normal'}`;
  const existing = inFlightProductForecasts.get(key);
  if (existing) return existing;

  const request = getOrTrainForecastArtifact(businessId, productName, horizon, forceRetrain)
    .finally(() => {
      if (inFlightProductForecasts.get(key) === request) {
        inFlightProductForecasts.delete(key);
      }
    });
  inFlightProductForecasts.set(key, request);
  return request;
}

function getBusinessRevenueForecastArtifact(
  businessId: number,
  horizon: number,
  forceRetrain: boolean,
) {
  const key = `${businessId}:${horizon}:${forceRetrain ? 'force' : 'normal'}`;
  const existing = inFlightRevenueForecasts.get(key);
  if (existing) return existing;

  const request = getOrTrainBusinessRevenueForecastArtifact(businessId, horizon, forceRetrain)
    .finally(() => {
      if (inFlightRevenueForecasts.get(key) === request) {
        inFlightRevenueForecasts.delete(key);
      }
    });
  inFlightRevenueForecasts.set(key, request);
  return request;
}

function slugifyProductName(productName: string): string {
  return productName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'forecast_model';
}

const FORECAST_CACHE_DIR = path.join(TRAINED_MODELS_DIR, 'forecast_cache');

function getForecastCachePath(businessId: number, productName: string) {
  return path.join(FORECAST_CACHE_DIR, `business_${businessId}`, `${slugifyProductName(productName)}.json`);
}

function getRevenueForecastCachePath(businessId: number) {
  return path.join(FORECAST_CACHE_DIR, `business_${businessId}`, 'business_revenue_forecast.json');
}

function classifyDemand(quantities: number[]) {
  const arr = quantities.map(Number);
  const n = arr.length;
  const nz = arr.filter(q => q > 0);
  if (nz.length === 0) {
    return {
      success: true,
      adi: Infinity,
      cv2: 0.0,
      demandType: 'INTERMITTENT',
      algorithm: 'TSB_XGB' as const,
    };
  }
  const adi = n / nz.length;
  const mean_nz = nz.reduce((a, b) => a + b, 0) / nz.length;
  const std_nz = nz.length > 1
    ? Math.sqrt(nz.reduce((a, b) => a + Math.pow(b - mean_nz, 2), 0) / (nz.length - 1))
    : 0.0;
  const cv2 = mean_nz > 0 ? Math.pow(std_nz / mean_nz, 2) : 0.0;
  const high_adi = adi >= 1.32;
  const high_cv2 = cv2 >= 0.49;
  let dt: string, algo: 'ARIMA_XGB' | 'TSB_XGB';
  if (!high_adi && !high_cv2) {
    dt = 'SMOOTH'; algo = 'ARIMA_XGB';
  } else if (!high_adi && high_cv2) {
    dt = 'ERRATIC'; algo = 'ARIMA_XGB';
  } else if (high_adi && !high_cv2) {
    dt = 'INTERMITTENT'; algo = 'TSB_XGB';
  } else {
    dt = 'LUMPY'; algo = 'TSB_XGB';
  }
  return {
    success: true,
    adi: Number(adi.toFixed(4)),
    cv2: Number(cv2.toFixed(4)),
    demandType: dt,
    algorithm: algo,
  };
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
  const modelDir = await resolveBusinessModelDir(MODEL_SCRIPT_PATHS[algorithm].dir, businessId);
  const modelPath = path.join(modelDir, `${BUSINESS_REVENUE_FORECAST_NAME}.pkl`);

  if (await fileExists(modelPath)) {
    return { modelDir, modelPath };
  }

  const candidateDirs = [
    modelDir,
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

async function cacheSharedArtifactToBusinessPath(sharedModelPath: string, businessModelPath: string) {
  if (normalizePathForCompare(sharedModelPath) === normalizePathForCompare(businessModelPath)) {
    return businessModelPath;
  }

  await ensureDir(path.dirname(businessModelPath));
  await fs.copyFile(sharedModelPath, businessModelPath);
  return businessModelPath;
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

/**
 * Returns the signed number of months between two YYYY-MM period strings.
 * Positive when \to\ is later than \from\.
 */
function monthsDiff(from: string | undefined | null, to: string | undefined | null): number {
  if (!from || !to) return 0;
  const parseYM = (s: string) => { const m = /^(\d{4})-(\d{2})$/.exec(s); return m ? { y: +m[1], mo: +m[2] } : null; };
  const a = parseYM(from);
  const b = parseYM(to);
  if (!a || !b) return 0;
  return (b.y - a.y) * 12 + (b.mo - a.mo);
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

function buildMonthlySeries(rawSales: Array<{ date: Date; quantity: number | bigint | null }>, customEndDate?: Date) {
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
  const dbLastDate = new Date(rawSales[rawSales.length - 1].date);
  const lastDate = (customEndDate && customEndDate > dbLastDate) ? customEndDate : dbLastDate;
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

function buildMonthlyRevenueSeries(rawSales: Array<{ date: Date; total_amount: Prisma.Decimal | number | null }>, customEndDate?: Date) {
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
  const dbLastDate = new Date(rawSales[rawSales.length - 1].date);
  const lastDate = (customEndDate && customEndDate > dbLastDate) ? customEndDate : dbLastDate;
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

async function prepareForecastContext(businessId: number, productName: string): Promise<PreparedForecastContext> {
  const rawSales = await prisma.sales_reports.findMany({
    where: { business_id: businessId, product_name: productName },
    orderBy: { date: 'asc' },
    select: { date: true, quantity: true }
  });

  if (rawSales.length === 0) {
    throw new Error('No sales history found for this product');
  }

  const latestBusinessSale = await prisma.sales_reports.findFirst({
    where: { business_id: businessId },
    orderBy: { date: 'desc' },
    select: { date: true }
  });
  const customEndDate = latestBusinessSale ? new Date(latestBusinessSale.date) : undefined;

  const { dates, quantities } = buildMonthlySeries(rawSales, customEndDate);
  if (dates.length < FORECAST_MIN_OBS) {
    throw new Error(`Need >= ${FORECAST_MIN_OBS} monthly observations, got ${dates.length}`);
  }

  const classResult = classifyDemand(quantities);

  const algorithm = classResult.algorithm as ForecastAlgorithm;
  const scriptConfig = MODEL_SCRIPT_PATHS[algorithm];
  const { modelDir, modelPath } = await buildBusinessModelPath(scriptConfig, businessId, productName);

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
  businessId: number,
  productName: string,
  horizon = 6,
  forceRetrain = false,
) {
  const prepared = await prepareForecastContext(businessId, productName);
  const { dates, quantities, sortedKeys, classResult, algorithm, scriptConfig, modelDir, modelPath } = prepared;

  const signature = `${dates.length}_${dates[dates.length - 1] || ''}_${quantities.join(',')}_${horizon}`;
  const cachePath = getForecastCachePath(businessId, productName);

  if (!forceRetrain) {
    try {
      if (await fileExists(cachePath)) {
        const cacheContent = await fs.readFile(cachePath, 'utf8');
        const cached = JSON.parse(cacheContent);
        if (cached.signature === signature) {
          console.log(`[Forecast Cache Hit] business=${businessId} | ${productName}`);
          return {
            ...prepared,
            savedModelPath: cached.model_info.saved_model_path,
            loadedFromCache: true,
            mergedModelInfo: {
              ...cached.model_info,
              from_cache: true,
            },
            filteredForecasts: cached.forecasts,
            fromJSONCache: true,
          };
        }
      }
    } catch (e: any) {
      console.warn(`[Forecast Cache Read Error] business=${businessId} | ${productName}:`, e.message);
    }
  }

  let modelResult: any = null;
  let savedModelPath = modelPath;
  let loadedFromCache = false;
  const hasCanonicalArtifact = await fileExists(modelPath);

  // Fix: no +120 horizon inflation; pass current_last_period so Python shifts periods correctly
  const currentLastPeriod = sortedKeys.length > 0 ? sortedKeys[sortedKeys.length - 1] : undefined;

  if (!forceRetrain && hasCanonicalArtifact) {
    const cachedResult = await runPython(scriptConfig.predict, {
      model_path: modelPath,
      horizon: Number(horizon),
      ...(currentLastPeriod ? { current_last_period: currentLastPeriod } : {}),
    });

    if (cachedResult.success) {
      // Reject artifacts whose last_period lags current sales by more than horizon months
      const artifactLastPeriod = cachedResult.model_info?.last_period as string | undefined;
      const staleMonths = monthsDiff(artifactLastPeriod, currentLastPeriod);
      if (staleMonths > Number(horizon)) {
        console.warn(
          `[Forecast Stale Cache] business=${businessId} | ${productName} | ` +
          `artifact last: ${artifactLastPeriod} | sales last: ${currentLastPeriod} | ` +
          `stale by ${staleMonths} months — retraining`
        );
        // modelResult stays null → falls through to retrain
      } else {
        assertModelSelectionConsistency(
          algorithm,
          modelDir,
          String(cachedResult.model_info?.saved_model_path ?? modelPath),
          cachedResult.model_info?.algorithm ?? null,
        );
        modelResult = cachedResult;
        loadedFromCache = true;
      }
    } else {
      console.warn(
        `[Forecast Cache Miss] business=${businessId} | ${productName} | ${algorithm} | ${cachedResult.error}`
      );
    }
  }

  if (!forceRetrain && !modelResult && !hasCanonicalArtifact) {
    const sharedModelPath = buildSharedProductModelPath(scriptConfig, productName);
    if (await fileExists(sharedModelPath)) {
      const sharedResult = await runPython(scriptConfig.predict, {
        model_path: sharedModelPath,
        horizon: Number(horizon),
        ...(currentLastPeriod ? { current_last_period: currentLastPeriod } : {}),
      });

      if (sharedResult.success) {
        // Same staleness gate for shared pre-loaded artifacts
        const artifactLastPeriod = sharedResult.model_info?.last_period as string | undefined;
        const staleMonths = monthsDiff(artifactLastPeriod, currentLastPeriod);
        if (staleMonths > Number(horizon)) {
          console.warn(
            `[Forecast Stale Shared Preload] business=${businessId} | ${productName} | ` +
            `artifact last: ${artifactLastPeriod} | sales last: ${currentLastPeriod} | ` +
            `stale by ${staleMonths} months — will retrain`
          );
          // modelResult stays null → falls through to retrain
        } else {
          assertModelSelectionConsistency(
            algorithm,
            scriptConfig.dir,
            String(sharedResult.model_info?.saved_model_path ?? sharedModelPath),
            sharedResult.model_info?.algorithm ?? null,
          );
          modelResult = sharedResult;
          savedModelPath = await cacheSharedArtifactToBusinessPath(sharedModelPath, modelPath);
          loadedFromCache = true;
        }
      } else {
        console.warn(
          `[Forecast Shared Preload Miss] business=${businessId} | ${productName} | ${algorithm} | ${sharedResult.error}`
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
    modelResult = trainResult;
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
    fromJSONCache: false,
  };
}

async function getOrTrainBusinessRevenueForecastArtifact(
  businessId: number,
  horizon = 6,
  forceRetrain = false,
) {
  const rawSales = await prisma.sales_reports.findMany({
    where: { business_id: businessId },
    orderBy: { date: 'asc' },
    select: { date: true, total_amount: true },
  });

  const { dates, revenues } = rawSales.length > 0
    ? buildMonthlyRevenueSeries(rawSales)
    : { dates: [] as string[], revenues: [] as number[] };

  const signature = `${dates.length}_${dates[dates.length - 1] || ''}_${revenues.join(',')}_${horizon}`;
  const cachePath = getRevenueForecastCachePath(businessId);

  if (!forceRetrain) {
    try {
      if (await fileExists(cachePath)) {
        const cacheContent = await fs.readFile(cachePath, 'utf8');
        const cached = JSON.parse(cacheContent);
        if (cached.signature === signature) {
          console.log(`[Revenue Forecast Cache Hit] business=${businessId}`);
          return {
            dates,
            revenues,
            classResult: cached.model_info ?? null,
            algorithm: cached.algorithm,
            modelDir: '',
            modelPath: '',
            savedModelPath: cached.model_info.saved_model_path,
            loadedFromCache: true,
            mergedModelInfo: {
              ...cached.model_info,
              from_cache: true,
            },
            filteredForecasts: cached.forecasts,
            fromJSONCache: true,
          };
        }
      }
    } catch (e: any) {
      console.warn(`[Revenue Forecast Cache Read Error] business=${businessId}:`, e.message);
    }
  }

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

    const { modelDir, modelPath } = await resolveBusinessRevenueArtifactPath(sharedArtifact.algorithm, businessId);
    const savedModelPath = await cacheSharedArtifactToBusinessPath(
      String(cachedResult.model_info?.saved_model_path ?? sharedArtifact.modelPath),
      modelPath,
    );
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
      modelDir,
      modelPath,
      savedModelPath,
      loadedFromCache: true,
      mergedModelInfo,
      filteredForecasts: Array.isArray(cachedResult.forecasts) ? cachedResult.forecasts : [],
      fromJSONCache: false,
    };
  }

  const classResult = classifyDemand(revenues);

  const algorithm = classResult.algorithm as ForecastAlgorithm;
  const { modelDir, modelPath } = await resolveBusinessRevenueArtifactPath(algorithm, businessId);

  let modelResult: any = null;
  let savedModelPath = modelPath;
  let loadedFromCache = false;
  const hasCanonicalArtifact = await fileExists(modelPath);

  // Fix: no +120 horizon inflation; pass current_last_period so Python shifts periods correctly
  const currentLastPeriod = dates.length > 0 ? dates[dates.length - 1] : undefined;

  if (!forceRetrain && hasCanonicalArtifact) {
    const cachedResult = await runPython(REVENUE_MODEL_SCRIPT_PATHS.predict, {
      model_path: modelPath,
      horizon: Number(horizon),
      ...(currentLastPeriod ? { current_last_period: currentLastPeriod } : {}),
    });

    if (cachedResult.success) {
      // Reject artifacts whose last_period lags current sales by more than horizon months
      const artifactLastPeriod = cachedResult.model_info?.last_period as string | undefined;
      const staleMonths = monthsDiff(artifactLastPeriod, currentLastPeriod);
      if (staleMonths > Number(horizon)) {
        console.warn(
          `[Revenue Forecast Stale Cache] business=${businessId} | ` +
          `artifact last: ${artifactLastPeriod} | sales last: ${currentLastPeriod} | ` +
          `stale by ${staleMonths} months — retraining`
        );
        // modelResult stays null → falls through to retrain
      } else {
        const cachedPath = String(cachedResult.model_info?.saved_model_path ?? modelPath);
        if (!isPathInsideDir(cachedPath, modelDir)) {
          throw new Error(`Saved revenue model path mismatch: expected artifact under ${modelDir}, got ${cachedPath}`);
        }
        modelResult = cachedResult;
        loadedFromCache = true;
      }
    } else {
      console.warn(
        `[Revenue Forecast Cache Miss] business=${businessId} | ${cachedResult.error}`
      );
    }
  }

  if (!forceRetrain && !modelResult && !hasCanonicalArtifact) {
    const sharedArtifact = await resolveSharedRevenueArtifactPath();
    if (sharedArtifact && sharedArtifact.algorithm === algorithm) {
      const sharedResult = await runPython(REVENUE_MODEL_SCRIPT_PATHS.predict, {
        model_path: sharedArtifact.modelPath,
        horizon: Number(horizon),
        ...(currentLastPeriod ? { current_last_period: currentLastPeriod } : {}),
      });

      if (sharedResult.success) {
        // Same staleness gate for shared pre-loaded revenue artifacts
        const artifactLastPeriod = sharedResult.model_info?.last_period as string | undefined;
        const staleMonths = monthsDiff(artifactLastPeriod, currentLastPeriod);
        if (staleMonths > Number(horizon)) {
          console.warn(
            `[Revenue Forecast Stale Shared Preload] business=${businessId} | ` +
            `artifact last: ${artifactLastPeriod} | sales last: ${currentLastPeriod} | ` +
            `stale by ${staleMonths} months — will retrain`
          );
          // modelResult stays null → falls through to retrain
        } else {
          savedModelPath = await cacheSharedArtifactToBusinessPath(sharedArtifact.modelPath, modelPath);
          modelResult = {
            ...sharedResult,
            model_info: {
              ...(sharedResult.model_info ?? {}),
              saved_model_path: savedModelPath,
            },
          };
          loadedFromCache = true;
        }
      } else {
        console.warn(
          `[Revenue Forecast Shared Preload Miss] business=${businessId} | ${algorithm} | ${sharedResult.error}`
        );
      }
    }
  }

  if (!modelResult) {
    const outputModelPath =
      forceRetrain && hasCanonicalArtifact
        ? buildRerunModelPath(modelDir, BUSINESS_REVENUE_FORECAST_NAME)
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

    modelResult = trainResult;
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
    fromJSONCache: false,
  };
}

// Render's smaller instances cannot safely hold multiple statsmodels/XGBoost
// processes at once. Queue every Python job globally so product and revenue
// forecasts never overlap and trigger an out-of-memory restart.
let pythonJobQueue: Promise<void> = Promise.resolve();

function executePython(scriptPath: string, payload: object): Promise<any> {
  return new Promise((resolve) => {
    const proc = spawn(PYTHON_BIN, [scriptPath], {
      env: {
        ...process.env,
        OMP_NUM_THREADS: '1',
        OPENBLAS_NUM_THREADS: '1',
        MKL_NUM_THREADS: '1',
        NUMEXPR_NUM_THREADS: '1',
      },
    });
    let settled = false;
    let timedOut = false;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
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
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      finish({ success: false, error: `Failed to start Python: ${err.message}` });
    });
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      forceKillTimer = setTimeout(() => {
        if (!settled) proc.kill('SIGKILL');
      }, 5_000);
    }, PYTHON_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (timedOut) {
        finish({ success: false, error: 'Python script timed out' });
        return;
      }
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

function runPython(scriptPath: string, payload: object): Promise<any> {
  const job = pythonJobQueue.then(
    () => executePython(scriptPath, payload),
    () => executePython(scriptPath, payload),
  );
  pythonJobQueue = job.then(() => undefined, () => undefined);
  return job;
}

async function saveForecastToJSONCache(
  businessId: number,
  productName: string,
  horizon: number,
  forecastResult: any
) {
  try {
    const cachePath = getForecastCachePath(businessId, productName);
    const signature = `${forecastResult.dates.length}_${forecastResult.dates[forecastResult.dates.length - 1] || ''}_${forecastResult.quantities.join(',')}_${horizon}`;
    const cacheData = {
      product_name: productName,
      algorithm: forecastResult.algorithm,
      demand_type: forecastResult.classResult.demandType,
      adi: forecastResult.classResult.adi,
      cv2: forecastResult.classResult.cv2,
      forecasts: forecastResult.filteredForecasts,
      model_info: forecastResult.mergedModelInfo,
      signature,
    };
    await ensureDir(path.dirname(cachePath));
    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
  } catch (cacheErr: any) {
    console.warn(`[Forecast Cache Write Error] business=${businessId} | ${productName}:`, cacheErr.message);
  }
}

async function saveRevenueForecastToJSONCache(
  businessId: number,
  horizon: number,
  forecastResult: any
) {
  try {
    const cachePath = getRevenueForecastCachePath(businessId);
    const signature = `${forecastResult.dates.length}_${forecastResult.dates[forecastResult.dates.length - 1] || ''}_${forecastResult.revenues.join(',')}_${horizon}`;
    const cacheData = {
      algorithm: forecastResult.mergedModelInfo.algorithm,
      demand_type: forecastResult.mergedModelInfo.demand_type,
      adi: forecastResult.mergedModelInfo.adi,
      cv2: forecastResult.mergedModelInfo.cv2,
      forecasts: forecastResult.filteredForecasts,
      model_info: forecastResult.mergedModelInfo,
      signature,
    };
    await ensureDir(path.dirname(cachePath));
    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
  } catch (cacheErr: any) {
    console.warn(`[Revenue Forecast Cache Write Error] business=${businessId}:`, cacheErr.message);
  }
}

// POST /api/forecast/train
// Body: { business_id, product_name, horizon? }
// Trains the appropriate forecasting model and saves a .pkl artifact.
app.post('/api/forecast/train', async (req: any, res: any) => {
  const { business_id, product_name, horizon = 6 } = req.body;
  if (!business_id || !product_name) {
    return res.status(400).json({ error: 'business_id and product_name required' });
  }

  try {
    const forecastResult = await getOrTrainForecastArtifact(
      Number(business_id),
      String(product_name),
      Number(horizon),
      true,
    );

    // Save to cache after training
    await saveForecastToJSONCache(Number(business_id), String(product_name), Number(horizon), forecastResult);

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
// Body: { business_id, product_name, horizon?, force_retrain? }
// 1. Pulls monthly sales totals for product from sales_reports
// 2. Classifies demand (ADI/CV²) → picks ARIMA_XGB or TSB_XGB
// 3. Reuses the matching saved .pkl artifact when available
// 4. Retrains only when forced, missing, or invalid
// 5. Saves results to predictions table and returns forecasts + model info
app.post('/api/forecast', async (req: any, res: any) => {
  const { business_id, product_name, horizon = 6, force_retrain = false } = req.body;
  if (!business_id || !product_name) {
    return res.status(400).json({ error: 'business_id and product_name required' });
  }

  const normalizedHorizon = Math.min(12, Math.max(1, Number(horizon) || 6));

  try {
    const forecastResult = await getProductForecastArtifact(
      Number(business_id),
      String(product_name),
      normalizedHorizon,
      Boolean(force_retrain),
    );

    // Log retrain events to server console for observability
    if (!forecastResult.loadedFromCache && forecastResult.mergedModelInfo.retrained) {
      const improved = forecastResult.mergedModelInfo.retrain_improved;
      console.log(
        `[Forecast Retrain] business=${business_id} | ${product_name} | ${forecastResult.algorithm}` +
        ` | initial MAPE: ${forecastResult.mergedModelInfo.initial_mape}%` +
        ` | final MAPE: ${forecastResult.mergedModelInfo.mape}%` +
        ` | improved: ${improved}`
      );
    }

    // 5. Upsert forecast rows into predictions table
    // Find or derive product_id from inventory
    const inventoryItem = await prisma.inventory.findFirst({
      where: { business_id: Number(business_id), product_name: String(product_name) },
      select: { product_id: true }
    });

    let needsDbWrite = true;
    if (forecastResult.fromJSONCache && inventoryItem) {
      const existingCount = await prisma.predictions.count({
        where: { business_id: Number(business_id), product_id: inventoryItem.product_id }
      });
      if (existingCount > 0) {
        needsDbWrite = false;
      }
    }

    if (needsDbWrite && inventoryItem) {
      const priority =
        (forecastResult.mergedModelInfo.mape ?? 0) <= 10 ? 'Low'
          : (forecastResult.mergedModelInfo.mape ?? 0) <= 20 ? 'Medium'
            : 'High';
      const rows = (forecastResult.filteredForecasts as ForecastItem[]).map((fc) => ({
            business_id: Number(business_id),
            product_id: inventoryItem.product_id,
            forecast_date: new Date(fc.period + '-01'),
            predicted_quantity: fc.predicted,
            confidence_interval: fc.predicted > 0 && fc.upper !== null && fc.lower !== null
              ? Math.min(999.99, Math.max(-999.99, Number(((fc.upper - fc.predicted) / fc.predicted * 100).toFixed(2))))
              : null,
            recommendation_priority: priority as any,
      }));

      // Replace the complete forecast atomically so interrupted or concurrent
      // requests cannot leave a partially-written prediction set behind.
      await prisma.$transaction([
        prisma.predictions.deleteMany({
          where: { business_id: Number(business_id), product_id: inventoryItem.product_id }
        }),
        ...(rows.length > 0 ? [prisma.predictions.createMany({ data: rows })] : []),
      ]);
    }

    // Write to JSON cache if not already loaded from it
    if (!forecastResult.fromJSONCache) {
      await saveForecastToJSONCache(Number(business_id), String(product_name), normalizedHorizon, forecastResult);
    }

    // 6. Respond with everything the frontend needs
    return res.json({
      product_name,
      algorithm: forecastResult.algorithm,
      demand_type: forecastResult.classResult.demandType,
      adi: forecastResult.classResult.adi,
      cv2: forecastResult.classResult.cv2,
      forecasts: forecastResult.filteredForecasts,
      model_info: forecastResult.mergedModelInfo,
      history: forecastResult.sortedKeys.map((k: string, i: number) => ({ period: k, actual: forecastResult.quantities[i] }))
    });

  } catch (err: any) {
    console.error('[Forecast Error]', err);
    return res.status(err.message?.startsWith('No sales history') ? 404 : 400).json({ error: err.message });
  }
});

// GET /api/forecast?business_id=X&product_name=Y
// Returns the most recently stored predictions for a product (no recompute)
app.get('/api/forecast', async (req: any, res: any) => {
  const business_id = parseInt(req.query.business_id as string);
  const product_name = req.query.product_name as string;
  const horizon = Math.min(12, Math.max(1, Number(req.query.horizon) || 6));

  if (!business_id || !product_name) {
    return res.status(400).json({ error: 'business_id and product_name required' });
  }

  try {
    const [inventoryItem, rawSales, latestBusinessSale] = await Promise.all([
      prisma.inventory.findFirst({
        where: { business_id, product_name },
        select: { product_id: true }
      }),
      prisma.sales_reports.findMany({
        where: { business_id, product_name },
        orderBy: { date: 'asc' },
        select: { date: true, quantity: true }
      }),
      prisma.sales_reports.findFirst({
        where: { business_id },
        orderBy: { date: 'desc' },
        select: { date: true }
      }),
    ]);

    const customEndDate = latestBusinessSale ? new Date(latestBusinessSale.date) : undefined;
    const { dates, quantities } = buildMonthlySeries(rawSales, customEndDate);
    const history = dates.map((period, index) => ({ period, actual: quantities[index] }));
    const lastHistoryPeriod = dates[dates.length - 1] ?? '';

    // Predictions are persisted in TiDB, while Render's filesystem cache is
    // ephemeral. Prefer these rows after a restart so an existing forecast
    // appears immediately instead of launching Python again.
    const storedPredictions = inventoryItem
      ? await prisma.predictions.findMany({
          where: { business_id, product_id: inventoryItem.product_id },
          orderBy: { forecast_date: 'asc' }
        })
      : [];

    const forecasts = storedPredictions
      .map((prediction) => {
        if (!prediction.forecast_date) return null;
        const date = new Date(prediction.forecast_date);
        const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
        if (lastHistoryPeriod && period <= lastHistoryPeriod) return null;

        const predicted = Number(prediction.predicted_quantity ?? 0);
        const intervalPercent = prediction.confidence_interval == null
          ? null
          : Math.abs(Number(prediction.confidence_interval));
        const interval = intervalPercent == null ? null : predicted * intervalPercent / 100;
        return {
          period,
          predicted,
          lower: interval == null ? null : Math.max(0, Number((predicted - interval).toFixed(2))),
          upper: interval == null ? null : Number((predicted + interval).toFixed(2)),
        };
      })
      .filter((forecast): forecast is ForecastItem => forecast !== null)
      .slice(0, horizon);

    const demand = quantities.length > 0 ? classifyDemand(quantities) : null;

    res.set('Cache-Control', 'no-store');
    return res.json({
      product_name,
      algorithm: demand?.algorithm ?? 'ARIMA_XGB',
      demand_type: demand?.demandType ?? '',
      adi: demand?.adi ?? 0,
      cv2: demand?.cv2 ?? 0,
      forecasts,
      history,
      model_info: {
        algorithm: demand?.algorithm ?? 'ARIMA_XGB',
        n_train: dates.length,
        horizon,
        mape: null,
        accuracy: null,
        retrained: false,
        retrain_improved: false,
        initial_mape: null,
        low_accuracy: false,
        from_cache: forecasts.length > 0,
        cache_source: forecasts.length > 0 ? 'database' : null,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/forecast/accuracy?business_id=X
// Computes overall MAPE across all products by comparing stored predictions
// to actual sales_reports. Used by the Dashboard confidence indicator.
app.get('/api/forecast/accuracy', async (req: any, res: any) => {
  const business_id = parseInt(req.query.business_id as string);
  if (!business_id) return res.status(400).json({ error: 'business_id required' });

  try {
    const preds = await prisma.predictions.findMany({
      where: { business_id },
      select: { forecast_date: true, predicted_quantity: true, product_id: true }
    });

    if (!preds.length) return res.json({ accuracy: null, mape: null, pairs: 0 });

    // Pull actual sales, aggregated monthly
    const allSales = await prisma.sales_reports.findMany({
      where: { business_id },
      select: { date: true, quantity: true, product_name: true }
    });

    // Build map: productId -> { period -> actual_qty }
    const inventoryItems = await prisma.inventory.findMany({
      where: { business_id },
      select: { product_id: true, product_name: true }
    });
    const pidToName: Record<number, string> = {};
    inventoryItems.forEach(i => { pidToName[i.product_id] = i.product_name; });

    const salesMap: Record<string, Record<string, number>> = {}; // productName -> period -> qty
    allSales.forEach(s => {
      const pname = s.product_name ?? '';
      const d = new Date(s.date);
      const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!salesMap[pname]) salesMap[pname] = {};
      salesMap[pname][period] = (salesMap[pname][period] ?? 0) + Number(s.quantity);
    });

    let mapeSum = 0, count = 0, skipped = 0, zeroActualCorrect = 0;
    for (const pred of preds) {
      if (!pred.product_id) continue;
      const pname = pidToName[pred.product_id];
      if (!pname) continue;
      const d = new Date(pred.forecast_date!);
      const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const actual = salesMap[pname]?.[period];
      if (actual === undefined) { skipped++; continue; }
      const predicted = Number(pred.predicted_quantity ?? 0);
      if (actual === 0) {
        // Zero-actual: if predicted is also ~0 count as correct; otherwise skip MAPE (division by zero)
        if (Math.abs(predicted) < 0.5) { zeroActualCorrect++; count++; }
        else { skipped++; }
        continue;
      }
      mapeSum += Math.abs((actual - predicted) / actual);
      count++;
    }

    const mape = count > 0 ? (mapeSum / count) * 100 : null;
    const accuracy = mape !== null ? Math.max(0, Math.round(100 - mape)) : null;
    return res.json({
      accuracy,
      mape: mape !== null ? Math.round(mape * 10) / 10 : null,
      pairs: count,
      skipped_pairs: skipped,
      zero_actual_correct: zeroActualCorrect,
      insufficient_data: count === 0,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/forecast/revenue', async (req: any, res: any) => {
  const { business_id, horizon = 6, force_retrain = false } = req.body;
  if (!business_id) {
    return res.status(400).json({ error: 'business_id required' });
  }

  const businessId = Number(business_id);
  const normalizedHorizon = Math.min(12, Math.max(1, Number(horizon) || 6));

  try {
    if (!force_retrain) {
      const [rawSales, storedPredictions] = await Promise.all([
        prisma.sales_reports.findMany({
          where: { business_id: businessId },
          orderBy: { date: 'asc' },
          select: { date: true, total_amount: true },
        }),
        prisma.predictions.findMany({
          where: { business_id: businessId, product_id: null },
          orderBy: { forecast_date: 'asc' },
        }),
      ]);
      const { dates, revenues } = rawSales.length > 0
        ? buildMonthlyRevenueSeries(rawSales)
        : { dates: [] as string[], revenues: [] as number[] };
      const lastHistoryPeriod = dates[dates.length - 1] ?? '';
      const forecasts = storedPredictions
        .map((prediction) => {
          if (!prediction.forecast_date) return null;
          const date = new Date(prediction.forecast_date);
          const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
          if (lastHistoryPeriod && period <= lastHistoryPeriod) return null;

          const predicted = Number(prediction.predicted_quantity ?? 0);
          const intervalPercent = prediction.confidence_interval == null
            ? null
            : Math.abs(Number(prediction.confidence_interval));
          const interval = intervalPercent == null ? null : predicted * intervalPercent / 100;
          return {
            period,
            predicted,
            lower: interval == null ? null : Math.max(0, Number((predicted - interval).toFixed(2))),
            upper: interval == null ? null : Number((predicted + interval).toFixed(2)),
          };
        })
        .filter((forecast): forecast is ForecastItem => forecast !== null)
        .slice(0, normalizedHorizon);

      if (forecasts.length >= normalizedHorizon) {
        const demand = revenues.length > 0 ? classifyDemand(revenues) : null;
        res.set('Cache-Control', 'no-store');
        return res.json({
          series_name: 'Business Sales Revenue',
          algorithm: demand?.algorithm ?? 'ARIMA_XGB',
          demand_type: demand?.demandType ?? '',
          adi: demand?.adi ?? 0,
          cv2: demand?.cv2 ?? 0,
          forecasts,
          model_info: {
            algorithm: demand?.algorithm ?? 'ARIMA_XGB',
            n_train: dates.length,
            horizon: normalizedHorizon,
            mape: null,
            accuracy: null,
            retrained: false,
            retrain_improved: false,
            initial_mape: null,
            low_accuracy: false,
            from_cache: true,
            cache_source: 'database',
          },
          history: dates.map((period, index) => ({ period, actual: revenues[index] })),
        });
      }
    }

    const forecastResult = await getBusinessRevenueForecastArtifact(
      businessId,
      normalizedHorizon,
      Boolean(force_retrain),
    );

    if (!forecastResult.fromJSONCache) {
      await saveRevenueForecastToJSONCache(businessId, normalizedHorizon, forecastResult);
    }

    const priority =
      (forecastResult.mergedModelInfo.mape ?? 0) <= 10 ? 'Low'
        : (forecastResult.mergedModelInfo.mape ?? 0) <= 20 ? 'Medium'
          : 'High';
    const rows = (forecastResult.filteredForecasts as ForecastItem[]).map((forecast) => ({
      business_id: businessId,
      product_id: null,
      forecast_date: new Date(forecast.period + '-01'),
      predicted_quantity: forecast.predicted,
      confidence_interval: forecast.predicted > 0 && forecast.upper !== null && forecast.lower !== null
        ? Math.min(999.99, Math.max(-999.99, Number(((forecast.upper - forecast.predicted) / forecast.predicted * 100).toFixed(2))))
        : null,
      recommendation_priority: priority as any,
    }));

    await prisma.$transaction([
      prisma.predictions.deleteMany({
        where: { business_id: businessId, product_id: null },
      }),
      ...(rows.length > 0 ? [prisma.predictions.createMany({ data: rows })] : []),
    ]);

    return res.json({
      series_name: 'Business Sales Revenue',
      algorithm: forecastResult.mergedModelInfo.algorithm,
      demand_type: forecastResult.mergedModelInfo.demand_type,
      adi: forecastResult.mergedModelInfo.adi,
      cv2: forecastResult.mergedModelInfo.cv2,
      forecasts: forecastResult.filteredForecasts,
      model_info: forecastResult.mergedModelInfo,
      history: forecastResult.dates.map((period: string, index: number) => ({ period, actual: forecastResult.revenues[index] })),
    });
  } catch (err: any) {
    console.error('[Revenue Forecast Error]', err);
    return res.status(err.message?.startsWith('No sales history') ? 404 : 400).json({ error: err.message });
  }
});

export default app;

const port = process.env.PORT || 5000;

app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  try {
    await prisma.$connect();
    console.log("Successfully connected to MySQL Database via Prisma.");
  } catch (error) {
    console.error("Database connection failed:", error);
  }
});
