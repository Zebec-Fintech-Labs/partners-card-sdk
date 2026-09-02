import axios, { AxiosError } from "axios";
import crypto from "crypto";
import { ethers } from "ethers";

import { ERC20, ERC20__factory, ZebecCard, ZebecCard__factory } from "./artifacts";
import { parseSupportedChain, SupportedEvmChain, TESTNET_CHAINIDS } from "./chains";
import { CARD_API_URL, DEFAULT_GAS_LIMIT, USDC_ADDRESS, ZEBEC_CARD_ADDRESS } from "./constants";
import {
	CardPurchaseAmountOutOfRangeError,
	DailyCardPurchaseLimitExceedError,
	InvalidEmailError,
	NotEnoughBalanceError,
	SwapQuoteUnavailableError,
} from "./errors";
import {
	CardToken,
	CardProgramWithUserRegion,
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
	Vault,
} from "./types";
import { areDatesOfSameDay, formatAmount, hashSHA256, isEmailValid } from "./utils";

type APIConfig = {
	apiKey: string;
	encryptionKey: string;
};

/**
 * Bridge for integrations that orchestrate the Partner API separately from
 * this SDK's on-chain purchase execution.
 */
export type CardPurchaseAPIAdapter = {
	ping(): Promise<boolean>;
	fetchZebecCardPrograms(countryCode: CountryCode): Promise<CardProgramWithUserRegion>;
	purchaseCard(data: OrderCardRequest): Promise<{ data: OrderWithExtraInfo }>;
};

export type ZebecCardEvmServiceOptions = {
	sandbox?: boolean;
	purchaseApiAdapter?: CardPurchaseAPIAdapter;
};

export class ZebecCardAPIService {
	readonly apiConfig: APIConfig & {
		apiUrl: string;
	};
	private readonly sdkVersion: string = "1.2.0";
	private readonly api: axios.AxiosInstance;
	private readonly sandbox: boolean = false;

	constructor(apiConfig: APIConfig, sandbox?: boolean) {
		this.apiConfig = {
			...apiConfig,
			apiUrl: sandbox ? CARD_API_URL.Sandbox : CARD_API_URL.Production,
		};

		this.api = axios.create({
			baseURL: this.apiConfig.apiUrl,
		});
		this.sandbox = sandbox ? sandbox : false;
	}

	// Generate request signature
	private generateSignature(method: string, path: string, timestamp: number, body?: any): string {
		const stringToSign = [
			method.toUpperCase(),
			path,
			timestamp,
			this.apiConfig.apiKey,
			body ? JSON.stringify(body) : "",
		].join("");

		return crypto
			.createHmac("sha256", this.apiConfig.encryptionKey)
			.update(stringToSign)
			.digest("hex");
	}

	// Generate request headers
	generateRequestHeaders(method: string, path: string, body?: any) {
		const timestamp = Math.floor(Date.now() / 1000);
		const nonce = crypto.randomBytes(16).toString("hex");

		return {
			"X-API-Key": this.apiConfig.apiKey,
			"X-Timestamp": timestamp.toString(),
			"X-Nonce": nonce,
			"X-Signature": this.generateSignature(method, path, timestamp, body),
			"X-SDK-Version": this.sdkVersion,
			"Content-Type": "application/json",
		};
	}

	// Encrypt sensitive data fields
	encryptSensitiveData(data: any) {
		const iv = crypto.randomBytes(16);
		const key = crypto.pbkdf2Sync(this.apiConfig.encryptionKey, iv, 1000, 32, "sha256");
		const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

		let encrypted = cipher.update(JSON.stringify(data), "utf8", "base64");
		encrypted += cipher.final("base64");
		const authTag = cipher.getAuthTag();

		return `${iv.toString("base64")}:${encrypted}:${authTag.toString("base64")}`;
	}

	// Ping API status
	async ping() {
		try {
			await this.api.get("/health");
			return true;
		} catch (e) {
			if (this.sandbox) {
				if (axios.isAxiosError(e)) {
					console.debug("cause", e.cause);
					console.debug("response data", e.response?.data);
				} else {
					console.debug("error", e);
				}
			}
			throw new Error("Card service is down. Please try again later.");
		}
	}

