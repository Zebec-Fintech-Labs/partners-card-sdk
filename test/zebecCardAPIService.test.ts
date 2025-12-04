import dotenv from "dotenv";

import { ZebecCardAPIService } from "../src";

dotenv.config();

describe("ZebecCardAPIService", () => {
	const apiService = new ZebecCardAPIService(
		{
			apiKey: process.env.API_KEY!,
			encryptionKey: process.env.ENCRYPTION_KEY!,
		},
		true,
	);

	describe("fetchZebecCardPrograms()", () => {
		it("fetch card programs", async () => {
			const programs = await apiService.fetchZebecCardPrograms("USA");

			console.log("programs:availableCurrencies", JSON.stringify(programs, null, 2));
		});
	});

	describe("fetchQuote()", () => {
		it("fetch quote paired with usd for given amount", async () => {
			const quote = await apiService.fetchQuote("USDC", 10);

			console.log("quote:", quote);
		});
	});

	describe("fetchVault()", () => {
		it("fetch vault address for given token", async () => {
			const vault = await apiService.fetchVault("TAO");

			console.log("vault:", vault);
		});
	});
});
