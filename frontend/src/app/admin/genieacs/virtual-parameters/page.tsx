"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Pencil, Trash2, ToggleLeft, ToggleRight, Code2, Cpu, X, Lightbulb, Palette } from "lucide-react";
import { SimpleModal, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter, ModalButton, ModalInput, ModalLabel, ModalSelect, ModalTextarea } from '@/components/cyberpunk/SimpleModal';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from "@/hooks/useTranslation";

interface VirtualParameter {
  id: string;
  name: string;
  parameter: string;
  expression: string;
  displayType?: string;
  displayOrder?: number;
  icon?: string | null;
  color?: string | null;
  category?: string | null;
  unit?: string | null;
  showInSummary?: boolean;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function VirtualParametersPage() {
  const { t } = useTranslation();
  const { addToast, confirm } = useToast();
  const [items, setItems] = useState<VirtualParameter[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<VirtualParameter | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'display'>('basic');
  const [form, setForm] = useState({
    name: "",
    parameter: "",
    expression: "",
    displayType: "card",
    displayOrder: 0,
    icon: "",
    color: "purple",
    category: "",
    unit: "",
    showInSummary: true,
    description: "",
    isActive: true,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/genieacs/virtual-parameters", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setItems(data.data || []);
      }
    } catch (error) {
      console.error("Failed to load virtual parameters", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({ 
      name: "", 
      parameter: "", 
      expression: "", 
      displayType: "card",
      displayOrder: 0,
      icon: "",
      color: "purple",
      category: "",
      unit: "",
      showInSummary: true,
      description: "", 
      isActive: true 
    });
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (vp: VirtualParameter) => {
    setEditing(vp);
    setForm({
      name: vp.name,
      parameter: vp.parameter,
      expression: vp.expression,
      displayType: vp.displayType || "card",
      displayOrder: vp.displayOrder || 0,
      icon: vp.icon || "",
      color: vp.color || "purple",
      category: vp.category || "",
      unit: vp.unit || "",
      showInSummary: vp.showInSummary !== false,
      description: vp.description || "",
      isActive: vp.isActive,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        parameter: form.parameter.trim(),
        expression: form.expression.trim(),
        description: form.description.trim() || null,
        isActive: form.isActive,
        displayType: form.displayType && form.displayType.trim() ? form.displayType.trim() : "card",
        displayOrder: typeof form.displayOrder === 'number' ? form.displayOrder : 0,
        icon: form.icon && form.icon.trim() ? form.icon.trim() : null,
        color: form.color && form.color.trim() ? form.color.trim() : null,
        category: form.category && form.category.trim() ? form.category.trim() : null,
        unit: form.unit && form.unit.trim() ? form.unit.trim() : null,
        showInSummary: typeof form.showInSummary === 'boolean' ? form.showInSummary : true,
      };

      const endpoint = editing
        ? `/api/settings/genieacs/virtual-parameters/${editing.id}`
        : "/api/settings/genieacs/virtual-parameters";
      const method = editing ? "PUT" : "POST";

      console.log('Submitting virtual parameter:', payload);

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      console.log('Response:', data);

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.details || t('genieacs.failedSaveParam'));
      }

      setShowForm(false);
      resetForm();
      fetchData();
      addToast({ type: 'success', title: t('common.success'), description: t('genieacs.paramSaved') });
    } catch (error: any) {
      console.error('Error submitting:', error);
      addToast({ type: 'error', title: t('common.error'), description: error?.message || t('genieacs.failedSaveParam') });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (vp: VirtualParameter) => {
    if (!await confirm({
      title: t('genieacs.deleteParamConfirm'),
      message: t('genieacs.deleteParamWarning').replace('{name}', vp.name),
      confirmText: t('genieacs.yesDeleteIt'),
      cancelText: t('common.cancel'),
      variant: 'danger',
    })) return;

    setDeletingId(vp.id);
    try {
      const res = await fetch(`/api/settings/genieacs/virtual-parameters/${vp.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('genieacs.failedDeleteParam'));
      setItems((prev) => prev.filter((item) => item.id !== vp.id));
    } catch (error: any) {
      addToast({ type: 'error', title: t('common.error'), description: error?.message || t('genieacs.failedDeleteParam') });
    } finally {
      setDeletingId(null);
    }
  };

  const toggleStatus = async (vp: VirtualParameter) => {
    try {
      const res = await fetch(`/api/settings/genieacs/virtual-parameters/${vp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: vp.name,
          parameter: vp.parameter,
          expression: vp.expression,
          description: vp.description || null,
          isActive: !vp.isActive,
          displayType: vp.displayType && vp.displayType.trim() ? vp.displayType.trim() : "card",
          displayOrder: typeof vp.displayOrder === 'number' ? vp.displayOrder : 0,
          icon: vp.icon && vp.icon.trim ? vp.icon.trim() : null,
          color: vp.color && vp.color.trim ? vp.color.trim() : null,
          category: vp.category && vp.category.trim ? vp.category.trim() : null,
          unit: vp.unit && vp.unit.trim ? vp.unit.trim() : null,
          showInSummary: typeof vp.showInSummary === 'boolean' ? vp.showInSummary : true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || t('genieacs.failedChangeStatus'));
      setItems((prev) => prev.map((item) => (item.id === vp.id ? { ...item, isActive: !item.isActive } : item)));
    } catch (error: any) {
      addToast({ type: 'error', title: t('common.error'), description: error?.message || t('genieacs.failedChangeStatus') });
    }
  };

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
      <div className="relative z-10 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
              <Cpu className="w-6 h-6 text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)]" />
              {t('genieacs.virtualParamsTitle')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {t('genieacs.virtualParamsSubtitle')}
            </p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 shadow"
          >
            <Plus className="w-4 h-4" />
            {t('genieacs.addVirtualParam')}
          </button>
        </div>

        {/* Help Banner */}
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <Code2 className="w-5 h-5 text-primary dark:text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                {t('genieacs.whatIsVirtualParams')}
              </h3>
              <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">
                {t('genieacs.virtualParamsDesc')}
              </p>
              <details className="text-xs text-blue-700 dark:text-blue-300">
                <summary className="cursor-pointer font-medium hover:text-blue-900 dark:hover:text-blue-100">
                  {t('genieacs.viewExamples')}
                </summary>
                <div className="mt-2 space-y-2 pl-4 border-l-2 border-blue-300 dark:border-blue-700">
                  <div>
                    <p className="font-mono text-[11px] text-blue-900 dark:text-blue-100">VirtualParameters.uptime</p>
                    <p className="text-[11px] text-primary dark:text-primary">{`\u2192`} {t('genieacs.calcUptimeDesc')}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[11px] text-blue-900 dark:text-blue-100">VirtualParameters.redaman</p>
                    <p className="text-[11px] text-primary dark:text-primary">{`\u2192`} {t('genieacs.getSignalDesc')}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[11px] text-blue-900 dark:text-blue-100">VirtualParameters.pppUsername</p>
                    <p className="text-[11px] text-primary dark:text-primary">{`\u2192`} {t('genieacs.getPppoeDesc')}</p>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground dark:text-gray-100">{t('genieacs.parameterList')}</p>
              <p className="text-xs text-muted-foreground">
                {items.length} {t('genieacs.parameters')} {`\u00B7`} {items.filter(i => i.isActive).length} {t('genieacs.activeCount')} {`\u00B7`} {items.filter(i => !i.isActive).length} {t('genieacs.inactiveCount')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a 
                href="https://docs.genieacs.com/" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground dark:text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                title={t('common.docs')}
              >
                <Code2 className="w-3 h-3" />
                {t('common.docs')}
              </a>
              <button onClick={fetchData} className="text-xs text-primary hover:underline">{t('common.refresh')}</button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)]" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center">
              <Code2 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-2">{t('genieacs.noVirtualParams')}</p>
              <p className="text-xs text-muted-foreground mb-4">{t('genieacs.createFirstParam')}</p>
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" />
                {t('genieacs.addFirstParam')}
              </button>
            </div>
          ) : (
            <>
            {/* Mobile Card View */}
            <div className="block md:hidden space-y-3 p-3">
              {items.map((vp) => (
                <div key={vp.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground">{vp.name}</span>
                      <span className={`ml-2 px-2 py-0.5 text-[10px] rounded-full font-medium ${vp.isActive ? "bg-success/20 text-success dark:bg-green-900/30 dark:text-green-300" : "bg-gray-100 text-muted-foreground dark:bg-gray-800 dark:text-gray-300"}`}>
                        {vp.isActive ? t('genieacs.activeCount').charAt(0).toUpperCase() + t('genieacs.activeCount').slice(1) : t('genieacs.inactiveCount').charAt(0).toUpperCase() + t('genieacs.inactiveCount').slice(1)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 mb-2">
                    <p className="text-xs text-muted-foreground break-all font-mono">{vp.parameter}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{vp.expression}</p>
                    {vp.description && <p className="text-[11px] text-muted-foreground">{vp.description}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    <button
                      onClick={() => toggleStatus(vp)}
                      className="inline-flex items-center gap-1 p-2 rounded border border-border text-foreground hover:bg-muted/50 text-xs"
                    >
                      {vp.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      {vp.isActive ? t('genieacs.deactivate') : t('genieacs.activate')}
                    </button>
                    <button
                      onClick={() => openEdit(vp)}
                      className="inline-flex items-center gap-1 p-2 rounded border border-border text-primary hover:bg-primary/10 text-xs"
                    >
                      <Pencil className="w-4 h-4" />
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => handleDelete(vp)}
                      disabled={deletingId === vp.id}
                      className="inline-flex items-center gap-1 p-2 rounded border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50 text-xs"
                    >
                      {deletingId === vp.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop List View */}
            <div className="divide-y divide-gray-200 dark:divide-gray-800 hidden md:block">
              {items.map((vp) => (
                <div key={vp.id} className="px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{vp.name}</span>
                      <span className={`px-2 py-0.5 text-[11px] rounded-full font-medium ${vp.isActive ? "bg-success/20 text-success dark:bg-green-900/30 dark:text-green-300" : "bg-gray-100 text-muted-foreground dark:bg-inputdark:text-gray-300"}`}>
                        {vp.isActive ? t('genieacs.activeCount').charAt(0).toUpperCase() + t('genieacs.activeCount').slice(1) : t('genieacs.inactiveCount').charAt(0).toUpperCase() + t('genieacs.inactiveCount').slice(1)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground break-all font-mono">{vp.parameter}</p>
                    <p className="text-xs text-muted-foreground dark:text-muted-foreground line-clamp-2">{vp.expression}</p>
                    {vp.description && <p className="text-[11px] text-muted-foreground">{vp.description}</p>}
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={() => toggleStatus(vp)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-foreground dark:text-gray-200 hover:bg-muted/50"
                    >
                      {vp.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      {vp.isActive ? t('genieacs.deactivate') : t('genieacs.activate')}
                    </button>
                    <button
                      onClick={() => openEdit(vp)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-primary hover:bg-primary/10 dark:text-blue-300 dark:hover:bg-blue-900/30"
                    >
                      <Pencil className="w-4 h-4" />
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => handleDelete(vp)}
                      disabled={deletingId === vp.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      {deletingId === vp.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>

      <SimpleModal isOpen={showForm} onClose={() => setShowForm(false)} size="lg">
          <ModalHeader>
            <ModalTitle className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-[#00f7ff]" />
              {editing ? t('genieacs.editVirtualParam') : t('genieacs.addVirtualParamTitle')}
            </ModalTitle>
            <ModalDescription>{t('genieacs.fillPathExpression')}</ModalDescription>
          </ModalHeader>

            {/* Tabs */}
            <div className="flex border-b border-[#bc13fe]/30 px-5">
              <button
                type="button"
                onClick={() => setActiveTab('basic')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'basic' ? 'text-[#00f7ff] border-b-2 border-[#00f7ff]' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t('genieacs.basicSettings')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('display')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'display' ? 'text-[#00f7ff] border-b-2 border-[#00f7ff]' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t('genieacs.displaySettings')}
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <ModalBody className="space-y-3">
              {activeTab === 'basic' ? (
                <>
                  <div>
                    <ModalLabel required>{t('genieacs.paramNameLabel')}</ModalLabel>
                    <ModalInput
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder={t('genieacs.paramNamePlaceholder')}
                      required
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">{t('genieacs.paramNameHint')}</p>
                  </div>

              <div>
                <ModalLabel required>{t('genieacs.parameterPath')}</ModalLabel>
                <ModalInput
                  value={form.parameter}
                  onChange={(e) => setForm({ ...form, parameter: e.target.value })}
                  className="font-mono"
                  placeholder="VirtualParameters.signalStrength"
                  required
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t('genieacs.parameterPathHint')}
                </p>
              </div>

              <div>
                <ModalLabel required>{t('genieacs.expression')}</ModalLabel>
                <ModalTextarea
                  value={form.expression}
                  onChange={(e) => setForm({ ...form, expression: e.target.value })}
                  className="text-xs font-mono resize-y"
                  rows={6}
                  placeholder="let uptime = declare(&quot;Device.DeviceInfo.UpTime&quot;, {value: Date.now()}).value[0];&#10;return Math.floor((Date.now() - Date.parse(uptime)) / 1000);"
                  required
                />
                <div className="mt-1 space-y-1">
                  <p className="text-[11px] text-muted-foreground">{t('genieacs.expressionHint')}</p>
                  <details className="text-[11px] text-muted-foreground">
                    <summary className="cursor-pointer text-[#00f7ff] hover:underline">{t('genieacs.viewExpressionExamples')}</summary>
                    <div className="mt-2 p-2 bg-muted/50 dark:bg-[#0a0520]/50 rounded border border-[#bc13fe]/20 space-y-2">
                      <div>
                        <p className="font-semibold text-foreground">1. Uptime (detik):</p>
                        <pre className="text-[10px] overflow-x-auto text-[#00f7ff]/80">{`let uptime = declare("Device.DeviceInfo.UpTime", {value: Date.now()}).value[0];
return Math.floor((Date.now() - Date.parse(uptime)) / 1000);`}</pre>
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">2. Signal Strength:</p>
                        <pre className="text-[10px] overflow-x-auto text-[#00f7ff]/80">{`let rx = declare("Device.X_HW_WebPonInfo.RxPower", {value: 0}).value[0];
return parseFloat(rx) || 0;`}</pre>
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">3. PPPoE Username:</p>
                        <pre className="text-[10px] overflow-x-auto text-[#00f7ff]/80">{`let user = declare("Device.PPP.Interface.1.Username", {value: ""}).value[0];
return user || "N/A";`}</pre>
                      </div>
                    </div>
                  </details>
                </div>
              </div>

              <div>
                <ModalLabel>{t('genieacs.descriptionOptional')}</ModalLabel>
                <ModalTextarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="text-xs resize-y"
                  rows={2}
                  placeholder={t('genieacs.descriptionPlaceholder')}
                />
              </div>

                  <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                      className="rounded border-[#bc13fe]/40 bg-background dark:bg-background dark:bg-[#0a0520] accent-brand-500 dark:accent-[#00f7ff]/50"
                    />
                    {t('genieacs.activateThisParam')}
                  </label>

                  {/* Tips Section */}
                  <div className="bg-[#ff8c00]/10 border border-[#ff8c00]/30 rounded-lg p-3">
                    <p className="text-xs font-semibold text-[#ff8c00] mb-2"><Lightbulb className="w-3.5 h-3.5 inline mr-1" />{t('genieacs.tips')}</p>
                    <ul className="text-[11px] text-[#ff8c00]/80 space-y-1 list-disc list-inside">
                      <li>{t('genieacs.tipDeclare')}</li>
                      <li>{t('genieacs.tipDefault')}</li>
                      <li>{t('genieacs.tipTest')}</li>
                      <li>{t('genieacs.tipDescription')}</li>
                    </ul>
                  </div>
                </>
              ) : (
                <>
                  {/* Display Settings Tab */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <ModalLabel>{t('genieacs.displayType')}</ModalLabel>
                      <ModalSelect
                        value={form.displayType}
                        onChange={(e) => setForm({ ...form, displayType: e.target.value })}
                      >
                        <option value="card" className="dark:bg-[#0a0520]">Card</option>
                        <option value="badge" className="dark:bg-[#0a0520]">Badge</option>
                        <option value="meter" className="dark:bg-[#0a0520]">Meter</option>
                        <option value="list" className="dark:bg-[#0a0520]">List</option>
                      </ModalSelect>
                    </div>

                    <div>
                      <ModalLabel>{t('genieacs.displayOrderLabel')}</ModalLabel>
                      <ModalInput
                        type="number"
                        value={form.displayOrder}
                        onChange={(e) => setForm({ ...form, displayOrder: parseInt(e.target.value) || 0 })}
                        placeholder="0"
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">{t('genieacs.displayOrderHint')}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <ModalLabel>{t('genieacs.color')}</ModalLabel>
                      <ModalSelect
                        value={form.color}
                        onChange={(e) => setForm({ ...form, color: e.target.value })}
                      >
                        <option value="blue" className="dark:bg-[#0a0520]">Blue</option>
                        <option value="green" className="dark:bg-[#0a0520]">Green</option>
                        <option value="purple" className="dark:bg-[#0a0520]">Purple</option>
                        <option value="red" className="dark:bg-[#0a0520]">Red</option>
                        <option value="orange" className="dark:bg-[#0a0520]">Orange</option>
                        <option value="teal" className="dark:bg-[#0a0520]">Teal</option>
                        <option value="pink" className="dark:bg-[#0a0520]">Pink</option>
                        <option value="indigo" className="dark:bg-[#0a0520]">Indigo</option>
                      </ModalSelect>
                    </div>

                    <div>
                      <ModalLabel>{t('genieacs.unitOptional')}</ModalLabel>
                      <ModalInput
                        type="text"
                        value={form.unit}
                        onChange={(e) => setForm({ ...form, unit: e.target.value })}
                        placeholder="dBm, \u00B0C, MB, etc"
                      />
                    </div>
                  </div>

                  <div>
                    <ModalLabel>{t('genieacs.categoryOptional')}</ModalLabel>
                    <ModalInput
                      type="text"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="Network, System, Performance, etc"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">{t('genieacs.categoryHint')}</p>
                  </div>

                  <div>
                    <ModalLabel>{t('genieacs.iconOptional')}</ModalLabel>
                    <ModalInput
                      type="text"
                      value={form.icon}
                      onChange={(e) => setForm({ ...form, icon: e.target.value })}
                      className="font-mono"
                      placeholder="Signal, Wifi, Activity, etc"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">{t('genieacs.iconHint')}</p>
                  </div>

                  <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.showInSummary}
                      onChange={(e) => setForm({ ...form, showInSummary: e.target.checked })}
                      className="rounded border-[#bc13fe]/40 bg-background dark:bg-background dark:bg-[#0a0520] accent-brand-500 dark:accent-[#00f7ff]/50"
                    />
                    {t('genieacs.showInSummary')}
                  </label>

                  <div className="bg-[#00f7ff]/10 border border-[#00f7ff]/30 rounded-lg p-3">
                    <p className="text-xs font-semibold text-[#00f7ff] mb-1"><Palette className="w-3.5 h-3.5 inline mr-1" />{t('genieacs.displayOptions')}</p>
                    <ul className="text-[10px] text-[#00f7ff]/80 space-y-0.5">
                      <li><strong>Card:</strong> {t('genieacs.cardDesc')}</li>
                      <li><strong>Badge:</strong> {t('genieacs.badgeDesc')}</li>
                      <li><strong>Meter:</strong> {t('genieacs.meterDesc')}</li>
                      <li><strong>List:</strong> {t('genieacs.listDesc')}</li>
                    </ul>
                  </div>
                </>
              )}

              </ModalBody>
              <ModalFooter>
                <ModalButton variant="secondary" type="button" onClick={() => setShowForm(false)}>
                  {t('common.cancel')}
                </ModalButton>
                <ModalButton variant="primary" type="submit" disabled={saving} className="flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {editing ? t('genieacs.saveChanges') : t('common.save')}
                </ModalButton>
              </ModalFooter>
            </form>
      </SimpleModal>
      </div>
    </div>
  );
}


