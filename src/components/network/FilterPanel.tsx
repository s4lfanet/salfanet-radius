'use client';

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Search, Filter, X } from 'lucide-react';

interface FilterPanelProps {
  filters: {
    types: string[];
    status: string[];
    search: string;
  };
  onFilterChange: (filters: any) => void;
  statistics: {
    olt: number;
    otb: number;
    jc: number;
    odc: number;
    odp: number;
    customers: number;
    active: number;
    issues: number;
  };
}

export default function FilterPanel({ filters, onFilterChange, statistics }: FilterPanelProps) {
  const { t } = useTranslation();

  const entityTypes = [
    { value: 'OLT', label: 'OLT', color: 'bg-purple-500', icon: '⬟' },
    { value: 'OTB', label: 'OTB (Distribution)', color: 'bg-blue-600', icon: '◇' },
    { value: 'JOINT_CLOSURE', label: 'Joint Closure', color: 'bg-purple-400', icon: '◆' },
    { value: 'ODC', label: 'ODC', color: 'bg-cyan-500', icon: '■' },
    { value: 'ODP', label: 'ODP', color: 'bg-green-500', icon: '▲' },
    { value: 'CUSTOMER', label: 'Customers', color: 'bg-blue-500', icon: '👤' },
  ];

  const statusOptions = [
    { value: 'active', label: 'Active', color: 'bg-green-500' },
    { value: 'inactive', label: 'Inactive', color: 'bg-gray-500' },
    { value: 'maintenance', label: 'Maintenance', color: 'bg-yellow-500' },
    { value: 'damaged', label: 'Damaged', color: 'bg-red-500' },
    { value: 'isolated', label: 'Isolated', color: 'bg-orange-500' },
    { value: 'offline', label: 'Offline', color: 'bg-gray-600' },
  ];

  const toggleType = (type: string) => {
    const newTypes = filters.types.includes(type)
      ? filters.types.filter(t => t !== type)
      : [...filters.types, type];
    onFilterChange({ ...filters, types: newTypes });
  };

  const toggleStatus = (status: string) => {
    const newStatus = filters.status.includes(status)
      ? filters.status.filter(s => s !== status)
      : [...filters.status, status];
    onFilterChange({ ...filters, status: newStatus });
  };

  const handleSearchChange = (search: string) => {
    onFilterChange({ ...filters, search });
  };

  const clearFilters = () => {
    onFilterChange({
      types: ['OLT', 'OTB', 'JOINT_CLOSURE', 'ODC', 'ODP', 'CUSTOMER'],
      status: ['active', 'inactive', 'maintenance', 'damaged', 'isolated', 'offline'],
      search: '',
    });
  };

  const hasActiveFilters = 
    filters.types.length < 6 || 
    filters.status.length < 6 || 
    filters.search.length > 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 space-y-4">
      {/* Statistics Panel */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
        <h3 className="text-gray-900 dark:text-white font-bold mb-3 flex items-center">
          <Filter className="w-5 h-5 mr-2" />
          {t('network.unifiedMap.statisticsTitle')}
        </h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center space-x-2">
            <span className="text-purple-500">⬟</span>
            <span className="text-gray-500 dark:text-gray-300">OLT:</span>
            <span className="text-gray-900 dark:text-white font-bold">{statistics.olt}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-blue-500">◇</span>
            <span className="text-gray-500 dark:text-gray-300">OTB:</span>
            <span className="text-gray-900 dark:text-white font-bold">{statistics.otb}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-purple-400">◆</span>
            <span className="text-gray-500 dark:text-gray-300">JC:</span>
            <span className="text-gray-900 dark:text-white font-bold">{statistics.jc}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-cyan-500">■</span>
            <span className="text-gray-500 dark:text-gray-300">ODC:</span>
            <span className="text-gray-900 dark:text-white font-bold">{statistics.odc}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-green-500">▲</span>
            <span className="text-gray-500 dark:text-gray-300">ODP:</span>
            <span className="text-gray-900 dark:text-white font-bold">{statistics.odp}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-blue-500">👤</span>
            <span className="text-gray-500 dark:text-gray-300">Customers:</span>
            <span className="text-gray-900 dark:text-white font-bold">{statistics.customers}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-green-500">✓</span>
            <span className="text-gray-500 dark:text-gray-300">Active:</span>
            <span className="text-gray-900 dark:text-white font-bold">{statistics.active}</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder={t('network.unifiedMap.searchPlaceholder')}
          value={filters.search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Entity Types Filter */}
      <div>
        <h4 className="text-gray-900 dark:text-white font-semibold mb-2 text-sm">
          {t('network.unifiedMap.filterByType')}
        </h4>
        <div className="space-y-1">
          {entityTypes.map(type => (
            <label
              key={type.value}
              className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded"
            >
              <input
                type="checkbox"
                checked={filters.types.includes(type.value)}
                onChange={() => toggleType(type.value)}
                className="form-checkbox h-4 w-4 text-blue-500 rounded"
              />
              <span className={`w-6 h-6 rounded flex items-center justify-center ${type.color}`}>
                {type.icon}
              </span>
              <span className="text-gray-700 dark:text-gray-200 text-sm">{type.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Status Filter */}
      <div>
        <h4 className="text-gray-900 dark:text-white font-semibold mb-2 text-sm">
          {t('network.unifiedMap.filterByStatus')}
        </h4>
        <div className="space-y-1">
          {statusOptions.map(status => (
            <label
              key={status.value}
              className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded"
            >
              <input
                type="checkbox"
                checked={filters.status.includes(status.value)}
                onChange={() => toggleStatus(status.value)}
                className="form-checkbox h-4 w-4 text-blue-500 rounded"
              />
              <span className={`w-3 h-3 rounded-full ${status.color}`}></span>
              <span className="text-gray-700 dark:text-gray-200 text-sm">{status.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="w-full flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
          <span>{t('network.unifiedMap.clearFilters')}</span>
        </button>
      )}
    </div>
  );
}
