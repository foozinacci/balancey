import { db, getSettings, DEFAULT_SETTINGS } from './index';
import type { BackupData } from '../types';

const SCHEMA_VERSION = 1;

// Export all data to a backup file
export async function exportBackup(): Promise<BackupData> {
  const [
    customers,
    customerTags,
    products,
    inventory,
    inventoryAdjustments,
    orders,
    orderItems,
    payments,
    fulfillments,
    orderPolicies,
    settings,
  ] = await Promise.all([
    db.customers.toArray(),
    db.customerTags.toArray(),
    db.products.toArray(),
    db.inventory.toArray(),
    db.inventoryAdjustments.toArray(),
    db.orders.toArray(),
    db.orderItems.toArray(),
    db.payments.toArray(),
    db.fulfillments.toArray(),
    db.orderPolicies.toArray(),
    getSettings(),
  ]);

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    customers,
    customerTags,
    products,
    inventory,
    inventoryAdjustments,
    orders,
    orderItems,
    payments,
    fulfillments,
    orderPolicies,
    settings,
  };
}

// Import data from a backup file
export async function importBackup(
  data: BackupData,
  mode: 'replace' | 'merge' = 'replace'
): Promise<void> {
  // Validate schema version
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Backup was created with a newer version (${data.schemaVersion}). Please update the app.`
    );
  }

  if (mode === 'replace') {
    // Clear all existing data
    await db.transaction(
      'rw',
      [
        db.customers,
        db.customerTags,
        db.products,
        db.inventory,
        db.inventoryAdjustments,
        db.orders,
        db.orderItems,
        db.payments,
        db.fulfillments,
        db.orderPolicies,
        db.settings,
      ],
      async () => {
        await db.customers.clear();
        await db.customerTags.clear();
        await db.products.clear();
        await db.inventory.clear();
        await db.inventoryAdjustments.clear();
        await db.orders.clear();
        await db.orderItems.clear();
        await db.payments.clear();
        await db.fulfillments.clear();
        await db.orderPolicies.clear();
        await db.settings.clear();

        // Import all data
        if (data.customers?.length) await db.customers.bulkAdd(data.customers);
        if (data.customerTags?.length) await db.customerTags.bulkAdd(data.customerTags);
        if (data.products?.length) await db.products.bulkAdd(data.products);
        if (data.inventory?.length) await db.inventory.bulkAdd(data.inventory);
        if (data.inventoryAdjustments?.length)
          await db.inventoryAdjustments.bulkAdd(data.inventoryAdjustments);
        if (data.orders?.length) await db.orders.bulkAdd(data.orders);
        if (data.orderItems?.length) await db.orderItems.bulkAdd(data.orderItems);
        if (data.payments?.length) await db.payments.bulkAdd(data.payments);
        if (data.fulfillments?.length) await db.fulfillments.bulkAdd(data.fulfillments);
        if (data.orderPolicies?.length) await db.orderPolicies.bulkAdd(data.orderPolicies);

        // Import settings
        if (data.settings) {
          await db.settings.add(data.settings);
        } else {
          await db.settings.add(DEFAULT_SETTINGS);
        }
      }
    );
  } else {
    // Merge mode: add new records, skip existing
    await db.transaction(
      'rw',
      [
        db.customers,
        db.customerTags,
        db.products,
        db.inventory,
        db.inventoryAdjustments,
        db.orders,
        db.orderItems,
        db.payments,
        db.fulfillments,
        db.orderPolicies,
      ],
      async () => {
        // Use bulkPut for merge (upsert behavior)
        if (data.customers?.length) await db.customers.bulkPut(data.customers);
        if (data.customerTags?.length) await db.customerTags.bulkPut(data.customerTags);
        if (data.products?.length) await db.products.bulkPut(data.products);
        if (data.inventory?.length) await db.inventory.bulkPut(data.inventory);
        if (data.inventoryAdjustments?.length)
          await db.inventoryAdjustments.bulkPut(data.inventoryAdjustments);
        if (data.orders?.length) await db.orders.bulkPut(data.orders);
        if (data.orderItems?.length) await db.orderItems.bulkPut(data.orderItems);
        if (data.payments?.length) await db.payments.bulkPut(data.payments);
        if (data.fulfillments?.length) await db.fulfillments.bulkPut(data.fulfillments);
        if (data.orderPolicies?.length) await db.orderPolicies.bulkPut(data.orderPolicies);
      }
    );
  }
}

// Download backup as a file
export async function downloadBackup(): Promise<void> {
  const data = await exportBackup();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const date = new Date().toISOString().split('T')[0];
  const filename = `balancey-backup-${date}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Read and import from a file
export async function importFromFile(
  file: File,
  mode: 'replace' | 'merge' = 'replace'
): Promise<void> {
  const text = await file.text();
  const data = JSON.parse(text) as BackupData;

  // Basic validation
  if (!data.schemaVersion || !data.exportedAt) {
    throw new Error('Invalid backup file format');
  }

  await importBackup(data, mode);
}