	// Purchase Card
	async purchaseCard(data: any) {
		// console.debug("Payload data:", data);
		const encryptedData = this.encryptSensitiveData(data);
		// console.debug("Encrypted Data: %s \n", encryptedData);
		const method = "POST";
		const path = "/orders/create";
		const url = this.apiConfig.apiUrl + path;
		const payload = {
			data: encryptedData,
		};
		const headers = this.generateRequestHeaders(method, path, payload);

		const response = await axios.post(url, payload, {
			headers,
		});

		return response;
	}

	// Fetch quote
	async fetchQuote(
		symbol: string,
		amount: string | number,
		type?: "EXACT_IN" | "EXACT_OUT",
	): Promise<Quote>;
	async fetchQuote(params: FetchQuoteParams): Promise<Quote>;
	async fetchQuote(
		symbolOrParams: string | FetchQuoteParams,
		amount?: string | number,
		type: "EXACT_IN" | "EXACT_OUT" = "EXACT_OUT",
	) {
		try {
			const params: FetchQuoteParams =
				typeof symbolOrParams === "string"
					? { symbol: symbolOrParams, amount: amount as string | number, type }
					: symbolOrParams;
			const targetCurrency = params.targetCurrency || "USD";
			const query = new URLSearchParams({
				type: params.type || "EXACT_OUT",
			});
			if (params.slippage !== undefined) query.set("slippage", String(params.slippage));
			if (params.platform) query.set("platform", params.platform);
			if (params.chainName) query.set("chainName", params.chainName);
			const symbol = params.symbol || params.token;
			if (!symbol || params.amount === undefined)
				throw new Error("Quote token and amount are required");
			const url = `/exchange/quotes/${encodeURIComponent(symbol)}_${encodeURIComponent(targetCurrency)}/${formatAmount(params.amount)}?${query}`;
			const { data } = await this.api.get(url);

			return {
				...data,
				timestamp: new Date(data.timestamp),
			} as Quote;
		} catch (e) {
			if (this.sandbox) {
				if (axios.isAxiosError(e)) {
					console.debug("cause", e.cause);
					console.debug("response data", e.response?.data);
				} else {
					console.debug("error", e);
				}
			}
			throw e;
		}
	}

	async fetchVault(symbol: string) {
		try {
			const { data } = await this.api.get(`/exchange/vault/${symbol.toLowerCase()}`);
			return data as Vault;
		} catch (e) {
			if (this.sandbox) {
				if (axios.isAxiosError(e)) {
					console.debug("cause", e.cause);
					console.debug("response data", e.response?.data);
				} else {
					console.debug("error", e);
				}
			}
			throw e;
		}
	}

	async fetchZebecCardPrograms(countryCode: CountryCode) {
		const path = "/orders/programs";
		const method = "GET";
		const headers = this.generateRequestHeaders(method, path);

		const urlParams = new URLSearchParams({
			country: countryCode,
		});
		const url = `${path}?${urlParams}`;
		try {
			const { data } = await this.api.get(url, {
				headers,
			});

			return data as CardProgramWithUserRegion;
		} catch (e) {
			if (this.sandbox) {
				if (axios.isAxiosError(e)) {
					console.debug("cause", e.cause);
					console.debug("response data", e.response?.data);
				} else {
					console.debug("error", e);
				}
			}
			throw e;
		}
	}

	async fetchOrders(params: { queryParams: "email" | "txHash" | "orderId"; queryValue: string }) {
		const method = "GET";
		const path = "/orders/lookup";
		const headers = this.generateRequestHeaders(method, path);

		const urlParams = new URLSearchParams({
			[params.queryParams]: params.queryValue,
		});

		const url = `${path}?${urlParams}`;

		try {
			const { data } = await this.api.get(url, {
				headers,
			});

			return data;
		} catch (e) {
			if (this.sandbox) {
				if (axios.isAxiosError(e)) {
					console.debug("cause", e.cause);
					console.debug("response data", e.response?.data);
				} else {
					console.debug("error", e);
				}
			}
			throw e;
		}
	}
}

export class ZebecCardEvmService {
	readonly zebecCard: ZebecCard;
	readonly usdcToken: ERC20;
	readonly chainId: SupportedEvmChain;
	private readonly apiService: ZebecCardAPIService;
	private readonly purchaseApi: CardPurchaseAPIAdapter;
	private readonly sandbox: boolean = false;

