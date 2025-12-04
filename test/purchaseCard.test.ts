import assert from "assert";
import dotenv from "dotenv";
import { describe } from "mocha";

import { CountryCode, Recipient, SupportedEvmChain, ZebecCardEvmService } from "../src";
import { getProvider, getSigners } from "./setup";

dotenv.config();

describe("purchaseCard()", () => {
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
		const { orderDetails, receipt } = await service.purchaseCardWithUsdc({
			amount,
			cardProgramId,
			recipient,
			quote,
		});

		console.log("receipt:", receipt.hash);
		console.log("order details:", orderDetails);
	});
});
