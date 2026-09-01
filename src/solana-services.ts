import crypto from "crypto";

import { InvalidEmailError, SwapQuoteUnavailableError } from "./errors";
import { ZebecCardAPIService } from "./services";
import {
	CardProgramWithUserRegion,
	CardToken,
	CountryCode,
	Deposit,
	FetchQuoteParams,
	Money,
	Order,
	OrderCardRequest,
	OrderWithExtraInfo,
	Quote,
	Receipt,
	Recipient,
} from "./types";
import { isEmailValid } from "./utils";

/** Options for the Solana card service. */
export type SolanaCardServiceOptions = {
	sandbox?: boolean;
	network?: "mainnet-beta" | "devnet";
};

/** Minimal structural interface so the companion Solana SDK stays optional. */
export type SolanaCardService = {
	provider: {
		publicKey?: { toBase58(): string };
		wallet?: { publicKey?: { toBase58(): string } };
	};
	getNextCardIndex(): Promise<bigint>;
	createSilverCard(
		params: Record<string, unknown>,
	): Promise<{ execute(options?: unknown): Promise<string> }>;
	loadCarbonCard(
		params: Record<string, unknown>,
	): Promise<{ execute(options?: unknown): Promise<string> }>;
	swapAndCreateSilverCard(
		params: Record<string, unknown>,
	): Promise<{ execute(options?: unknown): Promise<string> }>;
	swapAndLoadCarbonCard(
		params: Record<string, unknown>,
	): Promise<{ execute(options?: unknown): Promise<string> }>;
};

/**
 * Partner card service for Solana. The service owns the direct-vs-swap
 * decision, while the v2 card SDK remains responsible for wallet signing and
 * transaction construction.
 */
export class ZebecCardSolanaService {
	private readonly apiService: ZebecCardAPIService;
	readonly network: "mainnet-beta" | "devnet";

	constructor(
		readonly cardService: SolanaCardService,
		apiConfig: { apiKey: string; encryptionKey: string },
		options?: SolanaCardServiceOptions,
	) {
		this.network = options?.network || (options?.sandbox ? "devnet" : "mainnet-beta");
		this.apiService = new ZebecCardAPIService(apiConfig, options?.sandbox);
	}

	async fetchQuote(params: Omit<FetchQuoteParams, "symbol"> & { token: string }) {
		return this.apiService.fetchQuote({
			symbol: params.token,
			amount: params.amount,
			type: params.type,
			targetCurrency: params.targetCurrency,
			chainName: params.chainName || "SOLANA",
			platform: params.platform,
			slippage: params.slippage,
		});
	}

	async fetchZebecCardProgram(countryCode: CountryCode): Promise<CardProgramWithUserRegion> {
		return this.apiService.fetchZebecCardPrograms(countryCode);
	}

	async purchaseCard(params: {
		amount: string | number;
		quote: Quote;
		token: CardToken;
		cardProgramId: string;
		recipient: Recipient;
		/** Wallet address. Defaults to the provider wallet public key. */
		userAddress?: string;
		reloadCardId?: string;
	}): Promise<{ signature: string; orderDetail: OrderWithExtraInfo }> {
		if (!isEmailValid(params.recipient.emailAddress)) {
			throw new InvalidEmailError(params.recipient.emailAddress);
		}
		const cardPrograms = await this.apiService.fetchZebecCardPrograms(params.recipient.countryCode);
		const cardProgram = cardPrograms.availablePrograms.find(
			(program) => program.id === params.cardProgramId,
		);
		if (!cardProgram) throw new Error("Card program not supported for user's region");
		this.validateQuote(params.quote, cardProgram.availableCurrencies);

		const userAddress =
			params.userAddress ||
			this.cardService.provider.publicKey?.toBase58() ||
			this.cardService.provider.wallet?.publicKey?.toBase58();
		if (!userAddress) throw new Error("A Solana wallet public key is required");
		const nextCardCounter = await this.cardService.getNextCardIndex();
		const emailHash = crypto.createHash("sha256").update(params.recipient.emailAddress).digest();
		const shouldSwap =
			params.token.swapConfig?.shouldSwapOnDex ??
			params.token.shouldSwapOnDex ??
			params.quote.shouldSwapOnDex ??
			Boolean(params.quote.swapQuote);
		const cardType = cardProgram.type === "carbon" ? "carbon" : "silver";
		const currency = params.quote.targetCurrency;
		let payload;

		if (shouldSwap) {
			const rawQuote = params.quote.swapQuote?.rawQuote ?? params.quote.swapQuote;
			if (!rawQuote || typeof rawQuote !== "object" || "error" in rawQuote) {
				throw new SwapQuoteUnavailableError();
			}
			const swapParams = {
				quoteInfo: rawQuote as Record<string, unknown>,
				userAddress,
				nextCardCounter,
				emailHash,
				currency,
				wrapAndUnwrapWsol: params.token.symbol.toLowerCase() === "sol",
			};
			payload =
				cardType === "carbon"
					? await this.cardService.swapAndLoadCarbonCard({
							...swapParams,
							reloadCardId: params.reloadCardId || "",
						})
					: await this.cardService.swapAndCreateSilverCard(swapParams);
		} else {
			const amount = String(
				params.quote.totalPrice ??
					params.quote.sourceAmount ??
					params.quote.inputAmount ??
					params.amount,
			);
			const inputMintAddress = params.token.mintAddress || params.token.address;
			if (!inputMintAddress)
				throw new Error("Token mint address is required for a direct Solana card purchase");
			const directParams = {
				amount,
				nextCardCounter,
				userAddress,
				inputMintAddress,
				outputMintAddress: inputMintAddress,
				emailHash,
				currency,
			};
			payload =
				cardType === "carbon"
					? await this.cardService.loadCarbonCard({
							...directParams,
							reloadCardId: params.reloadCardId || "",
						})
					: await this.cardService.createSilverCard(directParams);
		}

		const signature = await payload.execute({
			commitment: "finalized",
			preflightCommitment: "finalized",
		});
		const buyerAddress = userAddress;
		const receipt = new Receipt(
			params.quote,
			new Deposit(
				this.network === "devnet" ? 0 : 1,
				params.token.symbol,
				params.amount,
				signature,
				signature,
				"",
				buyerAddress,
				params.recipient.emailAddress,
				"",
				"SOLANA",
				this.network === "devnet" ? "TESTNET" : "MAINNET",
			),
		);
		const orderPayload = new OrderCardRequest(
			Money.create(
				params.quote.outputAmount ?? params.quote.targetAmount ?? params.amount,
				currency,
			),
			params.cardProgramId,
			params.recipient,
			receipt,
		);
		const orderDetail = (await this.apiService.purchaseCard(orderPayload))
			.data as OrderWithExtraInfo;
		return { signature, orderDetail };
	}

	private validateQuote(quote: Quote, currencies: string[]) {
		if (quote.expiresIn - 20000 < Date.now()) throw new Error("Quote expired");
		if (
			!currencies.some((currency) => currency.toUpperCase() === quote.targetCurrency.toUpperCase())
		) {
			throw new Error("Invalid Quote: Target currency in quote not available in card program");
		}
	}

	async getOrdersByEmail(email: string): Promise<Order[]> {
		return this.apiService.fetchOrders({ queryParams: "email", queryValue: email });
	}

	async getOrdersByTxHash(txHash: string): Promise<Order[]> {
		return this.apiService.fetchOrders({ queryParams: "txHash", queryValue: txHash });
	}

	async getOrdersByOrderId(orderId: string): Promise<Order[]> {
		return this.apiService.fetchOrders({ queryParams: "orderId", queryValue: orderId });
	}
}