	constructor(
		readonly signer: ethers.Signer,
		chainId: number,
		apiConfig: APIConfig,
		sdkOptions?: ZebecCardEvmServiceOptions,
	) {
		this.sandbox = sdkOptions?.sandbox ? sdkOptions.sandbox : false;

		const isTesnetChainId = TESTNET_CHAINIDS.includes(chainId);
		if ((this.sandbox && !isTesnetChainId) || (!this.sandbox && isTesnetChainId)) {
			throw new Error("Only testnet chains are allowed in sandbox environment");
		}

		this.apiService = new ZebecCardAPIService(apiConfig, this.sandbox);
		this.purchaseApi = sdkOptions?.purchaseApiAdapter || this.apiService;

		this.chainId = parseSupportedChain(chainId);

		const zebecCardAddress = ZEBEC_CARD_ADDRESS[this.chainId];
		const usdcAddress = USDC_ADDRESS[this.chainId];

		this.zebecCard = ZebecCard__factory.connect(zebecCardAddress, signer);
		this.usdcToken = ERC20__factory.connect(usdcAddress, signer);
	}

	/**
	 * Fetch quote details for usdc for given amount
	 * @param amount Amount in decimals
	 * @param type "EXACT_IN" | "EXACT_OUT"
	 * @returns
	 */
	async fetchQuote(amount: string | number, type?: "EXACT_IN" | "EXACT_OUT"): Promise<Quote>;
	async fetchQuote(params: Omit<FetchQuoteParams, "symbol"> & { token: string }): Promise<Quote>;
	async fetchQuote(
		amountOrParams: string | number | (Omit<FetchQuoteParams, "symbol"> & { token: string }),
		type: "EXACT_IN" | "EXACT_OUT" = "EXACT_OUT",
	) {
		if (typeof amountOrParams === "object") {
			return this.fetchQuoteForToken(amountOrParams);
		}
		return this.apiService.fetchQuote("USDC", amountOrParams, type);
	}

	/**
	 * Fetch a quote for any supported card token. The API includes `swapQuote`
	 * and its aggregator-specific `rawQuote` when the token is DEX-routed.
	 */
	async fetchQuoteForToken(params: Omit<FetchQuoteParams, "symbol"> & { token: string }) {
		return this.apiService.fetchQuote({
			symbol: params.token,
			amount: params.amount,
			type: params.type,
			targetCurrency: params.targetCurrency,
			chainName: params.chainName || this.getApiChainName(),
			platform: params.platform,
			slippage: params.slippage,
		});
	}

	private getApiChainName() {
		switch (this.chainId) {
			case SupportedEvmChain.Base:
				return "BASE";
			case SupportedEvmChain.Bsc:
			case SupportedEvmChain.BscTestnet:
				return "BINANCE";
			case SupportedEvmChain.Polygon:
			case SupportedEvmChain.PolygonAmoy:
				return "POLYGON";
			default:
				return "ETHEREUM";
		}
	}

	/**
	 * Automatically select direct card purchase or DEX swap-and-buy based on
	 * token/quote metadata. Existing `purchaseCardWithUsdc` remains available
	 * for backwards compatibility.
	 */
	async purchaseCard(params: {
		amount: string | number;
		quote: Quote;
		token?: CardToken;
		cardProgramId: string;
		recipient: Recipient;
		/**
		 * Client-stable key reserved for retrying the future backend intent flow.
		 * Version 1.1 does not yet submit this value to the card API.
		 */
		idempotencyKey?: string;
		overrides?: ethers.Overrides;
	}): Promise<{ receipt: ethers.ContractTransactionReceipt; orderDetail: OrderWithExtraInfo }> {
		const token = params.token;
		const tokenSymbol =
			token?.symbol || params.quote.sourceToken || params.quote.inputToken || "USDC";
		const shouldSwap =
			tokenSymbol.toLowerCase() !== "usdc" ||
			(token?.swapConfig?.shouldSwapOnDex ??
				token?.shouldSwapOnDex ??
				params.quote.shouldSwapOnDex ??
				Boolean(params.quote.swapQuote));
		if (!shouldSwap) {
			return this.purchaseCardDirect({
				...params,
				tokenSymbol,
			});
		}
		return this.purchaseCardWithSwap({
			...params,
			token: token || {
				symbol: params.quote.sourceToken || params.quote.inputToken || params.quote.token || "",
			},
		});
	}

