import type { Meta, StoryObj } from '@storybook/react';
import { CyberButton } from '@/components/cyberpunk';
import { CheckCircle2, Trash2, AlertTriangle, Download, Loader2 } from 'lucide-react';

const meta: Meta<typeof CyberButton> = {
  title: 'Components/CyberButton',
  component: CyberButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Shared button component used across all roles. Variants map to brand colors (blue/violet) not neon cyan.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'cyan', 'magenta', 'purple', 'destructive', 'success', 'warning', 'outline', 'ghost', 'link', 'glass'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'xl', 'icon', 'icon-sm', 'icon-lg'],
    },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof CyberButton>;

export const AllVariants: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <CyberButton variant="default">Default (Blue)</CyberButton>
        <CyberButton variant="cyan">Cyan (Blue-500)</CyberButton>
        <CyberButton variant="magenta">Magenta (Violet)</CyberButton>
        <CyberButton variant="purple">Purple (Indigo)</CyberButton>
        <CyberButton variant="destructive">Destructive</CyberButton>
        <CyberButton variant="success">Success</CyberButton>
        <CyberButton variant="warning">Warning</CyberButton>
      </div>
      <div className="flex flex-wrap gap-3">
        <CyberButton variant="outline">Outline</CyberButton>
        <CyberButton variant="ghost">Ghost</CyberButton>
        <CyberButton variant="link">Link</CyberButton>
        <CyberButton variant="glass">Glass</CyberButton>
      </div>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <CyberButton variant="success">
        <CheckCircle2 className="w-4 h-4" /> Approve
      </CyberButton>
      <CyberButton variant="destructive">
        <Trash2 className="w-4 h-4" /> Delete
      </CyberButton>
      <CyberButton variant="warning">
        <AlertTriangle className="w-4 h-4" /> Suspend
      </CyberButton>
      <CyberButton variant="outline">
        <Download className="w-4 h-4" /> Export
      </CyberButton>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <CyberButton size="sm">Small</CyberButton>
      <CyberButton size="default">Default</CyberButton>
      <CyberButton size="lg">Large</CyberButton>
      <CyberButton size="xl">Extra Large</CyberButton>
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <CyberButton variant="default" loading>Submitting...</CyberButton>
      <CyberButton variant="success" loading>Approving...</CyberButton>
      <CyberButton variant="destructive" loading>Deleting...</CyberButton>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <CyberButton variant="default" disabled>Disabled</CyberButton>
      <CyberButton variant="outline" disabled>Disabled Outline</CyberButton>
    </div>
  ),
};
