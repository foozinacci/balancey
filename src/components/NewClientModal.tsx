import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCustomer } from '../db/customers';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';
import { audio } from '../utils/audio';

interface NewClientModalProps {
    isOpen: boolean;
    onClose: () => void;
    onClientCreated?: (clientId: string) => void; // For "Create + Order" - stays on current page with client selected
}

export function NewClientModal({ isOpen, onClose, onClientCreated }: NewClientModalProps) {
    const navigate = useNavigate();
    const [clientName, setClientName] = useState('');
    const [clientStreet, setClientStreet] = useState('');
    const [clientZip, setClientZip] = useState('');

    // Combine street + zip for the stored address
    const getFullAddress = () => {
        const street = clientStreet.trim();
        const zip = clientZip.trim();
        if (!street && !zip) return undefined;
        return zip ? `${street} ${zip}`.trim() : street;
    };

    const handleCreateAndViewCard = async () => {
        if (!clientName.trim()) return;
        try {
            audio.playSuccess();
            const client = await createCustomer({
                name: clientName.trim(),
                defaultAddress: getFullAddress(),
            });
            setClientName('');
            setClientStreet('');
            setClientZip('');
            onClose();
            // Navigate directly to client's detail card
            navigate(`/customers/${client.id}`);
        } catch (error) {
            console.error('Failed to create client:', error);
            audio.playError();
        }
    };

    const handleCreateAndStartOrder = async () => {
        if (!clientName.trim()) return;
        try {
            audio.playSuccess();
            const client = await createCustomer({
                name: clientName.trim(),
                defaultAddress: getFullAddress(),
            });
            setClientName('');
            setClientStreet('');
            setClientZip('');
            onClose();

            if (onClientCreated) {
                // Stay on current page (NewOrder) with client selected
                onClientCreated(client.id);
            } else {
                // Navigate to new order with client selected
                navigate(`/orders/new?customer=${client.id}`);
            }
        } catch (error) {
            console.error('Failed to create client:', error);
            audio.playError();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="New Client">
            <div className="space-y-4">
                <Input
                    label="Client Name"
                    placeholder="Enter name..."
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    autoFocus
                />
                <div>
                    <label className="block text-sm font-medium text-silver mb-1">Address (Optional)</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            className="flex-[2] px-3 py-2.5 rounded-xl glass-input text-sm"
                            placeholder="Street address"
                            value={clientStreet}
                            onChange={(e) => setClientStreet(e.target.value)}
                        />
                        <input
                            type="text"
                            className="w-24 px-3 py-2.5 rounded-xl glass-input text-sm"
                            placeholder="Zip"
                            value={clientZip}
                            onChange={(e) => setClientZip(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        className="flex-1"
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={handleCreateAndViewCard}
                        disabled={!clientName.trim()}
                        className="flex-1 text-xs"
                    >
                        Create - Order
                    </Button>
                    <Button
                        onClick={handleCreateAndStartOrder}
                        disabled={!clientName.trim()}
                        className="flex-1 text-xs"
                    >
                        Create + Order
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
