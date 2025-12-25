import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCustomers, useDashboardKPIs, useInitialize } from '../hooks/useData';
import { createCustomer } from '../db/customers';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Tag } from '../components/Tag';
import { formatMoney, formatWeight, formatRelativeTime } from '../utils/units';
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

  // Sort customers: late first, then by balance, then by activity
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
          <div className="text-sm text-silver mt-1">Monthly Margin</div>
        </Card>

        {/* Row 2: Owed */}
        <Card className="text-center animate-fade-in-up stagger-3">
          <div className="text-2xl font-bold text-cyan font-mono">
            {formatMoney(kpis.todayCollectedCents)}
          </div>
          <div className="text-sm text-silver mt-1">Today</div>
        </Card>
        <Card className="text-center animate-fade-in-up stagger-4">
          <div className="text-2xl font-bold text-text-primary font-mono">
            {formatMoney(kpis.totalOwedCents)}
          </div>
          <div className="text-sm text-silver mt-1">Total Owed</div>
        </Card>

        {/* Row 3: Status */}
        <Card className="text-center animate-fade-in-up stagger-5">
          <div
            className={`text-2xl font-bold font-mono ${kpis.lateCustomerCount > 0 ? 'text-magenta text-glow-magenta' : 'text-text-primary'
              }`}
          >
            {kpis.lateCustomerCount}
          </div>
          <div className="text-sm text-silver mt-1">Late</div>
        </Card>
        <Card className="text-center animate-fade-in-up stagger-6">
          <div className="space-y-0.5">
            <div className="flex justify-center gap-1 text-lg font-bold font-mono text-lime">
              <span>R:</span>
              <span>{formatWeight(kpis.regularStockGrams, 'g')}</span>
            </div>
            <div className="flex justify-center gap-1 text-lg font-bold font-mono text-gold">
              <span>P:</span>
              <span>{formatWeight(kpis.premiumStockGrams, 'g')}</span>
            </div>
          </div>
          <div className="text-sm text-silver mt-1">Stock Left</div>
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
    </div>
  );
}

function CustomerRow({ customer, style }: { customer: CustomerWithBalance; style?: React.CSSProperties }) {
  return (
    <Link to={`/customers/${customer.id}`} onClick={() => audio.playClick()}>
      <Card interactive className="animate-fade-in-up opacity-0" style={style}>
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
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
          </div>
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
      </Card>
    </Link>
  );
}
