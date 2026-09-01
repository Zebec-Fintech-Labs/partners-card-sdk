# Zebec Partners Card SDK

The Zebec Card SDK allows developers to integrate the functionality of purchasing and managing Zebec virtual cards into their applications. EVM cards (Ethereum, Binance Smart Chain (BSC), Polygon and Base) are supported directly, and Solana cards can use the companion `@zebec-network/zebec-card-v2-sdk` service.

---

## Installation

Install the Zebec Card SDK via npm:

```bash
npm i @zebec-network/partners-card-sdk
```

---

## Quick Start

To get started, create an instance of `ZebecCardEvmService` for EVM compatible networks. This instance requires a signer, a chain ID (for EVM only), and configuration details, including API credentials.

> **Note**: Testnets (e.g., Sepolia, BSC Testnet) can only be used if `sandbox` mode is enabled.

Example:

For EVM compatible networks:

```typescript
import { ethers } from 'ethers';
import { ZebecCardEvmService, Recipient, CountryCode } from '@zebec-network/partners-card-sdk';

const signer: ethers.Signer = ... ; // Signer instance from Wallet Extension

const chainId = 11155111; // Sepolia testnet
const apiKey = process.env.API_KEY!;
const encryptionKey = process.env.ENCRYPTION_KEY!;

const service = new ZebecCardEvmService(
 signer,
 chainId,
 {
  apiKey,
  encryptionKey,
 },
 {
  sandbox: true, // set true for testing and dev environment
 },
);
```

---

### Fetch Quote

The `fetchQuote` method retrieves a quote for the specified amount in USD. The quote is used to calculate the corresponding token amount required for the card purchase. It expires in about 30 seconds.

> **Note**: The `fetchQuote` method should be called regularly. Make sure to check its validity before proceeding with the purchase.

```typescript
const amount = "150.55"; // Amount in USD
const quote = await service.fetchQuote(amount);
```

For a token that may require a DEX swap, use `fetchQuoteForToken`. The API
returns executable swap data when the token requires DEX routing. This VELO
example assumes `service` was created with a BSC signer and chain ID `56`:

```typescript
const veloAmount = "2000"; // Choose enough input to satisfy the post-fee card minimum.
const veloQuote = await service.fetchQuoteForToken({
	token: "VELO",
	amount: veloAmount,
	type: "EXACT_IN",
	targetCurrency: "USD",
});
```

The `fetchQuote` method returns a quote object with the following fields:

```typescript
export type Quote = {
	id: string;
	quoteType: "EXACT_IN" | "EXACT_OUT";
	inputToken: string;
	outputToken: string;
	inputAmount: number;
	outputAmount: number;
	exchangeRate: number;
	platformFee: number;
	expiresIn: number;
	timestamp: Date;
	token: string;
	targetCurrency: string;
	amountRequested: number;
	pricePerUnitCurrency: number;
	totalPrice: number;
};
```

Token-aware quotes additionally expose `sourceTokenAddress`, `chainName`,
`shouldSwapOnDex`, and `swapQuote.rawQuote` when a DEX execution is required.

---

### Purchase Card

The `purchaseCard` method initiates a virtual card purchase. It performs three main operations:

1. Approves token spending to the ZebecCard smart contract. (ERC20 tokens only)
2. Initiates the direct purchase or swap-and-buy transaction on-chain.
3. Posts the confirmed transaction and quote metadata to the Zebec backend.

The method returns an object containing `receipt` and `orderDetail`.

For EVM compatible networks:

