import type { Meta, StoryObj } from '@storybook/react';
import { CyberButton, CyberCard } from '@/components/cyberpunk';
import {
  LayoutDashboard, Users, Wifi, Wallet, Ticket, Shield,
  CheckCircle2, XCircle, Clock, AlertTriangle, Loader2,
  Search, Filter, RefreshCw, Plus, Download,
} from 'lucide-react';

const meta: Meta = {
  title: 'Patterns/Role UI Comparison',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Side-by-side comparison of UI patterns across roles. Shows the target (semantic tokens) vs current (hardcoded neon).',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

export const StatsRow: Story = {
  render: () => (
    <div className="min-h-dvh bg-background p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Stats Cards — Target vs Current</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Top row uses semantic tokens (target). Bottom row uses hardcoded neon (current — to be replaced).
        </p>
      </div>

      {/* Target: semantic tokens */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-3">✅ Target — Semantic Tokens</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Total Users</p>
              <div className="p-2 bg-brand-500/10 rounded-xl">
                <Users className="w-5 h-5 text-brand-500 dark:text-brand-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">385</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Online</p>
              <div className="p-2 bg-emerald-500/10 rounded-xl">
                <Wifi className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">142</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Revenue</p>
              <div className="p-2 bg-violet-500/10 rounded-xl">
                <Wallet className="w-5 h-5 text-violet-500 dark:text-violet-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">Rp 12.5M</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Tickets</p>
              <div className="p-2 bg-amber-500/10 rounded-xl">
                <Ticket className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">23</p>
          </div>
        </div>
      </div>

      {/* Current: hardcoded neon (technician/admin style) */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-3">❌ Current — Hardcoded Neon (to be replaced)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Total Tasks</p>
              <div className="p-2.5 bg-amber-500/10 rounded-xl">
                <LayoutDashboard className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">12</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Open</p>
              <div className="p-2.5 bg-amber-500/10 rounded-xl">
                <Clock className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">5</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Active</p>
              <div className="p-2.5 bg-cyan-500/10 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-cyan-500 dark:text-cyan-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">4</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Completed</p>
              <div className="p-2.5 bg-green-500/10 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-green-500 dark:text-green-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">3</p>
          </div>
        </div>
      </div>
    </div>
  ),
};

export const ButtonComparison: Story = {
  render: () => (
    <div className="min-h-dvh bg-background p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Buttons — Target vs Current</h1>
      </div>

      <div>
        <h2 className="text-lg font-bold text-foreground mb-3">✅ Target — CyberButton (already uses blue/violet)</h2>
        <div className="flex flex-wrap gap-3">
          <CyberButton variant="default">Primary Action</CyberButton>
          <CyberButton variant="outline">Secondary</CyberButton>
          <CyberButton variant="destructive">Delete</CyberButton>
          <CyberButton variant="success">Approve</CyberButton>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-foreground mb-3">❌ Current — Hardcoded neon gradients (to be replaced)</h2>
        <div className="flex flex-wrap gap-3">
          <button className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-brand-500 to-brand-400 text-white text-xs font-bold rounded-xl hover:shadow-md shadow-brand-500/20 transition">
            <CheckCircle2 className="w-3.5 h-3.5" /> Take Task
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs font-bold rounded-xl hover:shadow-md transition">
            <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 bg-muted text-muted-foreground text-xs font-bold rounded-xl hover:bg-accent transition">
            <Ticket className="w-3.5 h-3.5" /> Open Ticket
          </button>
        </div>
      </div>
    </div>
  ),
};

export const TablePattern: Story = {
  render: () => (
    <div className="min-h-dvh bg-background p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Table Pattern — Semantic Tokens</h1>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 p-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            className="flex-1 bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <button className="flex items-center gap-1 px-3 py-1.5 bg-muted text-muted-foreground text-xs rounded-lg hover:bg-accent transition">
            <Filter className="w-3.5 h-3.5" /> Filter
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 bg-muted text-muted-foreground text-xs rounded-lg hover:bg-accent transition">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <CyberButton variant="default" size="sm">
            <Plus className="w-3.5 h-3.5" /> Add
          </CyberButton>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Package</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Expires</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: 'John Doe', status: 'active', pkg: 'Premium 20Mbps', expires: '15 Sep 2026' },
              { name: 'Jane Smith', status: 'isolated', pkg: 'Standard 10Mbps', expires: '1 Sep 2026' },
              { name: 'Bob Wilson', status: 'active', pkg: 'Basic 5Mbps', expires: '30 Oct 2026' },
            ].map((row) => (
              <tr key={row.name} className="border-b border-border hover:bg-muted/50 transition">
                <td className="px-4 py-3 text-sm font-medium text-foreground">{row.name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-lg border ${
                    row.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30'
                  }`}>
                    {row.status === 'active' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {row.status === 'active' ? 'Active' : 'Isolated'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{row.pkg}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{row.expires}</td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs text-brand-500 dark:text-brand-400 hover:underline font-medium">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ),
};

export const SidebarPattern: Story = {
  render: () => (
    <div className="min-h-dvh bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-sidebar-foreground">Salfanet</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Admin Portal</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <a className="menu-item menu-item-active">
            <LayoutDashboard className="w-4 h-4 menu-item-icon menu-item-icon-active" />
            Dashboard
          </a>
          <a className="menu-item menu-item-inactive">
            <Users className="w-4 h-4 menu-item-icon" />
            Customers
          </a>
          <a className="menu-item menu-item-inactive">
            <Wifi className="w-4 h-4 menu-item-icon" />
            Sessions
          </a>
          <a className="menu-item menu-item-inactive">
            <Wallet className="w-4 h-4 menu-item-icon" />
            Finance
          </a>
          <a className="menu-item menu-item-inactive">
            <Ticket className="w-4 h-4 menu-item-icon" />
            Tickets
          </a>
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center">
              <span className="text-xs font-bold text-brand-500 dark:text-brand-400">AD</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-sidebar-foreground truncate">Admin User</p>
              <p className="text-[10px] text-muted-foreground truncate">admin@salfa.net</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 p-6">
        <h1 className="text-xl font-bold text-foreground mb-4">Dashboard</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Users</p>
            <p className="text-2xl font-bold text-foreground">385</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Online Now</p>
            <p className="text-2xl font-bold text-foreground">142</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Revenue</p>
            <p className="text-2xl font-bold text-foreground">Rp 12.5M</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Open Tickets</p>
            <p className="text-2xl font-bold text-foreground">23</p>
          </div>
        </div>
      </div>
    </div>
  ),
};
