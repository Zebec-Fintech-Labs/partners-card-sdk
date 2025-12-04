# Zebec Partners Card SDK

The Zebec Card SDK allows developers to integrate the functionality of purchasing and managing Zebec virtual cards into their applications. We currently support EVM chains (Ethereum, Binance Smart Chain (BSC), Polygon and Base).

---

## Installation

Install the Zebec Card SDK via npm:

```bash
npm i @zebec-fintech/partners-card-sdk
```

---

## Quick Start

To get started, create an instance of `ZebecCardEvmService` for EVM compatible networks. This instance requires a signer, a chain ID (for EVM only), and configuration details, including API credentials.

> **Note**: Testnets (e.g., Sepolia, BSC Testnet) can only be used if `sandbox` mode is enabled.

Example:

For EVM compatible networks:

```typescript
import { ethers } from 'ethers';
import { ZebecCardService, Recipient, CountryCode } from '@zebec-fintech/silver-card-sdk';

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

Note: The `fetchQuote` method should be called regularly. Make sure to check it's validity before proceeding with the purchase.

```typescript
const amount = "150.55"; // Amount in USD
const quote = await service.fetchQuote(amount);
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

---

### Purchase Card

The `purchaseCard` method initiates a virtual card purchase. It performs four main operations:

1. Approves token spending to the ZebecCard smart contract. (ERC20 tokens only)
2. Deposits tokens into the user's Zebec vault.
3. Initiates the card purchase on-chain. (ERC20 tokens only)
4. Posts transaction data, along with metadata, to the Zebec backend.

The method returns a tuple with responses from each stage of the process.

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
assert(programWithDetails.availablePrograms.length);

const cardProgramId = programWithDetails.availablePrograms[0].id;

const quote = await service.fetchQuote(amount);
console.log("quote:", quote);
const { orderDetails, receipt } = await service.purchaseCardWithUsdc({
 amount,
 cardProgramId,
 recipient,
 quote,
});

console.log("receipt:", receipt.hash);
console.log("order details:", orderDetails);
```

The `purchaseCardWithUsdc` method in ZebecCardEvmService returns an object reponse with two properties:

1. **receipt**: Transaction receipt of card purchase.
2. **orderDetails**: Card order details like order id, recipient details, currency, card type, etc.

---

## Configuration Parameters

### ZebecCardEvmService

To create an instance of `ZebecCardService`, you need:

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
