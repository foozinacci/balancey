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
  const sortedCustomers = useMemo(() => {
    let filtered = customers;

    if (searchQuery) {
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

    const customer = await createCustomer({ name: newCustomerName.trim() });
    setNewCustomerName('');
    setShowNewCustomer(false);
    navigate(`/customers/${customer.id}`);
  };

  return (
    <div className="p-4 space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="text-center">
          <div className="text-2xl font-bold text-slate-900">
            {formatMoney(kpis.totalOwedCents)}
          </div>
          <div className="text-sm text-slate-500">Total Owed</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {formatMoney(kpis.todayCollectedCents)}
          </div>
          <div className="text-sm text-slate-500">Today</div>
        </Card>
        <Card className="text-center">
          <div
            className={`text-2xl font-bold ${
              kpis.lateCustomerCount > 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {kpis.lateCustomerCount}
          </div>
          <div className="text-sm text-slate-500">Late</div>
        </Card>
        <Card className="text-center">
          <div
            className={`text-2xl font-bold ${
              kpis.lowInventoryCount > 0 ? 'text-orange-600' : 'text-slate-900'
            }`}
          >
            {kpis.lowInventoryCount}
          </div>
          <div className="text-sm text-slate-500">Low Stock</div>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          onClick={() => navigate('/orders/new')}
          className="flex-1"
        >
          + New Order
        </Button>
        <Button
          variant="secondary"
          onClick={() => setShowNewCustomer(true)}
        >
          + Customer
        </Button>
      </div>

      {/* Search */}
      <Input
        type="search"
        placeholder="Search customers..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Customer list */}
      <div className="space-y-2">
        {sortedCustomers.length === 0 ? (
          <Card className="text-center py-8">
            <p className="text-slate-500">
              {customers.length === 0
                ? 'No customers yet. Add one to get started!'
                : 'No customers match your search.'}
            </p>
          </Card>
        ) : (
          sortedCustomers.map((customer) => (
            <CustomerRow key={customer.id} customer={customer} />
          ))
        )}
      </div>

      {/* New customer modal */}
      <Modal
        isOpen={showNewCustomer}
        onClose={() => setShowNewCustomer(false)}
        title="New Customer"
      >
        <div className="space-y-4">
          <Input
            label="Customer Name"
            placeholder="Enter name..."
            value={newCustomerName}
            onChange={(e) => setNewCustomerName(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
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

function CustomerRow({ customer }: { customer: CustomerWithBalance }) {
  return (
    <Link to={`/customers/${customer.id}`}>
      <Card className="active:bg-slate-50">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900 truncate">
                {customer.name}
              </span>
              {customer.tags
                .filter((t) => t.tag !== 'NEW')
                .map((t) => (
                  <Tag key={t.id} tag={t.tag} />
                ))}
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
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
              className={`font-semibold ${
                customer.balanceDueCents > 0
                  ? 'text-red-600'
                  : 'text-green-600'
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
