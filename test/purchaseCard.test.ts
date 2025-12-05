import assert from "assert";
import dotenv from "dotenv";
import { describe } from "mocha";

import { CountryCode, Recipient, SupportedEvmChain, ZebecCardEvmService } from "../src";
import { getProvider, getSigners } from "./setup";

dotenv.config();

describe("ZebecCardEvmService", () => {
	const provider = getProvider("sepolia");
	const signer = getSigners(provider)[1];
	console.log("user:", signer.address);
	const chainId = SupportedEvmChain.Sepolia; // sepolia

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

	describe("purchaseCard()", () => {
		it("order card from that usdc", async () => {
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
			const { orderDetail, receipt } = await service.purchaseCardWithUsdc({
				amount,
				cardProgramId,
				recipient,
				quote,
			});

			console.log("receipt:", receipt.hash);
			console.log("order detail:", orderDetail);
		});
	});

	describe('"getOrdersByEmail()"', () => {
		it("should fetch orders belonging to email", async () => {
			const emailAddress = "johnchamling@gmail.com";
			const orders = await service.getOrdersByEmail(emailAddress);

			console.log("Orders:", orders);
		});
	});

	describe('"getOrdersByTxHash()"', () => {
		it("should fetch order for txHash", async () => {
			const txHash = "0x03f8e147e871c449b26067e4d1b65ba75e01750d9c074c3494ac470d5f8b261e";
			const orders = await service.getOrdersByTxHash(txHash);

			console.log("Orders:", orders);
		});
	});

	describe('"getOrdersByOrderId()"', () => {
		it("should fetch order by orderId", async () => {
			const orderId = "733d293e-fd7d-4df1-8200-6986885aa9de";
			const orders = await service.getOrdersByOrderId(orderId);

			console.log("Orders:", orders);
		});
	});
});
