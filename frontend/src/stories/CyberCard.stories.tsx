import type { Meta, StoryObj } from '@storybook/react';
import {
  CyberCard,
  CyberCardHeader,
  CyberCardTitle,
  CyberCardDescription,
  CyberCardContent,
  CyberCardFooter,
  CyberStatsCard,
} from '@/components/cyberpunk';
import { CyberButton } from '@/components/cyberpunk';
import { Wifi, Users, DollarSign, Activity } from 'lucide-react';

const meta: Meta<typeof CyberCard> = {
  title: 'Components/CyberCard',
  component: CyberCard,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Card component used primarily in customer pages. Note: internal neon colors (cyan/magenta) should be updated to brand tokens.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'glass', 'neon', 'hologram'],
    },
    neonColor: {
      control: 'select',
      options: ['cyan', 'magenta', 'purple', 'blue', 'green'],
    },
    hoverEffect: { control: 'boolean' },
    glowIntensity: {
      control: 'select',
      options: ['none', 'low', 'medium', 'high'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof CyberCard>;

export const AllVariants: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
      <CyberCard variant="default" className="p-5">
        <h3 className="text-lg font-bold text-foreground mb-2">Default Card</h3>
        <p className="text-sm text-muted-foreground">Standard card with neon border accent.</p>
      </CyberCard>

      <CyberCard variant="glass" className="p-5">
        <h3 className="text-lg font-bold text-foreground mb-2">Glass Card</h3>
        <p className="text-sm text-muted-foreground">Glassmorphism with backdrop blur.</p>
      </CyberCard>

      <CyberCard variant="neon" className="p-5">
        <h3 className="text-lg font-bold text-foreground mb-2">Neon Card</h3>
        <p className="text-sm text-muted-foreground">Neon glow with top accent line.</p>
      </CyberCard>

      <CyberCard variant="hologram" className="p-5">
        <h3 className="text-lg font-bold text-foreground mb-2">Hologram Card</h3>
        <p className="text-sm text-muted-foreground">Gradient holographic effect.</p>
      </CyberCard>
    </div>
  ),
};

export const FullCard: Story = {
  render: () => (
    <CyberCard className="max-w-md">
      <CyberCardHeader>
        <CyberCardTitle>Customer Summary</CyberCardTitle>
        <CyberCardDescription>Overview of customer account status</CyberCardDescription>
      </CyberCardHeader>
      <CyberCardContent>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <span className="text-sm font-bold text-success">Active</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Package</span>
            <span className="text-sm font-bold text-foreground">Premium 20Mbps</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Expires</span>
            <span className="text-sm font-bold text-foreground">15 Sep 2026</span>
          </div>
        </div>
      </CyberCardContent>
      <CyberCardFooter>
        <CyberButton variant="outline" size="sm">View Details</CyberButton>
        <CyberButton variant="default" size="sm">Renew Now</CyberButton>
      </CyberCardFooter>
    </CyberCard>
  ),
};

export const StatsCards: Story = {
  render: () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl">
      <CyberStatsCard
        title="Online Users"
        value={142}
        icon={<Wifi className="w-5 h-5" />}
        neonColor="cyan"
        change={{ value: 12, type: 'increase' }}
      />
      <CyberStatsCard
        title="Total Customers"
        value={385}
        icon={<Users className="w-5 h-5" />}
        neonColor="purple"
      />
      <CyberStatsCard
        title="Revenue"
        value="Rp 12.5M"
        icon={<DollarSign className="w-5 h-5" />}
        neonColor="green"
        change={{ value: 8, type: 'increase' }}
      />
      <CyberStatsCard
        title="Isolated"
        value={23}
        icon={<Activity className="w-5 h-5" />}
        neonColor="magenta"
        change={{ value: 5, type: 'decrease' }}
      />
    </div>
  ),
};
