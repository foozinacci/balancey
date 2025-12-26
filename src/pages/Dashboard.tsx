import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCustomers, useDashboardKPIs, useInitialize, useOpenOrders } from '../hooks/useData';
import { createCustomer } from '../db/customers';
import { addPayment } from '../db/orders';
import { addTip } from '../db';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Tag } from '../components/Tag';
import { formatMoney, formatWeight, formatRelativeTime, parseMoney } from '../utils/units';
import { audio } from '../utils/audio';
import type { CustomerWithBalance } from '../types';

export function Dashboard() {
  useInitialize();

  const customers = useCustomers();
  const kpis = useDashboardKPIs();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');

  // Quick payment state
  const [showQuickPayment, setShowQuickPayment] = useState(false);
  const [quickPayCustomer, setQuickPayCustomer] = useState<CustomerWithBalance | null>(null);
  const [quickPayAmount, setQuickPayAmount] = useState('');

  // Tip modal state
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipAmount, setTipAmount] = useState('');
  // Hide paid customers (balance = 0) from main list
  const sortedCustomers = useMemo(() => {
    let filtered = customers;

    // Hide paid customers unless searching
    if (!searchQuery) {
      filtered = customers.filter((c) => c.balanceDueCents > 0);
    } else {
      const query = searchQuery.toLowerCase();
      filtered = customers.filter((c) =>
        c.name.toLowerCase().includes(query)
      );
    }

    return [...filtered].sort((a, b) => {
      // Late customers first
      if (a.isLate && !b.isLate) return -1;
      if (!a.isLate && b.isLate) return 1;

      // Then by balance (highest first)
      if (a.balanceDueCents !== b.balanceDueCents) {
        return b.balanceDueCents - a.balanceDueCents;
      }

      // Then by recent activity
      const aActivity = a.lastActivityAt ?? 0;
      const bActivity = b.lastActivityAt ?? 0;
      return bActivity - aActivity;
    });
  }, [customers, searchQuery]);

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) return;

    try {
      audio.playSuccess();
      const customer = await createCustomer({ name: newCustomerName.trim() });
      console.log('Customer created:', customer);
      setNewCustomerName('');
      setShowNewCustomer(false);
      navigate(`/customers/${customer.id}`);
    } catch (error) {
      console.error('Failed to create customer:', error);
      audio.playError();
    }
  };

  // Open orders for quick payment (to know which order to apply payment to)
  const openOrders = useOpenOrders();

  const openQuickPayment = (customer: CustomerWithBalance) => {
    setQuickPayCustomer(customer);
    setQuickPayAmount('');
    setShowQuickPayment(true);
    audio.playClick();
  };

  const handleQuickPayment = async () => {
    if (!quickPayCustomer) return;
    const cents = parseMoney(quickPayAmount);
    if (cents <= 0) return;

    // Find the oldest open order for this customer
    const customerOrder = openOrders.find(o => o.customerId === quickPayCustomer.id);
    if (!customerOrder) {
      audio.playError();
      return;
    }

    try {
      await addPayment(customerOrder.id, cents, 'CASH');
      audio.playSuccess();
      setShowQuickPayment(false);
      setQuickPayCustomer(null);
      setQuickPayAmount('');
    } catch (error) {
      console.error('Failed to record payment:', error);
      audio.playError();
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header row - matches Clients/Inventory */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">Dashboard</h1>
        <Button onClick={() => navigate('/orders/new')}>+ New Order</Button>
      </div>

      {/* KPIs - 2x3 Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Row 1: Margins */}
        {/* Row 1: Margins */}
        <Card className="text-center animate-fade-in-up stagger-1">
          <div
            className={`text-2xl font-bold font-mono ${kpis.dailyMarginCents >= 0
              ? 'text-lime text-glow-lime'
              : 'text-magenta text-glow-magenta'
              }`}
          >
            {kpis.dailyMarginCents >= 0 ? '+' : ''}{formatMoney(kpis.dailyMarginCents)}
          </div>
          <div className="text-sm text-silver mt-1">Daily Margin</div>
        </Card>
        <Card className="text-center animate-fade-in-up stagger-2">
          <div
            className={`text-2xl font-bold font-mono ${kpis.monthlyMarginCents >= 0
              ? 'text-lime text-glow-lime'
              : 'text-magenta text-glow-magenta'
              }`}
          >
            {kpis.monthlyMarginCents >= 0 ? '+' : ''}{formatMoney(kpis.monthlyMarginCents)}
          </div>
          <div className="text-sm text-silver mt-1">Margin to Date</div>
        </Card>

        {/* Row 2: Money */}
        <Card className="text-center animate-fade-in-up stagger-3">
          <div className="text-2xl font-bold text-lime font-mono">
            {formatMoney(kpis.monthCollectedCents)}
          </div>
          <div className="text-sm text-silver mt-1">Collected</div>
        </Card>
        <Card className="text-center animate-fade-in-up stagger-4">
          <div
            className={`text-2xl font-bold font-mono ${kpis.totalOwedCents > 0
              ? 'text-magenta'
              : 'text-lime'
              }`}
          >
            {formatMoney(Math.abs(kpis.totalOwedCents))}
          </div>
          <div className="text-sm text-silver mt-1">
            {kpis.totalOwedCents > 0 ? 'Daily Owed' : 'Daily Profit'}
          </div>
        </Card>

        {/* Row 3: Delivery Extras */}
        <Card className="text-center animate-fade-in-up stagger-5">
          <div className="text-2xl font-bold text-lime font-mono">
            {formatMoney(kpis.monthlyDeliveryRevenueCents)}
          </div>
          <div className="text-sm text-silver mt-1">Delivery Revenue</div>
        </Card>
        <Card className="text-center animate-fade-in-up stagger-6">
          <div className="text-2xl font-bold text-gold font-mono">
            {formatMoney(kpis.monthlyTipsCents)}
          </div>
          <div className="text-sm text-silver mt-1">Tips</div>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowNewCustomer(true)}
          className="flex-1 px-4 py-2.5 rounded-xl font-semibold transition-all animate-fade-in-up bg-lime text-surface-900"
        >
          + Client
        </button>
        <button
          onClick={() => setShowTipModal(true)}
          className="px-4 py-2.5 rounded-xl font-semibold transition-all animate-fade-in-up bg-gold text-surface-900"
        >
          + Tip
        </button>
      </div>

      {/* Search */}
      <div className="animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
        <Input
          type="search"
          placeholder="Search clients..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Customer list */}
      <div className="space-y-3">
        {sortedCustomers.length === 0 ? (
          <Card className="text-center py-8">
            <p className="text-silver">
              {customers.length === 0
                ? 'No clients yet. Add one to get started!'
                : 'No clients match your search.'}
            </p>
          </Card>
        ) : (
          sortedCustomers.map((customer, index) => (
            <CustomerRow
              key={customer.id}
              customer={customer}
              style={{ animationDelay: `${0.35 + index * 0.05}s` }}
              onQuickPay={() => openQuickPayment(customer)}
            />
          ))
        )}
      </div>

      {/* New customer modal */}
      <Modal
        isOpen={showNewCustomer}
        onClose={() => setShowNewCustomer(false)}
        title="New Client"
      >
        <div className="space-y-4">
          <Input
            label="Client Name"
            placeholder="Enter name..."
            value={newCustomerName}
            onChange={(e) => setNewCustomerName(e.target.value)}
            autoFocus
          />
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowNewCustomer(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateCustomer}
              disabled={!newCustomerName.trim()}
              className="flex-1"
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Quick Payment Modal */}
      <Modal
        isOpen={showQuickPayment}
        onClose={() => setShowQuickPayment(false)}
        title={`Quick Payment - ${quickPayCustomer?.name ?? ''}`}
      >
        <div className="space-y-4">
          {quickPayCustomer && (
            <div className="text-center py-2 glass-card rounded-xl">
              <div className="text-lg font-bold text-magenta">
                {formatMoney(quickPayCustomer.balanceDueCents)}
              </div>
              <div className="text-sm text-silver">Balance Due</div>
            </div>
          )}
          <Input
            label="Payment Amount"
            type="text"
            inputMode="decimal"
            placeholder="$0.00"
            value={quickPayAmount}
            onChange={(e) => setQuickPayAmount(e.target.value)}
            autoFocus
          />
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowQuickPayment(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleQuickPayment}
              disabled={!quickPayAmount || parseMoney(quickPayAmount) <= 0}
              className="flex-1"
            >
              Record
            </Button>
          </div>
        </div>
      </Modal>

      {/* Tip Modal */}
      <Modal
        isOpen={showTipModal}
        onClose={() => setShowTipModal(false)}
        title="Record Tip"
      >
        <div className="space-y-4">
          <Input
            label="Tip Amount"
            type="text"
            inputMode="decimal"
            placeholder="$0.00"
            value={tipAmount}
            onChange={(e) => setTipAmount(e.target.value)}
            autoFocus
          />
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowTipModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const cents = parseMoney(tipAmount);
                if (cents > 0) {
                  await addTip(cents);
                  audio.playSuccess();
                  setTipAmount('');
                  setShowTipModal(false);
                }
              }}
              disabled={!tipAmount || parseMoney(tipAmount) <= 0}
              className="flex-1"
            >
              Record
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function CustomerRow({
  customer,
  style,
  onQuickPay
}: {
  customer: CustomerWithBalance;
  style?: React.CSSProperties;
  onQuickPay?: () => void;
}) {
  return (
    <Card interactive className="animate-fade-in-up opacity-0" style={style}>
      <div className="flex items-center justify-between">
        <Link to={`/customers/${customer.id}`} onClick={() => audio.playClick()} className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text-primary truncate">
              {customer.name}
            </span>
            {customer.tags
              .filter((t) => t.tag !== 'NEW')
              .map((t) => (
                <Tag key={t.id} tag={t.tag} />
              ))}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-silver">
            {customer.typicalGrams && (
              <span>typ ~{formatWeight(customer.typicalGrams, 'g', 0)}</span>
            )}
            {customer.lastActivityAt && (
              <span>{formatRelativeTime(customer.lastActivityAt)}</span>
            )}
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {customer.balanceDueCents > 0 && onQuickPay && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onQuickPay();
              }}
              className="px-3 py-1.5 rounded-lg bg-lime/20 text-lime font-semibold text-sm hover:bg-lime/30 transition-all"
            >
              $
            </button>
          )}
          <div className="text-right">
            <div
              className={`font-bold font-mono ${customer.balanceDueCents > 0
                ? 'text-magenta'
                : 'text-lime'
                }`}
            >
              {customer.balanceDueCents > 0
                ? formatMoney(customer.balanceDueCents)
                : 'Paid'}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
