const assert = require("assert");
const { ethers } = require("ethers");

const { ERC20__factory } = require("../dist/artifacts");
const {
	CardPurchaseAmountOutOfRangeError,
	Recipient,
	SwapQuoteUnavailableError,
	SupportedEvmChain,
	USDC_ADDRESS,
	ZebecCardEvmService,
} = require("../dist");

describe("ZebecCardEvmService backward-compatible purchase routing", () => {
	const tokenAddress = "0x1111111111111111111111111111111111111111";
	const usdcAddress = USDC_ADDRESS[SupportedEvmChain.Sepolia];
	const cardAddress = "0x3333333333333333333333333333333333333333";
	const executorAddress = "0x4444444444444444444444444444444444444444";
	let originalConnect;

	const recipient = Recipient.create(
		"participant1",
		"Test",
		"User",
		"test.user@example.com",
		"9876543210",
		"en-US",
		"New York",
		"NY",
		"10001",
		"USA",
		"1 Test Street",
	);

	const programs = {
		availablePrograms: [{ id: "carbon-intl", type: "carbon", availableCurrencies: ["USD"] }],
	};

	const createService = (signer) => {
		return new ZebecCardEvmService(
			signer,
			SupportedEvmChain.Sepolia,
			{ apiKey: "test-api-key", encryptionKey: "test-encryption-key" },
			{
				sandbox: true,
				purchaseApiAdapter: {
					ping: async () => true,
					fetchZebecCardPrograms: async () => programs,
					purchaseCard: async () => ({ data: { orderId: "order-1" } }),
				},
			},
		);
	};

	const swapQuote = (minimum = "10") => ({
		id: "quote-swap",
		quoteType: "EXACT_IN",
		sourceToken: "VELO",
		targetCurrency: "USD",
		sourceAmount: "2.5",
		targetAmount: "10",
		expiresIn: Date.now() + 120000,
		timestamp: new Date(),
		shouldSwapOnDex: true,
		requestedAmount: { amount: "10", currencyCode: "USD" },
		payment: {
			chain: "ETHEREUM",
			contractAddress: tokenAddress,
			tokenAmount: ethers.parseUnits("2.5", 18).toString(),
			tokenDecimals: 18,
			flow: "SWAP_AND_BUY",
			cardContractAddress: cardAddress,
			outputTokenAddress: usdcAddress,
			outputTokenDecimals: 6,
			expectedCardLoadAmount: ethers.parseUnits(minimum, 6).toString(),
			minimumCardLoadAmount: ethers.parseUnits(minimum, 6).toString(),
		},
		swapQuote: {
			rawQuote: {
				ether: "0",
				swapParams: {
					executor: executorAddress,
					routeData: "0xabcdef",
					description: {
						srcToken: tokenAddress,
						dstToken: usdcAddress,
						srcReceiver: executorAddress,
						dstReceiver: cardAddress,
						srcAmount: "2.5",
						minReturnAmount: minimum,
						flags: "0",
					},
				},
			},
		},
	});

	beforeEach(() => {
		originalConnect = ERC20__factory.connect;
	});

	afterEach(() => {
		ERC20__factory.connect = originalConnect;
	});

	it("uses the configured purchase API adapter for public program lookup", async () => {
		const service = createService(ethers.Wallet.createRandom());
		const result = await service.fetchZebecCardProgram("USA");

		assert.strictEqual(result, programs);
	});

	it("keeps the published purchaseCardWithUsdc call and return shape", async () => {
		const signer = ethers.Wallet.createRandom();
		let approvedAmount;
		const usdc = {
			decimals: async () => 6,
			balanceOf: async () => ethers.parseUnits("100", 6),
			allowance: async () => 0n,
			approve: async (_spender, amount) => {
				approvedAmount = amount;
				return { wait: async () => ({ hash: "0xapproval" }) };
			},
		};
		ERC20__factory.connect = () => usdc;
		const service = createService(signer);
		service.zebecCard = {
			cardConfig: async () => ({
				minCardAmount: ethers.parseUnits("10", 6),
				maxCardAmount: ethers.parseUnits("1500", 6),
				dailyCardBuyLimit: ethers.parseUnits("5000", 6),
			}),
			cardPurchases: async () => ({ unixInRecord: 0n, totalCardBoughtPerDay: 0n }),
			buyCardDirect: async () => ({
				hash: "0xdirect",
				wait: async () => ({ hash: "0xdirect", blockHash: "0xblock" }),
			}),
		};

		const result = await service.purchaseCardWithUsdc({
			amount: 25,
			quote: {
				id: "legacy-quote",
				quoteType: "EXACT_OUT",
				token: "USDC",
				targetCurrency: "USD",
				amountRequested: 25,
				totalPrice: 25,
				expiresIn: Date.now() + 120000,
				timestamp: new Date(),
			},
			cardProgramId: "carbon-intl",
			recipient,
		});

		assert.strictEqual(approvedAmount, ethers.parseUnits("25", 6));
		assert.strictEqual(result.receipt.hash, "0xdirect");
		assert.strictEqual(result.orderDetail.orderId, "order-1");
	});

	it("adds VELO swap routing without changing the order return shape", async () => {
		const signer = ethers.Wallet.createRandom();
		const approvals = [];
		const swaps = [];
		ERC20__factory.connect = (address) => {
			if (address.toLowerCase() === tokenAddress.toLowerCase()) {
				return {
					decimals: async () => 18,
					balanceOf: async () => ethers.parseUnits("5", 18),
					allowance: async () => 0n,
					approve: async (spender, amount) => {
						approvals.push({ spender, amount });
						return { wait: async () => ({ hash: "0xapproval" }) };
					},
				};
			}
			return { decimals: async () => 6 };
		};
		const service = createService(signer);
		service.zebecCard = {
			getAddress: async () => cardAddress,
			cardConfig: async () => ({
				minCardAmount: ethers.parseUnits("10", 6),
				maxCardAmount: ethers.parseUnits("1500", 6),
			}),
			swapAndBuy: async (...args) => {
				swaps.push(args);
				return {
					hash: "0xswap",
					wait: async () => ({ hash: "0xswap", blockHash: "0xblock" }),
				};
			},
		};

		const result = await service.purchaseCard({
			amount: 10,
			quote: swapQuote(),
			token: { symbol: "VELO", address: tokenAddress },
			cardProgramId: "carbon-intl",
			recipient,
		});

		assert.strictEqual(approvals.length, 1);
		assert.strictEqual(approvals[0].spender, cardAddress);
		assert.strictEqual(swaps.length, 1);
		assert.strictEqual(swaps[0][0], executorAddress);
		assert.strictEqual(swaps[0][3], "reloadable");
		assert.strictEqual(result.receipt.hash, "0xswap");
		assert.strictEqual(result.orderDetail.orderId, "order-1");
	});

	it("forces non-USDC tokens to provide executable swap data", async () => {
		const signer = ethers.Wallet.createRandom();
		const service = createService(signer);
		await assert.rejects(
			() =>
				service.purchaseCard({
					amount: 10,
					quote: {
						id: "missing-route",
						quoteType: "DEFAULT",
						sourceToken: "VELO",
						targetCurrency: "USD",
						expiresIn: Date.now() + 120000,
						timestamp: new Date(),
					},
					token: { symbol: "VELO", address: tokenAddress },
					cardProgramId: "carbon-intl",
					recipient,
				}),
			SwapQuoteUnavailableError,
		);
	});

	it("rejects unsafe receivers and sub-minimum output before approval", async () => {
		const signer = ethers.Wallet.createRandom();
		let approvalCalled = false;
		ERC20__factory.connect = () => ({
			decimals: async () => 6,
			balanceOf: async () => ethers.parseUnits("100", 6),
			allowance: async () => 0n,
			approve: async () => {
				approvalCalled = true;
			},
		});
		const service = createService(signer);
		service.zebecCard = {
			getAddress: async () => cardAddress,
			cardConfig: async () => ({
				minCardAmount: ethers.parseUnits("10", 6),
				maxCardAmount: ethers.parseUnits("1500", 6),
			}),
		};

		const unsafe = swapQuote();
		unsafe.swapQuote.rawQuote.swapParams.description.dstReceiver =
			"0x5555555555555555555555555555555555555555";
		await assert.rejects(
			() =>
				service.purchaseCard({
					amount: 10,
					quote: unsafe,
					token: { symbol: "VELO", address: tokenAddress },
					cardProgramId: "carbon-intl",
					recipient,
				}),
			/route is not bound to the Zebec Card contract/,
		);

		await assert.rejects(
			() =>
				service.purchaseCard({
					amount: 10,
					quote: swapQuote("9"),
					token: { symbol: "VELO", address: tokenAddress },
					cardProgramId: "carbon-intl",
					recipient,
				}),
			CardPurchaseAmountOutOfRangeError,
		);
		assert.strictEqual(approvalCalled, false);
	});
});
