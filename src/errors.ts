export class UnsupportedChainError extends Error {
	name: string = "UnsupportedChainError";

	constructor(chainId: number) {
		super("Unsupported chainId: " + chainId);
	}
}

export class InvalidEmailError extends Error {
	name: string = "InvalidEmailError";

	constructor(email: string) {
		super("Invalid email: " + email);
	}
}

export class NotEnoughBalanceError extends Error {
	name: string = "NotEnoughBalanceError";

	constructor(currentBalance: string, requiredBalance: string) {
		super(
			"Not enough balance. Current amount: " +
				currentBalance +
				" Required amount: " +
				requiredBalance,
		);
	}
}

export class CardPurchaseAmountOutOfRangeError extends Error {
	name: string = "BuyAmountOutOfRangeError";

	constructor(minRange: string, maxRange: string) {
		super("Amount must be with range: " + minRange + " - " + maxRange);
	}
}

export class DailyCardPurchaseLimitExceedError extends Error {
	name: string = "DailyCardPurchaseLimitExceedError";

	constructor(dailyLimit: string, purchaseOfADay: string) {
		super(
			"Requested card purchase amount exceeds daily purchase limit. Daily limit: " +
				dailyLimit +
				" Today's purchase amount: " +
				purchaseOfADay,
		);
	}
}

export class ValidationError extends Error {
	name: string = "ValidationError";

	constructor(message: string) {
		super(message);
	}
}
