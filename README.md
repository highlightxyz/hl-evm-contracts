# hl-evm-contracts

Highlight v1 Protocol. Protocol documentation incoming.

### Private keys

accounts.json, can name accounts and keys

Run

```
cp sample.accounts.json accounts.json
```

and then when running tasks, simply change the signer, with --signer <name of signing account>

# Setup

```
cp .sample.env .env
```

fill in Infura API keys

```
yarn install
```

# Boot up local network

Run

```
yarn local
```

# Deploy system

Run

```
npx hardhat --network <network> deploy:default
```

# Copy Types and ABI's

### Copy All

```shell
task copy-all
```

### Copy ABI's

```shell
task copy-abis
```

### Copy Types

```shell
task copy-types
```

# Acknowledgements

| Protocol Authors    |
| ------------------- |
| ishan@highlight.xyz |
| sarib@highlight.xyz |
