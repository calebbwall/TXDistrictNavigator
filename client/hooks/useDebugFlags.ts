import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';

const DEBUG_ENABLED_KEY = '@debug_enabled';

let globalDebugEnabled = false;
const listeners = new Set<(enabled: boolean) => void>();

export function useDebugFlags() {
  const [debugEnabled, setDebugEnabled] = useState(globalDebugEnabled);

  useEffect(() => {
    AsyncStorage.getItem(DEBUG_ENABLED_KEY).then((value) => {
      const enabled = value === 'true';
      globalDebugEnabled = enabled;
      setDebugEnabled(enabled);
    });

    const listener = (enabled: boolean) => setDebugEnabled(enabled);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const toggleDebug = useCallback(async () => {
    const newValue = !globalDebugEnabled;
    globalDebugEnabled = newValue;
    await AsyncStorage.setItem(DEBUG_ENABLED_KEY, String(newValue));
    listeners.forEach((listener) => listener(newValue));
    
    if (Platform.OS === 'web') {
      console.log(`[Debug] ${newValue ? 'ON' : 'OFF'}`);
    } else {
      Alert.alert('Debug Mode', newValue ? 'Debug ON' : 'Debug OFF');
    }
  }, []);

  return { debugEnabled, toggleDebug };
}

export const BUILD_MARKER = 'PhaseE 2026-01-19';
