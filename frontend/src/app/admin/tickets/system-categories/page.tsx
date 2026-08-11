'use client';

import { useTranslation } from '@/hooks/useTranslation';
import { Tag, Info, Clock, AlertCircle, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';
import { TICKET_CATEGORIES, getGroupStats } from '@/lib/ticketCategories';

export default function SystemTicketCategoriesPage() {
  const { t } = useTranslation();
  const stats = getGroupStats();

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'MEDIUM':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'LOW':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return t('ticket.categoriesPage.urgent');
      case 'HIGH':
        return t('ticket.categoriesPage.high');
      case 'MEDIUM':
        return t('ticket.categoriesPage.medium');
      case 'LOW':
        return t('ticket.categoriesPage.low');
      default:
        return priority;
    }
  };

  return (
    <div className="bg-background relative">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-500/10 dark:bg-cyan-500/20">
            <Tag className="w-6 h-6 text-brand-500 dark:text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground dark:text-cyan-400">
              {t('ticket.categoriesPage.title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('ticket.categoriesPage.subtitle')}
            </p>
          </div>
        </div>

        {/* System Info Alert */}
        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-brand-500 dark:text-cyan-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-brand-600 dark:text-cyan-400">
                {t('ticket.categoriesPage.systemInfo')}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {t('ticket.categoriesPage.systemDescription').replace('{count}', String(TICKET_CATEGORIES.length))}
              </p>
            </div>
          </div>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TICKET_CATEGORIES.map((category) => (
            <div
              key={category.id}
              className="bg-card dark:bg-[#1a1525] border border-border dark:border-gray-800 rounded-lg p-4 hover:border-primary/30 dark:hover:border-cyan-500/30 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <h3 className="font-medium text-foreground text-sm">
                    {t(`ticket.categoriesPage.items.${category.nameKey}.name`) || category.name}
                  </h3>
                </div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded border ${getPriorityColor(category.priority)}`}>
                  {getPriorityLabel(category.priority)}
                </span>
              </div>
              
              <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                {t(`ticket.categoriesPage.items.${category.nameKey}.description`) || category.description}
              </p>
              
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{t('ticket.categoriesPage.slaTarget')}</span>
                <span className="text-brand-600 dark:text-cyan-400 font-medium">
                  {category.slaHours} {t('ticket.categoriesPage.hours')}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Stats Footer */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border dark:border-gray-800">
          <div className="bg-muted dark:bg-[#1a1525] rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">{t('ticket.categoriesPage.totalCategories')}</p>
            <p className="text-lg sm:text-2xl font-bold text-foreground">{stats.total}</p>
          </div>
          <div className="bg-muted dark:bg-[#1a1525] rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">{t('ticket.categoriesPage.networkConnection')}</p>
            <p className="text-lg sm:text-2xl font-bold text-red-500 dark:text-red-400">{stats.network}</p>
          </div>
          <div className="bg-muted dark:bg-[#1a1525] rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">{t('ticket.categoriesPage.installationTechnical')}</p>
            <p className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400">{stats.technical}</p>
          </div>
          <div className="bg-muted dark:bg-[#1a1525] rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">{t('ticket.categoriesPage.billingSupport')}</p>
            <p className="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.billing}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