```typescript
const participantId = "JohnChamling";
const firstName = "John";
const lastName = "Chamling";
const emailAddress = "johnchamling@gmail.com";
const mobilePhone = "9876543210";
const language = "en-US";
const city = "Bharatpur";
const state = "Bagmati";
const postalCode = "44200";
const countryCode: CountryCode = "NPL";
const address1 = "Shittal street, Bharatpur - 10, Chitwan";

const amount = "10";
const recipient = Recipient.create(
	participantId,
	firstName,
	lastName,
	emailAddress,
	mobilePhone,
	language,
	city,
	state,
	postalCode,
	countryCode,
	address1,
);

const programWithDetails = await service.fetchZebecCardProgram(countryCode);
if (!programWithDetails.availablePrograms.length) {
	throw new Error("No card program is available for this recipient");
}

const cardProgramId = programWithDetails.availablePrograms[0].id;

const quote = await service.fetchQuote(amount);
console.log("quote:", quote);
const { orderDetail, receipt } = await service.purchaseCard({
	amount,
	cardProgramId,
	recipient,
	quote,
	token: { symbol: "USDC" },
});

console.log("receipt:", receipt.hash);
console.log("order details:", orderDetail);
```

The `purchaseCardWithUsdc` method in `ZebecCardEvmService` returns an object with two properties:

1. **receipt**: Transaction receipt of card purchase.
2. **orderDetail**: Card order details like order id, recipient details, currency, card type, etc.

`purchaseCard()` selects the appropriate direct or DEX swap execution path
from the quote/token metadata. Non-USDC tokens require an EVM contract address
and executable swap data from the API:

```typescript
const { orderDetail, receipt } = await service.purchaseCard({
	amount: veloAmount,
	cardProgramId,
	recipient,
	quote: veloQuote,
	token: {
		symbol: "VELO",
		address: "0xf486ad071f3bee968384d2e39e2d8af0fcf6fd46",
	},
});
```

The swap path approves the source token and calls the existing Card contract's
`swapAndBuy` function. Unsafe receivers, mismatched tokens/chains, missing
routes, and card loads outside the contract limits are rejected before token
approval. The existing `purchaseCardWithUsdc()` API and return shape are unchanged.

Both EVM and Solana purchase methods accept an optional client-generated
`idempotencyKey`. Version 1.1 reserves this parameter for the future
pre-transaction backend intent flow; it is not yet submitted to the card API
and must not currently be treated as an order-deduplication guarantee.

For Solana, construct a `ZebecCardSolanaService` with a configured
`ZebecCardV2Service` and call its `fetchQuote()` and `purchaseCard()` methods;
it selects the appropriate direct or swap execution path from the supplied
token and quote metadata.

---

## Configuration Parameters

### ZebecCardEvmService

To create an instance of `ZebecCardEvmService`, you need:

- **signer**: An instance of `ethers.Signer`.
- **chainId**: The ID of the blockchain (see list of supported chains below).
- **apiConfig**: Object containing `apiKey` and `encryptionKey`.
- **sdkOption (optional)**: SDK-specific settings, such as:
  - `sandbox`: Boolean, set to `true` for testnets.

### EVM Supported Chains

```typescript
/**
 * Supported Chain Ids by SDK
 */
export enum SupportedEvmChain {
	Mainnet = 1,
	Sepolia = 11155111,
	Base = 8453,
	Bsc = 56,
	BscTestnet = 97,
	Polygon = 137,
	PolygonAmoy = 80002,
}
```

---

## Recipient Fields

To create a valid `Recipient` instance, provide the following details:

- **participantId** (alphanumeric string): Unique identifier for the buyer end user. 1-20 chars.
- **firstName** (string): Participant's firstname,
- **lastName** (string): Participant's last name.
- **emailAddress** (string): Contact email. 1-80 chars
- **address1** (string): Street address. (max 50 chars)
- **address2** (string) (optional): Street address. (max 50 chars)
- **city**, **state**, **postalCode** (string): Location details.
- **countryCode** (CountryCode enum): ISO 3166-1 alpha-3 country code.
- **mobilePhone** (string): Mobile number with country code.
- **language** (string): Language code (e.g., `"en-US"`).

---

## Environment Variables

- **API_KEY**: Your Zebec API Key.
- **ENCRYPTION_KEY**: Your Zebec encryption key for secure data handling.

---

## Supported Countries

<https://partner-api.dev.zebec.io/docs/valid-countries.html>