	private async purchaseCardDirect(params: {
		amount: string | number;
		quote: Quote;
		cardProgramId: string;
		recipient: Recipient;
		tokenSymbol: string;
		overrides?: ethers.Overrides;
	}): Promise<{ receipt: ethers.ContractTransactionReceipt; orderDetail: OrderWithExtraInfo }> {
		const { quote } = params;
		await this.purchaseApi.ping();
		const cardProgramDetails = await this.purchaseApi.fetchZebecCardPrograms(
			params.recipient.countryCode,
		);
		const cardProgram = cardProgramDetails.availablePrograms.find(
			(p) => p.id === params.cardProgramId,
		);
		if (!cardProgram) throw new Error("Card program not supported for user's region");
		if (!isEmailValid(params.recipient.emailAddress))
			throw new InvalidEmailError(params.recipient.emailAddress);
		const tokenSymbol = params.tokenSymbol.toLowerCase();
		if (tokenSymbol !== "usdc")
			throw new Error(
				"Direct EVM card purchase is only supported for USDC; enable DEX swapping for this token",
			);
		this.validateQuote(quote, params.amount, cardProgram.availableCurrencies);
		const totalPrice = String(
			quote.totalPrice ?? quote.sourceAmount ?? quote.inputAmount ?? params.amount,
		);
		const decimals = await this.usdcToken.decimals();
		const parsedAmount = ethers.parseUnits(totalPrice, decimals);
		const balance = await this.usdcToken.balanceOf(this.signer);
		if (parsedAmount > balance)
			throw new NotEnoughBalanceError(ethers.formatUnits(balance, decimals), totalPrice);
		const cardConfig = await this.zebecCard.cardConfig();
		if (parsedAmount < cardConfig.minCardAmount || parsedAmount > cardConfig.maxCardAmount) {
			throw new CardPurchaseAmountOutOfRangeError(
				ethers.formatUnits(cardConfig.minCardAmount, decimals),
				ethers.formatUnits(cardConfig.maxCardAmount, decimals),
			);
		}
		const purchaseInfo = await this.zebecCard.cardPurchases(this.signer);
		const lastPurchaseDate = new Date(Number(purchaseInfo.unixInRecord * 1000n));
		const dailyAmount = areDatesOfSameDay(new Date(), lastPurchaseDate)
			? purchaseInfo.totalCardBoughtPerDay + parsedAmount
			: parsedAmount;
		if (dailyAmount > cardConfig.dailyCardBuyLimit)
			throw new DailyCardPurchaseLimitExceedError(
				ethers.formatUnits(cardConfig.dailyCardBuyLimit, decimals),
				ethers.formatUnits(purchaseInfo.totalCardBoughtPerDay, decimals),
			);
		const allowance = await this.usdcToken.allowance(this.signer, this.zebecCard);
		if (allowance < parsedAmount) {
			const approval = await this.usdcToken.approve(
				this.zebecCard,
				parsedAmount,
				this.transactionOverrides(params.overrides),
			);
			await approval.wait();
		}
		const cardType = cardProgram.type === "carbon" ? "reloadable" : "non_reloadable";
		const response = await this.zebecCard.buyCardDirect(
			parsedAmount,
			cardType,
			hashSHA256(params.recipient.emailAddress),
			this.transactionOverrides(params.overrides),
		);
		const receipt = await response.wait();
		if (!receipt) throw new Error(`Could not get tx receipt for tx: ${response.hash}`);
		return {
			receipt,
			orderDetail: await this.postOrder(
				quote,
				params.recipient,
				params.cardProgramId,
				totalPrice,
				"USDC",
				receipt,
			),
		};
	}

