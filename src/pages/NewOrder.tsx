import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCustomers, useProducts, useSettings } from '../hooks/useData';
import { createOrder, type CreateOrderInput } from '../db/orders';
import { getCustomerTags } from '../db/customers';
import { computeTypicalOrderStats, isOverTypical } from '../utils/typicalOrder';
import { determinePolicy, computeDeliverNow, getPolicyTierDisplay } from '../utils/policyEngine';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { formatMoney, formatWeight, toGrams, fromGrams, parseMoney } from '../utils/units';
import type { FulfillmentMethod, PaymentMethod, Quality, WeightUnit } from '../types';

export function NewOrder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCustomerId = searchParams.get('customer');

  const customers = useCustomers();
  const products = useProducts();
  const settings = useSettings();

  // Form state
  const [customerId, setCustomerId] = useState(preselectedCustomerId ?? '');
  const [quality, setQuality] = useState<Quality>('REGULAR');
  const [productId, setProductId] = useState('');
  const [useCustomValues, setUseCustomValues] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<WeightUnit>('g');
  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>('PICKUP');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [paymentTiming, setPaymentTiming] = useState<'now' | 'later'>('later');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  // Policy state
  const [policyInfo, setPolicyInfo] = useState<{
    tier: string;
    tierDisplay: { label: string; color: string; bgColor: string };
    isOverTypical: boolean;
    typicalGrams: number | null;
    upperNormalGrams: number | null;
    deliverNowGrams: number;
    withheldGrams: number;
    depositMinCents: number;
    meetsDepositMin: boolean;
  } | null>(null);

  // Filter products by quality
  const filteredProducts = useMemo(() => {
    return products.filter((p) => p.quality === quality);
  }, [products, quality]);

  // Set default product when quality changes
  useEffect(() => {
    if (filteredProducts.length > 0 && !filteredProducts.find((p) => p.id === productId)) {
      setProductId(filteredProducts[0].id);
    }
  }, [filteredProducts, productId]);

  // Get selected product
  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === productId);
  }, [products, productId]);

  // Calculate totals
  const quantityGrams = useMemo(() => {
    const val = parseFloat(quantity) || 0;
    return toGrams(val, unit);
  }, [quantity, unit]);

  const lineTotalCents = useMemo(() => {
    if (!selectedProduct || quantityGrams <= 0) return 0;
    if (selectedProduct.pricePerGramCents) {
      return Math.round(quantityGrams * selectedProduct.pricePerGramCents);
    }
    return 0;
  }, [selectedProduct, quantityGrams]);

  const deliveryFeeCents = parseMoney(deliveryFee);
  const orderTotalCents = lineTotalCents + deliveryFeeCents;
  // Payment is 0 for Pay Later orders
  const paymentCents = paymentTiming === 'now' ? parseMoney(paymentAmount) : 0;
  const balanceDueCents = Math.max(0, orderTotalCents - paymentCents);

  // Compute policy when relevant inputs change
  useEffect(() => {
    async function computePolicy() {
      if (!customerId || !settings || quantityGrams <= 0) {
        setPolicyInfo(null);
        return;
      }

      const tags = await getCustomerTags(customerId);
      const typicalStats = await computeTypicalOrderStats(customerId, quality, settings);
      const overTypical = isOverTypical(quantityGrams, typicalStats);
      const policy = determinePolicy(tags, overTypical, settings);

      const deliverNow = computeDeliverNow(
        paymentCents,
        lineTotalCents,
        quantityGrams,
        0,
        selectedProduct?.pricePerGramCents,
        undefined,
        policy
      );

      setPolicyInfo({
        tier: policy.tier,
        tierDisplay: getPolicyTierDisplay(policy.tier),
        isOverTypical: overTypical,
        typicalGrams: typicalStats?.medianGrams ?? null,
        upperNormalGrams: typicalStats?.upperNormal ?? null,
        deliverNowGrams: deliverNow.deliverNowGrams,
        withheldGrams: deliverNow.withheldGrams,
        depositMinCents: deliverNow.depositMinCents,
        meetsDepositMin: deliverNow.meetsDepositMin,
      });
    }

    computePolicy();
  }, [customerId, quality, quantityGrams, paymentCents, lineTotalCents, selectedProduct, settings]);

  // Preset weights
  const presetWeights = settings?.presetWeights ?? [1, 2, 3.5, 7, 14, 28];

  const handlePresetWeight = (grams: number) => {
    const converted = fromGrams(grams, unit);
    setQuantity(converted.toString());
  };

  const handleSubmit = async () => {
    if (!customerId || !productId || quantityGrams <= 0) return;
    if (paymentTiming === 'later' && !dueDate) return;

    // Calculate due date
    let orderDueAt: number | undefined;
    if (paymentTiming === 'later' && dueDate) {
      orderDueAt = new Date(dueDate + 'T23:59:59').getTime();
    }

    // Payment only for Pay Now
    const actualPaymentCents = paymentTiming === 'now' ? paymentCents : 0;

    const input: CreateOrderInput = {
      customerId,
      items: [
        {
          productId,
          quantityGrams,
          pricePerGramCents: selectedProduct?.pricePerGramCents,
        },
      ],
      fulfillmentMethod,
      deliveryAddress: fulfillmentMethod === 'DELIVERY' ? deliveryAddress : undefined,
      deliveryFeeCents: fulfillmentMethod === 'DELIVERY' ? deliveryFeeCents : 0,
      initialPaymentCents: actualPaymentCents > 0 ? actualPaymentCents : undefined,
      paymentMethod: actualPaymentCents > 0 ? paymentMethod : undefined,
      notes: notes.trim() || undefined,
      dueAt: orderDueAt,
    };

    const order = await createOrder(input);
    navigate(`/orders/${order.id}`);
  };

  return (
    <div className="p-4 space-y-4 pb-32">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center text-silver -ml-1"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <h1 className="text-xl font-bold text-text-primary">New Order</h1>

      {/* Client select */}
      <Select
        label="Client"
        value={customerId}
        onChange={(e) => setCustomerId(e.target.value)}
        options={[
          { value: '', label: 'Select client...' },
          ...customers.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />

      {/* Quality toggle */}
      <div>
        <label className="block text-sm font-medium text-silver mb-2">Quality</label>
        <div className="flex gap-2">
          <button
            onClick={() => setQuality('REGULAR')}
            className={`flex-1 py-2.5 rounded-xl font-medium transition-all ${quality === 'REGULAR'
              ? 'bg-lime text-[#050810] font-semibold'
              : 'glass-card text-silver hover:text-text-primary'
              }`}
          >
            Regular
          </button>
          <button
            onClick={() => setQuality('PREMIUM')}
            className={`flex-1 py-2.5 rounded-xl font-medium transition-all ${quality === 'PREMIUM'
              ? 'bg-gold text-[#050810] font-semibold'
              : 'glass-card text-silver hover:text-gold'
              }`}
          >
            Premium
          </button>
        </div>
      </div>

      {/* Product select with Custom Values option */}
      <div>
        <label className="block text-sm font-medium text-silver mb-2">Product</label>
        {filteredProducts.length > 0 ? (
          <Select
            value={useCustomValues ? 'custom' : productId}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                setUseCustomValues(true);
                setProductId('');
              } else {
                setUseCustomValues(false);
                setProductId(e.target.value);
              }
            }}
            options={[
              ...filteredProducts.map((p) => ({
                value: p.id,
                label: `${p.name} (${formatMoney(p.pricePerGramCents ?? 0)}/g)`,
              })),
              { value: 'custom', label: '+ Custom Values' },
            ]}
          />
        ) : (
          <p className="text-sm text-silver italic">No {quality.toLowerCase()} products in inventory</p>
        )}
      </div>

      {/* Custom price input (only if Custom Values selected) */}
      {useCustomValues && (
        <Input
          label="Custom Price per Gram ($)"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
        />
      )}

      {/* Quantity with weight unit and quick selects */}
      <div>
        <label className="block text-sm font-medium text-silver mb-2">Quantity</label>
        <div className="flex gap-2">
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="flex-1"
          />
          <Select
            value={unit}
            onChange={(e) => setUnit(e.target.value as WeightUnit)}
            options={[
              { value: 'g', label: 'g' },
              { value: 'oz', label: 'oz' },
              { value: 'lb', label: 'lb' },
              { value: 'kg', label: 'kg' },
            ]}
            className="w-20"
          />
        </div>

        {/* Quick selects - only show for grams */}
        {unit === 'g' && (
          <div className="flex flex-wrap gap-2 mt-2">
            {presetWeights.map((w) => (
              <button
                key={w}
                onClick={() => handlePresetWeight(w)}
                className={`px-3 py-1.5 text-sm rounded-xl transition-all ${quantity === String(w)
                  ? 'bg-lime text-[#050810] font-semibold'
                  : 'glass-card text-silver hover:text-lime'
                  }`}
              >
                {w}g
              </button>
            ))}
          </div>
        )}

        {/* Conversion display */}
        {quantity && unit !== 'g' && (
          <p className="text-sm text-silver mt-2">
            = {formatWeight(quantityGrams, 'g')}
          </p>
        )}
      </div>

      {/* Fulfillment method */}
      <div>
        <label className="block text-sm font-medium text-silver mb-2">Fulfillment</label>
        <div className="flex gap-2">
          <button
            onClick={() => setFulfillmentMethod('PICKUP')}
            className={`flex-1 py-2.5 rounded-xl font-medium transition-all ${fulfillmentMethod === 'PICKUP'
              ? 'bg-lime text-[#050810] font-semibold'
              : 'glass-card text-silver hover:text-text-primary'
              }`}
          >
            Pickup
          </button>
          <button
            onClick={() => setFulfillmentMethod('DELIVERY')}
            className={`flex-1 py-2.5 rounded-xl font-medium transition-all ${fulfillmentMethod === 'DELIVERY'
              ? 'bg-lime text-[#050810] font-semibold'
              : 'glass-card text-silver hover:text-text-primary'
              }`}
          >
            Delivery
          </button>
        </div>
      </div>

      {/* Delivery options */}
      {fulfillmentMethod === 'DELIVERY' && (
        <div className="space-y-3">
          <Input
            label="Delivery Address"
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
          />
          <Input
            label="Delivery Fee"
            type="text"
            inputMode="decimal"
            placeholder="$0.00"
            value={deliveryFee}
            onChange={(e) => setDeliveryFee(e.target.value)}
          />
        </div>
      )}

      {/* Payment Timing */}
      <div>
        <label className="block text-sm font-medium text-silver mb-2">Payment</label>
        <div className="flex gap-2">
          <button
            onClick={() => setPaymentTiming('now')}
            className={`flex-1 py-2.5 rounded-xl font-medium transition-all ${paymentTiming === 'now'
              ? 'bg-lime text-[#050810] font-semibold'
              : 'glass-card text-silver hover:text-text-primary'
              }`}
          >
            Pay Now
          </button>
          <button
            onClick={() => setPaymentTiming('later')}
            className={`flex-1 py-2.5 rounded-xl font-medium transition-all ${paymentTiming === 'later'
              ? 'bg-lime text-[#050810] font-semibold'
              : 'glass-card text-silver hover:text-text-primary'
              }`}
          >
            Pay Later
          </button>
        </div>
      </div>

      {/* Pay Now - Payment Amount */}
      {paymentTiming === 'now' && (
        <div className="space-y-3">
          <Input
            label="Payment Amount"
            type="text"
            inputMode="decimal"
            placeholder="$0.00"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
          />
          {paymentCents > 0 && (
            <Select
              label="Payment Method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              options={[
                { value: 'CASH', label: 'Cash' },
                { value: 'CARD', label: 'Card' },
                { value: 'OTHER', label: 'Other' },
              ]}
            />
          )}
        </div>
      )}

      {/* Pay Later - Due Date */}
      {paymentTiming === 'later' && (
        <div>
          <label className="block text-sm font-medium text-silver mb-1">Due Date *</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-4 py-3 rounded-xl glass-card border border-surface-600 text-text-primary bg-transparent focus:outline-none focus:ring-2 focus:ring-lime/50"
            required
          />
          {!dueDate && (
            <p className="text-xs text-magenta mt-1">Due date is required for Pay Later orders</p>
          )}
        </div>
      )}

      {/* Notes (Optional) */}
      <div>
        <label className="block text-sm font-medium text-silver mb-1">Notes (Optional)</label>
        <textarea
          className="w-full px-4 py-3 text-base rounded-xl glass-input resize-none"
          rows={2}
          placeholder="Add any notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Order Summary */}
      {policyInfo && quantityGrams > 0 && (
        <Card>
          <h3 className="font-semibold text-text-primary mb-3">Order Summary</h3>

          <div className="space-y-2 text-sm">
            {/* Typical info */}
            {policyInfo.typicalGrams && (
              <div className="flex justify-between">
                <span className="text-silver">Typical order:</span>
                <span className="text-text-primary">{formatWeight(policyInfo.typicalGrams, 'g')}</span>
              </div>
            )}
            {policyInfo.upperNormalGrams && (
              <div className="flex justify-between">
                <span className="text-silver">Upper normal:</span>
                <span className="text-text-primary">{formatWeight(policyInfo.upperNormalGrams, 'g')}</span>
              </div>
            )}

            {/* Over typical warning */}
            {policyInfo.isOverTypical && (
              <div className="flex items-center gap-2 py-2 px-3 bg-gold/10 rounded-lg text-gold">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                Over typical amount
              </div>
            )}

            {/* Policy tier */}
            <div className="flex justify-between items-center">
              <span className="text-silver">Policy:</span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${policyInfo.tierDisplay.bgColor} ${policyInfo.tierDisplay.color}`}
              >
                {policyInfo.tierDisplay.label}
              </span>
            </div>

            <div className="border-t border-surface-600 my-2"></div>

            {/* Totals */}
            <div className="flex justify-between">
              <span className="text-silver">Order total:</span>
              <span className="font-medium text-text-primary">{formatMoney(orderTotalCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-silver">Paid now:</span>
              <span className="text-text-primary">{formatMoney(paymentCents)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-text-primary">Balance due:</span>
              <span className={balanceDueCents > 0 ? 'text-magenta' : 'text-lime'}>
                {formatMoney(balanceDueCents)}
              </span>
            </div>

            {/* Deposit warning */}
            {!policyInfo.meetsDepositMin && balanceDueCents > 0 && (
              <div className="flex items-center gap-2 py-2 px-3 bg-gold/10 rounded-lg text-gold">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                Minimum deposit: {formatMoney(policyInfo.depositMinCents)}
              </div>
            )}

            <div className="border-t border-surface-600 my-2"></div>

            {/* Give now / withhold */}
            <div className="flex justify-between text-lime">
              <span>Give now:</span>
              <span className="font-medium">
                {formatWeight(policyInfo.deliverNowGrams, 'g')}
              </span>
            </div>
            {policyInfo.withheldGrams > 0 && (
              <div className="flex justify-between text-gold">
                <span>Withhold:</span>
                <span className="font-medium">
                  {formatWeight(policyInfo.withheldGrams, 'g')}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Submit button */}
      <div className="pb-4">
        <Button
          onClick={handleSubmit}
          disabled={!customerId || !productId || quantityGrams <= 0 || (paymentTiming === 'later' && !dueDate)}
          className="w-full"
          size="lg"
        >
          Create Order
        </Button>
      </div>
    </div>
  );
}
