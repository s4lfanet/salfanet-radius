import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
  title: 'Design System/Color Tokens',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'All semantic color tokens from globals.css. Toggle the Theme toolbar to see dark/light mode.',
      },
    },
  },
};

export default meta;

type Story = StoryObj;

const tokenGroups = [
  {
    title: 'Surfaces',
    tokens: [
      { name: 'bg-background', var: '--background', desc: 'Page background' },
      { name: 'bg-card', var: '--card', desc: 'Card / elevated surface' },
      { name: 'bg-popover', var: '--popover', desc: 'Popover / dropdown' },
      { name: 'bg-muted', var: '--muted', desc: 'Muted background' },
      { name: 'bg-input', var: '--input', desc: 'Input background' },
      { name: 'bg-secondary', var: '--secondary', desc: 'Secondary surface' },
      { name: 'bg-sidebar', var: '--sidebar', desc: 'Sidebar background' },
    ],
  },
  {
    title: 'Text',
    tokens: [
      { name: 'text-foreground', var: '--foreground', desc: 'Primary text' },
      { name: 'text-muted-foreground', var: '--muted-foreground', desc: 'Secondary text' },
      { name: 'text-sidebar-foreground', var: '--sidebar-foreground', desc: 'Sidebar text' },
      { name: 'text-primary', var: '--primary', desc: 'Primary brand text' },
      { name: 'text-accent', var: '--accent', desc: 'Accent text (violet)' },
    ],
  },
  {
    title: 'Borders & Rings',
    tokens: [
      { name: 'border-border', var: '--border', desc: 'Standard border' },
      { name: 'border-input', var: '--input', desc: 'Input border' },
      { name: 'ring-ring', var: '--ring', desc: 'Focus ring' },
      { name: 'border-sidebar', var: '--sidebar-border', desc: 'Sidebar border' },
    ],
  },
  {
    title: 'Status Colors',
    tokens: [
      { name: 'bg-success', var: '--success', desc: 'Success' },
      { name: 'bg-warning', var: '--warning', desc: 'Warning' },
      { name: 'bg-destructive', var: '--destructive', desc: 'Error / destructive' },
      { name: 'bg-info', var: '--info', desc: 'Info' },
    ],
  },
  {
    title: 'Brand Palette (Tailwind)',
    tokens: [
      { name: 'brand-25', var: '--color-brand-25', desc: '#f2f7ff' },
      { name: 'brand-50', var: '--color-brand-50', desc: '#ecf3ff' },
      { name: 'brand-100', var: '--color-brand-100', desc: '#dde9ff' },
      { name: 'brand-300', var: '--color-brand-300', desc: '#9cb9ff' },
      { name: 'brand-400', var: '--color-brand-400', desc: '#7592ff' },
      { name: 'brand-500', var: '--color-brand-500', desc: '#465fff (primary)' },
      { name: 'brand-600', var: '--color-brand-600', desc: '#3641f5' },
      { name: 'brand-700', var: '--color-brand-700', desc: '#2a31d8' },
      { name: 'brand-900', var: '--color-brand-900', desc: '#262e89' },
    ],
  },
  {
    title: 'Legacy Hardcoded (TO BE REPLACED)',
    tokens: [
      { name: '#00f7ff', var: null, desc: 'Neon cyan → use text-brand-500 dark:text-brand-400' },
      { name: '#00bcd4', var: null, desc: 'Darker cyan → use text-brand-600 dark:text-brand-300' },
      { name: '#bc13fe', var: null, desc: 'Neon purple → use text-violet-600 dark:text-violet-400' },
      { name: '#0a0520', var: null, desc: 'Dark bg → use bg-background' },
      { name: '#1a0f35', var: null, desc: 'Dark card → use bg-card' },
      { name: '#0f0a1e', var: null, desc: 'Dark muted → use bg-muted' },
    ],
  },
];

export const AllTokens: Story = {
  render: () => (
    <div className="min-h-dvh bg-background p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Color Token Reference</h1>
        <p className="text-sm text-muted-foreground">
          Toggle the Theme toolbar (top bar) to see dark/light mode. Toggle Role to see scoped overrides.
        </p>
      </div>

      {tokenGroups.map((group) => (
        <div key={group.title}>
          <h2 className="text-lg font-bold text-foreground mb-3">{group.title}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {group.tokens.map((token) => (
              <div
                key={token.name}
                className="bg-card border border-border rounded-xl p-3 space-y-2"
              >
                <div
                  className="h-12 rounded-lg border border-border"
                  style={token.var ? { backgroundColor: `var(${token.var})` } : { backgroundColor: token.name }}
                />
                <div>
                  <p className="text-xs font-mono font-bold text-foreground">{token.name}</p>
                  <p className="text-[10px] text-muted-foreground">{token.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
};

export const Typography: Story = {
  render: () => (
    <div className="min-h-dvh bg-background p-6 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Typography Scale</h1>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">text-title-2xl (72px)</p>
          <p className="text-title-2xl font-bold text-foreground">Display Heading</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">text-title-lg (48px)</p>
          <p className="text-title-lg font-bold text-foreground">Section Heading</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">text-title-md (36px)</p>
          <p className="text-title-md font-bold text-foreground">Card Heading</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">text-theme-xl (20px)</p>
          <p className="text-theme-xl text-foreground">Large Body Text</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">text-theme-sm (14px) — default</p>
          <p className="text-theme-sm text-foreground">Regular body text for content and descriptions.</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">text-theme-xs (12px)</p>
          <p className="text-theme-xs text-muted-foreground">Small labels and captions</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-bold text-foreground">Font Weights</h2>
        <p className="text-theme-sm font-light text-foreground">font-light (300) — Outfit</p>
        <p className="text-theme-sm font-medium text-foreground">font-medium (500) — default</p>
        <p className="text-theme-sm font-bold text-foreground">font-bold (700) — headings</p>
        <p className="text-theme-sm font-black text-foreground">font-black (900) — display</p>
      </div>
    </div>
  ),
};