	private async purchaseCardWithSwap(params: {
		amount: string | number;
		quote: Quote;
		token: CardToken;
		cardProgramId: string;
		recipient: Recipient;
		overrides?: ethers.Overrides;
	}): Promise<{ receipt: ethers.ContractTransactionReceipt; orderDetail: OrderWithExtraInfo }> {
		const rawQuote = params.quote.swapQuote?.rawQuote as any;
		if (
			!rawQuote ||
			typeof rawQuote !== "object" ||
			!rawQuote.swapParams ||
			typeof rawQuote.swapParams !== "object" ||
			!rawQuote.swapParams.description ||
			typeof rawQuote.swapParams.description !== "object" ||
			!rawQuote.swapParams.executor ||
			!rawQuote.swapParams.routeData
		) {
			throw new SwapQuoteUnavailableError();
		}
		await this.purchaseApi.ping();
		const cardProgramDetails = await this.purchaseApi.fetchZebecCardPrograms(
			params.recipient.countryCode,
		);
		const cardProgram = cardProgramDetails.availablePrograms.find(
			(p) => p.id === params.cardProgramId,
		);
		if (!cardProgram) throw new Error("Card program not supported for user's region");
		if (!isEmailValid(params.recipient.emailAddress))
			throw new InvalidEmailError(params.recipient.emailAddress);
		this.validateQuote(params.quote, params.amount, cardProgram.availableCurrencies);

		const swapData = rawQuote as {
			dstAmount?: string;
			ether?: string;
			swapParams: {
				description: {
					srcToken: string;
					srcAmount: string;
					minReturnAmount: string;
					[key: string]: unknown;
				};
				[key: string]: unknown;
			};
		};
		const sourceToken = swapData.swapParams.description.srcToken;
		const sourceAmount = swapData.swapParams.description.srcAmount;
		if (!sourceToken || !sourceAmount || !swapData.swapParams.description.minReturnAmount) {
			throw new SwapQuoteUnavailableError(
				"Swap quote is missing executable transaction parameters",
			);
		}
		const configuredTokenAddress = params.token.address || params.token.contractAddress;
		if (
			!configuredTokenAddress ||
			configuredTokenAddress.toLowerCase() !== sourceToken.toLowerCase()
		) {
			throw new Error("Invalid swap quote: input token does not match the selected token");
		}
		const cardType = cardProgram.type === "carbon" ? "carbon" : "silver";
		const spender = await this.zebecCard.getAddress();
		const swapParams = rawQuote.swapParams;
		const swapDescription = swapParams.description;
		const usdcAddress = USDC_ADDRESS[this.chainId];
		if (
			swapDescription.dstToken?.toLowerCase() !== usdcAddress.toLowerCase() ||
			swapDescription.dstReceiver?.toLowerCase() !== spender.toLowerCase() ||
			swapDescription.srcReceiver?.toLowerCase() !== swapParams.executor.toLowerCase()
		) {
			throw new Error("Invalid swap quote: route is not bound to the Zebec Card contract");
		}
		if (params.quote.chainName && params.quote.chainName.toUpperCase() !== this.getApiChainName()) {
			throw new Error("Invalid swap quote: chain does not match the configured signer chain");
		}
		if (
			params.quote.payment &&
			(params.quote.payment.chain !== this.getApiChainName() ||
				params.quote.payment.flow !== "SWAP_AND_BUY" ||
				params.quote.payment.contractAddress.toLowerCase() !== sourceToken.toLowerCase() ||
				params.quote.payment.cardContractAddress?.toLowerCase() !== spender.toLowerCase() ||
				params.quote.payment.outputTokenAddress?.toLowerCase() !== usdcAddress.toLowerCase())
		) {
			throw new Error("Invalid swap quote: Partner payment metadata does not match the route");
		}
		const description = await this.toSwapDescription(swapDescription);
		const cardConfig = await this.zebecCard.cardConfig();
		const guaranteedCardLoad = params.quote.payment?.minimumCardLoadAmount
			? BigInt(params.quote.payment.minimumCardLoadAmount)
			: description.minReturnAmount;
		const expectedCardLoad = params.quote.payment?.expectedCardLoadAmount
			? BigInt(params.quote.payment.expectedCardLoadAmount)
			: guaranteedCardLoad;
		if (
			guaranteedCardLoad < cardConfig.minCardAmount ||
			expectedCardLoad > cardConfig.maxCardAmount
		) {
			const outputDecimals = await this.usdcToken.decimals();
			throw new CardPurchaseAmountOutOfRangeError(
				ethers.formatUnits(cardConfig.minCardAmount, outputDecimals),
				ethers.formatUnits(cardConfig.maxCardAmount, outputDecimals),
			);
		}
		const isNative = ["eth", "bnb"].includes(params.token.symbol.toLowerCase());
		if (isNative) {
			const wrapResponse = await this.wrapNative(sourceAmount, params.overrides);
			await wrapResponse.wait();
		}
		const approval = await this.approveToken(sourceToken, sourceAmount, spender, params.overrides);
		if (approval) await approval.wait();
		const response = await this.zebecCard.swapAndBuy(
			swapParams.executor,
			description,
			swapParams.routeData,
			cardType === "carbon" ? "reloadable" : "non_reloadable",
			hashSHA256(params.recipient.emailAddress),
			{
				value: ethers.parseEther(swapData.ether || "0"),
				...this.transactionOverrides(params.overrides),
			},
		);
		const receipt = await response.wait();
		if (!receipt) throw new Error(`Could not get tx receipt for tx: ${response.hash}`);
		const orderDetail = await this.postOrder(
			params.quote,
			params.recipient,
			params.cardProgramId,
			sourceAmount,
			params.token.symbol,
			receipt,
		);
		return { receipt, orderDetail };
	}

