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
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<WeightUnit>('g');
  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>('PICKUP');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
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
  const paymentCents = parseMoney(paymentAmount);
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
      initialPaymentCents: paymentCents > 0 ? paymentCents : undefined,
      paymentMethod: paymentCents > 0 ? paymentMethod : undefined,
      notes: notes.trim() || undefined,
    };

    const order = await createOrder(input);
    navigate(`/orders/${order.id}`);
  };

  return (
    <div className="p-4 space-y-4 pb-32">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center text-slate-600 -ml-1"
      >
        <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Cancel
      </button>

      <h1 className="text-xl font-bold text-slate-900">New Order</h1>

      {/* Customer select */}
      <Select
        label="Customer"
        value={customerId}
        onChange={(e) => setCustomerId(e.target.value)}
        options={[
          { value: '', label: 'Select customer...' },
          ...customers.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />

      {/* Quality toggle */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Quality</label>
        <div className="flex gap-2">
          <button
            onClick={() => setQuality('REGULAR')}
            className={`flex-1 py-2.5 rounded-lg font-medium transition-colors ${
              quality === 'REGULAR'
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            Regular
          </button>
          <button
            onClick={() => setQuality('PREMIUM')}
            className={`flex-1 py-2.5 rounded-lg font-medium transition-colors ${
              quality === 'PREMIUM'
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            Premium
          </button>
        </div>
      </div>

      {/* Product select */}
      {filteredProducts.length > 0 && (
        <Select
          label="Product"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          options={filteredProducts.map((p) => ({
            value: p.id,
            label: `${p.name} (${formatMoney(p.pricePerGramCents ?? 0)}/g)`,
          }))}
        />
      )}

      {/* Quantity */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Quantity</label>
        <div className="flex gap-2">
          <Input
            type="text"
            inputMode="decimal"
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

        {/* Preset weights */}
        <div className="flex flex-wrap gap-2 mt-2">
          {presetWeights.map((w) => (
            <button
              key={w}
              onClick={() => handlePresetWeight(w)}
              className="px-3 py-1.5 text-sm bg-slate-100 rounded-lg hover:bg-slate-200"
            >
              {w}g
            </button>
          ))}
        </div>

        {/* Conversion display */}
        {quantity && unit !== 'g' && (
          <p className="text-sm text-slate-500 mt-2">
            = {formatWeight(quantityGrams, 'g')}
          </p>
        )}
      </div>

      {/* Fulfillment method */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Fulfillment</label>
        <div className="flex gap-2">
          <button
            onClick={() => setFulfillmentMethod('PICKUP')}
            className={`flex-1 py-2.5 rounded-lg font-medium transition-colors ${
              fulfillmentMethod === 'PICKUP'
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            Pickup
          </button>
          <button
            onClick={() => setFulfillmentMethod('DELIVERY')}
            className={`flex-1 py-2.5 rounded-lg font-medium transition-colors ${
              fulfillmentMethod === 'DELIVERY'
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 text-slate-700'
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

      {/* Payment */}
      <div className="space-y-3">
        <Input
          label="Payment Now"
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

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
        <textarea
          className="w-full px-3 py-2.5 text-base rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Policy summary */}
      {policyInfo && quantityGrams > 0 && (
        <Card className="bg-slate-50">
          <h3 className="font-semibold text-slate-900 mb-3">Order Summary</h3>

          <div className="space-y-2 text-sm">
            {/* Typical info */}
            {policyInfo.typicalGrams && (
              <div className="flex justify-between">
                <span className="text-slate-500">Typical order:</span>
                <span>{formatWeight(policyInfo.typicalGrams, 'g')}</span>
              </div>
            )}
            {policyInfo.upperNormalGrams && (
              <div className="flex justify-between">
                <span className="text-slate-500">Upper normal:</span>
                <span>{formatWeight(policyInfo.upperNormalGrams, 'g')}</span>
              </div>
            )}

            {/* Over typical warning */}
            {policyInfo.isOverTypical && (
              <div className="flex items-center gap-2 py-2 px-3 bg-yellow-50 rounded-lg text-yellow-700">
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
              <span className="text-slate-500">Policy:</span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${policyInfo.tierDisplay.bgColor} ${policyInfo.tierDisplay.color}`}
              >
                {policyInfo.tierDisplay.label}
              </span>
            </div>

            <div className="border-t border-slate-200 my-2"></div>

            {/* Totals */}
            <div className="flex justify-between">
              <span className="text-slate-500">Order total:</span>
              <span className="font-medium">{formatMoney(orderTotalCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Paid now:</span>
              <span>{formatMoney(paymentCents)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Balance due:</span>
              <span className={balanceDueCents > 0 ? 'text-red-600' : 'text-green-600'}>
                {formatMoney(balanceDueCents)}
              </span>
            </div>

            {/* Deposit warning */}
            {!policyInfo.meetsDepositMin && balanceDueCents > 0 && (
              <div className="flex items-center gap-2 py-2 px-3 bg-orange-50 rounded-lg text-orange-700">
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

            <div className="border-t border-slate-200 my-2"></div>

            {/* Give now / withhold */}
            <div className="flex justify-between text-green-700">
              <span>Give now:</span>
              <span className="font-medium">
                {formatWeight(policyInfo.deliverNowGrams, 'g')}
              </span>
            </div>
            {policyInfo.withheldGrams > 0 && (
              <div className="flex justify-between text-orange-600">
                <span>Withhold:</span>
                <span className="font-medium">
                  {formatWeight(policyInfo.withheldGrams, 'g')}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Submit button - fixed at bottom */}
      <div className="fixed bottom-20 left-0 right-0 p-4 bg-white border-t border-slate-200">
        <Button
          onClick={handleSubmit}
          disabled={!customerId || !productId || quantityGrams <= 0}
          className="w-full"
          size="lg"
        >
          Create Order
        </Button>
      </div>
    </div>
  );
}
