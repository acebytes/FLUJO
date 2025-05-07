// Mark this file as a client component
'use client';

import { useState, useEffect } from 'react';
import { StorageKey } from '../../shared/types/storage';
import { createLogger } from '@/utils/logger';

// Create a logger instance for this file
const log = createLogger('utils/storage/frontend.ts');

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void, boolean] {
  log.verbose('useLocalStorage: Entering method'); // Changed to verbose
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadValue = async () => {
      log.verbose('loadValue: Entering method'); // Changed to verbose
      try {
        const response = await fetch(`/api/storage?key=${encodeURIComponent(key)}&defaultValue=${encodeURIComponent(JSON.stringify(initialValue))}`);
        const data = await response.json();
        if (response.ok) {
          setStoredValue(data.value);
        }
      } catch (error) {
        log.warn(`Error reading storage key "${key}":`, error);
      } finally {
        setIsLoading(false);
      }
    };

    loadValue();
  }, [key]); // Remove initialValue from dependencies to prevent infinite loop

  const setValue = async (value: T) => {
    log.verbose('setValue: Entering method'); // Changed to verbose
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);

      const response = await fetch('/api/storage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          value: valueToStore,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save value');
      }
    } catch (error) {
      log.warn(`Error setting storage key "${key}":`, error);
    }
  };

  return [storedValue, setValue, isLoading];
}

export const saveItem = async <T,>(key: StorageKey, value: T): Promise<void> => {
  log.verbose('saveItem: Entering method'); // Changed to verbose
  try {
    const response = await fetch('/api/storage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key,
        value,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to save item');
    }
  } catch (error) {
    log.error('Error saving to storage:', error);
    throw error;
  }
};

export const loadItem = async <T,>(key: StorageKey, defaultValue: T): Promise<T> => {
  log.verbose('loadItem: Entering method'); // Changed to verbose
  try {
    const response = await fetch(`/api/storage?key=${encodeURIComponent(key)}&defaultValue=${encodeURIComponent(JSON.stringify(defaultValue))}`);
    if (!response.ok) {
      throw new Error('Failed to load item');
    }
    const data = await response.json();
    return data.value;
  } catch (error) {
    log.error('Error loading from storage:', error);
    return defaultValue;
  }
};

export const clearItem = async (key: StorageKey): Promise<void> => {
  log.verbose('clearItem: Entering method'); // Changed to verbose
  try {
    const response = await fetch(`/api/storage?key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to clear item');
    }
  } catch (error) {
    log.error('Error clearing storage item:', error);
    throw error;
  }
};

export const setEncryptionKey = async (key: string): Promise<void> => {
  log.verbose('setEncryptionKey: Entering method'); // Changed to verbose
  await saveItem(StorageKey.ENCRYPTION_KEY, key);
};

export const getEncryptionKey = async (): Promise<string | null> => {
  log.verbose('getEncryptionKey: Entering method'); // Changed to verbose
  return await loadItem<string | null>(StorageKey.ENCRYPTION_KEY, null);
};
