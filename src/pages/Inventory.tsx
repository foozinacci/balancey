import { useState } from 'react';
import { useProducts, useSettings, useWasteHistory } from '../hooks/useData';
import { createProduct, adjustInventory } from '../db/products';
import { db } from '../db';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Modal } from '../components/Modal';
import { formatWeight, toGrams } from '../utils/units';
import type { Quality, SellMode, InventoryAdjustmentType, WeightUnit } from '../types';

export function Inventory() {
  const products = useProducts();
  const settings = useSettings();
  const wasteHistory = useWasteHistory();

  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductQuality, setNewProductQuality] = useState<Quality>('REGULAR');
  const [newProductQuantity, setNewProductQuantity] = useState('');  // Number of items
  const [newProductWeight, setNewProductWeight] = useState('');      // Weight per item
  const [newProductWeightUnit, setNewProductWeightUnit] = useState<WeightUnit>('g');

  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState<string | null>(null);
  const [adjustType, setAdjustType] = useState<InventoryAdjustmentType>('RESTOCK');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');

  const adjustProduct = products.find((p) => p.id === adjustProductId);

  const handleCreateProduct = async () => {
    if (!newProductName.trim()) return;

    // Get price from Settings - Regular uses base price, Premium uses base + markup
    const baseSale = settings?.baseSaleCentsPerGram ?? 0;
    let pricePerGramCents: number;

    if (newProductQuality === 'PREMIUM') {
      const markupPct = settings?.premiumSalePct ?? 30;
      pricePerGramCents = Math.round(baseSale * (1 + markupPct / 100));
    } else {
      pricePerGramCents = baseSale;
    }

    // Calculate weight per item in grams
    const weightPerItem = parseFloat(newProductWeight) || 1;
    const weightPerItemGrams = toGrams(weightPerItem, newProductWeightUnit);

    const product = await createProduct({
      name: newProductName.trim(),
      quality: newProductQuality,
      sellMode: 'WEIGHT' as SellMode,
      pricePerGramCents,
      weightPerItemGrams, // Store weight per individual item
    });

    // Add initial stock: Quantity × Weight per item = Total grams
    const quantity = parseFloat(newProductQuantity) || 0;
    if (quantity > 0 && weightPerItemGrams > 0) {
      const totalGrams = quantity * weightPerItemGrams;
      // Pass both grams AND units to track quantity independently
      await adjustInventory(product.id, 'RESTOCK', totalGrams, quantity, `Initial stock: ${quantity} × ${weightPerItem}${newProductWeightUnit}`);
    }

    setNewProductName('');
    setNewProductQuantity('');
    setNewProductWeight('');
    setNewProductWeightUnit(settings?.defaultWeightUnit ?? 'g');
    setShowNewProduct(false);
  };

  const handleAdjust = async () => {
    if (!adjustProductId) return;

    const units = parseInt(adjustAmount) || 0;
    if (units <= 0) return;

    // Calculate grams based on units * weight per item
    const product = products.find(p => p.id === adjustProductId);
    const weightPerItem = product?.weightPerItemGrams ?? 0;
    const grams = units * weightPerItem;

    const gramsAdjustment = adjustType === 'WASTE' ? -grams : grams;
    const unitsAdjustment = adjustType === 'WASTE' ? -units : units;

    await adjustInventory(
      adjustProductId,
      adjustType,
      gramsAdjustment,
      unitsAdjustment,
      adjustNote.trim() || `${adjustType} adjustment`
    );

    setAdjustAmount('');
    setAdjustNote('');
    setShowAdjust(false);
    setAdjustProductId(null);
  };

  const openAdjustModal = (productId: string, type: InventoryAdjustmentType) => {
    setAdjustProductId(productId);
    setAdjustType(type);
    setShowAdjust(true);
  };

  // Quick +1/-1 adjustments
  const handleQuickOnHand = async (productId: string, delta: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const weightPerItem = product.weightPerItemGrams ?? 1;
    await adjustInventory(
      productId,
      delta > 0 ? 'RESTOCK' : 'WASTE',
      delta * weightPerItem,
      delta,
      delta > 0 ? 'Quick +1' : 'Quick -1'
    );
  };

  const handleQuickReserved = async (productId: string, delta: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const weightPerItem = product.weightPerItemGrams ?? 1;
    // Update reserved directly via db
    const inventory = product.inventory;
    await db.inventory.update(productId, {
      reservedGrams: Math.max(0, inventory.reservedGrams + (delta * weightPerItem)),
      reservedUnits: Math.max(0, inventory.reservedUnits + delta),
      updatedAt: Date.now(),
    });
  };

  const unit = settings?.defaultWeightUnit ?? 'g';

  // Group by quality and sort by total value (weight × price) - cheapest first, most expensive last
  // If same value, sort by availability (more available = higher priority, comes first)
  const getTotalValue = (p: typeof products[0]) =>
    (p.weightPerItemGrams ?? 0) * (p.pricePerGramCents ?? 0);

  const sortProducts = (a: typeof products[0], b: typeof products[0]) => {
    const valueDiff = getTotalValue(a) - getTotalValue(b);
    if (valueDiff !== 0) return valueDiff;
    // Same value, sort by availability (more available first)
    return b.availableUnits - a.availableUnits;
  };

  const regularProducts = products
    .filter((p) => p.quality === 'REGULAR')
    .sort(sortProducts);
  const premiumProducts = products
    .filter((p) => p.quality === 'PREMIUM')
    .sort(sortProducts);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">Inventory</h1>
        <Button onClick={() => setShowNewProduct(true)}>+ Product</Button>
      </div>

      {/* Inventory Summary KPIs */}
      {products.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="text-center">
            <div className="text-2xl font-bold text-text-primary font-mono">
              {formatWeight(
                regularProducts.reduce((sum, p) => sum + p.availableGrams, 0),
                unit
              )}
            </div>
            <div className="text-sm text-text-secondary mt-1">Regular Stock</div>
          </Card>
          <Card className="text-center">
            <div className="text-2xl font-bold text-gold font-mono">
              {formatWeight(
                premiumProducts.reduce((sum, p) => sum + p.availableGrams, 0),
                unit
              )}
            </div>
            <div className="text-sm text-text-secondary mt-1">Premium Stock</div>
          </Card>
        </div>
      )}

      {products.length === 0 ? (
        <Card className="text-center py-8">
          <p className="text-text-secondary">No products yet. Add one to get started!</p>
        </Card>
      ) : (
        <>
          {/* Regular products */}
          {regularProducts.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-2">
                Regular
              </h2>
              <div className="space-y-2">
                {regularProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    unit={unit}
                    settings={settings}
                    onAddOnHand={() => handleQuickOnHand(product.id, 1)}
                    onRemoveOnHand={() => handleQuickOnHand(product.id, -1)}
                    onAddReserved={() => handleQuickReserved(product.id, 1)}
                    onRemoveReserved={() => handleQuickReserved(product.id, -1)}
                    onWaste={() => openAdjustModal(product.id, 'WASTE')}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Premium products */}
          {premiumProducts.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gold uppercase tracking-wider mb-2">
                Premium
              </h2>
              <div className="space-y-2">
                {premiumProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    unit={unit}
                    settings={settings}
                    onAddOnHand={() => handleQuickOnHand(product.id, 1)}
                    onRemoveOnHand={() => handleQuickOnHand(product.id, -1)}
                    onAddReserved={() => handleQuickReserved(product.id, 1)}
                    onRemoveReserved={() => handleQuickReserved(product.id, -1)}
                    onWaste={() => openAdjustModal(product.id, 'WASTE')}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Shake - aggregated totals */}
          {wasteHistory.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-2">
                Shake
              </h2>
              <Card>
                <div className="space-y-2">
                  {/* Regular waste total */}
                  {(() => {
                    const regularTotal = wasteHistory
                      .filter(r => r.quality === 'REGULAR')
                      .reduce((sum, r) => sum + r.gramsAdjustment, 0);
                    if (regularTotal > 0) {
                      return (
                        <div className="flex justify-between items-center py-1">
                          <span className="text-sm font-medium text-text-primary">Regular</span>
                          <span className="text-magenta font-mono text-sm">
                            -{formatWeight(regularTotal, unit)}
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {/* Premium waste total */}
                  {(() => {
                    const premiumTotal = wasteHistory
                      .filter(r => r.quality === 'PREMIUM')
                      .reduce((sum, r) => sum + r.gramsAdjustment, 0);
                    if (premiumTotal > 0) {
                      return (
                        <div className="flex justify-between items-center py-1">
                          <span className="text-sm font-medium text-gold">Premium</span>
                          <span className="text-magenta font-mono text-sm">
                            -{formatWeight(premiumTotal, unit)}
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {/* New product modal */}
      <Modal
        isOpen={showNewProduct}
        onClose={() => setShowNewProduct(false)}
        title="New Product"
      >
        <div className="space-y-4">
          <Input
            label="Product Name"
            placeholder="e.g., Vanilla"
            value={newProductName}
            onChange={(e) => setNewProductName(e.target.value)}
            autoFocus
          />

          {/* Quality toggle - first */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Quality</label>
            <div className="flex gap-2">
              <button
                onClick={() => setNewProductQuality('REGULAR')}
                className={`flex-1 py-2.5 rounded-xl font-medium transition-all ${newProductQuality === 'REGULAR'
                  ? 'bg-lime text-[#050810] font-semibold'
                  : 'glass-card text-silver hover:text-text-primary'
                  }`}
              >
                Regular
              </button>
              <button
                onClick={() => setNewProductQuality('PREMIUM')}
                className={`flex-1 py-2.5 rounded-xl font-medium transition-all ${newProductQuality === 'PREMIUM'
                  ? 'bg-gold text-[#050810] font-semibold'
                  : 'glass-card text-silver hover:text-gold'
                  }`}
              >
                Premium
              </button>
            </div>
          </div>

          {/* Quantity | Weight per Item - same row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Quantity</label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="e.g., 15"
                value={newProductQuantity}
                onChange={(e) => setNewProductQuantity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Weight per Item</label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g., 14"
                  value={newProductWeight}
                  onChange={(e) => setNewProductWeight(e.target.value)}
                  className="flex-1"
                />
                <Select
                  value={newProductWeightUnit}
                  onChange={(e) => setNewProductWeightUnit(e.target.value as WeightUnit)}
                  options={[
                    { value: 'g', label: 'g' },
                    { value: 'oz', label: 'oz' },
                    { value: 'lb', label: 'lb' },
                    { value: 'kg', label: 'kg' },
                  ]}
                  className="w-16"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowNewProduct(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProduct}
              disabled={!newProductName.trim()}
              className="flex-1"
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Adjust modal */}
      <Modal
        isOpen={showAdjust}
        onClose={() => setShowAdjust(false)}
        title={adjustType === 'RESTOCK' ? 'Restock' : 'Record Shake'}
      >
        <div className="space-y-3">
          {adjustProduct && (
            <div className="text-center py-2 glass-card rounded-xl">
              <div className="font-medium text-lime text-sm">{adjustProduct.name}</div>
              <div className="text-xs text-text-secondary">
                Available: {adjustProduct.availableUnits} units ({formatWeight(adjustProduct.availableGrams, unit)})
              </div>
            </div>
          )}
          <Select
            label="Quantity"
            value={adjustAmount}
            onChange={(e) => setAdjustAmount(e.target.value)}
            options={(() => {
              // For shake, limit to available units; for restock, allow up to 100
              const maxUnits = adjustType === 'WASTE'
                ? (adjustProduct?.availableUnits ?? 0)
                : 100;
              return Array.from({ length: maxUnits }, (_, i) => ({
                value: String(i + 1),
                label: String(i + 1),
              }));
            })()}
          />
          <Input
            label="Note"
            placeholder="Optional..."
            value={adjustNote}
            onChange={(e) => setAdjustNote(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowAdjust(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleAdjust}
              variant={adjustType === 'WASTE' ? 'danger' : 'primary'}
              className="flex-1"
            >
              {adjustType === 'RESTOCK' ? 'Add' : 'Remove'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

interface ProductCardProps {
  product: ReturnType<typeof useProducts>[0];
  unit: 'g' | 'kg' | 'oz' | 'lb';
  settings: ReturnType<typeof useSettings>;
  onAddOnHand: () => void;
  onRemoveOnHand: () => void;
  onAddReserved: () => void;
  onRemoveReserved: () => void;
  onWaste: () => void;
}

function ProductCard({ product, unit, settings, onAddOnHand, onRemoveOnHand, onAddReserved, onRemoveReserved, onWaste }: ProductCardProps) {
  const isLow = product.availableUnits < 5;
  const isPremium = product.quality === 'PREMIUM';
  const weightPerItem = product.weightPerItemGrams ?? 1;

  // Calculate unit counts
  const onHandUnits = product.inventory.onHandUnits;
  const reservedUnits = product.inventory.reservedUnits;
  const availableUnits = product.availableUnits;
  const totalWeightGrams = availableUnits * weightPerItem;

  // Calculate cost and worth using settings pricing
  const baseCostPerGram = settings?.baseCostCentsPerGram ?? 500; // Default $5/g
  const baseSalePerGram = settings?.baseSaleCentsPerGram ?? 1000; // Default $10/g
  const premiumCostPct = settings?.premiumCostPct ?? 20; // Match Settings UI default
  const premiumSalePct = settings?.premiumSalePct ?? 30; // Match Settings UI default

  // Apply premium markups if premium product
  const costPerGram = isPremium ? baseCostPerGram * (1 + premiumCostPct / 100) : baseCostPerGram;
  const salePerGram = isPremium ? baseSalePerGram * (1 + premiumSalePct / 100) : baseSalePerGram;

  const totalCostCents = Math.round(totalWeightGrams * costPerGram);
  const totalWorthCents = Math.round(totalWeightGrams * salePerGram);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className={`font-medium ${isPremium ? 'text-gold' : 'text-text-primary'}`}>{product.name}</h3>
          <p className="text-sm text-text-secondary">
            {formatWeight(weightPerItem, unit)} each
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLow && (
            <span className="px-2 py-0.5 text-xs font-medium bg-gold/20 text-gold rounded-full">
              Low
            </span>
          )}
          {/* Trash icon for shake/waste */}
          <button
            onClick={onWaste}
            className="p-2 rounded-lg hover:bg-magenta/20 text-silver hover:text-magenta transition-colors"
            title="Record Shake"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Units display with +/- controls */}
      <div className="grid grid-cols-3 gap-2 text-center text-sm mb-2">
        {/* On Hand with controls */}
        <div>
          <div className="flex items-center justify-center gap-1 mb-1">
            <button
              onClick={onRemoveOnHand}
              disabled={onHandUnits <= 0}
              className="w-6 h-6 rounded-md bg-surface-600 hover:bg-surface-500 text-silver hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold"
            >
              −
            </button>
            <span className="font-semibold text-text-primary w-6">{onHandUnits}</span>
            <button
              onClick={onAddOnHand}
              className="w-6 h-6 rounded-md bg-lime/20 hover:bg-lime/30 text-lime transition-colors text-sm font-bold"
            >
              +
            </button>
          </div>
          <div className="text-text-secondary text-xs">On Hand</div>
        </div>

        {/* Reserved with controls */}
        <div>
          <div className="flex items-center justify-center gap-1 mb-1">
            <button
              onClick={onRemoveReserved}
              disabled={reservedUnits <= 0}
              className="w-6 h-6 rounded-md bg-surface-600 hover:bg-surface-500 text-silver hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold"
            >
              −
            </button>
            <span className="font-semibold text-gold w-6">{reservedUnits}</span>
            <button
              onClick={onAddReserved}
              disabled={availableUnits <= 0}
              className="w-6 h-6 rounded-md bg-gold/20 hover:bg-gold/30 text-gold transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-bold"
            >
              +
            </button>
          </div>
          <div className="text-text-secondary text-xs">Reserved</div>
        </div>

        {/* Available (read-only) */}
        <div>
          <div className="font-semibold mb-1 h-6 flex items-center justify-center">
            <span className={isLow ? 'text-magenta' : 'text-lime'}>{availableUnits}</span>
          </div>
          <div className="text-text-secondary text-xs">Available</div>
        </div>
      </div>

      {/* Weight and value summary */}
      <div className="text-xs text-center space-y-1 pt-1 border-t border-silver/10">
        <p className="text-text-secondary">
          {formatWeight(totalWeightGrams, unit)} total weight
        </p>
        <div className="flex justify-center gap-4">
          {totalCostCents > 0 && (
            <span className="text-magenta">
              Cost: ${(totalCostCents / 100).toFixed(2)}
            </span>
          )}
          <span className="text-lime">
            Worth: ${(totalWorthCents / 100).toFixed(2)}
          </span>
        </div>
      </div>
    </Card>
  );
}
