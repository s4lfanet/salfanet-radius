'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { formatWIB } from '@/lib/timezone';
import {
  UserCheck,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  Clock,
  AlertCircle,
  CheckCircle,
  User,
  Phone,
  MapPin,
  FileText,
  Calendar,
  Loader2,
  RefreshCcw,
  Filter,
  Search,
} from 'lucide-react';

interface Technician {
  id: string;
  name: string;
  phoneNumber: string;
  activeTasks?: number;
}

interface WorkOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  issueType: string;
  description: string;
  priority: string;
  status: string;
  scheduledDate?: string;
  estimatedHours?: number;
  notes?: string;
  technicianNotes?: string;
  createdAt: string;
  assignedAt?: string;
  completedAt?: string;
  technician?: Technician;
  coordinator?: {
    id: string;
    name: string;
  };
}

const ISSUE_TYPES = [
  'CONNECTION',
  'SLOW_SPEED',
  'NO_INTERNET',
  'DEVICE_ISSUE',
  'INSTALLATION',
  'MAINTENANCE',
  'OTHER',
];

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

function CoordinatorTasksContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const [coordinator, setCoordinator] = useState<any>(null);
  const [tasks, setTasks] = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<WorkOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    issueType: 'CONNECTION',
    description: '',
    priority: 'MEDIUM',
    technicianId: '',
    scheduledDate: '',
    estimatedHours: '',
    notes: '',
  });

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (coordinator) {
      loadTasks();
      loadTechnicians();
    }
  }, [coordinator, searchTerm, filterStatus, filterPriority]);

  const checkSession = async () => {
    try {
      const res = await fetch('/api/coordinator/auth/session');
      if (res.ok) {
        const data = await res.json();
        setCoordinator(data.coordinator);
      } else {
        router.push('/coordinator/login');
      }
    } catch (error) {
      router.push('/coordinator/login');
    } finally {
      setLoading(false);
    }
  };

  const loadTasks = async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (filterStatus) params.append('status', filterStatus);
      if (filterPriority) params.append('priority', filterPriority);

      const res = await fetch(`/api/coordinator/tasks?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  };

  const loadTechnicians = async () => {
    try {
      const res = await fetch('/api/coordinator/stats');
      if (res.ok) {
        const data = await res.json();
        setTechnicians(data.technicians || []);
      }
    } catch (error) {
      console.error('Failed to load technicians:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      customerName: '',
      customerPhone: '',
      customerAddress: '',
      issueType: 'CONNECTION',
      description: '',
      priority: 'MEDIUM',
      technicianId: '',
      scheduledDate: '',
      estimatedHours: '',
      notes: '',
    });
  };

  const handleEdit = (task: WorkOrder) => {
    setEditingTask(task);
    setFormData({
      customerName: task.customerName,
      customerPhone: task.customerPhone,
      customerAddress: task.customerAddress,
      issueType: task.issueType,
      description: task.description,
      priority: task.priority,
      technicianId: task.technician?.id || '',
      scheduledDate: task.scheduledDate
        ? new Date(task.scheduledDate).toISOString().slice(0, 16)
        : '',
      estimatedHours: task.estimatedHours?.toString() || '',
      notes: task.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.customerName ||
      !formData.customerPhone ||
      !formData.customerAddress ||
      !formData.description
    ) {
      await showError(t('task.fillRequired'));
      return;
    }

    try {
      const method = editingTask ? 'PUT' : 'POST';
      const payload = editingTask
        ? { ...formData, id: editingTask.id }
        : formData;

      const res = await fetch('/api/coordinator/tasks', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await showSuccess(
          editingTask ? t('task.taskUpdated') : t('task.taskCreated')
        );
        setIsDialogOpen(false);
        setEditingTask(null);
        resetForm();
        loadTasks();
      } else {
        const error = await res.json();
        await showError(error.error || t('common.error'));
      }
    } catch (error) {
      await showError(t('common.error'));
    }
  };

  const handleDelete = async (task: WorkOrder) => {
    const confirmed = await showConfirm(
      t('task.deleteTask'),
      t('task.deleteTaskConfirm', { customer: task.customerName })
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/coordinator/tasks?id=${task.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await showSuccess(t('task.taskDeleted'));
        loadTasks();
      } else {
        const error = await res.json();
        await showError(error.error || t('common.error'));
      }
    } catch (error) {
      await showError(t('common.error'));
    }
  };

  const handleLogout = async () => {
    await fetch('/api/coordinator/auth/logout', { method: 'POST' });
    router.push('/coordinator/login');
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return 'bg-destructive/20 text-destructive';
      case 'HIGH':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      case 'MEDIUM':
        return 'bg-warning/20 text-warning';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-success/20 text-success';
      case 'IN_PROGRESS':
        return 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300';
      case 'ASSIGNED':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300';
      case 'CANCELLED':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push('/coordinator/dashboard')}
                className="p-1.5 hover:bg-muted rounded-lg"
              >
                <UserCheck className="h-5 w-5 text-primary dark:text-teal-400" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  {t('task.manageTasks')}
                </h1>
                <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                  {coordinator?.name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditingTask(null);
                  resetForm();
                  setIsDialogOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 btn-primary rounded-lg text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('task.createTask')}
              </button>
              <button
                onClick={handleLogout}
                className="p-1.5 text-muted-foreground dark:text-muted-foreground hover:text-gray-900 dark:hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Filters */}
        <div className="bg-card rounded-lg shadow-sm border border-border mb-4 p-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('task.searchTasks')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-inputdark:text-white"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-border rounded-lg dark:bg-inputdark:text-white"
            >
              <option value="">{t('task.allStatuses')}</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`task.status_${status}`)}
                </option>
              ))}
            </select>

            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-border rounded-lg dark:bg-inputdark:text-white"
            >
              <option value="">{t('task.allPriorities')}</option>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {t(`task.priority_${priority}`)}
                </option>
              ))}
            </select>

            <button
              onClick={loadTasks}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors text-sm"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              {t('common.refresh')}
            </button>
          </div>
        </div>

        {/* Tasks Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-card rounded-lg shadow-sm border border-border hover:shadow-md transition-shadow"
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${getPriorityColor(
                          task.priority
                        )}`}
                      >
                        {t(`task.priority_${task.priority}`)}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${getStatusColor(
                          task.status
                        )}`}
                      >
                        {t(`task.status_${task.status}`)}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {task.customerName}
                    </h3>
                    <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                      {t(`task.issueType_${task.issueType}`)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(task)}
                      className="p-0.5 text-primary hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(task)}
                      className="p-0.5 text-destructive hover:text-red-800 dark:text-destructive dark:hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground dark:text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    {task.customerPhone}
                  </div>
                  <div className="flex items-start gap-1.5 text-muted-foreground dark:text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 mt-0.5" />
                    <span className="flex-1">{task.customerAddress}</span>
                  </div>
                  {task.technician && (
                    <div className="flex items-center gap-1.5 text-muted-foreground dark:text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      {task.technician.name} ({task.technician.phoneNumber})
                    </div>
                  )}
                  {task.scheduledDate && (
                    <div className="flex items-center gap-1.5 text-muted-foreground dark:text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatWIB(task.scheduledDate)}
                    </div>
                  )}
                </div>

                <p className="text-xs text-foreground mt-2 line-clamp-2">
                  {task.description}
                </p>

                {task.notes && (
                  <div className="mt-2 p-1.5 bg-muted dark:bg-inputrounded text-[10px] text-muted-foreground dark:text-muted-foreground">
                    <FileText className="h-3 w-3 inline mr-1" />
                    {task.notes}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {tasks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground dark:text-muted-foreground text-sm">
            {t('task.noTasks')}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      {isDialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card rounded-lg shadow-xl max-w-2xl w-full my-8">
            <div className="p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">
                {editingTask ? t('task.editTask') : t('task.createTask')}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Customer Name */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('task.customerName')} *
                  </label>
                  <input
                    type="text"
                    value={formData.customerName}
                    onChange={(e) =>
                      setFormData({ ...formData, customerName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-inputdark:text-white"
                    required
                  />
                </div>

                {/* Customer Phone */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('task.customerPhone')} *
                  </label>
                  <input
                    type="tel"
                    value={formData.customerPhone}
                    onChange={(e) =>
                      setFormData({ ...formData, customerPhone: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-inputdark:text-white"
                    required
                  />
                </div>

                {/* Issue Type */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('task.issueType')} *
                  </label>
                  <select
                    value={formData.issueType}
                    onChange={(e) =>
                      setFormData({ ...formData, issueType: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-inputdark:text-white"
                    required
                  >
                    {ISSUE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`task.issueType_${type}`)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('task.priority')} *
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData({ ...formData, priority: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-inputdark:text-white"
                    required
                  >
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {t(`task.priority_${priority}`)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Assign Technician */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('task.assignTechnician')}
                  </label>
                  <select
                    value={formData.technicianId}
                    onChange={(e) =>
                      setFormData({ ...formData, technicianId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-inputdark:text-white"
                  >
                    <option value="">{t('task.unassigned')}</option>
                    {technicians.map((tech) => (
                      <option key={tech.id} value={tech.id}>
                        {tech.name} ({tech.activeTasks || 0} {t('task.activeTasks')})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Scheduled Date */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('task.scheduledDate')}
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.scheduledDate}
                    onChange={(e) =>
                      setFormData({ ...formData, scheduledDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-inputdark:text-white"
                  />
                </div>

                {/* Estimated Hours */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('task.estimatedHours')}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.estimatedHours}
                    onChange={(e) =>
                      setFormData({ ...formData, estimatedHours: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-inputdark:text-white"
                  />
                </div>

                {/* Customer Address */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('task.customerAddress')} *
                  </label>
                  <textarea
                    value={formData.customerAddress}
                    onChange={(e) =>
                      setFormData({ ...formData, customerAddress: e.target.value })
                    }
                    rows={2}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-inputdark:text-white"
                    required
                  />
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('task.description')} *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    rows={3}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-inputdark:text-white"
                    required
                  />
                </div>

                {/* Notes */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('task.notes')}
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    rows={2}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-inputdark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setIsDialogOpen(false);
                    setEditingTask(null);
                    resetForm();
                  }}
                  className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 btn-primary rounded-lg"
                >
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CoordinatorTasksPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
      </div>
    }>
      <CoordinatorTasksContent />
    </Suspense>
  );
}
