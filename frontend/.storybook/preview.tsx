import type { Preview } from '@storybook/react';
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: 'padded',
    backgrounds: {
      disable: true,
    },
  },
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Dark or Light theme',
      defaultValue: 'dark',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'dark', icon: 'circle', title: 'Dark' },
          { value: 'light', icon: 'circlehollow', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
    role: {
      name: 'Role',
      description: 'Current role context',
      defaultValue: 'admin',
      toolbar: {
        title: 'Role',
        icon: 'user',
        items: [
          { value: 'admin', title: 'Admin' },
          { value: 'agent', title: 'Agent' },
          { value: 'technician', title: 'Technician' },
          { value: 'collector', title: 'Collector' },
          { value: 'customer', title: 'Customer' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme as string;
      const role = context.globals.role as string;

      if (typeof document !== 'undefined') {
        const html = document.documentElement;
        html.classList.toggle('dark', theme === 'dark');
        html.style.colorScheme = theme;
      }

      return (
        <div data-role={role} className="min-h-dvh bg-background p-4">
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
