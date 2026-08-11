'use client';

import { useState, useEffect } from 'react';
import { showSuccess, showError } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import {
  TrendingUp,
  TrendingDown,
  RefreshCcw,
  Package,
  Calendar,
  User,
} from 'lucide-react';
import {
  SimpleModal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalSelect,
  ModalTextarea,
  ModalLabel,
  ModalButton,
} from '@/components/cyberpunk';
import { formatWIB } from '@/lib/timezone';

interface Item {
  id: string;
  sku: string;
  name: string;
  unit: string;
}

interface Movement {
  id: string;
  itemId: string;
  movementType: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  referenceNo?: string;
  notes?: string;
  userId?: string;
  userName?: string;
  createdAt: string;
  item: Item;
}

export default function StockMovementsPage() {
  const { t } = useTranslation();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterItem, setFilterItem] = useState('');
  const [filterType, setFilterType] = useState('');

  const [formData, setFormData] = useState({
    itemId: '',
    movementType: 'IN',
    quantity: 0,
    referenceNo: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [movementsRes, itemsRes] = await Promise.all([
        fetch('/api/inventory/movements'),
        fetch('/api/inventory/items'),
      ]);

      if (movementsRes.ok) setMovements(await movementsRes.json());
      if (itemsRes.ok) setItems(await itemsRes.json());
    } catch (error) {
      await showError(t('inventory.failedLoadData'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      itemId: '',
      movementType: 'IN',
      quantity: 0,
      referenceNo: '',
      notes: '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.itemId || !formData.quantity) {
      await showError(t('inventory.itemQtyRequired'));
      return;
    }

    try {
      const res = await fetch('/api/inventory/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const result = await res.json();

      if (res.ok) {
        await showSuccess(t('inventory.movementCreated'));
        setIsDialogOpen(false);
        resetForm();
        loadData();
      } else {
        await showError(result.error || t('common.failed'));
      }
    } catch (error) {
      await showError(t('inventory.failedRecordMovement'));
    }
  };

  const filteredMovements = movements.filter((mov) => {
    const matchItem = !filterItem || mov.itemId === filterItem;
    const matchType = !filterType || mov.movementType === filterType;
    return matchItem && matchType;
  });

  const stats = {
    totalIn: movements
      .filter((m) => m.movementType === 'IN')
      .reduce((sum, m) => sum + m.quantity, 0),
    totalOut: movements
      .filter((m) => m.movementType === 'OUT')
      .reduce((sum, m) => sum + m.quantity, 0),
    totalMovements: movements.length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <div className="w-12 h-12 border-4 border-brand-500 dark:border-[#00f7ff] border-t-transparent rounded-full animate-spin dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10"></div>
      </div>
    );
  }

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
        <div className="p-6">
          <div className="mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
              <RefreshCcw className="h-6 w-6 text-[#00f7ff]" />
              Stock Movements
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Track all stock in and out movements
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-card rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Movements</p>
                  <p className="text-lg sm:text-2xl font-bold text-foreground">
                    {stats.totalMovements}
                  </p>
                </div>
                <Package className="h-10 w-10 text-primary" />
              </div>
            </div>

            <div className="bg-card rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Stock In</p>
                  <p className="text-lg sm:text-2xl font-bold text-success">{stats.totalIn}</p>
                </div>
                <TrendingUp className="h-10 w-10 text-success" />
              </div>
            </div>

            <div className="bg-card rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Stock Out</p>
                  <p className="text-lg sm:text-2xl font-bold text-destructive">{stats.totalOut}</p>
                </div>
                <TrendingDown className="h-10 w-10 text-destructive" />
              </div>
            </div>
          </div>

          {/* Actions Bar */}
          <div className="bg-card rounded-lg shadow mb-6 p-4">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
              {/* Filters */}
              <div className="flex flex-wrap gap-2">
                <select
                  value={filterItem}
                  onChange={(e) => setFilterItem(e.target.value)}
                  className="px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary bg-card text-foreground text-sm"
                >
                  <option value="">All Items</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.sku})
                    </option>
                  ))}
                </select>

                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary bg-card text-foreground text-sm"
                >
                  <option value="">All Types</option>
                  <option value="IN">Stock In</option>
                  <option value="OUT">Stock Out</option>
                  <option value="ADJUSTMENT">Adjustment</option>
                </select>

                <button
                  onClick={loadData}
                  className="px-3 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors text-sm font-medium"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
              </div>

              <button
                onClick={() => {
                  resetForm();
                  setIsDialogOpen(true);
                }}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium flex items-center gap-2"
              >
                <RefreshCcw className="h-4 w-4" />
                Record Movement
              </button>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="block md:hidden space-y-3">
            {filteredMovements.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No movements found</div>
            ) : (
              filteredMovements.map((movement) => (
                <div key={movement.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{movement.item.name}</p>
                      <p className="text-xs font-mono text-muted-foreground">{movement.item.sku}</p>
                    </div>
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ml-2 shrink-0 ${
                      movement.movementType === 'IN' ? 'bg-success/20 text-success' :
                      movement.movementType === 'OUT' ? 'bg-destructive/20 text-destructive' :
                      'bg-primary/20 text-primary'
                    }`}>
                      {movement.movementType}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-1">
                    <div>
                      <span className="text-muted-foreground">Qty:</span>{' '}
                      <span className={`font-medium ${movement.movementType === 'IN' ? 'text-success' : movement.movementType === 'OUT' ? 'text-destructive' : 'text-primary'}`}>
                        {movement.movementType === 'IN' && '+'}{movement.movementType === 'OUT' && '-'}{movement.quantity} {movement.item.unit}
                      </span>
                    </div>
                    <div><span className="text-muted-foreground">Stock:</span> <span className="text-foreground">{movement.previousStock} → {movement.newStock}</span></div>
                    <div><span className="text-muted-foreground">Ref:</span> <span className="text-foreground">{movement.referenceNo || '-'}</span></div>
                    <div><span className="text-muted-foreground">User:</span> <span className="text-foreground">{movement.userName || '-'}</span></div>
                  </div>
                  <div className="text-[10px] text-muted-foreground">{formatWIB(movement.createdAt, 'dd/MM/yyyy HH:mm')}</div>
                  {movement.notes && <div className="text-[10px] text-muted-foreground mt-1">{movement.notes}</div>}
                </div>
              ))
            )}
          </div>

          {/* Movements Table */}
          <div className="hidden md:block bg-card rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Item
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Previous
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      New Stock
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Reference
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      User
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredMovements.map((movement) => (
                    <tr key={movement.id} className="hover:bg-muted">
                      <td className="px-4 py-3 text-sm text-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {formatWIB(movement.createdAt, 'dd/MM/yyyy HH:mm')}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-foreground">
                          {movement.item.name}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {movement.item.sku}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${movement.movementType === 'IN'
                              ? 'bg-success/20 text-success'
                              : movement.movementType === 'OUT'
                                ? 'bg-destructive/20 text-destructive'
                                : 'bg-primary/20 text-primary'
                            }`}
                        >
                          {movement.movementType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div
                          className={`font-medium ${movement.movementType === 'IN'
                              ? 'text-success'
                              : movement.movementType === 'OUT'
                                ? 'text-destructive'
                                : 'text-primary'
                            }`}
                        >
                          {movement.movementType === 'IN' && '+'}
                          {movement.movementType === 'OUT' && '-'}
                          {movement.quantity} {movement.item.unit}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {movement.previousStock}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        {movement.newStock}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {movement.referenceNo || '-'}
                        {movement.notes && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {movement.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {movement.userName || '-'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredMovements.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  No movements found
                </div>
              )}
            </div>
          </div>

          {/* Add Movement Modal */}
          <SimpleModal isOpen={isDialogOpen} onClose={() => { setIsDialogOpen(false); resetForm(); }} size="md">
            <ModalHeader>
              <ModalTitle>{t('inventory.recordStockMovement')}</ModalTitle>
            </ModalHeader>
            <form onSubmit={handleSubmit}>
              <ModalBody className="space-y-4">
                <div>
                  <ModalLabel required>{t('inventory.itemLabel')}</ModalLabel>
                  <ModalSelect value={formData.itemId} onChange={(e) => setFormData({ ...formData, itemId: e.target.value })} required>
                    <option value="" className="dark:bg-[#0a0520]">Select Item</option>
                    {items.map((item) => (<option key={item.id} value={item.id} className="dark:bg-[#0a0520]">{item.name} ({item.sku})</option>))}
                  </ModalSelect>
                </div>
                <div>
                  <ModalLabel required>{t('inventory.movementType')}</ModalLabel>
                  <ModalSelect value={formData.movementType} onChange={(e) => setFormData({ ...formData, movementType: e.target.value })} required>
                    <option value="IN" className="dark:bg-[#0a0520]">Stock In (Purchase/Return)</option>
                    <option value="OUT" className="dark:bg-[#0a0520]">Stock Out (Sale/Usage)</option>
                    <option value="ADJUSTMENT" className="dark:bg-[#0a0520]">Adjustment (Correction)</option>
                  </ModalSelect>
                </div>
                <div>
                  <ModalLabel required>{t('inventory.quantityLabel')}</ModalLabel>
                  <ModalInput type="number" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })} required min={1} />
                  {formData.movementType === 'ADJUSTMENT' && <p className="text-[10px] text-muted-foreground mt-1">Enter the new total stock quantity</p>}
                </div>
                <div>
                  <ModalLabel>{t('inventory.referenceNo')}</ModalLabel>
                  <ModalInput type="text" value={formData.referenceNo} onChange={(e) => setFormData({ ...formData, referenceNo: e.target.value })} placeholder="PO-001, INV-123, etc" />
                </div>
                <div>
                  <ModalLabel>{t('inventory.notesLabel')}</ModalLabel>
                  <ModalTextarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} />
                </div>
              </ModalBody>
              <ModalFooter>
                <ModalButton type="button" variant="secondary" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</ModalButton>
                <ModalButton type="submit" variant="primary">{t('inventory.recordMovement')}</ModalButton>
              </ModalFooter>
            </form>
          </SimpleModal>
        </div>
      </div>
    </div>
  );
}
