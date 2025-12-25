import { useState, useRef } from 'react';
import { useSettings } from '../hooks/useData';
import { updateSettings } from '../db';
import { downloadBackup, importFromFile } from '../db/backup';
import { createBalanceCarryover } from '../db/orders';
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
          <div>
            <label className="block text-sm text-slate-500 mb-1">Default Due Days</label>
            <Input
              type="number"
              min="1"
              max="90"
              value={settings.defaultDueDays}
              onChange={(e) => updateSettings({ defaultDueDays: parseInt(e.target.value) })}
            />
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
        </div>
      </Card>

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
