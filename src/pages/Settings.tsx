import { useState, useRef } from 'react';
import { useSettings } from '../hooks/useData';
import { updateSettings, db } from '../db';
import { downloadBackup, importFromFile } from '../db/backup';
import { createBalanceCarryover, clearPaidOrders, clearAllData } from '../db/orders';
import { createCustomer, getAllCustomers } from '../db/customers';
import { seedTestData } from '../db/seed';
import { Card, CardHeader } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Modal } from '../components/Modal';
import { parseMoney } from '../utils/units';
import type { WeightUnit } from '../types';

export function Settings() {
  const settings = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddBalance, setQuickAddBalance] = useState('');
  const [quickAddStatus, setQuickAddStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Local state for price inputs (to prevent cursor snapping)
  const [baseCostInput, setBaseCostInput] = useState('');
  const [baseSaleInput, setBaseSaleInput] = useState('');
  const [goalInput, setGoalInput] = useState('');

  // Clear confirmation modals
  const [showClearPaid, setShowClearPaid] = useState(false);
  const [showClearAll, setShowClearAll] = useState(false);
  const [showClearWaste, setShowClearWaste] = useState(false);
  const [clearAllConfirmText, setClearAllConfirmText] = useState('');
  const [showSeedDemo, setShowSeedDemo] = useState(false);
  const [seedStatus, setSeedStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  if (!settings) {
    return <div className="p-4">Loading...</div>;
  }

  const handleExport = async () => {
    try {
      await downloadBackup();
    } catch (error) {
      alert('Failed to export backup');
    }
  };

  const handleImport = async () => {
    if (!importFile) return;

    setImportStatus('loading');
    try {
      await importFromFile(importFile, importMode);
      setImportStatus('success');
      setTimeout(() => {
        setShowImport(false);
        setImportStatus('idle');
        setImportFile(null);
        window.location.reload();
      }, 1500);
    } catch (error) {
      setImportStatus('error');
      alert('Failed to import: ' + (error as Error).message);
    }
  };

  const handleQuickAdd = async () => {
    if (!quickAddName.trim()) return;

    setQuickAddStatus('loading');
    try {
      // Check if customer exists
      const customers = await getAllCustomers();
      let customer = customers.find(
        (c) => c.name.toLowerCase() === quickAddName.trim().toLowerCase()
      );

      if (!customer) {
        customer = await createCustomer({ name: quickAddName.trim() });
      }

      const balanceCents = parseMoney(quickAddBalance);
      if (balanceCents > 0) {
        await createBalanceCarryover(customer.id, balanceCents);
      }

      setQuickAddStatus('success');
      setQuickAddName('');
      setQuickAddBalance('');
      setTimeout(() => setQuickAddStatus('idle'), 2000);
    } catch (error) {
      setQuickAddStatus('error');
      alert('Failed to add: ' + (error as Error).message);
    }
  };

  const handleUpdatePolicy = async (field: string, value: number) => {
    await updateSettings({ [field]: value });
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-text-primary">Settings</h1>

      {/* Monthly Goal - FIRST */}
      <Card>
        <CardHeader title="Monthly Goal" />
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-silver mb-1">Target Revenue ($)</label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="$0.00"
              value={goalInput || (settings.monthlyGoalCents ? (settings.monthlyGoalCents / 100).toFixed(2) : '')}
              onChange={(e) => setGoalInput(e.target.value)}
              onFocus={() => setGoalInput(settings.monthlyGoalCents ? (settings.monthlyGoalCents / 100).toFixed(2) : '')}
              onBlur={(e) => {
                const cents = parseMoney(e.target.value);
                updateSettings({ monthlyGoalCents: cents });
                setGoalInput('');
              }}
            />
            <p className="text-xs text-silver/70 mt-1">
              Your target monthly revenue. The Monthly Margin on the dashboard shows how you're tracking against this goal.
            </p>
          </div>
          {(settings.monthlyClearedCents ?? 0) > 0 && (
            <div className="text-sm text-silver/70">
              Includes ${((settings.monthlyClearedCents ?? 0) / 100).toFixed(2)} from cleared orders
            </div>
          )}
        </div>
      </Card>

      {/* Pricing Settings */}
      <Card>
        <CardHeader title="Pricing" />
        <div className="space-y-4">
          {/* Base Prices */}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-sm text-silver mb-1">Your Cost ($/{settings.defaultWeightUnit})</label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={baseCostInput || (settings.baseCostCentsPerGram ? (settings.baseCostCentsPerGram / 100).toFixed(2) : '')}
                onChange={(e) => setBaseCostInput(e.target.value)}
                onFocus={() => setBaseCostInput(settings.baseCostCentsPerGram ? (settings.baseCostCentsPerGram / 100).toFixed(2) : '')}
                onBlur={(e) => {
                  const cents = parseMoney(e.target.value);
                  updateSettings({ baseCostCentsPerGram: cents });
                  setBaseCostInput('');
                }}
              />
            </div>
            <div>
              <label className="block text-sm text-silver mb-1">Sale Price ($/{settings.defaultWeightUnit})</label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={baseSaleInput || (settings.baseSaleCentsPerGram ? (settings.baseSaleCentsPerGram / 100).toFixed(2) : '')}
                onChange={(e) => setBaseSaleInput(e.target.value)}
                onFocus={() => setBaseSaleInput(settings.baseSaleCentsPerGram ? (settings.baseSaleCentsPerGram / 100).toFixed(2) : '')}
                onBlur={(e) => {
                  const cents = parseMoney(e.target.value);
                  updateSettings({ baseSaleCentsPerGram: cents });
                  setBaseSaleInput('');
                }}
              />
            </div>
            <Select
              value={settings.defaultWeightUnit}
              onChange={(e) => updateSettings({ defaultWeightUnit: e.target.value as WeightUnit })}
              options={[
                { value: 'g', label: 'g' },
                { value: 'oz', label: 'oz' },
                { value: 'lb', label: 'lb' },
                { value: 'kg', label: 'kg' },
              ]}
            />
          </div>

          {/* Other Units */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-silver">Other Units</label>
              {(() => {
                const usedUnits = (settings.priceTiers ?? []).map(t => t.unit);
                const allUnits: WeightUnit[] = ['g', 'oz', 'lb', 'kg'];
                // Exclude default unit (used by base prices) and already-used units
                const availableUnits = allUnits.filter(u => u !== settings.defaultWeightUnit && !usedUnits.includes(u));
                if (availableUnits.length === 0) return null;
                return (
                  <button
                    onClick={() => {
                      const newTiers = [...(settings.priceTiers ?? []), { unit: availableUnits[0] }];
                      updateSettings({ priceTiers: newTiers });
                    }}
                    className="text-sm text-lime hover:text-lime/80 transition-colors"
                  >
                    + Add
                  </button>
                );
              })()}
            </div>

            {(settings.priceTiers ?? []).length === 0 ? (
              <p className="text-sm text-silver/50 italic">No other units set.</p>
            ) : (
              <div className="space-y-4">
                {(settings.priceTiers ?? []).map((tier, index) => {
                  const usedUnits = (settings.priceTiers ?? []).map((t, i) => i !== index ? t.unit : null).filter(Boolean);
                  const allUnits: WeightUnit[] = ['g', 'oz', 'lb', 'kg'];
                  // Exclude default unit (used by base prices) and already-used units
                  const availableUnits = allUnits.filter(u => u !== settings.defaultWeightUnit && !usedUnits.includes(u));

                  // Get the unit to display - use tier.unit if valid, otherwise first available
                  const displayUnit = tier.unit && tier.unit !== settings.defaultWeightUnit ? tier.unit : availableUnits[0] || 'oz';

                  // If tier has invalid/missing unit, update it
                  if (!tier.unit || tier.unit === settings.defaultWeightUnit) {
                    const newTiers = [...(settings.priceTiers ?? [])];
                    newTiers[index] = { ...tier, unit: availableUnits[0] || 'oz' };
                    updateSettings({ priceTiers: newTiers });
                    return null; // Skip render this cycle, will re-render with correct unit
                  }

                  return (
                    <div key={index} className="glass-card p-3 rounded-xl">
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
                        <div>
                          <label className="block text-sm text-silver mb-1">Your Cost ($/{displayUnit})</label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={tier.costCents ? (tier.costCents / 100).toFixed(2) : ''}
                            onChange={(e) => {
                              const cents = parseMoney(e.target.value);
                              const newTiers = [...(settings.priceTiers ?? [])];
                              newTiers[index] = { ...tier, costCents: cents > 0 ? cents : undefined };
                              updateSettings({ priceTiers: newTiers });
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-silver mb-1">Sale Price ($/{displayUnit})</label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={tier.saleCents ? (tier.saleCents / 100).toFixed(2) : ''}
                            onChange={(e) => {
                              const cents = parseMoney(e.target.value);
                              const newTiers = [...(settings.priceTiers ?? [])];
                              newTiers[index] = { ...tier, saleCents: cents > 0 ? cents : undefined };
                              updateSettings({ priceTiers: newTiers });
                            }}
                          />
                        </div>
                        <Select
                          value={displayUnit}
                          onChange={(e) => {
                            const newTiers = [...(settings.priceTiers ?? [])];
                            newTiers[index] = { ...tier, unit: e.target.value as WeightUnit };
                            updateSettings({ priceTiers: newTiers });
                          }}
                          options={availableUnits.map(u => ({ value: u, label: u }))}
                        />
                      </div>
                      <button
                        onClick={() => {
                          const newTiers = (settings.priceTiers ?? []).filter((_, i) => i !== index);
                          updateSettings({ priceTiers: newTiers });
                        }}
                        className="text-sm text-magenta hover:text-magenta/80 transition-colors mt-2"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Delivery Fee */}
          <div className="border-t border-surface-600 pt-4 mt-4">
            <h4 className="font-medium text-text-primary mb-3">Delivery Fee</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-silver mb-1">Calculation Method</label>
                <Select
                  value={settings.deliveryFeeMethod}
                  onChange={(e) => updateSettings({ deliveryFeeMethod: e.target.value as 'gas' | 'flat' })}
                  options={[
                    { value: 'gas', label: 'Calculate from mileage' },
                    { value: 'flat', label: 'Manual entry only' },
                  ]}
                />
              </div>

              {settings.deliveryFeeMethod === 'gas' && (
                <div>
                  <label className="block text-sm text-silver mb-1">Vehicle Type</label>
                  <Select
                    value={settings.vehicleType}
                    onChange={(e) => updateSettings({ vehicleType: e.target.value as 'compact' | 'sedan' | 'suv' | 'truck' | 'van' | 'hybrid' })}
                    options={[
                      { value: 'compact', label: 'Compact (32 MPG)' },
                      { value: 'sedan', label: 'Sedan (28 MPG)' },
                      { value: 'suv', label: 'SUV (22 MPG)' },
                      { value: 'truck', label: 'Truck (18 MPG)' },
                      { value: 'van', label: 'Van (20 MPG)' },
                      { value: 'hybrid', label: 'Hybrid (45 MPG)' },
                    ]}
                  />
                  <p className="text-xs text-silver/70 mt-1">
                    Round-trip ÷ {{ compact: 32, sedan: 28, suv: 22, truck: 18, van: 20, hybrid: 45 }[settings.vehicleType]} MPG × $4.05/gal
                  </p>
                </div>
              )}

              {settings.deliveryFeeMethod === 'flat' && (
                <p className="text-xs text-silver/70">
                  Enter delivery fee manually for each order
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Policy settings */}
      <Card>
        <CardHeader title="Policy Defaults" />

        <div className="space-y-4">
          <h4 className="font-medium text-slate-700">Normal Policy</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-500 mb-1">Deposit Min %</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={Math.round(settings.depositMinPctNormal * 100)}
                onChange={(e) =>
                  handleUpdatePolicy('depositMinPctNormal', parseInt(e.target.value) / 100)
                }
              />
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">Holdback %</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={Math.round(settings.holdbackPctNormal * 100)}
                onChange={(e) =>
                  handleUpdatePolicy('holdbackPctNormal', parseInt(e.target.value) / 100)
                }
              />
            </div>
          </div>

          <h4 className="font-medium text-slate-700">Over Typical Policy</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-500 mb-1">Deposit Min %</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={Math.round(settings.depositMinPctOverTypical * 100)}
                onChange={(e) =>
                  handleUpdatePolicy('depositMinPctOverTypical', parseInt(e.target.value) / 100)
                }
              />
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">Holdback %</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={Math.round(settings.holdbackPctOverTypical * 100)}
                onChange={(e) =>
                  handleUpdatePolicy('holdbackPctOverTypical', parseInt(e.target.value) / 100)
                }
              />
            </div>
          </div>

          <h4 className="font-medium text-slate-700">Late Policy</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-500 mb-1">Deposit Min %</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={Math.round(settings.depositMinPctLate * 100)}
                onChange={(e) =>
                  handleUpdatePolicy('depositMinPctLate', parseInt(e.target.value) / 100)
                }
              />
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">Holdback %</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={Math.round(settings.holdbackPctLate * 100)}
                onChange={(e) =>
                  handleUpdatePolicy('holdbackPctLate', parseInt(e.target.value) / 100)
                }
              />
            </div>
          </div>

          <h4 className="font-medium text-slate-700">Premium Pricing</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-500 mb-1">Your Cost Markup %</label>
              <Input
                type="number"
                min="0"
                max="200"
                value={settings.premiumCostPct ?? 20}
                onChange={(e) =>
                  updateSettings({ premiumCostPct: parseInt(e.target.value) })
                }
              />
              <p className="text-xs text-slate-400 mt-1">Extra % you pay for premium</p>
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">Sale Markup %</label>
              <Input
                type="number"
                min="0"
                max="200"
                value={settings.premiumSalePct ?? 30}
                onChange={(e) =>
                  updateSettings({ premiumSalePct: parseInt(e.target.value) })
                }
              />
              <p className="text-xs text-slate-400 mt-1">Extra % to charge clients</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Preset weights */}
      {/* Display settings */}
      <Card>
        <CardHeader title="Display" />
        <div className="space-y-4">
          <Select
            label="Default Weight Unit"
            value={settings.defaultWeightUnit}
            onChange={(e) => updateSettings({ defaultWeightUnit: e.target.value as WeightUnit })}
            options={[
              { value: 'g', label: 'Grams (g)' },
              { value: 'oz', label: 'Ounces (oz)' },
              { value: 'lb', label: 'Pounds (lb)' },
              { value: 'kg', label: 'Kilograms (kg)' },
            ]}
          />

          <Select
            label="Timezone"
            value={settings.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
            onChange={(e) => updateSettings({ timezone: e.target.value })}
            options={[
              { value: 'America/New_York', label: 'Eastern (ET)' },
              { value: 'America/Chicago', label: 'Central (CT)' },
              { value: 'America/Denver', label: 'Mountain (MT)' },
              { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
              { value: 'America/Anchorage', label: 'Alaska (AKT)' },
              { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
              { value: 'America/Phoenix', label: 'Arizona (MST)' },
              { value: 'UTC', label: 'UTC' },
            ]}
          />
          <div>
            <label className="block text-sm text-slate-500 mb-1">Default Due Days</label>
            <Input
              type="number"
              min="1"
              max="90"
              value={settings.defaultDueDays}
              onChange={(e) => updateSettings({ defaultDueDays: parseInt(e.target.value) })}
            />
            <p className="text-xs text-silver/70 mt-1">Orders will be due this many days after creation</p>
          </div>
        </div>
      </Card>

      {/* Data management */}
      <Card>
        <CardHeader title="Data Management" />
        <div className="space-y-3">
          <Button variant="secondary" onClick={handleExport} className="w-full">
            Export Backup
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowImport(true)}
            className="w-full"
          >
            Import Backup
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowQuickAdd(true)}
            className="w-full"
          >
            Quick Add Debts
          </Button>
          <div className="border-t border-surface-600 pt-3 mt-3">
            <p className="text-sm text-silver mb-2">Quick Actions</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => setShowClearPaid(true)}
              >
                Clear Paid
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowClearWaste(true)}
              >
                Clear Waste
              </Button>
              <Button
                variant="danger"
                onClick={() => setShowClearAll(true)}
              >
                Clear All
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowSeedDemo(true)}
              >
                🌱 Demo Data
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Clear Paid Confirmation Modal */}
      <Modal
        isOpen={showClearPaid}
        onClose={() => setShowClearPaid(false)}
        title="Clear Paid Orders"
      >
        <div className="space-y-4">
          <p className="text-silver">
            This will remove all CLOSED/PAID orders and their payment history.
          </p>
          <p className="text-sm text-magenta">
            This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowClearPaid(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  const count = await clearPaidOrders();
                  setShowClearPaid(false);
                  // Show success briefly then close
                  setTimeout(() => {
                    window.location.reload();
                  }, 500);
                  console.log(`Cleared ${count} paid orders`);
                } catch (error) {
                  console.error('Failed to clear paid orders:', error);
                }
              }}
              className="flex-1"
            >
              Clear Paid
            </Button>
          </div>
        </div>
      </Modal>

      {/* Clear Waste Confirmation Modal */}
      <Modal
        isOpen={showClearWaste}
        onClose={() => setShowClearWaste(false)}
        title="Clear Waste History"
      >
        <div className="space-y-4">
          <p className="text-silver">
            This will clear all waste records from inventory history.
          </p>
          <p className="text-sm text-silver/70">
            Your current stock levels will not be affected.
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowClearWaste(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  // Clear only WASTE type adjustments
                  const wasteRecords = await db.inventoryAdjustments
                    .filter(a => a.type === 'WASTE')
                    .toArray();
                  const ids = wasteRecords.map(r => r.id);
                  await db.inventoryAdjustments.bulkDelete(ids);
                  setShowClearWaste(false);
                  window.location.reload();
                } catch (error) {
                  console.error('Failed to clear waste:', error);
                }
              }}
              className="flex-1"
            >
              Clear Waste
            </Button>
          </div>
        </div>
      </Modal>

      {/* Clear All Confirmation Modal */}
      <Modal
        isOpen={showClearAll}
        onClose={() => {
          setShowClearAll(false);
          setClearAllConfirmText('');
        }}
        title="⚠️ Delete All Data"
      >
        <div className="space-y-4">
          <p className="text-silver">
            This will permanently delete ALL clients, orders, inventory, and history.
          </p>
          <p className="text-sm text-magenta font-semibold">
            This action CANNOT be undone!
          </p>
          <div>
            <label className="block text-sm text-silver mb-1">Type DELETE to confirm:</label>
            <Input
              value={clearAllConfirmText}
              onChange={(e) => setClearAllConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </div>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowClearAll(false);
                setClearAllConfirmText('');
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={clearAllConfirmText !== 'DELETE'}
              onClick={async () => {
                if (clearAllConfirmText === 'DELETE') {
                  try {
                    await clearAllData();
                    setShowClearAll(false);
                    setClearAllConfirmText('');
                    window.location.reload();
                  } catch (error) {
                    console.error('Failed to clear all data:', error);
                  }
                }
              }}
              className="flex-1"
            >
              Delete Everything
            </Button>
          </div>
        </div>
      </Modal>

      {/* Seed Demo Modal */}
      <Modal
        isOpen={showSeedDemo}
        onClose={() => setShowSeedDemo(false)}
        title="🌱 Load Demo Data"
      >
        <div className="space-y-4">
          {seedStatus === 'success' ? (
            <div className="text-center py-4">
              <p className="text-lime text-lg font-semibold">✅ Demo data loaded!</p>
              <p className="text-silver text-sm mt-2">12 clients, 14 products, varied orders, $1M goal</p>
            </div>
          ) : (
            <>
              <p className="text-silver">
                This will create test data for integrity testing.
              </p>
              <ul className="text-sm text-silver space-y-1">
                <li>• 6 Regular products (4 standard + 2 specialty bulk)</li>
                <li>• 8 Premium products (4 standard + 4 specialty bulk)</li>
                <li>• 6 Pay Now clients (fully paid)</li>
                <li>• 6 Pay Later clients (with open orders)</li>
                <li>• Delivery orders with calculated fees</li>
                <li>• Monthly goal: $20,834</li>
              </ul>
            </>
          )}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowSeedDemo(false);
                setSeedStatus('idle');
              }}
              className="flex-1"
            >
              {seedStatus === 'success' ? 'Close' : 'Cancel'}
            </Button>
            {seedStatus !== 'success' && (
              <Button
                onClick={async () => {
                  setSeedStatus('loading');
                  try {
                    await seedTestData();
                    setSeedStatus('success');
                    setTimeout(() => window.location.reload(), 1500);
                  } catch (error) {
                    console.error('Failed to seed demo:', error);
                    setSeedStatus('idle');
                  }
                }}
                disabled={seedStatus === 'loading'}
                className="flex-1"
              >
                {seedStatus === 'loading' ? 'Loading...' : 'Load Demo'}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Quick add modal */}
      <Modal
        isOpen={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        title="Quick Add Debt"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Quickly add a client with a starting balance (for migrating from notepad).
          </p>
          <Input
            label="Client Name"
            value={quickAddName}
            onChange={(e) => setQuickAddName(e.target.value)}
            autoFocus
          />
          <Input
            label="Starting Balance"
            type="text"
            inputMode="decimal"
            placeholder="$0.00"
            value={quickAddBalance}
            onChange={(e) => setQuickAddBalance(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowQuickAdd(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleQuickAdd}
              disabled={quickAddStatus === 'loading' || !quickAddName.trim()}
              className="flex-1"
            >
              {quickAddStatus === 'loading'
                ? 'Adding...'
                : quickAddStatus === 'success'
                  ? 'Added!'
                  : 'Add'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Import modal */}
      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="Import Backup">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select backup file
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700 file:font-medium"
            />
          </div>
          <Select
            label="Import Mode"
            value={importMode}
            onChange={(e) => setImportMode(e.target.value as 'replace' | 'merge')}
            options={[
              { value: 'replace', label: 'Replace all data' },
              { value: 'merge', label: 'Merge with existing' },
            ]}
          />
          {importMode === 'replace' && (
            <p className="text-sm text-orange-600">
              Warning: This will delete all existing data!
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowImport(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!importFile || importStatus === 'loading'}
              className="flex-1"
            >
              {importStatus === 'loading'
                ? 'Importing...'
                : importStatus === 'success'
                  ? 'Done!'
                  : 'Import'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Version info */}
      <div className="text-center text-sm text-slate-400 py-4">
        BALANCEY v1.0.0
      </div>
    </div>
  );
}
