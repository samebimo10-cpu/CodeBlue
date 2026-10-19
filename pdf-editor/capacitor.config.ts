import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.inkdesk.pdf',
  appName: 'InkDesk PDF',
  webDir: 'dist',
  android: { allowMixedContent: false },
  ios: { contentInset: 'automatic' },
};

export default config;
