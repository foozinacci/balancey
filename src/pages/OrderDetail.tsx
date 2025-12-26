import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useOrder, useCustomer, useProducts } from '../hooks/useData';
import { addPayment, addFulfillment, cancelOrder, closeOrder, updateOrderDueDate } from '../db/orders';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { formatMoney, formatWeight, formatDate, formatDateTime } from '../utils/units';
import { audio } from '../utils/audio';

export function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const order = useOrder(orderId);
  const customer = useCustomer(order?.customerId);
  const products = useProducts();

  const [showFulfill, setShowFulfill] = useState(false);
  const [fulfillNote, setFulfillNote] = useState('');

  const [showCancel, setShowCancel] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showEditDue, setShowEditDue] = useState(false);
  const [newDueDate, setNewDueDate] = useState('');

  if (!order) {
    return (
      <div className="p-4 text-center">
        <p className="text-slate-500">Order not found</p>
        <Button variant="secondary" onClick={() => navigate('/')} className="mt-4">
          Go Back
        </Button>
      </div>
    );
  }

  const getProductName = (productId: string) => {
    if (productId === 'CARRYOVER') return 'Balance Carryover';
    return products.find((p) => p.id === productId)?.name ?? 'Unknown';
  };

  // Combined fulfill: pays full balance due, delivers all owed grams, and closes order
  const handleFulfill = async () => {
    // Pay the full balance due
    if (order.balanceDueCents > 0) {
      await addPayment(order.id, order.balanceDueCents, 'CASH', fulfillNote.trim() || undefined);
    }

    // Deliver all remaining owed grams
    if (order.owedRemainingGrams > 0) {
      await addFulfillment(
        order.id,
        'DELIVERED',
        order.owedRemainingGrams,
        undefined,
        fulfillNote.trim() || undefined
      );
    }

    // Close the order
    await closeOrder(order.id);

    setFulfillNote('');
    setShowFulfill(false);
    audio.playSuccess();
  };

  const handleCancel = async () => {
    await cancelOrder(order.id);
    setShowCancel(false);
    navigate(-1);
  };

  const statusStyles = {
    OPEN: 'bg-blue-100 text-blue-700',
    PARTIAL: 'bg-yellow-100 text-yellow-700',
    CLOSED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-slate-100 text-slate-500',
  };


  return (
    <div className="p-4 space-y-4">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center text-silver -ml-1"
      >
        <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Order Details</h1>
          <p className="text-sm text-silver">{formatDate(order.createdAt)}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusStyles[order.status]}`}>
          {order.status}
        </span>
      </div>

      {/* Customer link */}
      {customer && (
        <Link to={`/customers/${customer.id}`}>
          <Card className="active:bg-surface-700">
            <div className="flex items-center justify-between">
              <div className="font-medium text-text-primary">{customer.name}</div>
              <svg className="w-5 h-5 text-silver" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Card>
        </Link>
      )}

      {/* Order items */}
      <Card>
        <h3 className="font-semibold text-text-primary mb-3">Items</h3>
        <div className="space-y-2">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between">
              <div>
                <div className="font-medium text-text-primary">{getProductName(item.productId)}</div>
                {item.quantityGrams && item.quantityGrams > 0 && (
                  <div className="text-sm text-silver">
                    {formatWeight(item.quantityGrams, 'g')}
                    {item.pricePerGramCentsSnapshot && (
                      <> @ {formatMoney(item.pricePerGramCentsSnapshot)}/g</>
                    )}
                  </div>
                )}
              </div>
              <div className="font-medium text-text-primary">{formatMoney(item.lineTotalCents)}</div>
            </div>
          ))}

          {order.deliveryFeeCents > 0 && (
            <div className="flex justify-between pt-2 border-t border-slate-100">
              <div className="text-slate-600">Delivery fee</div>
              <div className="font-medium">{formatMoney(order.deliveryFeeCents)}</div>
            </div>
          )}

          <div className="flex justify-between pt-2 border-t border-slate-200 font-semibold">
            <div>Total</div>
            <div>{formatMoney(order.orderSubtotalCents)}</div>
          </div>
        </div>
      </Card>

      {/* Balance summary */}
      <Card>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-lime">
              {formatMoney(order.paidTotalCents)}
            </div>
            <div className="text-sm text-silver">Paid</div>
          </div>
          <div>
            <div
              className={`text-2xl font-bold ${order.balanceDueCents > 0 ? 'text-magenta' : 'text-lime'
                }`}
            >
              {formatMoney(order.balanceDueCents)}
            </div>
            <div className="text-sm text-silver">Due</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-text-primary">
              {formatWeight(order.owedRemainingGrams, 'g', 0)}
            </div>
            <div className="text-sm text-silver">Owed</div>
          </div>
        </div>
      </Card>

      {/* Due Date */}
      {order.status !== 'CANCELLED' && order.status !== 'CLOSED' && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-silver">Due Date</div>
              <div className={`font-semibold ${order.dueAt && order.dueAt < Date.now() ? 'text-magenta' : 'text-text-primary'}`}>
                {order.dueAt ? formatDate(order.dueAt) : 'No due date'}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (order.dueAt) {
                  const d = new Date(order.dueAt);
                  setNewDueDate(d.toISOString().split('T')[0]);
                } else {
                  setNewDueDate('');
                }
                setShowEditDue(true);
              }}
            >
              Edit
            </Button>
          </div>
        </Card>
      )}

      {/* Actions */}
      {order.status !== 'CANCELLED' && order.status !== 'CLOSED' && (
        <div className="space-y-2">
          <Button onClick={() => setShowFulfill(true)} className="w-full">
            Fulfill Order
          </Button>
          <Button
            onClick={() => setShowClose(true)}
            variant="secondary"
            className="w-full"
          >
            Mark as Closed
          </Button>
        </div>
      )}

      {/* Payments */}
      {order.payments.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-primary mb-3">Payments</h3>
          <div className="space-y-2">
            {order.payments.map((payment) => (
              <div key={payment.id} className="flex justify-between items-center">
                <div className="text-sm text-silver">
                  {formatDateTime(payment.createdAt)}
                </div>
                <div className="font-medium text-lime">
                  +{formatMoney(payment.amountCents)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Deliveries */}
      {order.fulfillments.length > 0 && (
        <Card>
          <h3 className="font-semibold text-text-primary mb-3">Deliveries</h3>
          <div className="space-y-2">
            {order.fulfillments.map((f) => (
              <div key={f.id} className="flex justify-between items-center">
                <div>
                  <div className="text-sm text-silver">{formatDateTime(f.createdAt)}</div>
                  {f.note && <div className="text-sm text-silver">{f.note}</div>}
                </div>
                <div className="text-right">
                  {f.deliveredGrams && f.deliveredGrams > 0 && (
                    <div className="font-medium text-text-primary">{formatWeight(f.deliveredGrams, 'g')}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Policy snapshot */}
      {order.policy && (
        <Card>
          <h3 className="font-semibold text-text-primary mb-3">Policy Applied</h3>
          <div className="space-y-1 text-sm">
            {order.policy.computedTypicalGrams && (
              <div className="flex justify-between">
                <span className="text-silver">Typical:</span>
                <span className="text-text-primary">{formatWeight(order.policy.computedTypicalGrams, 'g')}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-silver">Holdback:</span>
              <span className="text-text-primary">{Math.round(order.policy.appliedHoldbackPct * 100)}%</span>
            </div>
            {order.policy.computedDeliverNowGrams !== undefined && (
              <div className="flex justify-between">
                <span className="text-silver">Give now:</span>
                <span className="text-text-primary">{formatWeight(order.policy.computedDeliverNowGrams, 'g')}</span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Cancel button */}
      {order.status !== 'CANCELLED' && order.status !== 'CLOSED' && (
        <Button
          variant="ghost"
          onClick={() => setShowCancel(true)}
          className="w-full text-red-600"
        >
          Cancel Order
        </Button>
      )}

      {/* Fulfill modal - pays and delivers in one action */}
      <Modal isOpen={showFulfill} onClose={() => setShowFulfill(false)} title="Fulfill Order">
        <div className="space-y-4">
          {/* Summary of what will happen */}
          <div className="glass-card p-3 rounded-xl space-y-2">
            {order.balanceDueCents > 0 && (
              <div className="flex justify-between">
                <span className="text-silver">Payment:</span>
                <span className="text-lime font-mono">{formatMoney(order.balanceDueCents)}</span>
              </div>
            )}
            {order.owedRemainingGrams > 0 && (
              <div className="flex justify-between">
                <span className="text-silver">Delivery:</span>
                <span className="text-text-primary font-mono">{formatWeight(order.owedRemainingGrams, 'g')}</span>
              </div>
            )}
          </div>
          <Input
            label="Note (optional)"
            value={fulfillNote}
            onChange={(e) => setFulfillNote(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowFulfill(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleFulfill} className="flex-1">
              Fulfill
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel confirmation */}
      <Modal isOpen={showCancel} onClose={() => setShowCancel(false)} title="Cancel Order">
        <div className="space-y-4">
          <p className="text-slate-600">
            Are you sure you want to cancel this order? This will release the reserved inventory.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowCancel(false)} className="flex-1">
              Keep Order
            </Button>
            <Button variant="danger" onClick={handleCancel} className="flex-1">
              Cancel Order
            </Button>
          </div>
        </div>
      </Modal>

      {/* Close order confirmation */}
      <Modal isOpen={showClose} onClose={() => setShowClose(false)} title="Mark as Closed">
        <div className="space-y-4">
          <p className="text-silver">
            Mark this order as closed/complete? Any outstanding balance will be forgiven and remaining inventory will be released.
          </p>
          {order.balanceDueCents > 0 && (
            <p className="text-sm text-magenta">
              Note: {formatMoney(order.balanceDueCents)} balance will be forgiven.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowClose(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await closeOrder(order.id);
                setShowClose(false);
              }}
              className="flex-1"
            >
              Mark as Closed
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Due Date modal */}
      <Modal isOpen={showEditDue} onClose={() => setShowEditDue(false)} title="Edit Due Date">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-silver mb-1">Due Date</label>
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="w-full px-4 py-3 rounded-xl glass-card border border-surface-600 text-text-primary bg-transparent focus:outline-none focus:ring-2 focus:ring-lime/50"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowEditDue(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const dueAt = newDueDate ? new Date(newDueDate + 'T23:59:59').getTime() : undefined;
                await updateOrderDueDate(order.id, dueAt);
                setShowEditDue(false);
              }}
              className="flex-1"
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
