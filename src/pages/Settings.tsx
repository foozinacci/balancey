import { useState, useRef } from 'react';
import { useSettings } from '../hooks/useData';
import { updateSettings } from '../db';
import { downloadBackup, importFromFile } from '../db/backup';
import { createBalanceCarryover, clearPaidOrders, clearAllData } from '../db/orders';
import { createCustomer, getAllCustomers } from '../db/customers';
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

  const [editingPresets, setEditingPresets] = useState(false);
  const [presetsInput, setPresetsInput] = useState('');

  // Clear confirmation modals
  const [showClearPaid, setShowClearPaid] = useState(false);
  const [showClearAll, setShowClearAll] = useState(false);
  const [clearAllConfirmText, setClearAllConfirmText] = useState('');

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

  const handleUpdatePresets = async () => {
    const weights = presetsInput
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);

    if (weights.length > 0) {
      await updateSettings({ presetWeights: weights });
    }
    setEditingPresets(false);
  };

  const startEditingPresets = () => {
    setPresetsInput(settings.presetWeights.join(', '));
    setEditingPresets(true);
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Settings</h1>

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
              value={settings.monthlyGoalCents ? (settings.monthlyGoalCents / 100).toFixed(2) : ''}
              onChange={(e) => {
                const cents = parseMoney(e.target.value);
                updateSettings({ monthlyGoalCents: cents });
              }}
            />
            <p className="text-xs text-silver/70 mt-1">
              Your target monthly revenue. The Monthly Margin on the dashboard shows how you're tracking against this goal.
            </p>
          </div>
          {settings.monthlyClearedCents && settings.monthlyClearedCents > 0 && (
            <div className="text-sm text-silver/70">
              Includes ${(settings.monthlyClearedCents / 100).toFixed(2)} from cleared orders
            </div>
          )}
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
              <p className="text-xs text-slate-400 mt-1">Extra % to charge customers</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Preset weights */}
      <Card>
        <CardHeader
          title="Preset Weights"
          action={
            !editingPresets && (
              <Button variant="ghost" size="sm" onClick={startEditingPresets}>
                Edit
              </Button>
            )
          }
        />
        {editingPresets ? (
          <div className="space-y-3">
            <Input
              placeholder="1, 2, 3.5, 7, 14, 28"
              value={presetsInput}
              onChange={(e) => setPresetsInput(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditingPresets(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleUpdatePresets} className="flex-1">
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {settings.presetWeights.map((w) => (
              <span key={w} className="px-3 py-1.5 bg-slate-100 rounded-lg text-sm">
                {w}g
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Display settings */}
      <Card>
        <CardHeader title="Display" />
        <div className="space-y-3">
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
          <div className="border-t border-slate-200 pt-3 mt-3">
            <p className="text-sm text-slate-500 mb-2">Quick Actions</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => setShowClearPaid(true)}
              >
                Clear Paid
              </Button>
              <Button
                variant="danger"
                onClick={() => setShowClearAll(true)}
              >
                Clear All
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
            This will permanently delete ALL customers, orders, inventory, and history.
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

      {/* Quick add modal */}
      <Modal
        isOpen={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        title="Quick Add Debt"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Quickly add a customer with a starting balance (for migrating from notepad).
          </p>
          <Input
            label="Customer Name"
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
