'use client';

import { useState, useEffect } from 'react';
import { Edit, Plus, Trash2, Save, X, GripVertical, Eye, EyeOff, RotateCcw, Settings2, Loader2, AlertTriangle } from 'lucide-react';
import { SimpleModal, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter, ModalButton, ModalInput, ModalLabel, ModalSelect, ModalTextarea } from '@/components/cyberpunk/SimpleModal';
import { useTranslation } from '@/hooks/useTranslation';
import { showSuccess, showError, showConfirm, showWarning } from '@/lib/sweetalert';

interface ParameterConfig {
  id: number;
  configType: 'DEVICE_LIST' | 'DEVICE_DETAIL';
  section: string;
  parameterName: string;
  label: string;
  parameterPaths: string[];
  enabled: boolean;
  displayOrder: number;
  columnWidth?: string;
  format?: string;
  colorCoding?: any;
  icon?: string;
}

interface VirtualParameter {
  id: string;
  name: string;
  parameter: string;
  isActive: boolean;
}

export default function ParameterConfigPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'DEVICE_LIST' | 'DEVICE_DETAIL'>('DEVICE_LIST');
  const [configs, setConfigs] = useState<ParameterConfig[]>([]);
  const [virtualParameters, setVirtualParameters] = useState<VirtualParameter[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingConfig, setEditingConfig] = useState<ParameterConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draggedItem, setDraggedItem] = useState<ParameterConfig | null>(null);
  const [saving, setSaving] = useState(false);

  // Component mounted
  useEffect(() => {
    console.log('ParameterConfigPage mounted');
    fetchVirtualParameters();
  }, []);

  // Fetch Virtual Parameters
  const fetchVirtualParameters = async () => {
    try {
      const response = await fetch('/api/settings/genieacs/virtual-parameters');
      const data = await response.json();
      if (data.success) {
        setVirtualParameters(data.data.filter((vp: VirtualParameter) => vp.isActive));
      }
    } catch (error) {
      console.error('Error fetching virtual parameters:', error);
    }
  };

  // Fetch configurations
  const fetchConfigs = async () => {
    setLoading(true);
    try {
      console.log('Fetching configs for tab:', activeTab);
      const response = await fetch(`/api/settings/genieacs/parameter-display?configType=${activeTab}`);
      const data = await response.json();
      console.log('Fetched configs:', data);
      if (data.success) {
        setConfigs(data.configs);
      } else {
        console.error('Failed to fetch configs:', data.error);
        await showError(t('genieacs.failedLoadConfig') + ': ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error fetching configs:', error);
      await showError(t('genieacs.failedLoadConfig') + ': ' + error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('Tab changed to:', activeTab);
    fetchConfigs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Toggle enabled/disabled
  const toggleEnabled = async (config: ParameterConfig) => {
    try {
      console.log('Toggling config:', config.id);
      const response = await fetch(`/api/settings/genieacs/parameter-display/${config.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !config.enabled })
      });

      const data = await response.json();
      console.log('Toggle response:', data);

      if (response.ok && data.success) {
        setConfigs(configs.map(c => 
          c.id === config.id ? { ...c, enabled: !c.enabled } : c
        ));
      } else {
        await showError(t('genieacs.failedToggle') + ': ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error toggling config:', error);
      await showError(t('genieacs.failedToggle') + ': ' + error);
    }
  };

  // Save reordering
  const saveOrder = async () => {
    try {
      console.log('Saving order for', configs.length, 'configs');
      const updates = configs.map((config, index) => ({
        id: config.id,
        displayOrder: index + 1
      }));

      const response = await fetch('/api/settings/genieacs/parameter-display', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: updates })
      });

      const data = await response.json();
      console.log('Save order response:', data);

      if (response.ok && data.success) {
        await showSuccess(t('genieacs.orderSaved'));
        fetchConfigs(); // Refresh to get updated data
      } else {
        await showError(t('genieacs.failedSaveOrder') + ': ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving order:', error);
      await showError(t('genieacs.failedSaveOrder') + ': ' + error);
    }
  };

  // Delete configuration
  const deleteConfig = async (id: number) => {
    const confirmed = await showConfirm(t('genieacs.confirmDeleteParam'));
    if (!confirmed) return;

    try {
      console.log('Deleting config:', id);
      const response = await fetch(`/api/settings/genieacs/parameter-display/${id}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      console.log('Delete response:', data);

      if (response.ok && data.success) {
        setConfigs(configs.filter(c => c.id !== id));
        await showSuccess(t('genieacs.configDeleted'));
      } else {
        await showError(t('genieacs.failedDeleteConfig') + ': ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting config:', error);
      await showError(t('genieacs.failedDeleteConfig') + ': ' + error);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, config: ParameterConfig) => {
    setDraggedItem(config);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetConfig: ParameterConfig) => {
    e.preventDefault();
    
    if (!draggedItem || draggedItem.id === targetConfig.id) return;

    const newConfigs = [...configs];
    const draggedIndex = newConfigs.findIndex(c => c.id === draggedItem.id);
    const targetIndex = newConfigs.findIndex(c => c.id === targetConfig.id);

    newConfigs.splice(draggedIndex, 1);
    newConfigs.splice(targetIndex, 0, draggedItem);

    setConfigs(newConfigs);
    setDraggedItem(null);
  };

  // Open edit modal
  const openEditModal = (config: ParameterConfig) => {
    console.log('[ParameterConfig] Opening edit modal for:', config);
    setEditingConfig({ ...config });
    setIsModalOpen(true);
    console.log('[ParameterConfig] Modal state set to open');
  };

  // Save edited or new configuration
  const saveConfig = async () => {
    if (!editingConfig || saving) return;

    // Validation
    if (!editingConfig.label.trim()) {
      await showWarning(t('genieacs.labelRequired'));
      return;
    }
    if (!editingConfig.parameterName.trim()) {
      await showWarning(t('genieacs.paramNameRequired'));
      return;
    }
    if (!editingConfig.parameterPaths || editingConfig.parameterPaths.length === 0) {
      await showWarning(t('genieacs.pathRequired'));
      return;
    }

    setSaving(true);
    try {
      console.log('Saving config:', editingConfig);
      
      const isNewConfig = editingConfig.id === 0;
      const endpoint = isNewConfig 
        ? '/api/settings/genieacs/parameter-display'
        : `/api/settings/genieacs/parameter-display/${editingConfig.id}`;
      
      const response = await fetch(endpoint, {
        method: isNewConfig ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingConfig)
      });

      const data = await response.json();
      console.log('Save config response:', data);

      if (response.ok && data.success) {
        // Close modal first
        setIsModalOpen(false);
        setEditingConfig(null);
        
        // Refresh data from server to get latest state
        await fetchConfigs();
        
        await showSuccess(isNewConfig ? t('genieacs.paramCreated') : t('genieacs.configSaved'));
      } else {
        await showError(t('genieacs.failedSaveConfig') + ': ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving config:', error);
      await showError(t('genieacs.failedSaveConfig') + ': ' + error);
    } finally {
      setSaving(false);
    }
  };

  // Reset to defaults
  const resetToDefaults = async () => {
    const confirmed = await showConfirm(t('genieacs.resetConfirm'));
    if (!confirmed) return;

    setSaving(true);
    try {
      // Call reset endpoint which will re-seed the data
      const response = await fetch('/api/settings/genieacs/parameter-display/reset', {
        method: 'POST'
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        await showSuccess(t('genieacs.resetSuccess'));
        fetchConfigs();
      } else {
        await showError(t('genieacs.failedReset') + ': ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error resetting configs:', error);
      await showError(t('genieacs.failedReset') + ': ' + error);
    } finally {
      setSaving(false);
    }
  };

  // Group configs by section
  const groupedConfigs = configs.reduce((acc, config) => {
    if (!acc[config.section]) acc[config.section] = [];
    acc[config.section].push(config);
    return acc;
  }, {} as Record<string, ParameterConfig[]>);

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
      <div className="relative z-10 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
              <Settings2 className="w-6 h-6 text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)]" />
              {t('genieacs.paramConfigTitle')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {t('genieacs.paramConfigSubtitle')}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                console.log('Save Order button clicked');
                saveOrder();
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 shadow"
            >
              <Save className="w-4 h-4" />
              {t('genieacs.saveOrder')}
            </button>
            <button
              onClick={() => {
                console.log('Reset Defaults button clicked');
                resetToDefaults();
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-600 dark:bg-input text-white text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-600 shadow"
            >
              <RotateCcw className="w-4 h-4" />
              {t('genieacs.resetDefaults')}
            </button>
          </div>
        </div>

        {/* Info Banner about RX Power Fix */}
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-primary dark:text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">{t('genieacs.caseSensitiveWarning')}</h3>
              <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">
                {t('genieacs.caseSensitiveDesc')}
              </p>
              <p className="text-[11px] text-blue-700 dark:text-blue-300">
                Example: <code className="bg-primary/20 dark:bg-blue-900/40 px-2 py-0.5 rounded">VirtualParameters.RXPower</code> {`\u2260`} <code className="bg-primary/20 dark:bg-blue-900/40 px-2 py-0.5 rounded">VirtualParameters.rxPower</code>
              </p>
              <div className="mt-2">
                <a 
                  href="/admin/genieacs/virtual-parameters" 
                  className="text-xs text-primary dark:text-primary hover:text-blue-900 dark:hover:text-blue-100 font-medium cursor-pointer"
                  target="_blank"
                >
                  {`\u2192`} {t('genieacs.manageVirtualParams')}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-border">
          <button
            onClick={() => setActiveTab('DEVICE_LIST')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'DEVICE_LIST'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground dark:text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {t('genieacs.deviceListParams')}
          </button>
          <button
            onClick={() => setActiveTab('DEVICE_DETAIL')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'DEVICE_DETAIL'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground dark:text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {t('genieacs.deviceDetailParams')}
          </button>
        </div>

        {/* Configuration List - Card Layout */}
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)]" />
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-border">
            <div className="p-4 space-y-6">
              {Object.entries(groupedConfigs).map(([section, sectionConfigs]) => (
                <div key={section} className="space-y-3">
                  {/* Section Header with Add Button */}
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground dark:text-gray-100 capitalize flex items-center gap-2">
                      {section.replace(/_/g, ' ')}
                      <span className="text-xs font-normal text-muted-foreground dark:text-muted-foreground">
                        ({sectionConfigs.length} {t('genieacs.parameters')})
                      </span>
                    </h2>
                    <button
                  onClick={() => {
                    // Create new config for this section
                    const newConfig: ParameterConfig = {
                      id: 0, // Will be generated by API
                      configType: activeTab,
                      section: section,
                      parameterName: '',
                      label: '',
                      parameterPaths: [],
                      enabled: true,
                      displayOrder: sectionConfigs.length > 0 ? Math.max(...sectionConfigs.map(c => c.displayOrder)) + 1 : 1,
                      columnWidth: activeTab === 'DEVICE_LIST' ? 'auto' : undefined,
                      format: 'text',
                      colorCoding: null,
                      icon: ''
                    };
                    setEditingConfig(newConfig);
                    setIsModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90"
                >
                  <Plus className="w-3 h-3" />
                  {t('genieacs.addParameter')}
                </button>
              </div>

              {/* Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sectionConfigs.map((config) => (
                  <div
                    key={config.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, config)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, config)}
                    className={`bg-muted rounded-lg border ${
                      config.enabled ? 'border-green-300 dark:border-green-700' : 'border-border'
                    } hover:shadow-lg transition-all duration-200 ${
                      draggedItem?.id === config.id ? 'opacity-50' : ''
                    }`}
                  >
                    {/* Card Header */}
                    <div className={`px-3 py-2 border-b ${
                      config.enabled ? 'bg-success/10 border-success/30' : 'bg-muted border-border'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <GripVertical className="w-4 h-4 text-muted-foreground cursor-move" />
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              toggleEnabled(config);
                            }}
                            className={`p-1 rounded transition-colors ${
                              config.enabled
                                ? 'bg-success/20 dark:bg-green-900/40 text-success dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60'
                                : 'bg-muted text-muted-foreground dark:text-muted-foreground hover:bg-muted/80'
                            }`}
                          >
                            {config.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              openEditModal(config);
                            }}
                            className="p-1 text-primary dark:text-primary hover:bg-primary/10 rounded transition-colors"
                            title={t('common.edit')}
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              deleteConfig(config.id);
                            }}
                            className="p-1 text-destructive dark:text-destructive hover:bg-destructive/10 rounded transition-colors"
                            title={t('common.delete')}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-3 space-y-2">
                      <div>
                        <h3 className="font-semibold text-foreground text-sm mb-1">{config.label}</h3>
                        <p className="text-xs text-muted-foreground dark:text-muted-foreground font-mono bg-muted dark:bg-input px-2 py-1 rounded">
                          {config.parameterName}
                        </p>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between text-foreground">
                          <span className="font-medium">{t('genieacs.paths')}:</span>
                          <span className="bg-primary/20 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                            {config.parameterPaths.length}
                          </span>
                        </div>
                        
                        {config.parameterPaths.length > 0 && (
                          <div className="bg-primary/10 border border-primary/30 rounded p-2 max-h-16 overflow-y-auto">
                            {config.parameterPaths.map((path, idx) => (
                              <div key={idx} className="text-[10px] font-mono text-blue-800 dark:text-blue-200 truncate" title={path}>
                                {`\u2022`} {path}
                              </div>
                            ))}
                          </div>
                        )}

                        {config.format && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground dark:text-muted-foreground">{t('genieacs.format')}:</span>
                            <span className="bg-accent/20 dark:bg-purple-900/40 text-accent dark:text-purple-300 px-2 py-0.5 rounded text-[10px] font-semibold">
                              {config.format}
                            </span>
                          </div>
                        )}

                        {config.icon && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground dark:text-muted-foreground">Icon:</span>
                            <span className="bg-primary/10 dark:bg-primary/20 text-primary px-2 py-0.5 rounded text-[10px] font-semibold">
                              {config.icon}
                            </span>
                          </div>
                        )}

                        {activeTab === 'DEVICE_LIST' && config.columnWidth && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground dark:text-muted-foreground">{t('genieacs.width')}:</span>
                            <span className="bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded text-[10px] font-semibold">
                              {config.columnWidth}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="px-3 py-2 bg-muted border-t border-border flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground dark:text-muted-foreground">{t('genieacs.displayOrder')}</span>
                      <span className="bg-muted text-foreground px-2 py-0.5 rounded-full text-[10px] font-semibold">
                        #{config.displayOrder}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
            </div>
          </div>
        )}

        {/* Edit Modal */}
      {/* Debug log removed: console.log('[ParameterConfig] Modal render check - isModalOpen:', isModalOpen, 'editingConfig:', editingConfig) */}
      {editingConfig && (
        <SimpleModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} size="2xl">
          <ModalHeader>
            <ModalTitle className="flex items-center gap-2">
              {editingConfig.id === 0 ? <Plus className="w-4 h-4 text-[#00f7ff]" /> : <Settings2 className="w-4 h-4 text-[#00f7ff]" />}
              {editingConfig.id === 0 ? t('genieacs.createNewParam') : t('genieacs.editParamConfig')}
            </ModalTitle>
            <ModalDescription>{editingConfig.id === 0 ? 'Tambah parameter monitoring baru' : 'Edit konfigurasi parameter'}</ModalDescription>
          </ModalHeader>

            <ModalBody className="space-y-4">
              {/* Section (for new configs) */}
              {editingConfig.id === 0 && (
                <div>
                  <ModalLabel required>{t('genieacs.section')}</ModalLabel>
                  <ModalInput
                    type="text"
                    value={editingConfig.section}
                    onChange={(e) => setEditingConfig({ ...editingConfig, section: e.target.value })}
                    placeholder="e.g., device_info, connection_status"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Group name for organizing parameters (lowercase with underscores)</p>
                </div>
              )}

              {/* Parameter Name (for new configs) */}
              {editingConfig.id === 0 && (
                <div>
                  <ModalLabel required>{t('genieacs.parameterName')}</ModalLabel>
                  <ModalInput
                    type="text"
                    value={editingConfig.parameterName}
                    onChange={(e) => setEditingConfig({ ...editingConfig, parameterName: e.target.value })}
                    placeholder="e.g., rxPower, pppoeUsername"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Internal parameter name (camelCase)</p>
                </div>
              )}

              {/* Label */}
              <div>
                <ModalLabel required>{t('genieacs.displayLabel')}</ModalLabel>
                <ModalInput
                  type="text"
                  value={editingConfig.label}
                  onChange={(e) => setEditingConfig({ ...editingConfig, label: e.target.value })}
                  placeholder="e.g., RX Power, PPPoE Username"
                />
              </div>

              {/* Parameter Paths - Multiple Input */}
              <div className="bg-[#00f7ff]/10 border border-[#00f7ff]/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-[#00f7ff] flex items-center gap-2">
                    {t('genieacs.parameterPaths')}
                    <span className="text-xs font-semibold text-[#ff4466] bg-[#ff4466]/20 px-2 py-0.5 rounded"><AlertTriangle className="w-3 h-3 inline mr-0.5" />Case-sensitive!</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const currentPaths = editingConfig.parameterPaths || [];
                      setEditingConfig({
                        ...editingConfig,
                        parameterPaths: [...currentPaths, '']
                      });
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#00f7ff] bg-[#00f7ff]/20 hover:bg-[#00f7ff]/30 rounded transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    {t('genieacs.addPath')}
                  </button>
                </div>

                <div className="space-y-2">
                  {(editingConfig.parameterPaths || ['']).map((path, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={path}
                        placeholder="VirtualParameters.RXPower"
                        onChange={(e) => {
                          const newPaths = [...(editingConfig.parameterPaths || [])];
                          newPaths[index] = e.target.value;
                          setEditingConfig({
                            ...editingConfig,
                            parameterPaths: newPaths.filter(p => p !== '' || newPaths.length === 1)
                          });
                        }}
                        className="flex-1 px-3 py-2 border-2 border-[#bc13fe]/30 rounded-lg focus:ring-1 focus:ring-[#00f7ff]/50 focus:border-[#00f7ff] bg-background dark:bg-[#0a0520] text-foreground font-mono text-sm outline-none transition-all"
                      />
                      {(editingConfig.parameterPaths || []).length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newPaths = (editingConfig.parameterPaths || []).filter((_, i) => i !== index);
                            setEditingConfig({
                              ...editingConfig,
                              parameterPaths: newPaths.length > 0 ? newPaths : ['']
                            });
                          }}
                          className="px-2 py-2 text-[#ff4466] hover:bg-[#ff4466]/10 rounded transition-colors"
                          title="Remove path"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <p className="text-xs text-[#00f7ff]/80 mt-3">
                  Type exact parameter path (e.g., <code className="bg-[#00f7ff]/20 px-1.5 py-0.5 rounded text-[#00f7ff]">VirtualParameters.RXPower</code>)
                </p>
              </div>

              {/* Virtual Parameter Selector */}
              {virtualParameters.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold mb-2 text-foreground flex items-center gap-2">
                    {t('genieacs.quickAddVirtual')}
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        const currentPaths = editingConfig.parameterPaths || [''];
                        // Check if path already exists
                        if (!currentPaths.includes(e.target.value)) {
                          // Replace first empty path or add new
                          const hasEmpty = currentPaths.some(p => p === '');
                          if (hasEmpty) {
                            const newPaths = currentPaths.map(p => p === '' ? e.target.value : p);
                            setEditingConfig({ 
                              ...editingConfig, 
                              parameterPaths: newPaths
                            });
                          } else {
                            setEditingConfig({ 
                              ...editingConfig, 
                              parameterPaths: [...currentPaths, e.target.value]
                            });
                          }
                        }
                        // Reset select
                        e.target.value = '';
                      }
                    }}
                    className="w-full px-3 py-2 border-2 border-[#bc13fe]/30 rounded-lg focus:ring-1 focus:ring-[#00f7ff]/50 focus:border-[#00f7ff] bg-background dark:bg-[#0a0520] text-foreground text-sm outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value="" className="dark:bg-[#0a0520]">{t('genieacs.selectToAdd')}</option>
                    {virtualParameters.map((vp) => (
                      <option key={vp.id} value={vp.parameter}>
                        {vp.name} ({vp.parameter})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-2">
                    <span className="text-[#00ff88]">● {virtualParameters.length}</span> {t('genieacs.activeVirtualParams')} | 
                    <a 
                      href="/admin/genieacs/virtual-parameters" 
                      className="ml-1 text-[#00f7ff] hover:underline"
                      target="_blank"
                    >
                      {t('genieacs.manageVirtualParams')} →
                    </a>
                  </p>
                </div>
              )}

              {/* Format */}
              <div>
                <ModalLabel>{t('genieacs.format')}</ModalLabel>
                <ModalSelect
                  value={editingConfig.format || ''}
                  onChange={(e) => setEditingConfig({ ...editingConfig, format: e.target.value })}
                >
                  <option value="">{t('common.none')}</option>
                  <option value="text">{t('genieacs.formatText')}</option>
                  <option value="dBm">{t('genieacs.formatDbm')}</option>
                  <option value="celsius">{t('genieacs.formatCelsius')}</option>
                  <option value="voltage">{t('genieacs.formatVoltage')}</option>
                  <option value="bytes">{t('genieacs.formatBytes')}</option>
                  <option value="datetime">{t('genieacs.formatDatetime')}</option>
                  <option value="uptime">{t('genieacs.formatUptime')}</option>
                  <option value="status">{t('genieacs.formatStatus')}</option>
                  <option value="boolean" className="dark:bg-[#0a0520]">{t('genieacs.formatBoolean')}</option>
                </ModalSelect>
              </div>

              {/* Column Width (DEVICE_LIST only) */}
              {activeTab === 'DEVICE_LIST' && (
                <div>
                  <ModalLabel>{t('genieacs.columnWidth')}</ModalLabel>
                  <ModalInput
                    type="text"
                    value={editingConfig.columnWidth || ''}
                    onChange={(e) => setEditingConfig({ ...editingConfig, columnWidth: e.target.value })}
                    placeholder="e.g., 200px, 20%, auto"
                  />
                </div>
              )}

              {/* Icon */}
              <div>
                <ModalLabel>{t('genieacs.iconName')}</ModalLabel>
                <ModalInput
                  type="text"
                  value={editingConfig.icon || ''}
                  onChange={(e) => setEditingConfig({ ...editingConfig, icon: e.target.value })}
                  placeholder="e.g., Server, Network, Signal"
                />
              </div>

              {/* Color Coding */}
              <div>
                <ModalLabel>{t('genieacs.colorCoding')}</ModalLabel>
                <ModalTextarea
                  value={JSON.stringify(editingConfig.colorCoding, null, 2)}
                  onChange={(e) => {
                    try {
                      const coding = JSON.parse(e.target.value);
                      setEditingConfig({ ...editingConfig, colorCoding: coding });
                    } catch (err) {
                      // Invalid JSON, ignore
                    }
                  }}
                  rows={4}
                  placeholder='{"green": {"operator": ">", "value": -25}}'
                  className="font-mono resize-y"
                />
              </div>
            </ModalBody>

            <ModalFooter>
              <ModalButton variant="secondary" onClick={() => setIsModalOpen(false)}>
                {t('common.cancel')}
              </ModalButton>
              <ModalButton variant="primary" onClick={() => saveConfig()} disabled={saving} className="flex items-center gap-2">
                <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
                {saving ? t('genieacs.saving') : t('genieacs.saveChanges')}
              </ModalButton>
            </ModalFooter>
        </SimpleModal>
        )}
      </div>
    </div>
  );
}



