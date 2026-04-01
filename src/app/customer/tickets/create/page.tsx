'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { ArrowLeft, Send, CheckCircle } from 'lucide-react';
import { CyberCard } from '@/components/cyberpunk/CyberCard';
import { CyberButton } from '@/components/cyberpunk/CyberButton';

interface Category {
  id: string;
  name: string;
  color: string;
}

export default function CreateTicketPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { addToast } = useToast();
  const toastError = (msg: string) => addToast({ type: 'error', title: 'Gagal', description: msg, duration: 8000 });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [ticketNumber, setTicketNumber] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    categoryId: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchCategories();
    loadCustomerData();
  }, [router]);

  const loadCustomerData = () => {
    const token = localStorage.getItem('customer_token');
    const userData = localStorage.getItem('customer_user');
    
    if (!token || !userData) {
      router.push('/customer/login');
      return;
    }
    
    try {
      const user = JSON.parse(userData);
      setFormData(prev => ({
        ...prev,
        customerName: user.name || user.username,
        customerPhone: user.phone || '',
        customerEmail: user.email || '',
      }));
    } catch (error) {
      router.push('/customer/login');
    }
  };

  const fetchCategories = async () => {
    try {
      const token = localStorage.getItem('customer_token');
      const res = await fetch('/api/tickets/categories?isActive=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.subject.trim()) {
      newErrors.subject = t('ticket.subjectRequired');
    }

    if (!formData.description.trim()) {
      newErrors.description = t('ticket.descriptionRequired');
    } else if (formData.description.trim().length < 10) {
      newErrors.description = t('ticket.descriptionTooShort');
    }

    if (!formData.customerName.trim()) {
      newErrors.customerName = t('ticket.nameRequired');
    }

    if (!formData.customerPhone.trim()) {
      newErrors.customerPhone = t('ticket.phoneRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    try {
      // Get customer ID from session
      const userData = localStorage.getItem('customer_user');
      let customerId = null;
      if (userData) {
        try {
          const user = JSON.parse(userData);
          customerId = user.id;
        } catch (error) {
          console.error('Failed to parse user data:', error);
        }
      }

      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          customerId, // Link ticket to customer
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTicketNumber(data.ticketNumber);
        setSuccess(true);
        setTimeout(() => {
          router.push(`/customer/tickets/${data.id}`);
        }, 3000);
      } else {
        const error = await res.json();
        toastError(error.error || t('ticket.createFailed'));
      }
    } catch (error) {
      console.error('Failed to create ticket:', error);
      toastError(t('ticket.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex items-center justify-center p-4 py-12">
        <CyberCard className="p-8 max-w-md w-full text-center bg-card/90 backdrop-blur-xl border-2 border-success/30 shadow-[0_0_40px_rgba(34,197,94,0.2)]">
          <CheckCircle size={64} className="text-success mx-auto mb-4 drop-shadow-[0_0_20px_rgba(34,197,94,0.8)]" />
          <h2 className="text-2xl font-bold text-success mb-2 drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]">
            {t('ticket.ticketCreated')}
          </h2>
          <p className="text-muted-foreground mb-4">
            {t('ticket.ticketNumberIs')}:
          </p>
          <div className="bg-success/10 border-2 border-success/30 rounded-lg p-4 mb-6 shadow-[0_0_20px_rgba(34,197,94,0.15)]">
            <span className="text-2xl font-mono font-bold text-success drop-shadow-[0_0_10px_rgba(34,197,94,0.6)]">
              #{ticketNumber}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            {t('ticket.whatsappNotificationSent')}
          </p>
          <p className="text-sm text-cyan-400">
            {t('ticket.redirectingToTicket')}...
          </p>
        </CyberCard>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/customer/tickets"
          className="text-cyan-400 hover:text-cyan-300 transition-colors drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]"
        >
          <ArrowLeft size={22} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-cyan-400 drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]">
            {t('ticket.createTicket')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('ticket.createTicketDescription')}
          </p>
        </div>
      </div>

      <CyberCard className="p-6 bg-card/80 backdrop-blur-xl border-2 border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.15)]">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Customer Name */}
          <div>
            <label className="block text-sm font-medium text-cyan-400 mb-2 drop-shadow-[0_0_5px_rgba(6,182,212,0.3)]">
              {t('ticket.customerName')} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.customerName}
              onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
              className={`w-full bg-slate-900/50 border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all ${
                errors.customerName ? 'border-red-500/50 focus:ring-red-500/50' : 'border-cyan-500/30'
              }`}
              placeholder={t('ticket.enterYourName')}
            />
            {errors.customerName && (
              <p className="text-red-400 text-sm mt-1">{errors.customerName}</p>
            )}
          </div>

          {/* Customer Phone */}
          <div>
            <label className="block text-sm font-medium text-cyan-400 mb-2 drop-shadow-[0_0_5px_rgba(6,182,212,0.3)]">
              {t('ticket.customerPhone')} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.customerPhone}
              onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
              className={`w-full bg-slate-900/50 border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all ${
                errors.customerPhone ? 'border-red-500/50 focus:ring-red-500/50' : 'border-cyan-500/30'
              }`}
              placeholder="08xxxxxxxxxx"
            />
            {errors.customerPhone && (
              <p className="text-red-400 text-sm mt-1">{errors.customerPhone}</p>
            )}
          </div>

          {/* Customer Email */}
          <div>
            <label className="block text-sm font-medium text-cyan-400 mb-2 drop-shadow-[0_0_5px_rgba(6,182,212,0.3)]">
              {t('ticket.customerEmail')}
            </label>
            <input
              type="email"
              value={formData.customerEmail}
              onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
              className="w-full bg-slate-900/50 border border-cyan-500/30 rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
              placeholder="email@example.com"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-cyan-400 mb-2 drop-shadow-[0_0_5px_rgba(6,182,212,0.3)]">
              {t('ticket.subject')} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className={`w-full bg-slate-900/50 border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all ${
                errors.subject ? 'border-red-500/50 focus:ring-red-500/50' : 'border-cyan-500/30'
              }`}
              placeholder={t('ticket.subjectPlaceholder')}
            />
            {errors.subject && (
              <p className="text-red-400 text-sm mt-1">{errors.subject}</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-cyan-400 mb-2 drop-shadow-[0_0_5px_rgba(6,182,212,0.3)]">
              {t('ticket.category')}
            </label>
            <select
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              className="w-full bg-slate-900/50 border border-cyan-500/30 rounded-lg px-4 py-2.5 text-foreground focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
            >
              <option value="">{t('ticket.selectCategory')}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-cyan-400 mb-2 drop-shadow-[0_0_5px_rgba(6,182,212,0.3)]">
              {t('ticket.description')} <span className="text-red-400">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={6}
              className={`w-full bg-slate-900/50 border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all resize-none ${
                errors.description ? 'border-red-500/50 focus:ring-red-500/50' : 'border-cyan-500/30'
              }`}
              placeholder={t('ticket.descriptionPlaceholder')}
            />
            {errors.description && (
              <p className="text-red-400 text-sm mt-1">{errors.description}</p>
            )}
            <p className="text-muted-foreground text-sm mt-1">
              {t('ticket.minCharacters')}: 10
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3 pt-2">
            <Link href="/customer/tickets">
              <CyberButton
                type="button"
                variant="outline"
                className="px-6 py-2.5"
              >
                {t('ticket.cancel')}
              </CyberButton>
            </Link>
            <CyberButton
              type="submit"
              disabled={loading}
              variant="cyan"
              className="px-6 py-2.5 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  {t('ticket.creating')}...
                </>
              ) : (
                <>
                  <Send size={20} />
                  {t('ticket.submitTicket')}
                </>
              )}
            </CyberButton>
          </div>
        </form>
      </CyberCard>
    </div>
  );
}
