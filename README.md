# Stellar Testnet Payment dApp — Level 1 (White Belt)

A minimal Stellar dApp for connecting Freighter, viewing your XLM testnet balance, and sending a testnet payment.

## Features
- Connect / disconnect Freighter wallet
- Detects and warns if Freighter is not set to Testnet
- Fetches and displays XLM balance from Horizon testnet
- Sends an XLM payment to any valid Stellar address
- Shows success/failure feedback with the transaction hash, linked to Stellar Expert (testnet)
- Basic error handling: missing wallet, wrong network, invalid address, invalid amount, failed submission

## Tech stack
- React + Vite
- `@stellar/freighter-api`
- `@stellar/stellar-sdk` (Horizon testnet)

## Run locally

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually http://localhost:5173).

## Before testing
1. Install the [Freighter wallet extension](https://www.freighter.app/).
2. In Freighter, switch the network to **Test Net** (Settings → Network).
3. Fund your address using [Friendbot](https://laboratory.stellar.org/#account-creator?network=test) or:
   ```
   https://friendbot.stellar.org?addr=YOUR_PUBLIC_KEY
   ```
4. Reload the app, click **Connect Freighter**, approve the request.

## Deploy (for submission)
1. Push this project to a public GitHub repository.
2. Deploy on [Vercel](https://vercel.com) or [Netlify](https://netlify.com):
   - Framework preset: Vite
   - Build command: `npm run build`
   - Output directory: `dist`
3. Confirm on the live URL: connect wallet → balance shows → send a small testnet payment → see confirmation + tx hash.

## Notes
- This app only works on **Stellar Testnet**. Do not send real (mainnet) XLM to it.
- All signing happens in Freighter — this app never touches your secret key.
