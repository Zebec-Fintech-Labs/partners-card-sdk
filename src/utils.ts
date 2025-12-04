import crypto from "crypto";

export function hashSHA256(input: string) {
	const hash = crypto.createHash("sha256");
	hash.update(input);
	const hex = hash.digest("hex");
	return hex;
}

export function isEmailValid(value: string) {
	return /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/.test(value);
}

export function isAlphaNumeric(value: string) {
	return /^[a-zA-Z0-9]+$/.test(value);
}

export function areDatesOfSameDay(date1: Date, date2: Date) {
	return (
		date1.getUTCDay() === date2.getUTCDay() &&
		date1.getUTCMonth() === date2.getUTCMonth() &&
		date1.getUTCFullYear() === date2.getUTCFullYear()
	);
}

export function hasMinLen(value: string, len: number) {
	return value.length >= len;
}

export function hasMaxLen(value: string, len: number) {
	return value.length <= len;
}

export function hasLen(value: string, min: number, max?: number) {
	if (max) {
		return hasMinLen(value, min) && hasMaxLen(value, max);
	} else {
		return hasMinLen(value, min);
	}
}

export function formatAmount(amount: number | string, decimalPlaces = 2) {
	return Number(Number(amount).toFixed(decimalPlaces));
}
