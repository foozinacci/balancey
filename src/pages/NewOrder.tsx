import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCustomers, useProducts, useSettings } from '../hooks/useData';
import { createOrder, type CreateOrderInput } from '../db/orders';
import { getCustomerTags } from '../db/customers';
import { computeTypicalOrderStats, isOverTypical } from '../utils/typicalOrder';
import { determinePolicy, computeDeliverNow, getPolicyTierDisplay } from '../utils/policyEngine';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { NewClientModal } from '../components/NewClientModal';
import { audio } from '../utils/audio';
import { formatMoney, formatWeight, parseMoney } from '../utils/units';
import { geocodeAddress, haversineDistance, estimateDrivingDistance, calculateDeliveryFee, getCurrentLocation, getMpgForVehicle } from '../utils/distance';
import type { FulfillmentMethod } from '../types';

export function NewOrder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCustomerId = searchParams.get('customer');

  const customers = useCustomers();
  const products = useProducts();
  const settings = useSettings();

  // Form state
  const [customerId, setCustomerId] = useState(preselectedCustomerId ?? '');

  // Primary line item (quantity = number of items, each item is 1 unit of product weight)
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');

  // Additional line items for multi-product orders
  type LineItem = { productId: string; quantity: string };
  const [additionalItems, setAdditionalItems] = useState<LineItem[]>([]);

  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>('PICKUP');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [destZip, setDestZip] = useState('');
  const [deliveryOrigin, setDeliveryOrigin] = useState('');
  const [originZip, setOriginZip] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [calculatedDistance, setCalculatedDistance] = useState<number | null>(null);
  const [paymentTiming, setPaymentTiming] = useState<'now' | 'later'>('later');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  // New client modal state
  const [showNewClient, setShowNewClient] = useState(false);

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

  // Selected customer
  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === customerId);
  }, [customers, customerId]);

  // All products with stock info
  const availableProducts = useMemo(() => {
    return products.filter(p => p.availableGrams > 0);
  }, [products]);

  // Set default product when products change
  useEffect(() => {
    if (availableProducts.length > 0 && !availableProducts.find((p) => p.id === productId)) {
      setProductId(availableProducts[0].id);
    }
  }, [availableProducts, productId]);

  // Get selected product
  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === productId);
  }, [products, productId]);

  // Calculate totals - quantity is number of items, multiply by weight per item
  const quantityGrams = useMemo(() => {
    const qty = parseFloat(quantity) || 0;
    const weightPerItem = selectedProduct?.weightPerItemGrams ?? 1;
    return qty * weightPerItem;
  }, [quantity, selectedProduct]);

  const lineTotalCents = useMemo(() => {
    if (!selectedProduct || quantityGrams <= 0) return 0;

    // Use product price if available
    if (selectedProduct.pricePerGramCents) {
      return Math.round(quantityGrams * selectedProduct.pricePerGramCents);
    }

    // Fall back to base sale price from settings
    if (settings?.baseSaleCentsPerGram) {
      return Math.round(quantityGrams * settings.baseSaleCentsPerGram);
    }

    return 0;
  }, [selectedProduct, quantityGrams, settings]);

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
      const productQuality = selectedProduct?.quality ?? 'REGULAR';
      const typicalStats = await computeTypicalOrderStats(customerId, productQuality, settings);
      const overTypical = isOverTypical(quantityGrams, typicalStats);
      const policy = determinePolicy(tags, overTypical, settings);

      // Use orderTotalCents (includes delivery fee) for deposit calculation
      const deliverNow = computeDeliverNow(
        paymentCents,
        orderTotalCents, // Include delivery fee in deposit calculation
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
  }, [customerId, quantityGrams, paymentCents, orderTotalCents, selectedProduct, settings]);

  // Handle using current location for delivery origin
  const handleUseCurrentLocation = async () => {
    try {
      audio.playClick();
      const coords = await getCurrentLocation();
      // Reverse geocode to get address (simple format)
      setDeliveryOrigin(`${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`);
    } catch (error) {
      console.error('Failed to get location:', error);
      audio.playError();
    }
  };

  // Auto-calculate delivery fee when addresses change
  useEffect(() => {
    // Only calculate for delivery orders
    if (fulfillmentMethod !== 'DELIVERY') return;

    const originAddr = deliveryOrigin || settings?.homeBaseAddress || '';
    const originFull = originZip ? `${originAddr} ${originZip}` : originAddr;

    const destAddr = deliveryAddress || selectedCustomer?.defaultAddress || '';
    const destFull = destZip ? `${destAddr} ${destZip}` : destAddr;

    // Need both addresses with zip codes
    if (!originFull.trim() || !destFull.trim() || !originZip || !destZip) {
      return;
    }

    // Debounce the API call
    const timer = setTimeout(async () => {
      try {
        const [fromCoords, toCoords] = await Promise.all([
          geocodeAddress(originFull),
          geocodeAddress(destFull),
        ]);

        if (!fromCoords || !toCoords) return;

        const straightLine = haversineDistance(fromCoords, toCoords);
        const drivingMiles = estimateDrivingDistance(straightLine);
        setCalculatedDistance(drivingMiles);

        const mpg = getMpgForVehicle(settings?.vehicleType ?? 'sedan');
        const gasPriceCents = 405;
        const feeCents = calculateDeliveryFee(drivingMiles, mpg, gasPriceCents);
        setDeliveryFee((feeCents / 100).toFixed(2));
      } catch (error) {
        console.error('Failed to calculate delivery fee:', error);
      }
    }, 800); // Wait 800ms after typing stops

    return () => clearTimeout(timer);
  }, [fulfillmentMethod, deliveryOrigin, originZip, deliveryAddress, destZip, selectedCustomer?.defaultAddress, settings]);

  const handleSubmit = async () => {
    if (!customerId || !productId || quantityGrams <= 0) return;
    if (paymentTiming === 'later' && !dueDate) return;

    // Calculate due date
    let orderDueAt: number | undefined;
    if (paymentTiming === 'later' && dueDate) {
      orderDueAt = new Date(dueDate + 'T23:59:59').getTime();
    }

    // Payment: Pay Now = full amount, Pay Later = deposit amount from input
    const actualPaymentCents = paymentTiming === 'now' ? orderTotalCents : paymentCents;

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
      paymentMethod: actualPaymentCents > 0 ? 'CARD' : undefined,
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

      {/* Client select with +Client button */}
      <div>
        <label className="block text-sm font-medium text-silver mb-2">Client</label>
        <div className="flex gap-2">
          <Select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            options={[
              { value: '', label: 'Select client...' },
              ...customers.map((c) => ({ value: c.id, label: c.name })),
            ]}
            className="flex-1"
          />
          <button
            onClick={() => {
              audio.playClick();
              setShowNewClient(true);
            }}
            className="px-4 py-2.5 rounded-xl font-semibold transition-all whitespace-nowrap"
            style={{ backgroundColor: '#c9a050', color: '#050810' }}
          >
            + Client
          </button>
        </div>
      </div>

      {/* Products - simplified inline */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-silver">Products</label>
          {availableProducts.length > 0 && (
            <button
              onClick={() => {
                audio.playClick();
                setAdditionalItems([...additionalItems, { productId: availableProducts[0].id, quantity: '' }]);
              }}
              className="text-sm text-lime hover:text-lime/80 transition-colors"
            >
              + Add
            </button>
          )}
        </div>

        {availableProducts.length === 0 ? (
          <p className="text-sm text-silver italic">No products in inventory</p>
        ) : (
          <div className="space-y-3">
            {/* Primary item */}
            <div className="flex gap-2 items-end">
              <Select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                options={availableProducts.map((p) => {
                  const weightPerItem = p.weightPerItemGrams ?? 1;
                  const unit = settings?.defaultWeightUnit ?? 'g';
                  return {
                    value: p.id,
                    label: `${p.name} ${p.quality === 'PREMIUM' ? '★' : ''} (${formatWeight(weightPerItem, unit)} each, ${p.availableUnits} avail)`,
                  };
                })}
                className="flex-1 min-w-0"
              />
              <Select
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                options={(() => {
                  const product = products.find(p => p.id === productId);
                  if (!product) return [{ value: '', label: 'Qty' }];
                  const maxQty = product.availableUnits ?? 0;
                  const options = [{ value: '', label: 'Qty' }];
                  for (let i = 1; i <= Math.min(maxQty, 99); i++) {
                    options.push({ value: String(i), label: String(i) });
                  }
                  return options;
                })()}
                className="w-16 shrink-0"
              />
            </div>

            {/* Additional items */}
            {additionalItems.map((item, index) => {
              const itemProduct = products.find(p => p.id === item.productId);
              const maxQty = itemProduct?.availableUnits ?? 0;
              return (
                <div key={index} className="flex gap-2 items-end">
                  <Select
                    value={item.productId}
                    onChange={(e) => {
                      const updated = [...additionalItems];
                      updated[index] = { ...item, productId: e.target.value, quantity: '' };
                      setAdditionalItems(updated);
                    }}
                    options={availableProducts.map((p) => {
                      const wpi = p.weightPerItemGrams ?? 1;
                      const unit = settings?.defaultWeightUnit ?? 'g';
                      return {
                        value: p.id,
                        label: `${p.name} ${p.quality === 'PREMIUM' ? '★' : ''} (${formatWeight(wpi, unit)} each, ${p.availableUnits} avail)`,
                      };
                    })}
                    className="flex-1 min-w-0"
                  />
                  <Select
                    value={item.quantity}
                    onChange={(e) => {
                      const updated = [...additionalItems];
                      updated[index] = { ...item, quantity: e.target.value };
                      setAdditionalItems(updated);
                    }}
                    options={(() => {
                      const options = [{ value: '', label: 'Qty' }];
                      for (let i = 1; i <= Math.min(maxQty, 99); i++) {
                        options.push({ value: String(i), label: String(i) });
                      }
                      return options;
                    })()}
                    className="w-16 shrink-0"
                  />
                  <button
                    onClick={() => {
                      setAdditionalItems(additionalItems.filter((_, i) => i !== index));
                      audio.playClick();
                    }}
                    className="text-magenta hover:text-magenta/80 transition-colors px-2 pb-2 shrink-0"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
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
          {/* Origin */}
          <div>
            <label className="block text-sm font-medium text-silver mb-1">From</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-[2] px-3 py-2.5 rounded-xl glass-input text-sm"
                placeholder="Street address"
                value={deliveryOrigin}
                onChange={(e) => setDeliveryOrigin(e.target.value)}
              />
              <input
                type="text"
                className="w-24 px-3 py-2.5 rounded-xl glass-input text-sm"
                placeholder="Zip"
                value={originZip}
                onChange={(e) => setOriginZip(e.target.value)}
              />
              <button
                onClick={handleUseCurrentLocation}
                className="px-3 py-2 rounded-xl glass-card text-cyan hover:bg-cyan/10 transition-colors text-sm"
                title="Use current location"
              >
                📍
              </button>
            </div>
          </div>

          {/* Destination */}
          <div>
            <label className="block text-sm font-medium text-silver mb-1">To</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-[2] px-3 py-2.5 rounded-xl glass-input text-sm"
                placeholder="Street address"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
              <input
                type="text"
                className="w-24 px-3 py-2.5 rounded-xl glass-input text-sm"
                placeholder="Zip"
                value={destZip}
                onChange={(e) => setDestZip(e.target.value)}
              />
              {selectedCustomer?.defaultAddress && !deliveryAddress && (
                <button
                  onClick={() => setDeliveryAddress(selectedCustomer.defaultAddress || '')}
                  className="px-3 py-2 rounded-xl glass-card text-lime hover:bg-lime/10 transition-colors text-sm"
                  title="Use client address"
                >
                  📋
                </button>
              )}
            </div>
          </div>
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

      {/* Pay Now - just display the total */}
      {paymentTiming === 'now' && orderTotalCents > 0 && (
        <div className="glass-card rounded-xl p-4">
          <div className="flex justify-between items-center">
            <span className="text-silver">Total:</span>
            <span className="text-2xl font-bold text-lime">{formatMoney(orderTotalCents)}</span>
          </div>
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

      {/* Order Summary - for Pay Later */}
      {paymentTiming === 'later' && quantityGrams > 0 && (
        <Card>
          <h3 className="font-semibold text-text-primary mb-3">Order Summary</h3>

          <div className="space-y-2 text-sm">
            {/* Line Item Total */}
            <div className="flex justify-between">
              <span className="text-silver">Products:</span>
              <span className="text-text-primary">{formatMoney(lineTotalCents)}</span>
            </div>

            {/* Delivery Fee - show if delivery selected */}
            {fulfillmentMethod === 'DELIVERY' && deliveryFeeCents > 0 && (
              <div className="flex justify-between">
                <span className="text-silver">Delivery ({calculatedDistance ? `~${calculatedDistance.toFixed(0)} mi` : 'fee'}):</span>
                <span className="text-text-primary">{formatMoney(deliveryFeeCents)}</span>
              </div>
            )}

            {/* Order Total */}
            <div className="flex justify-between border-t border-surface-600 pt-2 mt-2">
              <span className="font-medium text-text-primary">Order total:</span>
              <span className="font-medium text-text-primary">{formatMoney(orderTotalCents)}</span>
            </div>

            {/* Simple minimum deposit when no client selected */}
            {!policyInfo && orderTotalCents > 0 && (() => {
              const depositPct = settings?.depositMinPctNormal ?? 40;
              // Calculate deposit on products only
              const productDepositCents = Math.round(lineTotalCents * depositPct / 100);
              // Total includes delivery fee
              const totalDepositCents = productDepositCents + deliveryFeeCents;
              const meetsMin = paymentCents >= totalDepositCents;

              if (!meetsMin && totalDepositCents > 0) {
                return (
                  <button
                    onClick={() => {
                      audio.playClick();
                      setPaymentAmount((totalDepositCents / 100).toFixed(2));
                    }}
                    className="w-full flex items-center gap-2 py-2 px-3 bg-gold/10 rounded-lg text-gold hover:bg-gold/20 transition-colors cursor-pointer"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>
                      Minimum deposit: {formatMoney(productDepositCents)}
                      {deliveryFeeCents > 0 && ' + delivery'}
                    </span>
                    <span className="ml-auto text-xs opacity-70">tap to add</span>
                  </button>
                );
              }
              return null;
            })()}

            {/* Policy details only if available */}
            {policyInfo && (
              <>
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

                {/* Deposit warning - only for Pay Later, clickable to add deposit */}
                {paymentTiming === 'later' && balanceDueCents > 0 && (() => {
                  // Add delivery fee to policy deposit
                  const totalDepositCents = policyInfo.depositMinCents + deliveryFeeCents;
                  const meetsMin = paymentCents >= totalDepositCents;

                  if (!meetsMin && totalDepositCents > 0) {
                    return (
                      <button
                        onClick={() => {
                          audio.playClick();
                          setPaymentAmount((totalDepositCents / 100).toFixed(2));
                        }}
                        className="w-full flex items-center gap-2 py-2 px-3 bg-gold/10 rounded-lg text-gold hover:bg-gold/20 transition-colors cursor-pointer"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span>
                          Minimum deposit: {formatMoney(policyInfo.depositMinCents)}
                          {deliveryFeeCents > 0 && ' + delivery'}
                        </span>
                        <span className="ml-auto text-xs opacity-70">tap to add</span>
                      </button>
                    );
                  }
                  return null;
                })()}

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
              </>
            )}
          </div>
        </Card>
      )}

      {/* Submit button */}
      <div className="pb-4">
        <Button
          onClick={handleSubmit}
          disabled={
            !customerId ||
            !productId ||
            quantityGrams <= 0 ||
            (paymentTiming === 'later' && !dueDate) ||
            (paymentTiming === 'later' && !!(policyInfo && !policyInfo.meetsDepositMin && balanceDueCents > 0))
          }
          className="w-full"
          size="lg"
        >
          Create Order
        </Button>
      </div>

      {/* New Client Modal */}
      <NewClientModal
        isOpen={showNewClient}
        onClose={() => setShowNewClient(false)}
        onClientCreated={(clientId) => setCustomerId(clientId)}
      />
    </div>
  );
}
