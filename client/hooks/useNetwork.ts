import { useState, useEffect } from "react";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

interface NetworkState {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  isOffline: boolean | null;
}

export function useNetwork(): NetworkState {
  const [state, setState] = useState<NetworkState>({
    isConnected: null,
    isInternetReachable: null,
    isOffline: null,
  });

  useEffect(() => {
    const applyState = (netState: NetInfoState) => {
      const isConnected = netState.isConnected;
      const isInternetReachable = netState.isInternetReachable;
      const isOffline =
        isConnected === false || isInternetReachable === false ? true
        : isConnected === true && isInternetReachable !== false ? false
        : null;
      setState({ isConnected, isInternetReachable, isOffline });
    };

    const unsubscribe = NetInfo.addEventListener(applyState);
    NetInfo.fetch().then(applyState);

    return () => unsubscribe();
  }, []);

  return state;
}