	private validateQuote(quote: Quote, amount: string | number, currencies: string[]) {
		const requestedAmount = quote.amountRequested ?? quote.requestedAmount?.amount;
		if (requestedAmount !== undefined && Number(requestedAmount) !== formatAmount(amount)) {
			throw new Error("Invalid Quote: Amount request and passed amount does not match");
		}
		if (quote.expiresIn - 20000 < Date.now()) throw new Error("Quote expired");
		if (
			!currencies.some((currency) => currency.toUpperCase() === quote.targetCurrency.toUpperCase())
		) {
			throw new Error("Invalid Quote: Target currency in quote not available in card program");
		}
	}

	private transactionOverrides(overrides?: ethers.Overrides) {
		return { ...overrides, gasLimit: overrides?.gasLimit || DEFAULT_GAS_LIMIT };
	}

	private async approveToken(
		tokenAddress: string,
		amount: string,
		spender: string,
		overrides?: ethers.Overrides,
	) {
		const token = ERC20__factory.connect(tokenAddress, this.signer);
		const decimals = await token.decimals();
		const parsedAmount = ethers.parseUnits(amount, decimals);
		const balance = await token.balanceOf(this.signer);
		if (parsedAmount > balance)
			throw new NotEnoughBalanceError(ethers.formatUnits(balance, decimals), amount);
		const allowance = await token.allowance(this.signer, spender);
		return allowance < parsedAmount
			? token.approve(spender, parsedAmount, this.transactionOverrides(overrides))
			: null;
	}

	private async wrapNative(amount: string, overrides?: ethers.Overrides) {
		const weth = ERC20__factory.connect(await this.zebecCard.wEth(), this.signer);
		return this.signer.sendTransaction({
			to: await weth.getAddress(),
			value: ethers.parseEther(amount),
			...this.transactionOverrides(overrides),
		});
	}

	private async toSwapDescription(description: {
		srcToken: string;
		dstToken: string;
		srcReceiver: string;
		dstReceiver: string;
		srcAmount: string;
		minReturnAmount: string;
		flags: string;
	}) {
		const srcToken = ERC20__factory.connect(description.srcToken, this.signer);
		const dstToken = ERC20__factory.connect(description.dstToken, this.signer);
		const [srcDecimals, dstDecimals] = await Promise.all([
			srcToken.decimals(),
			dstToken.decimals(),
		]);
		return {
			srcToken: description.srcToken,
			dstToken: description.dstToken,
			srcReceiver: description.srcReceiver,
			dstReceiver: description.dstReceiver,
			amount: ethers.parseUnits(description.srcAmount, srcDecimals),
			minReturnAmount: ethers.parseUnits(description.minReturnAmount, dstDecimals),
			flags: BigInt(description.flags),
		};
	}

