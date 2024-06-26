import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-ethers";
import { config as dotenvConfig } from "dotenv";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "hardhat-storage-layout";
import type { HardhatUserConfig } from "hardhat/config";
import type { NetworkUserConfig } from "hardhat/types";
import { resolve } from "path";

import chainAccounts from "./accounts.json";

dotenvConfig({ path: resolve(__dirname, "./.env") });

const infuraApiKey: string | undefined = process.env.INFURA_API_KEY;
if (!infuraApiKey) {
  throw new Error("Please set your INFURA_API_KEY in a .env file");
}

if (!chainAccounts) {
  throw new Error("Please setup accounts.json by running `cp sample.accounts.json accounts.json`");
}

export const chainIds = {
  local: 1337,
  mainnet: 1,
  "polygon-mainnet": 137,
  "polygon-mumbai": 80001,
  goerli: 5,
  sepolia: 11155111,
  arbitrum: 42161,
  "arbitrum-goerli": 421613,
  optimism: 10,
  "optimism-goerli": 420,
  base: 8453,
  "base-goerli": 84531,
  "base-sepolia": 84532,
  zora: 7777777,
  "zora-goerli": 999,
};

function getChainConfig(chain: keyof typeof chainIds): NetworkUserConfig {
  return {
    accounts: [chainAccounts.hl || chainAccounts["hl-local"]],
    chainId: chainIds[chain],
    url: getUrl(chain),
  };
}

export function getUrl(chain: keyof typeof chainIds): string {
  if (chain === "arbitrum") {
    return "https://arb1.arbitrum.io/rpc";
  } else if (chain === "arbitrum-goerli") {
    return "https://arbitrum-goerli-rpc.publicnode.com";
  } else if (chain === "optimism") {
    return "https://optimism.llamarpc.com";
  } else if (chain === "optimism-goerli") {
    return "https://optimism-goerli-rpc.publicnode.com";
  } else if (chain === "base") {
    return "https://mainnet.base.org";
  } else if (chain === "base-goerli") {
    return "https://base-goerli.public.blastapi.io";
  } else if (chain === "zora") {
    return "https://rpc.zora.co";
  } else if (chain === "zora-goerli") {
    return "https://testnet.rpc.zora.co";
  } else if (chain === "polygon-mainnet") {
    return "https://polygon-rpc.com/";
  } else if (chain === "base-sepolia") {
    return "https://base-sepolia.blockpi.network/v1/rpc/public	";
  } else {
    return "https://" + chain + ".infura.io/v3/" + infuraApiKey;
  }
}

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      polygon: process.env.POLYGONSCAN_API_KEY || "",
      polygonMumbai: process.env.POLYGONSCAN_API_KEY || "",
      goerli: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      optimisticEthereum: process.env.OPTIMISMSCAN_API_KEY || "",
      arbitrumOne: process.env.ARBITRUMSCAN_API_KEY || "",
      "optimism-goerli": process.env.OPTIMISMSCAN_API_KEY || "",
      "arbitrum-goerli": process.env.ARBITRUMSCAN_API_KEY || "",
      base: process.env.BASESCAN_API_KEY || "",
      "base-goerli": process.env.BASESCAN_API_KEY || "",
      "base-sepolia": process.env.BASESCAN_API_KEY || "",
      zora: process.env.ZORASCAN_API_KEY || "",
      "zora-goerli": process.env.ZORASCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "base-goerli",
        chainId: 84531,
        urls: {
          apiURL: "https://api-goerli.basescan.org/api",
          browserURL: "https://goerli.basescan.org",
        },
      },
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia-explorer.base.org/",
        },
      },
      {
        network: "optimism-goerli",
        chainId: 420,
        urls: {
          apiURL: "https://api-goerli-optimistic.etherscan.io/api",
          browserURL: "https://goerli-optimism.etherscan.io/",
        },
      },
      {
        network: "arbitrum-goerli",
        chainId: 421613,
        urls: {
          apiURL: "https://api-goerli.arbiscan.io/api",
          browserURL: "https://goerli.arbiscan.io/",
        },
      },
      {
        network: "zora",
        chainId: 7777777,
        urls: {
          apiURL: "https://explorer.zora.energy/api",
          browserURL: "https://explorer.zora.energy",
        },
      },
      {
        network: "zora-goerli",
        chainId: 999,
        urls: {
          apiURL: "https://testnet.explorer.zora.energy/api",
          browserURL: "https://testnet.explorer.zora.co",
        },
      },
    ],
  },
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
    src: "./contracts",
  },
  networks: {
    hardhat: {
      chainId: chainIds.local,
      loggingEnabled: process.env.LOGGING_ENABLED === "true",
      mining: {
        auto: process.env.AUTO_MINING_ON === "true",
        interval: 1,
      },
    },
    mainnet: getChainConfig("mainnet"),
    goerli: getChainConfig("goerli"),
    sepolia: getChainConfig("sepolia"),
    "polygon-mainnet": getChainConfig("polygon-mainnet"),
    "polygon-mumbai": getChainConfig("polygon-mumbai"),
    arbitrum: getChainConfig("arbitrum"),
    "arbitrum-goerli": getChainConfig("arbitrum-goerli"),
    optimism: getChainConfig("optimism"),
    "optimism-goerli": getChainConfig("optimism-goerli"),
    base: getChainConfig("base"),
    "base-goerli": getChainConfig("base-goerli"),
    "base-sepolia": getChainConfig("base-sepolia"),
    zora: getChainConfig("zora"),
    "zora-goerli": getChainConfig("zora-goerli"),
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.8.10",
    settings: {
      metadata: {
        // Not including the metadata hash
        // https://github.com/paulrberg/hardhat-template/issues/31
        bytecodeHash: "none",
      },
      // Disable the optimizer when debugging
      // https://hardhat.org/hardhat-network/#solidity-optimizer-support
      optimizer: {
        enabled: true,
        runs: 1,
      },
      outputSelection: { "*": { "*": ["storageLayout"] } },
    },
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
  contractSizer: {
    runOnCompile: true,
  },
};

export default config;
