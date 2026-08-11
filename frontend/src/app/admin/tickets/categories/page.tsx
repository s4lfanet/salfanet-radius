'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { showSuccess, showError, showConfirm, showWarning } from '@/lib/sweetalert';
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react';
import {
  SimpleModal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalTextarea,
  ModalLabel,
  ModalButton,
} from '@/components/cyberpunk';
import { TICKET_CATEGORIES, getGroupStats } from '@/lib/ticketCategories';

interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string;
  isActive: boolean;
  _count: {
    tickets: number;
  };
}

export default function TicketCategoriesPage() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    isActive: true,
  });

  // Calculate real stats from categories state
  const calculateStats = () => {
    const total = categories.length;
    // Count by category name patterns
    const network = categories.filter(cat => 
      cat.name.includes('Jaringan') || cat.name.includes('Lambat') || 
      cat.name.includes('Putus') || cat.name.includes('Ping') ||
      cat.name.includes('Network') || cat.name.includes('Slow') ||
      cat.name.includes('Intermittent') || cat.name.includes('Latency')
    ).length;
    
    const technical = categories.filter(cat => 
      cat.name.includes('Instalasi') || cat.name.includes('Pemasangan') || 
      cat.name.includes('Pindah') || cat.name.includes('Perangkat') ||
      cat.name.includes('Installation') || cat.name.includes('Relocation') ||
      cat.name.includes('Equipment')
    ).length;
    
    const billing = total - network - technical;
    
    return { total, network, technical, billing };
  };

  const stats = calculateStats();

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/tickets/categories');
      if (res.ok) {
        const data = await res.json();
        // If no data from DB, use default categories
        if (!data || data.length === 0) {
          const defaultCategories = TICKET_CATEGORIES.map(cat => ({
            id: cat.id,
            name: cat.name,
            description: cat.description,
            color: cat.color,
            isActive: true,
            _count: { tickets: 0 }
          }));
          setCategories(defaultCategories);
        } else {
          setCategories(data);
        }
      } else {
        // On error, show default categories
        const defaultCategories = TICKET_CATEGORIES.map(cat => ({
          id: cat.id,
          name: cat.name,
          description: cat.description,
          color: cat.color,
          isActive: true,
          _count: { tickets: 0 }
        }));
        setCategories(defaultCategories);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      // On error, show default categories
      const defaultCategories = TICKET_CATEGORIES.map(cat => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        color: cat.color,
        isActive: true,
        _count: { tickets: 0 }
      }));
      setCategories(defaultCategories);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        name: category.name,
        description: category.description || '',
        color: category.color,
        isActive: category.isActive,
      });
    } else {
      setEditingCategory(null);
      setFormData({
        name: '',
        description: '',
        color: '#3B82F6',
        isActive: true,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingCategory(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const url = '/api/tickets/categories';
    const method = editingCategory ? 'PUT' : 'POST';
    const body = editingCategory
      ? { id: editingCategory.id, ...formData }
      : formData;

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        fetchCategories();
        handleCloseModal();
        await showSuccess(editingCategory ? t('ticket.categoryUpdated') : t('ticket.categoryCreated'));
      } else {
        const error = await res.json();
        await showError(error.error || t('ticket.saveFailed'));
      }
    } catch (error) {
      console.error('Failed to save category:', error);
      await showError(t('ticket.saveFailed'));
    }
  };

  const handleDelete = async (category: Category) => {
    if (category._count.tickets > 0) {
      await showWarning(t('ticket.cannotDeleteCategoryWithTickets').replace('{count}', category._count.tickets.toString()));
      return;
    }

    const confirmed = await showConfirm(t('ticket.confirmDeleteCategory'));
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/tickets/categories?id=${category.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchCategories();
        await showSuccess(t('ticket.categoryDeleted') || 'Category deleted');
      } else {
        const error = await res.json();
        await showError(error.error || t('ticket.deleteFailed'));
      }
    } catch (error) {
      console.error('Failed to delete category:', error);
      await showError(t('ticket.deleteFailed'));
    }
  };

  const colorOptions = [
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Green', value: '#10B981' },
    { name: 'Red', value: '#EF4444' },
    { name: 'Yellow', value: '#F59E0B' },
    { name: 'Purple', value: '#8B5CF6' },
    { name: 'Pink', value: '#EC4899' },
    { name: 'Indigo', value: '#6366F1' },
    { name: 'Gray', value: '#6B7280' },
  ];

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">
              {t('ticket.ticketCategories')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {t('ticket.manageCategoriesDescription')}
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={20} />
            {t('ticket.addCategory')}
          </button>
        </div>

        {/* Categories Grid */}
        {loading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
            </div>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 dark:border-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((category) => (
              <div
                key={category.id}
                className="bg-card dark:bg-[#1a1525]/80 backdrop-blur-sm border border-border dark:border-[#bc13fe]/30 rounded-lg p-2.5 sm:p-4 hover:border-primary/30 dark:hover:border-[#00f7ff]/50 transition-all dark:hover:shadow-[0_0_20px_rgba(0,247,255,0.3)]"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                      style={{ backgroundColor: category.color }}
                    />
                    <h3 className="font-semibold text-foreground">
                      {category.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenModal(category)}
                      className="text-muted-foreground hover:text-[#00f7ff] transition-colors"
                      title="Edit Kategori"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(category)}
                      className="text-muted-foreground hover:text-[#ff44cc] transition-colors"
                      disabled={category._count.tickets > 0}
                      title="Hapus Kategori"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {category.description && (
                  <p className="text-muted-foreground text-sm mb-3">
                    {category.description}
                  </p>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {category._count.tickets} {t('ticket.tickets').toLowerCase()}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${category.isActive
                      ? 'bg-[#00f7ff]/20 text-[#00f7ff] border border-[#00f7ff]/30'
                      : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                    }`}>
                    {category.isActive ? t('ticket.active') : t('ticket.inactive')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats Footer */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-card dark:bg-[#1a1525]/80 backdrop-blur-sm border border-border dark:border-[#bc13fe]/30 rounded-lg p-2.5 sm:p-4 hover:border-primary/30 dark:hover:border-[#00f7ff]/50 transition-all">
            <p className="text-xs text-muted-foreground mb-1">{t('ticket.categoriesPage.totalCategories')}</p>
            <p className="text-lg sm:text-2xl font-bold text-foreground">{stats.total}</p>
          </div>
          <div className="bg-card dark:bg-[#1a1525]/80 backdrop-blur-sm border border-border dark:border-[#bc13fe]/30 rounded-lg p-2.5 sm:p-4 hover:border-red-400/50 transition-all">
            <p className="text-xs text-muted-foreground mb-1">{t('ticket.categoriesPage.networkConnection')}</p>
            <p className="text-lg sm:text-2xl font-bold text-red-500 dark:text-red-400 dark:drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]">{stats.network}</p>
          </div>
          <div className="bg-card dark:bg-[#1a1525]/80 backdrop-blur-sm border border-border dark:border-[#bc13fe]/30 rounded-lg p-2.5 sm:p-4 hover:border-green-500/50 transition-all">
            <p className="text-xs text-muted-foreground mb-1">{t('ticket.categoriesPage.installationTechnical')}</p>
            <p className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400 dark:drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]">{stats.technical}</p>
          </div>
          <div className="bg-card dark:bg-[#1a1525]/80 backdrop-blur-sm border border-border dark:border-[#bc13fe]/30 rounded-lg p-2.5 sm:p-4 hover:border-cyan-500/50 transition-all">
            <p className="text-xs text-muted-foreground mb-1">{t('ticket.categoriesPage.billingSupport')}</p>
            <p className="text-lg sm:text-2xl font-bold text-brand-500 dark:text-cyan-400 dark:drop-shadow-[0_0_10px_rgba(0,247,255,0.5)]">{stats.billing}</p>
          </div>
        </div>

        {/* Modal */}
        <SimpleModal isOpen={showModal} onClose={handleCloseModal} size="md">
          <ModalHeader>
            <ModalTitle>{editingCategory ? t('ticket.editCategory') : t('ticket.addCategory')}</ModalTitle>
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody className="space-y-4">
              <div>
                <ModalLabel required>{t('ticket.categoryName')}</ModalLabel>
                <ModalInput type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div>
                <ModalLabel>{t('ticket.description')}</ModalLabel>
                <ModalTextarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />
              </div>
              <div>
                <ModalLabel>{t('ticket.color')}</ModalLabel>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {colorOptions.map((color) => (
                    <button key={color.value} type="button" onClick={() => setFormData({ ...formData, color: color.value })} className={`w-full h-10 rounded-lg border-2 transition-all ${formData.color === color.value ? 'border-white shadow-[0_0_15px_rgba(255,255,255,0.5)] scale-110' : 'border-[#bc13fe]/30 hover:border-[#00f7ff]/50'}`} style={{ backgroundColor: color.value }}>
                      {formData.color === color.value && <Check className="mx-auto text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]" size={20} />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="rounded border-[#bc13fe]/50 bg-background dark:bg-[#0a0520] accent-brand-500 dark:accent-[#00f7ff] w-4 h-4" />
                  <span>{t('ticket.active')}</span>
                </label>
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalButton type="button" variant="secondary" onClick={handleCloseModal}>{t('ticket.cancel')}</ModalButton>
              <ModalButton type="submit" variant="primary">{t('ticket.save')}</ModalButton>
            </ModalFooter>
          </form>
        </SimpleModal>
      </div>
    </div>
  );
}
