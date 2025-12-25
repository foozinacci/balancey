import { v4 as uuid } from 'uuid';
import { db } from './index';
import type {
  Product,
  Inventory,
  InventoryAdjustment,
  ProductWithInventory,
  InventoryAdjustmentType,
} from '../types';

// Create a new product
export async function createProduct(
  data: Omit<Product, 'id' | 'isActive'>
): Promise<Product> {
  const product: Product = {
    id: uuid(),
    isActive: true,
    ...data,
  };
  await db.products.add(product);

  // Initialize inventory for this product
  const inventory: Inventory = {
    productId: product.id,
    onHandGrams: 0,
    reservedGrams: 0,
    onHandUnits: 0,
    reservedUnits: 0,
    updatedAt: Date.now(),
  };
  await db.inventory.add(inventory);

  return product;
}

// Update a product
export async function updateProduct(
  id: string,
  updates: Partial<Product>
): Promise<void> {
  await db.products.update(id, updates);
}

// Get a product by ID
export async function getProduct(id: string): Promise<Product | undefined> {
  return db.products.get(id);
}

// Get all active products
export async function getActiveProducts(): Promise<Product[]> {
  return db.products.where('isActive').equals(1).toArray();
}

// Get all products
export async function getAllProducts(): Promise<Product[]> {
  return db.products.toArray();
}

// Get inventory for a product
export async function getInventory(productId: string): Promise<Inventory | undefined> {
  return db.inventory.get(productId);
}

// Get product with inventory
export async function getProductWithInventory(
  productId: string
): Promise<ProductWithInventory | null> {
  const [product, inventory] = await Promise.all([
    getProduct(productId),
    getInventory(productId),
  ]);

  if (!product || !inventory) return null;

  return {
    ...product,
    inventory,
    availableGrams: inventory.onHandGrams - inventory.reservedGrams,
    availableUnits: inventory.onHandUnits - inventory.reservedUnits,
  };
}

// Get all products with inventory
export async function getAllProductsWithInventory(): Promise<ProductWithInventory[]> {
  const products = await getActiveProducts();
  const results: ProductWithInventory[] = [];

  for (const product of products) {
    const result = await getProductWithInventory(product.id);
    if (result) results.push(result);
  }

  return results;
}

// Adjust inventory
export async function adjustInventory(
  productId: string,
  type: InventoryAdjustmentType,
  gramsAdjustment: number,
  unitsAdjustment: number,
  note: string
): Promise<void> {
  const inventory = await getInventory(productId);
  if (!inventory) throw new Error('Inventory not found');

  // Record adjustment
  const adjustment: InventoryAdjustment = {
    id: uuid(),
    productId,
    type,
    gramsAdjustment,
    unitsAdjustment,
    note,
    createdAt: Date.now(),
  };
  await db.inventoryAdjustments.add(adjustment);

  // Update inventory
  await db.inventory.update(productId, {
    onHandGrams: inventory.onHandGrams + gramsAdjustment,
    onHandUnits: inventory.onHandUnits + unitsAdjustment,
    updatedAt: Date.now(),
  });
}

// Reserve inventory (for orders)
export async function reserveInventory(
  productId: string,
  grams: number,
  units: number
): Promise<void> {
  const inventory = await getInventory(productId);
  if (!inventory) throw new Error('Inventory not found');

  await db.inventory.update(productId, {
    reservedGrams: inventory.reservedGrams + grams,
    reservedUnits: inventory.reservedUnits + units,
    updatedAt: Date.now(),
  });
}

// Release reserved inventory (for cancelled orders)
export async function releaseReservedInventory(
  productId: string,
  grams: number,
  units: number
): Promise<void> {
  const inventory = await getInventory(productId);
  if (!inventory) throw new Error('Inventory not found');

  await db.inventory.update(productId, {
    reservedGrams: Math.max(0, inventory.reservedGrams - grams),
    reservedUnits: Math.max(0, inventory.reservedUnits - units),
    updatedAt: Date.now(),
  });
}

// Fulfill inventory (reduce both on-hand and reserved)
export async function fulfillInventory(
  productId: string,
  grams: number,
  units: number
): Promise<void> {
  const inventory = await getInventory(productId);
  if (!inventory) throw new Error('Inventory not found');

  await db.inventory.update(productId, {
    onHandGrams: Math.max(0, inventory.onHandGrams - grams),
    reservedGrams: Math.max(0, inventory.reservedGrams - grams),
    onHandUnits: Math.max(0, inventory.onHandUnits - units),
    reservedUnits: Math.max(0, inventory.reservedUnits - units),
    updatedAt: Date.now(),
  });
}

// Get inventory adjustments for a product
export async function getInventoryAdjustments(
  productId: string
): Promise<InventoryAdjustment[]> {
  return db.inventoryAdjustments
    .where('productId')
    .equals(productId)
    .reverse()
    .sortBy('createdAt');
}
