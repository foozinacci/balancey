import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCustomers, useDashboardKPIs, useInitialize, useOpenOrders } from '../hooks/useData';
import { createCustomer } from '../db/customers';
import { addPayment } from '../db/orders';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Modal } from '../components/Modal';
import { Tag } from '../components/Tag';
import { formatMoney, formatWeight, formatRelativeTime, parseMoney } from '../utils/units';
import { audio } from '../utils/audio';
import type { CustomerWithBalance, PaymentMethod } from '../types';

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
  const [quickPayMethod, setQuickPayMethod] = useState<PaymentMethod>('CASH');
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
    setQuickPayMethod('CASH');
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
      await addPayment(customerOrder.id, cents, quickPayMethod);
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

        {/* Row 3: Inventory */}
        <Card className="text-center animate-fade-in-up stagger-5">
          <div className="text-2xl font-bold text-text-primary font-mono">
            {formatWeight(kpis.regularStockGrams, 'g')}
          </div>
          <div className="text-sm text-silver mt-1">Regular Inventory</div>
        </Card>
        <Card className="text-center animate-fade-in-up stagger-6">
          <div className="text-2xl font-bold text-gold font-mono">
            {formatWeight(kpis.premiumStockGrams, 'g')}
          </div>
          <div className="text-sm text-silver mt-1">Premium Inventory</div>
        </Card>
      </div>

      {/* Quick Action */}
      <button
        onClick={() => setShowNewCustomer(true)}
        className="w-full px-4 py-2.5 rounded-xl font-semibold transition-all animate-fade-in-up"
        style={{ backgroundColor: '#c9a050', color: '#050810' }}
      >
        + Client
      </button>

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
          <Select
            label="Payment Method"
            value={quickPayMethod}
            onChange={(e) => setQuickPayMethod(e.target.value as PaymentMethod)}
            options={[
              { value: 'CASH', label: 'Cash' },
              { value: 'CARD', label: 'Card' },
              { value: 'OTHER', label: 'Other' },
            ]}
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
