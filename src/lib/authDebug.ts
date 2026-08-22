/**
 * Authentication debugging utilities
 * 
 * This module provides debugging tools to diagnose authentication persistence issues.
 * Remove or disable in production.
 */

export const authDebug = {
  /**
   * Log authentication state to console
   */
  logAuthState(context: string) {
    if (import.meta.env.DEV) {
      console.group(`🔐 [Auth Debug] ${context}`);
      
      // Check localStorage for Supabase tokens
      try {
        const storageKeys = Object.keys(localStorage).filter(key => 
          key.includes('supabase') || key.includes('sb-')
        );
        
        console.log('📦 LocalStorage keys:', storageKeys);
        
        storageKeys.forEach(key => {
          const value = localStorage.getItem(key);
          if (value) {
            try {
              const parsed = JSON.parse(value);
              console.log(`  ${key}:`, {
                hasAccessToken: !!parsed.access_token,
                hasRefreshToken: !!parsed.refresh_token,
                userEmail: parsed.user?.email,
                expiresAt: parsed.expires_at ? new Date(parsed.expires_at * 1000).toISOString() : 'N/A',
              });
            } catch {
              console.log(`  ${key}: (non-JSON value, length: ${value.length})`);
            }
          }
        });
        
        if (storageKeys.length === 0) {
          console.warn('⚠️ No Supabase tokens found in localStorage');
        }
      } catch (error) {
        console.error('❌ Error accessing localStorage:', error);
      }
      
      console.groupEnd();
    }
  },

  /**
   * Monitor localStorage changes
   */
  watchStorage() {
    if (import.meta.env.DEV) {
      const originalSetItem = localStorage.setItem;
      const originalRemoveItem = localStorage.removeItem;
      const originalClear = localStorage.clear;

      localStorage.setItem = function(key: string, value: string) {
        if (key.includes('supabase') || key.includes('sb-')) {
          console.log('📝 [Storage] setItem:', key, `(${value.length} chars)`);
        }
        return originalSetItem.apply(this, [key, value]);
      };

      localStorage.removeItem = function(key: string) {
        if (key.includes('supabase') || key.includes('sb-')) {
          console.log('🗑️ [Storage] removeItem:', key);
        }
        return originalRemoveItem.apply(this, [key]);
      };

      localStorage.clear = function() {
        console.warn('🧹 [Storage] clear() called - all storage will be wiped');
        return originalClear.apply(this);
      };

      console.log('👀 Storage monitoring enabled');
    }
  },
};
