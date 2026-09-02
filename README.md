# Zebec Partners Card SDK

The Zebec Partners Card SDK lets partners quote and purchase Zebec virtual
cards. It supports Ethereum, BNB Smart Chain, Polygon, and Base through
`ZebecCardEvmService`. Solana integrations use `ZebecCardSolanaService` with
the companion `@zebec-network/zebec-card-v2-sdk`.

## Installation

Install the Zebec Card SDK via npm:

```bash
npm i @zebec-network/partners-card-sdk
```

## Quick Start

Create a `ZebecCardEvmService` with an ethers signer, a supported chain ID,
and the Partner API credentials supplied by Zebec. The credentials remain
constructor parameters for compatibility with integrations using the built-in
legacy API client.

> **Note**: Testnets (e.g., Sepolia, BSC Testnet) can only be used if `sandbox` mode is enabled.

```typescript
import { ethers } from "ethers";
import {
	CountryCode,
	Recipient,
	ZebecCardEvmService,
} from "@zebec-network/partners-card-sdk";

const signer: ethers.Signer = ...;

const chainId = 56; // BNB Smart Chain
const apiKey = process.env.API_KEY!;
const encryptionKey = process.env.ENCRYPTION_KEY!;

const legacyService = new ZebecCardEvmService(signer, chainId, {
	apiKey,
	encryptionKey,
});
```

## Authentication

The SDK does not perform end-user login, OTP verification, OAuth, or an
access-token exchange. Its built-in legacy API client uses `apiKey` to
identify the partner and `encryptionKey` to sign requests and encrypt order
data. Do not commit either credential or expose them in browser-delivered
source code.

Partner API environments:

- Production: `https://api.superapp.zebec.io`
- Sandbox: `https://dev-super.api.zebec.io`

If your application uses the current Partner v1 top-up API, keep its OTP,
delegated token, quote, preflight, and receipt-submission calls in your API
client. Pass a `purchaseApiAdapter` to connect those calls to the SDK's
on-chain purchase workflow without adding authentication state to the SDK:

```typescript
const service = new ZebecCardEvmService(
	signer,
	56,
	{ apiKey, encryptionKey },
	{
		purchaseApiAdapter: {
			ping: () => partnerApi.healthCheck(),
			fetchZebecCardPrograms: (countryCode) => partnerApi.getCardPrograms(countryCode),
			purchaseCard: (orderRequest) => partnerApi.submitConfirmedPurchase(orderRequest),
		},
	},
);
```

The adapter methods above belong to your Partner API client; their HTTP
authentication is deliberately outside this package. Use this adapter for the
current Partner v1 API. Existing integrations can omit `purchaseApiAdapter`
only when their deployment still supports the SDK's legacy API routes and
authentication format. The current Super App hosts do not expose those legacy
`/orders/*` routes.

## Fetch Quote

`fetchQuote` and `fetchQuoteForToken` use the SDK's legacy built-in API client.
Call them shortly before purchasing only when your deployment supports those
legacy routes. The SDK validates the returned quote amount, currency, and
expiry before submitting a transaction.

```typescript
const amount = "25";
const quote = await legacyService.fetchQuote(amount);
```

For a non-USDC token, use `fetchQuoteForToken`. `EXACT_IN` means `amount` is
the quantity of the input token. The API returns executable swap data when DEX
routing is required.

```typescript
const veloAmount = "<input-token-amount>";
const veloQuote = await legacyService.fetchQuoteForToken({
	token: "VELO",
	amount: veloAmount,
	type: "EXACT_IN",
	targetCurrency: "USD",
});
```

Token-aware quotes include chain and payment metadata. When a swap is needed,
`swapQuote.rawQuote` contains the executable route consumed by `purchaseCard`.
For the current Partner v1 API, obtain the quote through your external Partner
API client and pass it unchanged to `purchaseCard`; do not call the legacy
quote methods shown above.

## Purchase Card

The `purchaseCard` method initiates a virtual card purchase. It performs three main operations:

1. Approves token spending to the ZebecCard smart contract. (ERC20 tokens only)
2. Initiates the direct purchase or swap-and-buy transaction on-chain.
3. Posts the confirmed transaction and quote metadata to the Zebec backend.

The method returns an object containing `receipt` and `orderDetail`.

For EVM compatible networks:

```typescript
const participantId = "customer123";
const firstName = "Sample";
const lastName = "Customer";
const emailAddress = "customer@example.com";
const mobilePhone = "+15555550100";
const language = "en-US";
const city = "San Francisco";
const state = "CA";
const postalCode = "94105";
const countryCode: CountryCode = "USA";
const address1 = "123 Market Street";

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

// Current Partner v1 quote and preflight are performed by your API client.
const amount = "25";
const sourceChain = "BINANCE";
const sourceTokenMint = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const quote = await partnerApi.getTopupQuote({
	amount,
	currencyCode: "USD",
	sourceChain,
	sourceTokenMint,
});
await partnerApi.preflightTopup({ quoteId: quote.id, cardProgramId });
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

For Solana, construct `ZebecCardSolanaService` with a configured
`ZebecCardV2Service`, then use the same `fetchQuote()` and `purchaseCard()`
workflow.

## Configuration Parameters

### ZebecCardEvmService

To create an instance of `ZebecCardEvmService`, you need:

- **signer**: An instance of `ethers.Signer`.
- **chainId**: The ID of the blockchain (see list of supported chains below).
- **apiConfig**: Object containing `apiKey` and `encryptionKey`.
- **sdkOption (optional)**: SDK settings. Set `sandbox: true` for testnets.
- **purchaseApiAdapter**: Required for the current Partner v1 API; optional only for legacy-compatible API deployments.

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

## Recipient Fields

To create a valid `Recipient` instance, provide the following details:

- **participantId** (alphanumeric string): Unique identifier for the buyer end user. 1-20 chars.
- **firstName** (string): Participant's first name.
- **lastName** (string): Participant's last name.
- **emailAddress** (string): Contact email. 1-80 chars
- **address1** (string): Street address. (max 50 chars)
- **address2** (string) (optional): Street address. (max 50 chars)
- **city**, **state**, **postalCode** (string): Location details.
- **countryCode** (CountryCode enum): ISO 3166-1 alpha-3 country code.
- **mobilePhone** (string): Mobile number with country code.
- **language** (string): Language code (e.g., `"en-US"`).

## Environment Variables

- **API_KEY**: Your Zebec API Key.
- **ENCRYPTION_KEY**: Your Zebec encryption key for secure data handling.

---

## Partner API Reference

Use the sandbox Swagger UI at
<https://dev-super.api.zebec.io/api/partner> for Partner v1 authentication,
program, quote, preflight, submission, and status schemas.
