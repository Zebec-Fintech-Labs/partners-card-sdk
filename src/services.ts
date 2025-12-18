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
} from "./errors";
import {
	CardProgramWithUserRegion,
	CountryCode,
	Deposit,
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

export class ZebecCardAPIService {
	readonly apiConfig: APIConfig & {
		apiUrl: string;
	};
	private readonly sdkVersion: string = "1.0.0";
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
			await this.api.get("/ping");
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
		type: "EXACT_IN" | "EXACT_OUT" = "EXACT_OUT",
	) {
		try {
			const url = `/exchange/quotes/${symbol.toString()}_USD/${formatAmount(amount)}?type=${type}`;
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
	private readonly sandbox: boolean = false;

	constructor(
		readonly signer: ethers.Signer,
		chainId: number,
		apiConfig: APIConfig,
		sdkOptions?: {
			sandbox?: boolean;
		},
	) {
		this.sandbox = sdkOptions?.sandbox ? sdkOptions.sandbox : false;

		const isTesnetChainId = TESTNET_CHAINIDS.includes(chainId);
		if ((this.sandbox && !isTesnetChainId) || (!this.sandbox && isTesnetChainId)) {
			throw new Error("Only testnet chains are allowed in sandbox environment");
		}

		this.apiService = new ZebecCardAPIService(apiConfig, this.sandbox);

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
	async fetchQuote(amount: string | number, type: "EXACT_IN" | "EXACT_OUT" = "EXACT_OUT") {
		const res = await this.apiService.fetchQuote("USDC", amount, type);
		return res;
	}

	async fetchZebecCardProgram(countryCode: CountryCode) {
		return this.apiService.fetchZebecCardPrograms(countryCode);
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
		await this.apiService.ping();

		const cardProgramDetails = await this.apiService.fetchZebecCardPrograms(
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
		if (quote.token.toLowerCase() !== "usdc") {
			throw new Error("Invalid Quote: Quote not for USDC");
		}

		if (quote.amountRequested !== formatAmount(params.amount)) {
			throw new Error("Invalid Quote: Amount request and passed amount does not match");
		}

		if (quote.expiresIn - 20000 < Date.now()) {
			throw new Error("Quote expired");
		}

		if (!cardProgram.availableCurrencies.some((c) => c === quote.targetCurrency)) {
			throw new Error("Invalid Quote: Target currency in quote not available in card program");
		}

		const decimals = await this.usdcToken.decimals();
		const parsedAmount = ethers.parseUnits(quote.totalPrice.toString(), decimals);

		const usdcBalance = await this.usdcToken.balanceOf(this.signer);
		if (this.sandbox) {
			console.debug("Usdc Balance:", usdcBalance);
		}

		if (parsedAmount > usdcBalance) {
			throw new NotEnoughBalanceError(
				ethers.formatUnits(usdcBalance, decimals),
				quote.totalPrice.toString(),
			);
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
		const usdAmount = Money.create(quote.outputAmount, quote.targetCurrency);
		const buyer = await this.signer.getAddress();
		const receipt = new Receipt(
			params.quote,
			new Deposit(
				this.chainId,
				"USDC",
				quote.totalPrice,
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
				const response = await this.apiService.purchaseCard(payload);

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
