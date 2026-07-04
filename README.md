# 🚄 Disaster Relief Rail — Transparent Aid Disbursement

Disaster Relief Rail is a direct, transparent aid disbursement dApp built on the **Stellar Soroban testnet**. It enables relief organizations to pool donor contributions in a transparent smart contract and disburse aid directly to verified recipient wallets, providing public cryptographic auditability.

---

## 🌍 The Vision

Traditional disaster relief is often plagued by high administrative overhead, delays, and a lack of visibility, meaning donor funds can disappear into opaque accounts before reaching victims. 

**Disaster Relief Rail** solves this by establishing a direct line between donors, organizations, and recipients. By utilizing a Soroban smart contract as the custody engine, aid disbursements are:
1. **Direct**: Bypasses banking intermediaries and middlemen.
2. **Transparent**: Every donation, recipient registration, and disbursement is recorded on-chain.
3. **Auditable**: A public feed of disbursements allows anyone to verify that aid funds reached verified victims.

---

## 🧬 Project Evolution: Level 1 to Level 2

- **Level 1 (Direct Payments)**: A basic wallet-to-wallet payment interface where the relief organization connected their wallet and made direct payments to victims. This proved the feasibility of direct aid but lacked pooling mechanics and structured recipient auditing.
- **Level 2 (Contract-Managed Fund)**: Introduces the `ReliefFund` smart contract. Donors deposit funds directly into the contract. The organization's admin registers verified recipient wallets and authorizes disbursements from the pooled contract funds, emitting on-chain events for public transparency.

---

## 📋 On-Chain Configuration (Testnet)

| Component | Identifier / Link |
|-----------|------------------|
| **ReliefFund Contract** | `CDP64LN3FJDEU5TSICSG2MRRXXNCRB6KGJX7OKWHZTEFF3HCTGPAEWOT` |
| **Admin Organization** | `GAGQNYTIAVTZP6U3GOW3TUZ344UFOEKNZGRC6E2TWZ22PGAPL56Y3WRT` |
| **Native XLM SAC** | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| **Stellar Expert URL** | [View ReliefFund Contract on Stellar Expert](https://stellar.expert/explorer/testnet/contract/CDP64LN3FJDEU5TSICSG2MRRXXNCRB6KGJX7OKWHZTEFF3HCTGPAEWOT) |

---

## 🛠️ Setup & Execution

### Prerequisites
- **Rust 1.96+** with `wasm32-unknown-unknown` target.
- **Stellar CLI v27+** (for contract interaction and deployment).
- **Node.js 24+** and **npm 11+**.
- **Freighter Wallet** or **xBull Wallet** browser extensions.

### 1. Build and Test Smart Contract
Navigate to the root workspace directory and run:
```bash
# Run contract unit tests
cargo test

# Build WASM target for deployment
cargo build --target wasm32-unknown-unknown --release

# Optimize WASM size for Soroban (reduces binary size to ~9.4KB)
stellar contract optimize --wasm target/wasm32-unknown-unknown/release/relief_fund.wasm
```

### 2. Deploy and Initialize Contract
```bash
# Deploy to Testnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/relief_fund.optimized.wasm \
  --source-account deployer \
  --network testnet

# Initialize contract (sets admin key and native XLM token address)
stellar contract invoke \
  --id CDP64LN3FJDEU5TSICSG2MRRXXNCRB6KGJX7OKWHZTEFF3HCTGPAEWOT \
  --source-account deployer \
  --network testnet \
  -- \
  init \
  --admin $(stellar keys address deployer) \
  --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

### 3. Run Frontend Dashboard
Navigate to the `frontend` folder:
```bash
# Install dependencies
npm install

# Run Vite dev server locally
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🚨 Error Testing Guide

The UI is built to handle and display error states gracefully. Here is how to trigger and test the 3 core error conditions:

### 1. Wallet Not Found
- **How to test**: Disable or uninstall both Freighter and xBull extensions in your browser.
- **Action**: Click the **Connect Wallet** button on the top right.
- **Result**: An error alert appears at the top: *"Wallet extension not found. Please install Freighter or xBull."*

### 2. User Rejected Action
- **How to test**: Ensure your wallet extension is connected.
- **Action**: Try to submit a **Donation** or **Disbursement** transaction. When the Freighter/xBull pop-up window opens, click **Cancel** or **Reject**.
- **Result**: The transaction progress modal shows a failed state stating: *"Action cancelled — you rejected the request in your wallet."*

### 3. Insufficient Balance (Two Scenarios)
- **Donor Wallet Balance**:
  - **How to test**: Check your connected wallet balance (e.g. 10 XLM).
  - **Action**: Input a donation amount greater than your balance (e.g. 50 XLM) and click **Donate**.
  - **Result**: The transaction modal immediately aborts and displays: *"Your wallet has insufficient balance to cover this donation."*
- **Relief Fund Contract Balance**:
  - **How to test**: Check the active Relief Fund Balance on the dashboard.
  - **Action**: As the Admin, try to disburse an amount greater than the Relief Fund Balance.
  - **Result**: The transaction modal aborts and displays: *"The Relief Fund does not have enough balance to fulfill this disbursement."*

---

## 📸 Screenshots

### 1. Available Wallets Connection Modal (Freighter & xBull)
![Available Wallets](wallet-connection-button.png)

### 2. Wallet Connected & Balance Dashboard View
![Wallet Connected and Balance](wallet-connected.png)
