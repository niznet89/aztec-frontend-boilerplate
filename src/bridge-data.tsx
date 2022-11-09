import React, { createContext, useContext, useEffect, useState } from "react";
import {
  DataProviderWrapper,
  BridgeData,
} from "@aztec/bridge-clients/client-dest/src/client/aztec/data-provider/DataProvider";
import { EthAddress, JsonRpcProvider } from "@aztec/sdk";

export async function fetchBridgeData() {
  const provider = new JsonRpcProvider(
    "https://aztec-connect-testnet-eth-host.aztec.network:8545"
  );
  const testnetAddress = EthAddress.fromString(
    "0x614957a8aE7B87f18fa3f207b6619C520A022b4F"
  );
  const dataProvider = DataProviderWrapper.create(
    provider,
    testnetAddress as any
  );
  console.log(dataProvider)
  const bridges = await dataProvider.getBridges();
  return bridges;
}

type BridgeDataByName = Record<string, BridgeData>;

interface BridgeDataContextValue {
  bridges: BridgeDataByName | null;
}

const BridgeDataContext = createContext<BridgeDataContextValue>({
  bridges: null,
});

export function BridgeDataProvider(props: { children: React.ReactNode }) {
  const [bridges, setBridges] = useState<BridgeDataByName | null>(null);
  useEffect(() => {
    fetchBridgeData().then(setBridges);
  }, []);
  return (
    <BridgeDataContext.Provider value={{ bridges }}>
      {props.children}
    </BridgeDataContext.Provider>
  );
}

export function useBridgeData() {
  return useContext(BridgeDataContext).bridges;
}
