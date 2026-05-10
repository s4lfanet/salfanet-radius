'use client';

import { useState, useEffect } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Plus,
  Pencil,
  Trash2,
  Package,
  Search,
  Filter,
  Download,
  Upload,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  RefreshCcw,
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

interface Category {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface Item {
  id: string;
  sku: string;
  name: string;
  description?: string;
  categoryId?: string;
  supplierId?: string;
  unit: string;
  minimumStock: number;
  currentStock: number;
  purchasePrice: number;
  sellingPrice: number;
  location?: string;
  notes?: string;
  isActive: boolean;
  category?: Category;
  supplier?: Supplier;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export default function InventoryItemsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);

  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    categoryId: '',
    supplierId: '',
    unit: 'pcs',
    minimumStock: 0,
    currentStock: 0,
    purchasePrice: 0,
    sellingPrice: 0,
    location: '',
    notes: '',
    isActive: true,
  });

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [itemsRes, categoriesRes, suppliersRes] = await Promise.all([
        fetch('/api/inventory/items'),
        fetch('/api/inventory/categories'),
        fetch('/api/inventory/suppliers'),
      ]);

      if (itemsRes.ok) setItems(await itemsRes.json());
      if (categoriesRes.ok) setCategories(await categoriesRes.json());
      if (suppliersRes.ok) setSuppliers(await suppliersRes.json());
    } catch (error) {
      await showError(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      sku: '',
      name: '',
      description: '',
      categoryId: '',
      supplierId: '',
      unit: 'pcs',
      minimumStock: 0,
      currentStock: 0,
      purchasePrice: 0,
      sellingPrice: 0,
      location: '',
      notes: '',
      isActive: true,
    });
  };

  const handleEdit = (item: Item) => {
    setEditingItem(item);
    setFormData({
      sku: item.sku,
      name: item.name,
      description: item.description || '',
      categoryId: item.categoryId || '',
      supplierId: item.supplierId || '',
      unit: item.unit,
      minimumStock: item.minimumStock,
      currentStock: item.currentStock,
      purchasePrice: item.purchasePrice,
      sellingPrice: item.sellingPrice,
      location: item.location || '',
      notes: item.notes || '',
      isActive: item.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.sku || !formData.name) {
      await showError(t('inventory.skuRequired') + ' & ' + t('inventory.itemNameRequired'));
      return;
    }

    try {
      const method = editingItem ? 'PUT' : 'POST';
      const payload = editingItem
        ? { ...formData, id: editingItem.id }
        : formData;

      const res = await fetch('/api/inventory/items', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (res.ok) {
        await showSuccess(
          editingItem ? t('inventory.itemUpdated') : t('inventory.itemCreated')
        );
        setIsDialogOpen(false);
        setEditingItem(null);
        resetForm();
        loadData();
      } else {
        await showError(result.error || t('common.error'));
      }
    } catch (error) {
      await showError(t('common.error'));
    }
  };

  const handleDelete = async (item: Item) => {
    const confirmed = await showConfirm(
      t('inventory.deleteItem'),
      t('inventory.deleteItemConfirm', { name: item.name })
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/inventory/items?id=${item.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await showSuccess(t('inventory.itemDeleted'));
        loadData();
      } else {
        const result = await res.json();
        await showError(result.error || t('common.error'));
      }
    } catch (error) {
      await showError(t('common.error'));
    }
  };

  const filteredItems = items.filter((item) => {
    const matchSearch =
      !searchTerm ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = !filterCategory || item.categoryId === filterCategory;
    const matchSupplier = !filterSupplier || item.supplierId === filterSupplier;
    const matchLowStock = !filterLowStock || item.stockStatus === 'low_stock' || item.stockStatus === 'out_of_stock';

    return matchSearch && matchCategory && matchSupplier && matchLowStock;
  });

  const stats = {
    totalItems: items.length,
    lowStock: items.filter((i) => i.stockStatus === 'low_stock').length,
    outOfStock: items.filter((i) => i.stockStatus === 'out_of_stock').length,
    totalValue: items.reduce((sum, i) => sum + i.currentStock * i.purchasePrice, 0),
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
        <div className="space-y-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
              <Package className="h-6 w-6 text-brand-500 dark:text-[#00f7ff]" />
              {t('inventory.items')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {t('inventory.itemsDesc')}
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-border dark:border-[#bc13fe]/30 p-2.5 sm:p-4 dark:shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-primary/30 dark:hover:border-[#bc13fe]/50 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('inventory.totalItems')}</p>
                  <p className="text-lg font-bold text-foreground">
                    {stats.totalItems}
                  </p>
                </div>
                <Package className="h-6 w-6 text-primary" />
              </div>
            </div>

            <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-border dark:border-[#bc13fe]/30 p-2.5 sm:p-4 dark:shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-orange-300 dark:hover:border-[#bc13fe]/50 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('inventory.lowStock')}</p>
                  <p className="text-lg font-bold text-orange-500">{stats.lowStock}</p>
                </div>
                <AlertTriangle className="h-6 w-6 text-orange-500" />
              </div>
            </div>

            <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-border dark:border-[#bc13fe]/30 p-2.5 sm:p-4 dark:shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-destructive/30 dark:hover:border-[#bc13fe]/50 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('inventory.outOfStock')}</p>
                  <p className="text-lg font-bold text-destructive">{stats.outOfStock}</p>
                </div>
                <TrendingDown className="h-6 w-6 text-destructive" />
              </div>
            </div>

            <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-border dark:border-[#bc13fe]/30 p-2.5 sm:p-4 dark:shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-success/30 dark:hover:border-[#bc13fe]/50 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('inventory.totalValue')}</p>
                  <p className="text-lg font-bold text-success">
                    Rp {stats.totalValue.toLocaleString('id-ID')}
                  </p>
                </div>
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
            </div>
          </div>

          {/* Actions Bar */}
          <div className="bg-card rounded-lg shadow-sm border border-border p-3">
            <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t('inventory.searchItems')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-inputdark:text-white"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-2">
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="px-2.5 py-1.5 border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-inputdark:text-white text-xs"
                >
                  <option value="">{t('inventory.allCategories')}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>

                <select
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  className="px-2.5 py-1.5 border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-inputdark:text-white text-xs"
                >
                  <option value="">{t('inventory.allSuppliers')}</option>
                  {suppliers.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => setFilterLowStock(!filterLowStock)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterLowStock
                      ? 'bg-orange-500 text-white'
                      : 'bg-muted text-muted-foreground'
                    }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                  {t('inventory.lowStock')}
                </button>

                <button
                  onClick={loadData}
                  className="px-2.5 py-1.5 bg-muted text-muted-foreground rounded-lg hover:bg-muted transition-colors text-xs font-medium"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                </button>

                <button
                  onClick={() => {
                    setEditingItem(null);
                    resetForm();
                    setIsDialogOpen(true);
                  }}
                  className="px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-xs font-medium flex items-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('inventory.addItem')}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="block md:hidden space-y-3">
            {filteredItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">{t('inventory.noItems')}</div>
            ) : (
              filteredItems.map((item) => (
                <div key={item.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                      <p className="text-xs font-mono text-muted-foreground">{item.sku}</p>
                    </div>
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ml-2 shrink-0 ${
                      item.stockStatus === 'out_of_stock' ? 'bg-destructive/20 text-destructive' :
                      item.stockStatus === 'low_stock' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300' :
                      'bg-success/20 text-success'
                    }`}>
                      {item.stockStatus === 'out_of_stock' ? t('inventory.outOfStock') :
                       item.stockStatus === 'low_stock' ? t('inventory.lowStock') : t('inventory.inStock')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-2">
                    <div><span className="text-muted-foreground">Category:</span> <span className="text-foreground">{item.category?.name || '-'}</span></div>
                    <div><span className="text-muted-foreground">Unit:</span> <span className="text-foreground">{item.unit}</span></div>
                    <div>
                      <span className="text-muted-foreground">Stock:</span>{' '}
                      <span className={`font-medium ${item.stockStatus === 'out_of_stock' ? 'text-destructive' : item.stockStatus === 'low_stock' ? 'text-orange-600' : 'text-success'}`}>{item.currentStock}</span>
                      <span className="text-muted-foreground text-[10px]"> (min: {item.minimumStock})</span>
                    </div>
                    {item.location && <div><span className="text-muted-foreground">📍</span> <span className="text-foreground">{item.location}</span></div>}
                    <div><span className="text-muted-foreground">Buy:</span> <span className="text-foreground">Rp {item.purchasePrice.toLocaleString('id-ID')}</span></div>
                    <div><span className="text-muted-foreground">Sell:</span> <span className="text-foreground">Rp {item.sellingPrice.toLocaleString('id-ID')}</span></div>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <button onClick={() => handleEdit(item)} className="p-2 text-primary hover:text-blue-800 dark:text-primary dark:hover:text-blue-300" title="Edit Barang">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(item)} className="p-2 text-destructive hover:text-red-800 dark:text-destructive dark:hover:text-red-300" title="Hapus Barang">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Items Table */}
          <div className="hidden md:block bg-card rounded-lg shadow-sm border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      SKU
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Stock
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Unit
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Purchase Price
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Selling Price
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-muted"
                    >
                      <td className="px-3 py-2 text-xs font-mono text-foreground">
                        {item.sku}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="font-medium text-foreground">
                          {item.name}
                        </div>
                        {item.location && (
                          <div className="text-[10px] text-muted-foreground">
                            📍 {item.location}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-foreground">
                        {item.category?.name || '-'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div
                          className={`font-medium ${item.stockStatus === 'out_of_stock'
                              ? 'text-destructive'
                              : item.stockStatus === 'low_stock'
                                ? 'text-orange-600'
                                : 'text-success'
                            }`}
                        >
                          {item.currentStock}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Min: {item.minimumStock}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-foreground">
                        {item.unit}
                      </td>
                      <td className="px-3 py-2 text-xs text-foreground">
                        Rp {item.purchasePrice.toLocaleString('id-ID')}
                      </td>
                      <td className="px-3 py-2 text-xs text-foreground">
                        Rp {item.sellingPrice.toLocaleString('id-ID')}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${item.stockStatus === 'out_of_stock'
                              ? 'bg-destructive/20 text-destructive'
                              : item.stockStatus === 'low_stock'
                                ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300'
                                : 'bg-success/20 text-success'
                            }`}
                        >
                          {item.stockStatus === 'out_of_stock'
                            ? t('inventory.outOfStock')
                            : item.stockStatus === 'low_stock'
                              ? t('inventory.lowStock')
                              : t('inventory.inStock')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEdit(item)}
                            className="p-0.5 text-primary hover:text-blue-800 dark:text-primary dark:hover:text-blue-300"
                            title="Edit Barang"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            className="p-0.5 text-destructive hover:text-red-800 dark:text-destructive dark:hover:text-red-300"
                            title="Hapus Barang"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredItems.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  {t('inventory.noItems')}
                </div>
              )}
            </div>
          </div>

          {/* Add/Edit Modal */}
          <SimpleModal isOpen={isDialogOpen} onClose={() => { setIsDialogOpen(false); setEditingItem(null); resetForm(); }} size="xl">
            <ModalHeader>
              <ModalTitle>{editingItem ? t('inventory.editItem') : t('inventory.addItem')}</ModalTitle>
            </ModalHeader>
            <form onSubmit={handleSubmit}>
              <ModalBody>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <ModalLabel required>{t('inventory.sku')}</ModalLabel>
                    <ModalInput type="text" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} className="font-mono" required />
                  </div>
                  <div>
                    <ModalLabel required>{t('inventory.itemName')}</ModalLabel>
                    <ModalInput type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                  </div>
                  <div>
                    <ModalLabel>{t('inventory.category')}</ModalLabel>
                    <ModalSelect value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}>
                      <option value="" className="dark:bg-[#0a0520]">{t('inventory.selectCategory')}</option>
                      {categories.map((cat) => (<option key={cat.id} value={cat.id} className="dark:bg-[#0a0520]">{cat.name}</option>))}
                    </ModalSelect>
                  </div>
                  <div>
                    <ModalLabel>{t('inventory.supplier')}</ModalLabel>
                    <ModalSelect value={formData.supplierId} onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}>
                      <option value="" className="dark:bg-[#0a0520]">{t('inventory.selectSupplier')}</option>
                      {suppliers.map((sup) => (<option key={sup.id} value={sup.id} className="dark:bg-[#0a0520]">{sup.name}</option>))}
                    </ModalSelect>
                  </div>
                  <div>
                    <ModalLabel>{t('inventory.unit')}</ModalLabel>
                    <ModalInput type="text" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} placeholder="pcs, box, meter, etc" />
                  </div>
                  <div>
                    <ModalLabel>{t('inventory.location')}</ModalLabel>
                    <ModalInput type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="Warehouse, Shelf A1, etc" />
                  </div>
                  <div>
                    <ModalLabel>{t('inventory.currentStock')}</ModalLabel>
                    <ModalInput type="number" value={formData.currentStock} onChange={(e) => setFormData({ ...formData, currentStock: parseInt(e.target.value) || 0 })} disabled={!!editingItem} />
                    {editingItem && <p className="text-[9px] text-muted-foreground mt-1">{t('inventory.movements')}</p>}
                  </div>
                  <div>
                    <ModalLabel>{t('inventory.minimumStock')}</ModalLabel>
                    <ModalInput type="number" value={formData.minimumStock} onChange={(e) => setFormData({ ...formData, minimumStock: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <ModalLabel>{t('inventory.purchasePrice')} (Rp)</ModalLabel>
                    <ModalInput type="number" value={formData.purchasePrice} onChange={(e) => setFormData({ ...formData, purchasePrice: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <ModalLabel>{t('inventory.sellingPrice')} (Rp)</ModalLabel>
                    <ModalInput type="number" value={formData.sellingPrice} onChange={(e) => setFormData({ ...formData, sellingPrice: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="md:col-span-2">
                    <ModalLabel>{t('inventory.descriptionLabel')}</ModalLabel>
                    <ModalTextarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} />
                  </div>
                  <div className="md:col-span-2">
                    <ModalLabel>{t('inventory.notes')}</ModalLabel>
                    <ModalTextarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
                  </div>
                  <div className="md:col-span-2 flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="rounded border-[#bc13fe]/50 bg-background dark:bg-[#0a0520] accent-brand-500 dark:accent-[#00f7ff] w-4 h-4" />
                      <span>{t('common.active')}</span>
                    </label>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <ModalButton type="button" variant="secondary" onClick={() => { setIsDialogOpen(false); setEditingItem(null); resetForm(); }}>{t('common.cancel')}</ModalButton>
                <ModalButton type="submit" variant="primary">{editingItem ? t('common.update') : t('common.create')}</ModalButton>
              </ModalFooter>
            </form>
          </SimpleModal>
        </div>
      </div>
    </div>
  );
}
