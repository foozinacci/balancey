import { useState } from 'react';
import { useProducts, useSettings } from '../hooks/useData';
import { createProduct, adjustInventory } from '../db/products';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { formatWeight, formatMoney } from '../utils/units';
import type { Quality, SellMode, InventoryAdjustmentType } from '../types';

export function Inventory() {
  const products = useProducts();
  const settings = useSettings();

  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductQuality, setNewProductQuality] = useState<Quality>('REGULAR');
  const [newProductPrice, setNewProductPrice] = useState('');

  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState<string | null>(null);
  const [adjustType, setAdjustType] = useState<InventoryAdjustmentType>('RESTOCK');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');

  const adjustProduct = products.find((p) => p.id === adjustProductId);

  const handleCreateProduct = async () => {
    if (!newProductName.trim()) return;

    const pricePerGram = parseFloat(newProductPrice) || 0;
    await createProduct({
      name: newProductName.trim(),
      quality: newProductQuality,
      sellMode: 'WEIGHT' as SellMode,
      pricePerGramCents: Math.round(pricePerGram * 100),
    });

    setNewProductName('');
    setNewProductPrice('');
    setShowNewProduct(false);
  };

  const handleAdjust = async () => {
    if (!adjustProductId) return;

    const grams = parseFloat(adjustAmount) || 0;
    if (grams <= 0) return;

    const adjustment = adjustType === 'WASTE' ? -grams : grams;
    await adjustInventory(
      adjustProductId,
      adjustType,
      adjustment,
      0,
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

  const unit = settings?.defaultWeightUnit ?? 'g';

  // Group by quality
  const regularProducts = products.filter((p) => p.quality === 'REGULAR');
  const premiumProducts = products.filter((p) => p.quality === 'PREMIUM');

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Inventory</h1>
        <Button onClick={() => setShowNewProduct(true)}>+ Product</Button>
      </div>

      {products.length === 0 ? (
        <Card className="text-center py-8">
          <p className="text-slate-500">No products yet. Add one to get started!</p>
        </Card>
      ) : (
        <>
          {/* Regular products */}
          {regularProducts.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-2">
                Regular
              </h2>
              <div className="space-y-2">
                {regularProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    unit={unit}
                    onRestock={() => openAdjustModal(product.id, 'RESTOCK')}
                    onWaste={() => openAdjustModal(product.id, 'WASTE')}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Premium products */}
          {premiumProducts.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-2">
                Premium
              </h2>
              <div className="space-y-2">
                {premiumProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    unit={unit}
                    onRestock={() => openAdjustModal(product.id, 'RESTOCK')}
                    onWaste={() => openAdjustModal(product.id, 'WASTE')}
                  />
                ))}
              </div>
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Quality</label>
            <div className="flex gap-2">
              <button
                onClick={() => setNewProductQuality('REGULAR')}
                className={`flex-1 py-2.5 rounded-lg font-medium transition-colors ${
                  newProductQuality === 'REGULAR'
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                Regular
              </button>
              <button
                onClick={() => setNewProductQuality('PREMIUM')}
                className={`flex-1 py-2.5 rounded-lg font-medium transition-colors ${
                  newProductQuality === 'PREMIUM'
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                Premium
              </button>
            </div>
          </div>
          <Input
            label="Price per gram ($)"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={newProductPrice}
            onChange={(e) => setNewProductPrice(e.target.value)}
          />
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
        title={adjustType === 'RESTOCK' ? 'Restock' : 'Record Waste'}
      >
        <div className="space-y-4">
          {adjustProduct && (
            <div className="text-center py-2 bg-slate-50 rounded-lg">
              <div className="font-medium">{adjustProduct.name}</div>
              <div className="text-sm text-slate-500">
                Current: {formatWeight(adjustProduct.inventory.onHandGrams, unit)}
              </div>
            </div>
          )}
          <Input
            label={`Amount (${unit})`}
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={adjustAmount}
            onChange={(e) => setAdjustAmount(e.target.value)}
            autoFocus
          />
          <Input
            label="Note"
            placeholder="Optional note..."
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
              {adjustType === 'RESTOCK' ? 'Add Stock' : 'Remove Stock'}
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
  onRestock: () => void;
  onWaste: () => void;
}

function ProductCard({ product, unit, onRestock, onWaste }: ProductCardProps) {
  const isLow = product.availableGrams < 10;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-medium text-slate-900">{product.name}</h3>
          <p className="text-sm text-slate-500">
            {formatMoney(product.pricePerGramCents ?? 0)}/g
          </p>
        </div>
        {isLow && (
          <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
            Low
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-sm mb-3">
        <div>
          <div className="font-semibold text-slate-900">
            {formatWeight(product.inventory.onHandGrams, unit)}
          </div>
          <div className="text-slate-500">On Hand</div>
        </div>
        <div>
          <div className="font-semibold text-orange-600">
            {formatWeight(product.inventory.reservedGrams, unit)}
          </div>
          <div className="text-slate-500">Reserved</div>
        </div>
        <div>
          <div className={`font-semibold ${isLow ? 'text-red-600' : 'text-green-600'}`}>
            {formatWeight(product.availableGrams, unit)}
          </div>
          <div className="text-slate-500">Available</div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onRestock} className="flex-1">
          + Restock
        </Button>
        <Button variant="ghost" size="sm" onClick={onWaste} className="flex-1">
          - Waste
        </Button>
      </div>
    </Card>
  );
}
