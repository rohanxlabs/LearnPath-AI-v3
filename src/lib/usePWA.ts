import { useState, useEffect } from 'react';

export function usePWA() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isInstallAvailable, setIsInstallAvailable] = useState<boolean>(false);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  useEffect(() => {
    // 1. Connection status handlers
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 2. Standalone app display check
    const checkIsInstalled = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
      setIsInstalled(!!isStandalone);
    };
    checkIsInstalled();

    // 3. Deferred install prompt listener
    const handleInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallAvailable(true);
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);

    // 4. Detected successful installation
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallAvailable(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    // 5. Register production service worker and handle updates
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          setSwRegistration(reg);
          console.log('[PWA] Service Worker registered successfully:', reg.scope);

          // Check if there is already a waiting worker on load
          if (reg.waiting) {
            setUpdateAvailable(true);
          }

          // Listen for new worker updates
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // A new service worker has been successfully pre-cached and is waiting to activate
                  setUpdateAvailable(true);
                }
              });
            }
          });
        })
        .catch((err) => {
          console.error('[PWA] Service worker registration failed:', err);
        });

      // Handle controller changes (reloading page immediately when skipWaiting is activated)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Method to prompt installation sheet
  const installApp = async () => {
    if (!deferredPrompt) return false;
    
    // Trigger prompt
    deferredPrompt.prompt();
    
    // Wait for the response choice
    const choiceResult = await deferredPrompt.userChoice;
    console.log('[PWA] User choice installed result:', choiceResult.outcome);
    
    if (choiceResult.outcome === 'accepted') {
      setIsInstalled(true);
      setIsInstallAvailable(false);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  // Method to activate service worker update and refresh
  const triggerUpdateApp = () => {
    if (swRegistration?.waiting) {
      console.log('[PWA] Sending skipWaiting to active waiting service worker...');
      swRegistration.waiting.postMessage('skipWaiting');
    } else {
      // Manual backup reload
      window.location.reload();
    }
  };

  // Request native permission for reminders and notifications
  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return 'default';
    
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return permission;
    } catch (err) {
      console.error('[PWA] Error requesting notification permissions:', err);
      return 'default';
    }
  };

  return {
    isOnline,
    isInstallAvailable,
    isInstalled,
    installApp,
    updateAvailable,
    triggerUpdateApp,
    notificationPermission,
    requestNotificationPermission
  };
}