	private async postOrder(
		quote: Quote,
		recipient: Recipient,
		cardProgramId: string,
		amount: string | number,
		tokenName: string,
		txReceipt: ethers.ContractTransactionReceipt,
	) {
		const usdAmount = Money.create(
			quote.outputAmount ?? quote.targetAmount ?? amount,
			quote.targetCurrency,
		);
		const buyer = await this.signer.getAddress();
		const receipt = new Receipt(
			quote,
			new Deposit(
				this.chainId,
				tokenName,
				amount,
				txReceipt.hash,
				txReceipt.hash,
				txReceipt.blockHash || "",
				buyer,
				recipient.emailAddress,
				"",
				this.getApiChainName(),
				this.sandbox ? "TESTNET" : "MAINNET",
			),
		);
		const payload = new OrderCardRequest(usdAmount, cardProgramId, recipient, receipt);
		let retries = 0;
		let delay = 1000;
		while (retries < 5) {
			try {
				return (await this.purchaseApi.purchaseCard(payload)).data as OrderWithExtraInfo;
			} catch (error) {
				if (retries >= 4) throw error;
				retries += 1;
				await new Promise((resolve) => setTimeout(resolve, delay));
				delay *= 2;
			}
		}
		throw new Error("Max retries reached");
	}

	async fetchZebecCardProgram(countryCode: CountryCode) {
		return this.purchaseApi.fetchZebecCardPrograms(countryCode);
	}

