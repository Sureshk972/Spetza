import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.spetza.app',
  appName: 'Spetza',
  webDir: 'dist',
  server: {
    // In dev, point to the Vite dev server for live reload
    // url: 'http://192.168.X.X:3000',
    // cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0378A6',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
