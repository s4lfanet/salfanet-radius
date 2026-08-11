'use client';

import { useState, useEffect } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import { Plus, Pencil, Trash2, Tag, RefreshCcw } from 'lucide-react';
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

interface Category {
  id: string;
  name: string;
  description?: string;
  _count?: {
    items: number;
  };
}

export default function CategoriesPage() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  useEffect(() => {
    loadCategories();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory/categories');
      if (res.ok) {
        setCategories(await res.json());
      }
    } catch (error) {
      await showError(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', description: '' });
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      await showError(t('inventory.categoryNameRequired'));
      return;
    }

    try {
      const method = editingCategory ? 'PUT' : 'POST';
      const payload = editingCategory
        ? { ...formData, id: editingCategory.id }
        : formData;

      const res = await fetch('/api/inventory/categories', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (res.ok) {
        await showSuccess(
          editingCategory
            ? t('inventory.categoryUpdated')
            : t('inventory.categoryCreated')
        );
        setIsDialogOpen(false);
        setEditingCategory(null);
        resetForm();
        loadCategories();
      } else {
        await showError(result.error || t('common.error'));
      }
    } catch (error) {
      await showError(t('common.error'));
    }
  };

  const handleDelete = async (category: Category) => {
    const confirmed = await showConfirm(
      t('inventory.deleteCategory'),
      t('inventory.deleteCategoryConfirm', { name: category.name })
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/inventory/categories?id=${category.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await showSuccess(t('inventory.categoryDeleted'));
        loadCategories();
      } else {
        const result = await res.json();
        await showError(result.error || t('common.error'));
      }
    } catch (error) {
      await showError(t('common.error'));
    }
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
              <Tag className="h-6 w-6 text-[#00f7ff]" />
              {t('inventory.categories')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {t('inventory.categoriesDesc')}
            </p>
          </div>

          {/* Actions Bar */}
          <div className="bg-card rounded-lg shadow mb-6 p-4">
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                {t('inventory.total')}: {categories.length} {t('inventory.categories').toLowerCase()}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={loadCategories}
                  className="px-3 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors text-sm font-medium"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setEditingCategory(null);
                    resetForm();
                    setIsDialogOpen(true);
                  }}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {t('inventory.addCategory')}
                </button>
              </div>
            </div>
          </div>

          {/* Categories Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((category) => (
              <div
                key={category.id}
                className="bg-card rounded-lg shadow hover:shadow-md transition-shadow p-4"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-foreground">
                      {category.name}
                    </h3>
                    {category.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {category.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(category)}
                      className="p-1 text-primary hover:text-blue-800 dark:text-primary dark:hover:text-blue-300"
                      title="Edit Kategori"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(category)}
                      className="p-1 text-destructive hover:text-red-800 dark:text-destructive dark:hover:text-red-300"
                      title="Hapus Kategori"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Tag className="h-4 w-4" />
                  <span>{category._count?.items || 0} {t('inventory.items').toLowerCase()}</span>
                </div>
              </div>
            ))}
          </div>

          {categories.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {t('inventory.noCategories')}
            </div>
          )}

          {/* Add/Edit Modal */}
          <SimpleModal isOpen={isDialogOpen} onClose={() => { setIsDialogOpen(false); setEditingCategory(null); resetForm(); }} size="md">
            <ModalHeader>
              <ModalTitle>{editingCategory ? t('inventory.editCategory') : t('inventory.addCategory')}</ModalTitle>
            </ModalHeader>
            <form onSubmit={handleSubmit}>
              <ModalBody className="space-y-4">
                <div>
                  <ModalLabel required>{t('common.name')}</ModalLabel>
                  <ModalInput type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div>
                  <ModalLabel>{t('inventory.descriptionLabel')}</ModalLabel>
                  <ModalTextarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />
                </div>
              </ModalBody>
              <ModalFooter>
                <ModalButton type="button" variant="secondary" onClick={() => { setIsDialogOpen(false); setEditingCategory(null); resetForm(); }}>{t('common.cancel')}</ModalButton>
                <ModalButton type="submit" variant="primary">{editingCategory ? t('common.update') : t('common.create')}</ModalButton>
              </ModalFooter>
            </form>
          </SimpleModal>
        </div>
      </div>
    </div>
  );
}
