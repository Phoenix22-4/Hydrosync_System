import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hydrosync.app',
  appName: 'HydroSync',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined
    }
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#050b1a'
    }
  },
  ios: {},
  web: {},
  bundledWebRuntime: false,
  icon: 'public/icon.png'
};
  icon: 'public/icon.png'
};

export default config;
