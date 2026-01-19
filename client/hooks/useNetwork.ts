import { useState, useEffect } from "react";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  isOffline: boolean;
}

export function useNetwork(): NetworkState {
  const [state, setState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: true,
    isOffline: false,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState: NetInfoState) => {
      const isConnected = netState.isConnected ?? true;
      const isInternetReachable = netState.isInternetReachable;
      const isOffline = !isConnected || isInternetReachable === false;
      
      setState({
        isConnected,
        isInternetReachable,
        isOffline,
      });
    });

    NetInfo.fetch().then((netState: NetInfoState) => {
      const isConnected = netState.isConnected ?? true;
      const isInternetReachable = netState.isInternetReachable;
      const isOffline = !isConnected || isInternetReachable === false;
      
      setState({
        isConnected,
        isInternetReachable,
        isOffline,
      });
    });

    return () => unsubscribe();
  }, []);

  return state;
}
