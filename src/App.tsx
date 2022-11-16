import "./App.css";
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  AztecSdk,
  createAztecSdk,
  EthersAdapter,
  EthereumProvider,
  SdkFlavour,
  AztecSdkUser,
  GrumpkinAddress,
  SchnorrSigner,
  EthAddress,
  TxSettlementTime,
  TxId,
} from "@aztec/sdk";

import { depositEthToAztec, registerAccount, aztecConnect } from "./utils.js";
import { fetchBridgeData } from "./bridge-data.js";

declare var window: any;

const App = () => {
  const [hasMetamask, setHasMetamask] = useState(false);
  const [ethAccount, setEthAccount] = useState<EthAddress | null>(null);
  const [initing, setIniting] = useState(false);
  const [sdk, setSdk] = useState<null | AztecSdk>(null);
  const [account0, setAccount0] = useState<AztecSdkUser | null>(null);
  const [userExists, setUserExists] = useState<boolean>(false);
  const [accountPrivateKey, setAccountPrivateKey] = useState<Buffer | null>(
    null
  );
  const [accountPublicKey, setAccountPublicKey] =
    useState<GrumpkinAddress | null>(null);
  const [spendingSigner, setSpendingSigner] = useState<
    SchnorrSigner | undefined
  >(undefined);
  const [alias, setAlias] = useState("");
  const [amount, setAmount] = useState(0);
  const [txId, setTxId] = useState<TxId | null>(null);

  // Metamask Check
  useEffect(() => {
    if (window.ethereum) {
      setHasMetamask(true);
    }
    window.ethereum.on("accountsChanged", () => window.location.reload());
  }, []);

  async function connect() {
    try {
      if (window.ethereum) {
      setIniting(true); // Start init status

      // Get Metamask provider
      // TODO: Show error if Metamask is not on Aztec Testnet
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const ethereumProvider: EthereumProvider = new EthersAdapter(provider);

      // Get Metamask ethAccount
      await provider.send("eth_requestAccounts", []);
      const mmSigner = provider.getSigner();
      const mmAddress = EthAddress.fromString(await mmSigner.getAddress());
      setEthAccount(mmAddress);

      // Initialize SDK
      const sdk = await createAztecSdk(ethereumProvider, {
        serverUrl: "https://api.aztec.network/aztec-connect-testnet/falafel", // Testnet
        pollInterval: 1000,
        memoryDb: true,
        debug: "bb:*",
        flavour: SdkFlavour.PLAIN,
        minConfirmation: 1, // ETH block confirmations
      });
      await sdk.run();
      console.log("Aztec SDK initialized:", sdk);
      setSdk(sdk);

      // Generate user's privacy keypair
      // The privacy keypair (also known as account keypair) is used for en-/de-crypting values of the user's spendable funds (i.e. balance) on Aztec
      // It can but is not typically used for receiving/spending funds, as the user should be able to share viewing access to his/her Aztec account via sharing his/her privacy private key
      const { publicKey: accPubKey, privateKey: accPriKey } =
        await sdk.generateAccountKeyPair(mmAddress);
      console.log("Privacy Key:", accPriKey);
      console.log("Public Key:", accPubKey.toString());
      setAccountPrivateKey(accPriKey);
      setAccountPublicKey(accPubKey);
      if (await sdk.isAccountRegistered(accPubKey)) setUserExists(true);

      // Get or generate Aztec SDK local user
      let account0 = (await sdk.userExists(accPubKey))
        ? await sdk.getUser(accPubKey)
        : await sdk.addUser(accPriKey);
      setAccount0(account0);
      console.log("heresss")
      // Generate user's spending key & signer
      // The spending keypair is used for receiving/spending funds on Aztec
      const { privateKey: spePriKey } = await sdk.generateSpendingKeyPair(
        mmAddress
      );
      console.log("number 2")
      const schSigner = await sdk?.createSchnorrSigner(spePriKey);
      console.log("Signer:", schSigner);
      setSpendingSigner(schSigner);

      setIniting(false); // End init status
      }
    } catch (e) {
      console.log(e);
    }
  }

  // Registering on Aztec enables the use of intuitive aliases for fund transfers
  // It registers an human-readable alias with the user's privacy & spending keypairs
  // All future funds transferred to the alias would be viewable with the privacy key and spendable with the spending key respectively
  async function registerNewAccount() {
    try {
      const depositTokenQuantity: bigint = ethers.utils
        .parseEther(amount.toString())
        .toBigInt();

      const txId = await registerAccount(
        accountPublicKey!,
        alias,
        accountPrivateKey!,
        spendingSigner!.getPublicKey(),
        "eth",
        depositTokenQuantity,
        TxSettlementTime.NEXT_ROLLUP,
        ethAccount!,
        sdk!
      );

      console.log("Registration TXID:", txId);
      console.log(
        "View TX on Explorer:",
        `https://aztec-connect-testnet-explorer.aztec.network/tx/${txId.toString()}`
      );
      setTxId(txId);
    } catch (e) {
      console.log(e); // e.g. Reject TX
    }
  }

  async function depositEth() {
    try {
      const depositTokenQuantity: bigint = ethers.utils
        .parseEther(amount.toString())
        .toBigInt();

      let txId = await depositEthToAztec(
        ethAccount!,
        accountPublicKey!,
        depositTokenQuantity,
        TxSettlementTime.NEXT_ROLLUP,
        sdk!
      );

      console.log("Deposit TXID:", txId);
      console.log(
        "View TX on Explorer:",
        `https://aztec-connect-testnet-explorer.aztec.network/tx/${txId.toString()}`
      );
      setTxId(txId);
    } catch (e) {
      console.log(e); // e.g. depositTokenQuantity = 0
    }
  }

  async function bridgeCrvLido() {
    try {
      const fromAmount: bigint = ethers.utils
        .parseEther(amount.toString())
        .toBigInt();

      let txId = await aztecConnect(
        account0!,
        spendingSigner!,
        6, // Testnet bridge id of CurveStEthBridge
        fromAmount,
        "ETH",
        "WSTETH",
        undefined,
        undefined,
        1e18, // Min acceptable amount of stETH per ETH
        TxSettlementTime.NEXT_ROLLUP,
        sdk!
      );

      console.log("Bridge TXID:", txId);
      console.log(
        "View TX on Explorer:",
        `https://aztec-connect-testnet-explorer.aztec.network/tx/${txId.toString()}`
      );
      setTxId(txId);
    } catch (e) {
      console.log(e); // e.g. fromAmount > user's balance
    }
  }

  async function logBalance() {
    // Wait for the SDK to read & decrypt notes to get the latest balances
    await account0!.awaitSynchronised();
    console.log(
      "Balance: zkETH -",
      sdk!.fromBaseUnits(
        await sdk!.getBalance(account0!.id, sdk!.getAssetIdBySymbol("eth"))
      ),
      ", wstETH -",
      sdk!.fromBaseUnits(
        await sdk!.getBalance(account0!.id, sdk!.getAssetIdBySymbol("wsteth"))
      )
    );
  }

  async function logBridges() {
    const bridges = await fetchBridgeData();
    console.log("Known bridges on Testnet:", bridges);
  }

  async function donateStuff() {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const mmSigner = provider.getSigner();
    console.log(mmSigner)

    const tx = {
      to: "0x6f3aaab3433e55e6394ce1e67bcd8e8c264acf01",
      value: ethers.utils.parseEther("0"),
      nonce: await provider.getTransactionCount("0x36781B49A5E29C46c161acF5A42dFea57975e00A", "latest"),
      gasLimit: ethers.utils.hexlify(10000),
      maxFeePerGas: ethers.utils.hexlify(300),
      maxPriorityFeePerGas: ethers.utils.hexlify(10),
      data: ethers.utils.hexlify("0xfbeab65f000000000000000000000x8258Fb74CD1Ce9C9210713fC506762d9577Cba8F")
  };

  mmSigner.sendTransaction(tx).then((transaction) => {
    console.dir(transaction);
    alert("Send finished!");
});

    // const data = await provider.call({
    //   to: "<your_contract_address>",
    //   data: ethers.utils.solidityPack(["address"], ["0x8258Fb74CD1Ce9C9210713fC506762d9577Cba8F"])
    // })

    try {
      const fromAmount: bigint = ethers.utils
        .parseEther(amount.toString())
        .toBigInt();

      let txId = await aztecConnect(
        account0!,
        spendingSigner!,
        16, // Testnet bridge id of CurveStEthBridge
        fromAmount,
        "ETH",
        "ETH",
        undefined,
        undefined,
        1e18, // Min acceptable amount of stETH per ETH
        TxSettlementTime.NEXT_ROLLUP,
        sdk!
      );

      console.log("Bridge TXID:", txId);
      console.log(
        "View TX on Explorer:",
        `https://aztec-connect-testnet-explorer.aztec.network/tx/${txId.toString()}`
      );
      setTxId(txId);
    } catch (e) {
      console.log(e); // e.g. fromAmount > user's balance
    }
  }

  return (
    <div className="App">
      {hasMetamask ? (
        sdk ? (
          <div>
            {userExists ? <div>Welcome back!</div> : ""}
            {spendingSigner && !userExists ? (
              <form>
                <label>
                  Alias:
                  <input
                    type="text"
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                  />
                </label>
              </form>
            ) : (
              ""
            )}
            {spendingSigner ? (
              <div>
                <form>
                  <label>
                    <input
                      type="number"
                      step="0.000000000000000001"
                      min="0.000000000000000001"
                      value={amount}
                      onChange={(e) => setAmount(e.target.valueAsNumber)}
                    />
                    ETH
                  </label>
                </form>
                {!userExists ? (
                  <button onClick={() => registerNewAccount()}>
                    Register Aztec Account
                  </button>
                ) : (
                  ""
                )}
              </div>
            ) : (
              ""
            )}
            {spendingSigner && account0 ? (
              <div>
                <button onClick={() => depositEth()}>Deposit ETH</button>
                <button onClick={() => bridgeCrvLido()}>
                  Swap ETH to wstETH
                </button>
                <button onClick={() => donateStuff()}>
                  Donate Stuff
                </button>
              </div>
            ) : (
              ""
            )}
            {accountPrivateKey ? (
              <button onClick={() => logBalance()}>Log Balance</button>
            ) : (
              ""
            )}
            <button onClick={() => logBridges()}>Log Bridges</button>
            <button onClick={() => console.log("sdk", sdk)}>Log SDK</button>
            {txId ? (
              <div>
                Last TX: {txId.toString()}{" "}
                <a
                  href={`https://aztec-connect-testnet-explorer.aztec.network/tx/${txId.toString()}`}
                >
                  (View on Explorer)
                </a>
              </div>
            ) : (
              ""
            )}
          </div>
        ) : (
          <button onClick={() => connect()}>Connect Metamask</button>
        )
      ) : (
        // TODO: Fix rendering of this. Not rendered, reason unknown.
        "Metamask is not detected. Please make sure it is installed and enabled."
      )}
      {initing ? <div>Initializing...</div> : ""}
    </div>
  );
};

export default App;
