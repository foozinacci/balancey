import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCustomers } from '../hooks/useData';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { NewClientModal } from '../components/NewClientModal';
import { formatMoney } from '../utils/units';
import type { CustomerWithBalance } from '../types';

export function Clients() {
    const customers = useCustomers();
    const [searchQuery, setSearchQuery] = useState('');
    const [showNewClient, setShowNewClient] = useState(false);
    const [showPaid, setShowPaid] = useState(false);

    // Filter and sort clients
    const filteredClients = useMemo(() => {
        let filtered = customers;

        // Filter by search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = customers.filter((c) =>
                c.name.toLowerCase().includes(query)
            );
        }

        // Filter by balance
        if (!showPaid) {
            filtered = filtered.filter((c) => c.balanceDueCents > 0);
        }

        // Sort: late first, then by balance, then by name
        return [...filtered].sort((a, b) => {
            if (a.isLate && !b.isLate) return -1;
            if (!a.isLate && b.isLate) return 1;
            if (a.balanceDueCents !== b.balanceDueCents) {
                return b.balanceDueCents - a.balanceDueCents;
            }
            return a.name.localeCompare(b.name);
        });
    }, [customers, searchQuery, showPaid]);

    const paidCount = customers.filter((c) => c.balanceDueCents === 0).length;

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-text-primary">Clients</h1>
                <button
                    onClick={() => setShowNewClient(true)}
                    className="px-4 py-2.5 rounded-xl font-semibold transition-all"
                    style={{ backgroundColor: '#c9a050', color: '#050810' }}
                >
                    + Client
                </button>
            </div>

            {/* Search and filter */}
            <div className="space-y-3">
                <Input
                    type="search"
                    placeholder="Search clients..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowPaid(false)}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${!showPaid
                            ? 'bg-lime text-[#050810]'
                            : 'glass-card text-silver hover:text-text-primary'
                            }`}
                    >
                        With Balance ({customers.length - paidCount})
                    </button>
                    <button
                        onClick={() => setShowPaid(true)}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${showPaid
                            ? 'bg-lime text-[#050810]'
                            : 'glass-card text-silver hover:text-text-primary'
                            }`}
                    >
                        All Clients ({customers.length})
                    </button>
                </div>
            </div>

            {/* Client list */}
            <div className="space-y-2">
                {filteredClients.length === 0 ? (
                    <Card className="text-center py-8">
                        <p className="text-silver">
                            {customers.length === 0
                                ? 'No clients yet. Add one to get started!'
                                : 'No clients match your filter.'}
                        </p>
                    </Card>
                ) : (
                    filteredClients.map((client) => (
                        <ClientRow key={client.id} client={client} />
                    ))
                )}
            </div>

            {/* New Client Modal */}
            <NewClientModal
                isOpen={showNewClient}
                onClose={() => setShowNewClient(false)}
            />
        </div>
    );
}

function ClientRow({ client }: { client: CustomerWithBalance }) {
    // New client = no orders, balance = 0
    const isNewClient = client.orderCount === 0 && client.balanceDueCents === 0;

    return (
        <Link to={`/customers/${client.id}`}>
            <Card className="glass-card-interactive">
                <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-text-primary truncate">
                                {client.name}
                            </span>
                            {client.isLate && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-magenta/20 text-magenta rounded-full">
                                    Late
                                </span>
                            )}
                            {isNewClient && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-silver/20 text-silver rounded-full">
                                    New
                                </span>
                            )}
                            {client.tags.some((t) => t.tag === 'VIP') && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-gold/20 text-gold rounded-full">
                                    VIP
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="text-right">
                        {isNewClient ? (
                            <span className="text-sm text-silver italic">Balance Pending</span>
                        ) : (
                            <div
                                className={`font-mono font-semibold ${client.balanceDueCents > 0 ? 'text-magenta' : 'text-lime'
                                    }`}
                            >
                                {formatMoney(client.balanceDueCents)}
                            </div>
                        )}
                    </div>
                </div>
            </Card>
        </Link>
    );
}
