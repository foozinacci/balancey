import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCustomer, useCustomerOrders, useSettings } from '../hooks/useData';
import { addPayment, addFulfillment, closeOrder } from '../db/orders';
import { addCustomerTag, removeCustomerTag, updateCustomer } from '../db/customers';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Tag } from '../components/Tag';
import { formatMoney, formatWeight, formatDate } from '../utils/units';
import { audio } from '../utils/audio';
import type { CustomerTag as CustomerTagType } from '../types';

export function CustomerDetail() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const customer = useCustomer(customerId);
  const orders = useCustomerOrders(customerId);
  const settings = useSettings();

  const [showPayment, setShowPayment] = useState(false);

  const [showTagModal, setShowTagModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');

  if (!customer) {
    return (
      <div className="p-4 text-center">
        <p className="text-silver">Customer not found</p>
        <Button variant="secondary" onClick={() => navigate('/')} className="mt-4">
          Go Back
        </Button>
      </div>
    );
  }

  const openOrders = orders.filter(
    (o) => o.status === 'OPEN' || o.status === 'PARTIAL'
  );
  const closedOrders = orders.filter(
    (o) => o.status === 'CLOSED' || o.status === 'CANCELLED'
  );

  // Fulfill order: pays full balance, delivers all owed grams, and closes order
  const handleFulfillOrder = async (order: typeof openOrders[0]) => {
    // Pay the full balance due
    if (order.balanceDueCents > 0) {
      await addPayment(order.id, order.balanceDueCents, 'CASH');
    }

    // Deliver all remaining owed grams
    if (order.owedRemainingGrams > 0) {
      await addFulfillment(order.id, 'DELIVERED', order.owedRemainingGrams);
    }

    // Close the order so it moves to history
    await closeOrder(order.id);

    audio.playSuccess();
    setShowPayment(false);
  };

  const handleToggleTag = async (tag: CustomerTagType) => {
    const hasTag = customer.tags.some((t) => t.tag === tag);
    if (hasTag) {
      await removeCustomerTag(customer.id, tag);
    } else {
      await addCustomerTag(customer.id, tag);
    }
  };

  const handleSaveEdit = async () => {
    await updateCustomer(customer.id, {
      name: editName.trim() || customer.name,
      notes: editNotes.trim() || undefined,
    });
    setShowEditModal(false);
  };

  const openEditModal = () => {
    setEditName(customer.name);
    setEditNotes(customer.notes ?? '');
    setShowEditModal(true);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center text-silver -ml-1"
      >
        <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Customer card */}
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">{customer.name}</h1>
            <div className="flex flex-wrap gap-1 mt-2">
              {customer.tags.map((t) => (
                <Tag key={t.id} tag={t.tag} size="md" />
              ))}
            </div>
          </div>
          <div className="text-right">
            <div
              className={`text-2xl font-bold ${customer.balanceDueCents > 0 ? 'text-red-600' : 'text-green-600'
                }`}
            >
              {customer.balanceDueCents > 0
                ? formatMoney(customer.balanceDueCents)
                : 'Paid'}
            </div>
            <div className="text-sm text-silver">balance due</div>
          </div>
        </div>

        {/* Typical order stats */}
        {customer.typicalGrams && (
          <div className="mt-4 pt-4 border-t border-surface-600">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-silver">Typical:</span>{' '}
                <span className="font-medium text-text-primary">
                  {formatWeight(customer.typicalGrams, settings?.defaultWeightUnit ?? 'g')}
                </span>
              </div>
              {customer.upperNormalGrams && (
                <div>
                  <span className="text-silver">Upper normal:</span>{' '}
                  <span className="font-medium text-text-primary">
                    {formatWeight(customer.upperNormalGrams, settings?.defaultWeightUnit ?? 'g')}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {customer.notes && (
          <div className="mt-4 pt-4 border-t border-surface-600">
            <p className="text-sm text-silver">{customer.notes}</p>
          </div>
        )}
      </Card>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          onClick={() => navigate(`/orders/new?customer=${customer.id}`)}
          className="flex-1"
        >
          + New Order
        </Button>
        {openOrders.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => setShowPayment(true)}
          >
            Fulfill
          </Button>
        )}
        <Button variant="secondary" onClick={openEditModal}>
          Edit
        </Button>
        <Button variant="secondary" onClick={() => setShowTagModal(true)}>
          Tags
        </Button>
      </div>

      {/* Open orders */}
      {openOrders.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">Open Orders</h2>
          <div className="space-y-2">
            {openOrders.map((order) => (
              <Link key={order.id} to={`/orders/${order.id}`}>
                <Card className="active:bg-surface-700">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm text-silver">
                        {formatDate(order.createdAt)}
                      </div>
                      <div className="font-medium text-text-primary">
                        {order.requestedTotalGrams > 0 &&
                          formatWeight(order.requestedTotalGrams, 'g')}
                        {order.requestedTotalUnits > 0 &&
                          ` ${order.requestedTotalUnits} units`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-red-600">
                        {formatMoney(order.balanceDueCents)}
                      </div>
                      <div className="text-sm text-silver">
                        paid {formatMoney(order.paidTotalCents)}
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Closed orders */}
      {closedOrders.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">History</h2>
          <div className="space-y-2">
            {closedOrders.slice(0, 5).map((order) => (
              <Link key={order.id} to={`/orders/${order.id}`}>
                <Card className="active:bg-surface-700">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm text-silver">
                        {formatDate(order.createdAt)}
                      </div>
                      <div className="font-medium text-text-primary">
                        {order.requestedTotalGrams > 0 &&
                          formatWeight(order.requestedTotalGrams, 'g')}
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-sm px-2 py-0.5 rounded ${order.status === 'CLOSED'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-600'
                          }`}
                      >
                        {order.status}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Fulfill Order modal */}
      <Modal
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        title="Fulfill Order"
      >
        <div className="space-y-2">
          {openOrders.map((order) => (
            <button
              key={order.id}
              onClick={() => handleFulfillOrder(order)}
              className="w-full p-3 glass-card rounded-xl text-left hover:bg-surface-600 transition-colors"
            >
              <div className="flex justify-between items-center">
                <div className="text-sm text-silver">{formatDate(order.createdAt)}</div>
                <div className="text-magenta font-mono font-semibold">
                  {formatMoney(order.balanceDueCents)}
                </div>
                <div className="text-text-primary font-mono">
                  {formatWeight(order.owedRemainingGrams, 'g')}
                </div>
              </div>
            </button>
          ))}
          <Button
            variant="secondary"
            onClick={() => setShowPayment(false)}
            className="w-full mt-2"
          >
            Cancel
          </Button>
        </div>
      </Modal>

      {/* Tag modal */}
      <Modal
        isOpen={showTagModal}
        onClose={() => setShowTagModal(false)}
        title="Manage Tags"
      >
        <div className="space-y-3">
          {(['VIP', 'RELIABLE', 'DO_NOT_ADVANCE'] as CustomerTagType[]).map((tag) => {
            const hasTag = customer.tags.some((t) => t.tag === tag);
            return (
              <button
                key={tag}
                onClick={() => handleToggleTag(tag)}
                className={`w-full p-3 rounded-lg border flex items-center justify-between ${hasTag
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-slate-200'
                  }`}
              >
                <Tag tag={tag} size="md" />
                {hasTag && (
                  <svg
                    className="w-5 h-5 text-primary-600"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Customer"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Notes
            </label>
            <textarea
              className="w-full px-3 py-2.5 text-base rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
              rows={3}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowEditModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} className="flex-1">
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