	/**
	 * Transfer specified amount from user's vault balance to card vault with some fee amount for card purchase.
	 * @param params
	 * @returns
	 */
	async purchaseCardWithUsdc(params: {
		amount: string | number;
		quote: Quote;
		cardProgramId: string;
		recipient: Recipient;
		overrides?: ethers.Overrides;
	}): Promise<{ receipt: ethers.ContractTransactionReceipt; orderDetail: OrderWithExtraInfo }> {
		const { quote } = params;
		// Check card service status
		await this.purchaseApi.ping();

		const cardProgramDetails = await this.purchaseApi.fetchZebecCardPrograms(
			params.recipient.countryCode,
		);

		const cardProgram = cardProgramDetails.availablePrograms.find(
			(p) => p.id === params.cardProgramId,
		);

		if (!cardProgram) {
			throw new Error("Card program not supported for user's region");
		}

		// validate email
		if (!isEmailValid(params.recipient.emailAddress)) {
			throw new InvalidEmailError(params.recipient.emailAddress);
		}

		// validate quote
		if ((quote.token || quote.sourceToken || quote.inputToken || "").toLowerCase() !== "usdc") {
			throw new Error("Invalid Quote: Quote not for USDC");
		}

		if (
			quote.amountRequested !== undefined &&
			Number(quote.amountRequested) !== formatAmount(params.amount)
		) {
			throw new Error("Invalid Quote: Amount request and passed amount does not match");
		}

		if (quote.expiresIn - 20000 < Date.now()) {
			throw new Error("Quote expired");
		}

		if (
			!cardProgram.availableCurrencies.some(
				(c) => c.toUpperCase() === quote.targetCurrency.toUpperCase(),
			)
		) {
			throw new Error("Invalid Quote: Target currency in quote not available in card program");
		}

		const decimals = await this.usdcToken.decimals();
		const totalPrice = String(
			quote.totalPrice ?? quote.sourceAmount ?? quote.inputAmount ?? params.amount,
		);
		const parsedAmount = ethers.parseUnits(totalPrice, decimals);

		const usdcBalance = await this.usdcToken.balanceOf(this.signer);
		if (this.sandbox) {
			console.debug("Usdc Balance:", usdcBalance);
		}

		if (parsedAmount > usdcBalance) {
			throw new NotEnoughBalanceError(ethers.formatUnits(usdcBalance, decimals), totalPrice);
		}

		let cardConfig = await this.zebecCard.cardConfig();
		const minRange = cardConfig.minCardAmount;
		const maxRange = cardConfig.maxCardAmount;

		if (parsedAmount < minRange || parsedAmount > maxRange) {
			throw new CardPurchaseAmountOutOfRangeError(
				ethers.formatUnits(minRange, decimals),
				ethers.formatUnits(maxRange, decimals),
			);
		}

		const cardPurchaseInfo = await this.zebecCard.cardPurchases(this.signer);
		const lastCardPurchaseDate = new Date(Number(cardPurchaseInfo.unixInRecord * 1000n));
		const today = new Date();

		let cardPurchaseOfDay = 0n;
		if (areDatesOfSameDay(today, lastCardPurchaseDate)) {
			cardPurchaseOfDay = cardPurchaseInfo.totalCardBoughtPerDay + parsedAmount;
		} else {
			cardPurchaseOfDay = parsedAmount;
		}

		if (cardPurchaseOfDay > cardConfig.dailyCardBuyLimit) {
			throw new DailyCardPurchaseLimitExceedError(
				ethers.formatUnits(cardConfig.dailyCardBuyLimit, decimals),
				ethers.formatUnits(cardPurchaseInfo.totalCardBoughtPerDay, decimals),
			);
		}

		const allowance = await this.usdcToken.allowance(this.signer, this.zebecCard);
		if (this.sandbox) {
			console.debug("Allowance:", allowance);
		}

		if (allowance < parsedAmount) {
			if (this.sandbox) {
				console.debug("===== Approving token =====");
			}
			const approveResponse = await this.usdcToken.approve(this.zebecCard, parsedAmount);
			const approveReceipt = await approveResponse.wait();
			if (this.sandbox) {
				console.debug("Approve hash: %s \n", approveReceipt?.hash);
			}
		}
		const cardType = cardProgram.type === "carbon" ? "reloadable" : "non_reloadable";
		const emailHash = hashSHA256(params.recipient.emailAddress);

		const overrides = {
			...params.overrides,
			gasLimit: params.overrides?.gasLimit || DEFAULT_GAS_LIMIT, // Default
		};

		if (this.sandbox) {
			console.debug("===== Purchasing Card =====");
		}
		const buyCardResponse = await this.zebecCard.buyCardDirect(
			parsedAmount,
			cardType,
			emailHash,
			overrides,
		);
		const buyCardReceipt = await buyCardResponse.wait();
		if (!buyCardReceipt) {
			throw new Error(`Could not get tx receipt for tx: ${buyCardResponse.hash}`);
		}
		if (this.sandbox) {
			console.debug("Purchase hash: %s \n", buyCardReceipt.hash);
		}
		const usdAmount = Money.create(
			quote.outputAmount ?? quote.targetAmount ?? params.amount,
			quote.targetCurrency,
		);
		const buyer = await this.signer.getAddress();
		const receipt = new Receipt(
			params.quote,
			new Deposit(
				this.chainId,
				"USDC",
				totalPrice,
				buyCardReceipt.hash,
				buyCardReceipt.hash,
				buyCardReceipt.blockHash,
				buyer,
				params.recipient.emailAddress,
				"",
			),
		);
		const payload = new OrderCardRequest(
			usdAmount,
			params.cardProgramId,
			params.recipient,
			receipt,
		);

		let retries = 0;
		let delay = 1000; // Initial delay in milliseconds (1 second)
		const maxRetries = 5; // Max retry default

		while (retries < maxRetries) {
			try {
				const response = await this.purchaseApi.purchaseCard(payload);

				if (this.sandbox) {
					console.debug("API response: %o \n", response.data);
				}
				const data = response.data as OrderWithExtraInfo;

				return {
					receipt: buyCardReceipt,
					orderDetail: data,
				};
			} catch (error) {
				if (error instanceof AxiosError) {
					if (this.sandbox) {
						console.debug("error:", error.response?.data);
						console.debug("error:", error.message);
					}
				} else {
					if (this.sandbox) {
						console.debug("error:", error);
					}
				}
				if (retries >= maxRetries) {
					throw error;
				}

				retries += 1;
				if (this.sandbox) {
					console.debug(`Retrying in ${delay / 1000} seconds...`);
				}
				await new Promise((resolve) => setTimeout(resolve, delay));
				delay *= 2; // Exponential backoff
			}
		}

		throw new Error("Max retries reached");
	}

	async getOrdersByEmail(email: string): Promise<Order[]> {
		return this.apiService.fetchOrders({ queryParams: "email", queryValue: email });
	}

	async getOrdersByTxHash(txHash: string): Promise<Order> {
		return this.apiService.fetchOrders({ queryParams: "txHash", queryValue: txHash });
	}

	async getOrdersByOrderId(orderId: string): Promise<Order> {
		return this.apiService.fetchOrders({ queryParams: "orderId", queryValue: orderId });
	}
}
