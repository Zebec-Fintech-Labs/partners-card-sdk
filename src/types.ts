import { ValidationError } from "./errors";
import { formatAmount, hasLen, isAlphaNumeric, isEmailValid } from "./utils";

/**
 * Card type featured by zebec instant card.
 */
export type CardType = "silver" | "carbon";

export type UserRegion = {
	name: string;
	value: string;
	currencies: string[];
	countries: CountryCode[];
};

export type CardProgram = {
	id: string;
	type: "carbon" | "silver";
	name: string;
	description: string;
	isRegional: boolean;
	isInternational: boolean;
	availableCurrencies: string[];
	region: string;
};

export type CardProgramWithUserRegion = {
	userRegion: UserRegion;
	availablePrograms: CardProgram[];
	currencies: Record<string, number>;
};

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

export type Vault = {
	depositVault: {
		address: string;
	};
};

export type Order = {
	id: string;
	createdAt: Date;
	updatedAt: Date;
	orderId: string;
	programId: string;
	amount: { amount: number; currencyCode: number };
	recepient: {
		participantId: string;
		firstName: string;
		lastName: string;
		address1: string;
		address2: string;
		city: string;
		state: string;
		postalCode: string;
		countryCode: CountryCode;
		emailAddress: string;
		language: string;
		mobilePhone: string;
	};
	payment: { expirationDateUtc: string | null };
	signature: string;
	chainId: number;
	chainName: string;
	status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
	cardName: string;
};

export type OrderWithExtraInfo = Order & {
	date: string;
	retryCount: number;
	lastRetryAttempt: string | null;
};

export class OrderCardRequest {
	readonly amount: Money;
	readonly recipient: Recipient;
	readonly receipt: Receipt;
	readonly programId: string;

	constructor(amount: Money, programId: string, recipient: Recipient, receipt: Receipt) {
		this.amount = amount;
		this.programId = programId;
		this.receipt = receipt;
		this.recipient = recipient;
	}
}

export class Deposit {
	chainId: number;
	tokenName: string;
	tokenAmount: number;
	signature: string;
	txHash: string;
	blockHash: string;
	buyerAddress: string;
	userEmail: string;
	paymentId: string;

	constructor(
		chainId: number,
		tokenName: string,
		tokenAmount: number,
		signature: string,
		txHash: string,
		blockHash: string,
		buyerAddress: string,
		userEmail: string,
		paymentId: string,
	) {
		this.chainId = chainId;
		this.tokenName = tokenName;
		this.tokenAmount = tokenAmount;
		this.signature = signature;
		this.txHash = txHash;
		this.blockHash = blockHash;
		this.buyerAddress = buyerAddress;
		this.userEmail = userEmail;
		this.paymentId = paymentId;
	}
}

export class Receipt {
	quote?: any;
	deposit?: Deposit;

	constructor(quote?: any, deposit?: Deposit) {
		this.quote = quote;
		this.deposit = deposit;
	}
}

export class Money {
	readonly amount: number;
	readonly currencyCode: string;

	private constructor(amount: number, currencyCode: string) {
		this.amount = amount;
		this.currencyCode = currencyCode;
	}

	// Example static method to create a Money instance from an amount and optional currency code
	static create(amount: number | string, currencyCode: string): Money {
		return new Money(Number(amount), currencyCode);
	}

	static USD(amount: number | string): Money {
		return this.create(formatAmount(amount), "USD");
	}
}

export class Recipient {
	readonly participantId: string;
	readonly firstName: string;
	readonly lastName: string;
	readonly emailAddress: string;
	readonly address1: string;
	readonly address2?: string;
	readonly city: string;
	readonly state: string;
	readonly postalCode: string;
	readonly countryCode: CountryCode;
	readonly language: string = "en-US";
	readonly mobilePhone: string;

	private constructor(
		participantId: string,
		firstName: string,
		lastName: string,
		emailAddress: string,
		mobilePhone: string,
		language: string,
		city: string,
		state: string,
		postalCode: string,
		countryCode: CountryCode,
		address1: string,
		address2: string,
	) {
		this.participantId = participantId;
		this.firstName = firstName;
		this.lastName = lastName;
		this.address1 = address1;
		this.address2 = address2;
		this.city = city;
		this.state = state;
		this.postalCode = postalCode;
		this.countryCode = countryCode;
		this.emailAddress = emailAddress;
		this.language = language;
		this.mobilePhone = mobilePhone;
	}

	static create(
		participantId: string,
		firstName: string,
		lastName: string,
		emailAddress: string,
		mobilePhone: string,
		language: string,
		city: string,
		state: string,
		postalCode: string,
		countryCode: CountryCode,
		address1: string,
		address2?: string,
	) {
		if (!hasLen(participantId, 1, 20)) {
			throw new ValidationError("Participants must be of 1 to 20 characters.");
		}

		if (!isAlphaNumeric(participantId)) {
			throw new ValidationError("Participants must only contains alpha numeric characters");
		}

		if (!hasLen(firstName, 1, 50)) {
			throw new ValidationError("Firstname must be within 1 to 50 characters.");
		}

		if (!hasLen(lastName, 1, 50)) {
			throw new ValidationError("Lastname must be within 1 to 50 characters.");
		}

		if (!hasLen(emailAddress, 1, 80)) {
			throw new ValidationError("Email must be within 1 to 80 characters.");
		}

		if (!isEmailValid(emailAddress)) {
			throw new ValidationError("Email address must be a valid email.");
		}

		if (!language) {
			throw new ValidationError("Language code is required");
		}

		if (!hasLen(mobilePhone, 1, 20)) {
			throw new ValidationError("Mobile phone number must be within 1 to 20 characters.");
		}

		if (!hasLen(city, 1, 35)) {
			throw new ValidationError("City must be within 1 to 50 characters.");
		}

		if (!hasLen(state, 1, 50)) {
			throw new ValidationError("State must be within 1 to 50 characters.");
		}

		if (!ALL_COUNTRIES_AND_CODE.find((country) => country.code === countryCode)) {
			throw new ValidationError("CountryCode must be a valid supported ISO 3166-1 alpha-3 code");
		}

		if (!hasLen(postalCode, 1, 20)) {
			throw new ValidationError("Postal code must be within 1 to 20 characters.");
		}

		if (!hasLen(address1, 1, 50)) {
			throw new ValidationError("Address line 1 must be within 1 to 50 characters.");
		}

		if (address2 && !hasLen(address2, 1, 50)) {
			throw new ValidationError("Address line 2 must be within 1 to 50 characters.");
		}

		return new Recipient(
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
			address2 ?? "N/A",
		);
	}
}

const ALL_COUNTRIES_AND_CODE = [
	{ code: "ABW", name: "Aruba" },
	{ code: "AFG", name: "Afghanistan" },
	{ code: "AGO", name: "Angola" },
	{ code: "AIA", name: "Anguilla" },
	{ code: "ALA", name: "Åland Islands" },
	{ code: "ALB", name: "Albania" },
	{ code: "AND", name: "Andorra" },
	{ code: "ARE", name: "United Arab Emirates" },
	{ code: "ARG", name: "Argentina" },
	{ code: "ARM", name: "Armenia" },
	{ code: "ASM", name: "American Samoa" },
	{ code: "ATA", name: "Antarctica" },
	{ code: "ATF", name: "French Southern Territories" },
	{ code: "ATG", name: "Antigua and Barbuda" },
	{ code: "AUS", name: "Australia" },
	{ code: "AUT", name: "Austria" },
	{ code: "AZE", name: "Azerbaijan" },
	{ code: "BDI", name: "Burundi" },
	{ code: "BEL", name: "Belgium" },
	{ code: "BEN", name: "Benin" },
	{ code: "BES", name: "Bonaire, Sint Eustatius and Saba" },
	{ code: "BFA", name: "Burkina Faso" },
	{ code: "BGD", name: "Bangladesh" },
	{ code: "BGR", name: "Bulgaria" },
	{ code: "BHR", name: "Bahrain" },
	{ code: "BHS", name: "Bahamas" },
	{ code: "BIH", name: "Bosnia and Herzegovina" },
	{ code: "BLM", name: "Saint Barthélemy" },
	{ code: "BLR", name: "Belarus" },
	{ code: "BLZ", name: "Belize" },
	{ code: "BMU", name: "Bermuda" },
	{ code: "BOL", name: "Bolivia, Plurinational State of" },
	{ code: "BRA", name: "Brazil" },
	{ code: "BRB", name: "Barbados" },
	{ code: "BRN", name: "Brunei Darussalam" },
	{ code: "BTN", name: "Bhutan" },
	{ code: "BVT", name: "Bouvet Island" },
	{ code: "BWA", name: "Botswana" },
	{ code: "CAF", name: "Central African Republic" },
	{ code: "CAN", name: "Canada" },
	{ code: "CCK", name: "Cocos (Keeling) Islands" },
	{ code: "CHE", name: "Switzerland" },
	{ code: "CHL", name: "Chile" },
	{ code: "CHN", name: "China" },
	{ code: "CIV", name: "Côte d'Ivoire" },
	{ code: "CMR", name: "Cameroon" },
	{ code: "COD", name: "Congo, Democratic Republic of the" },
	{ code: "COG", name: "Congo" },
	{ code: "COK", name: "Cook Islands" },
	{ code: "COL", name: "Colombia" },
	{ code: "COM", name: "Comoros" },
	{ code: "CPV", name: "Cabo Verde" },
	{ code: "CRI", name: "Costa Rica" },
	{ code: "CUB", name: "Cuba" },
	{ code: "CUW", name: "Curaçao" },
	{ code: "CXR", name: "Christmas Island" },
	{ code: "CYM", name: "Cayman Islands" },
	{ code: "CYP", name: "Cyprus" },
	{ code: "CZE", name: "Czechia" },
	{ code: "DEU", name: "Germany" },
	{ code: "DJI", name: "Djibouti" },
	{ code: "DMA", name: "Dominica" },
	{ code: "DNK", name: "Denmark" },
	{ code: "DOM", name: "Dominican Republic" },
	{ code: "DZA", name: "Algeria" },
	{ code: "ECU", name: "Ecuador" },
	{ code: "EGY", name: "Egypt" },
	{ code: "ERI", name: "Eritrea" },
	{ code: "ESH", name: "Western Sahara" },
	{ code: "ESP", name: "Spain" },
	{ code: "EST", name: "Estonia" },
	{ code: "ETH", name: "Ethiopia" },
	{ code: "FIN", name: "Finland" },
	{ code: "FJI", name: "Fiji" },
	{ code: "FLK", name: "Falkland Islands (Malvinas)" },
	{ code: "FRA", name: "France" },
	{ code: "FRO", name: "Faroe Islands" },
	{ code: "FSM", name: "Micronesia, Federated States of" },
	{ code: "GAB", name: "Gabon" },
	{ code: "GBR", name: "United Kingdom of Great Britain and Northern Ireland" },
	{ code: "GEO", name: "Georgia" },
	{ code: "GGY", name: "Guernsey" },
	{ code: "GHA", name: "Ghana" },
	{ code: "GIB", name: "Gibraltar" },
	{ code: "GIN", name: "Guinea" },
	{ code: "GLP", name: "Guadeloupe" },
	{ code: "GMB", name: "Gambia" },
	{ code: "GNB", name: "Guinea-Bissau" },
	{ code: "GNQ", name: "Equatorial Guinea" },
	{ code: "GRC", name: "Greece" },
	{ code: "GRD", name: "Grenada" },
	{ code: "GRL", name: "Greenland" },
	{ code: "GTM", name: "Guatemala" },
	{ code: "GUF", name: "French Guiana" },
	{ code: "GUM", name: "Guam" },
	{ code: "GUY", name: "Guyana" },
	{ code: "HKG", name: "Hong Kong" },
	{ code: "HMD", name: "Heard Island and McDonald Islands" },
	{ code: "HND", name: "Honduras" },
	{ code: "HRV", name: "Croatia" },
	{ code: "HTI", name: "Haiti" },
	{ code: "HUN", name: "Hungary" },
	{ code: "IDN", name: "Indonesia" },
	{ code: "IMN", name: "Isle of Man" },
	{ code: "IND", name: "India" },
	{ code: "IOT", name: "British Indian Ocean Territory" },
	{ code: "IRL", name: "Ireland" },
	{ code: "IRN", name: "Iran, Islamic Republic of" },
	{ code: "IRQ", name: "Iraq" },
	{ code: "ISL", name: "Iceland" },
	{ code: "ISR", name: "Israel" },
	{ code: "ITA", name: "Italy" },
	{ code: "JAM", name: "Jamaica" },
	{ code: "JEY", name: "Jersey" },
	{ code: "JOR", name: "Jordan" },
	{ code: "JPN", name: "Japan" },
	{ code: "KAZ", name: "Kazakhstan" },
	{ code: "KEN", name: "Kenya" },
	{ code: "KGZ", name: "Kyrgyzstan" },
	{ code: "KHM", name: "Cambodia" },
	{ code: "KIR", name: "Kiribati" },
	{ code: "KNA", name: "Saint Kitts and Nevis" },
	{ code: "KOR", name: "Korea, Republic of" },
	{ code: "KWT", name: "Kuwait" },
	{ code: "LAO", name: "Lao People's Democratic Republic" },
	{ code: "LBN", name: "Lebanon" },
	{ code: "LBR", name: "Liberia" },
	{ code: "LBY", name: "Libya" },
	{ code: "LCA", name: "Saint Lucia" },
	{ code: "LIE", name: "Liechtenstein" },
	{ code: "LKA", name: "Sri Lanka" },
	{ code: "LSO", name: "Lesotho" },
	{ code: "LTU", name: "Lithuania" },
	{ code: "LUX", name: "Luxembourg" },
	{ code: "LVA", name: "Latvia" },
	{ code: "MAC", name: "Macao" },
	{ code: "MAF", name: "Saint Martin (French part)" },
	{ code: "MAR", name: "Morocco" },
	{ code: "MCO", name: "Monaco" },
	{ code: "MDA", name: "Moldova, Republic of" },
	{ code: "MDG", name: "Madagascar" },
	{ code: "MDV", name: "Maldives" },
	{ code: "MEX", name: "Mexico" },
	{ code: "MHL", name: "Marshall Islands" },
	{ code: "MKD", name: "North Macedonia" },
	{ code: "MLI", name: "Mali" },
	{ code: "MLT", name: "Malta" },
	{ code: "MMR", name: "Myanmar" },
	{ code: "MNE", name: "Montenegro" },
	{ code: "MNG", name: "Mongolia" },
	{ code: "MNP", name: "Northern Mariana Islands" },
	{ code: "MOZ", name: "Mozambique" },
	{ code: "MRT", name: "Mauritania" },
	{ code: "MSR", name: "Montserrat" },
	{ code: "MTQ", name: "Martinique" },
	{ code: "MUS", name: "Mauritius" },
	{ code: "MWI", name: "Malawi" },
	{ code: "MYS", name: "Malaysia" },
	{ code: "MYT", name: "Mayotte" },
	{ code: "NAM", name: "Namibia" },
	{ code: "NCL", name: "New Caledonia" },
	{ code: "NER", name: "Niger" },
	{ code: "NFK", name: "Norfolk Island" },
	{ code: "NGA", name: "Nigeria" },
	{ code: "NIC", name: "Nicaragua" },
	{ code: "NIU", name: "Niue" },
	{ code: "NLD", name: "Netherlands, Kingdom of the" },
	{ code: "NOR", name: "Norway" },
	{ code: "NPL", name: "Nepal" },
	{ code: "NRU", name: "Nauru" },
	{ code: "NZL", name: "New Zealand" },
	{ code: "OMN", name: "Oman" },
	{ code: "PAK", name: "Pakistan" },
	{ code: "PAN", name: "Panama" },
	{ code: "PCN", name: "Pitcairn" },
	{ code: "PER", name: "Peru" },
	{ code: "PHL", name: "Philippines" },
	{ code: "PLW", name: "Palau" },
	{ code: "PNG", name: "Papua New Guinea" },
	{ code: "POL", name: "Poland" },
	{ code: "PRI", name: "Puerto Rico" },
	{ code: "PRK", name: "Korea, Democratic People's Republic of" },
	{ code: "PRT", name: "Portugal" },
	{ code: "PRY", name: "Paraguay" },
	{ code: "PSE", name: "Palestine, State of" },
	{ code: "PYF", name: "French Polynesia" },
	{ code: "QAT", name: "Qatar" },
	{ code: "REU", name: "Réunion" },
	{ code: "ROU", name: "Romania" },
	{ code: "RUS", name: "Russian Federation" },
	{ code: "RWA", name: "Rwanda" },
	{ code: "SAU", name: "Saudi Arabia" },
	{ code: "SDN", name: "Sudan" },
	{ code: "SEN", name: "Senegal" },
	{ code: "SGP", name: "Singapore" },
	{ code: "SGS", name: "South Georgia and the South Sandwich Islands" },
	{ code: "SHN", name: "Saint Helena, Ascension and Tristan da Cunha" },
	{ code: "SJM", name: "Svalbard and Jan Mayen" },
	{ code: "SLB", name: "Solomon Islands" },
	{ code: "SLE", name: "Sierra Leone" },
	{ code: "SLV", name: "El Salvador" },
	{ code: "SMR", name: "San Marino" },
	{ code: "SOM", name: "Somalia" },
	{ code: "SPM", name: "Saint Pierre and Miquelon" },
	{ code: "SRB", name: "Serbia" },
	{ code: "SSD", name: "South Sudan" },
	{ code: "STP", name: "Sao Tome and Principe" },
	{ code: "SUR", name: "Suriname" },
	{ code: "SVK", name: "Slovakia" },
	{ code: "SVN", name: "Slovenia" },
	{ code: "SWE", name: "Sweden" },
	{ code: "SWZ", name: "Eswatini" },
	{ code: "SXM", name: "Sint Maarten (Dutch part)" },
	{ code: "SYC", name: "Seychelles" },
	{ code: "SYR", name: "Syrian Arab Republic" },
	{ code: "TCA", name: "Turks and Caicos Islands" },
	{ code: "TCD", name: "Chad" },
	{ code: "TGO", name: "Togo" },
	{ code: "THA", name: "Thailand" },
	{ code: "TJK", name: "Tajikistan" },
	{ code: "TKL", name: "Tokelau" },
	{ code: "TKM", name: "Turkmenistan" },
	{ code: "TLS", name: "Timor-Leste" },
	{ code: "TON", name: "Tonga" },
	{ code: "TTO", name: "Trinidad and Tobago" },
	{ code: "TUN", name: "Tunisia" },
	{ code: "TUR", name: "Türkiye" },
	{ code: "TUV", name: "Tuvalu" },
	{ code: "TWN", name: "Taiwan, Province of China" },
	{ code: "TZA", name: "Tanzania, United Republic of" },
	{ code: "UGA", name: "Uganda" },
	{ code: "UKR", name: "Ukraine" },
	{ code: "UMI", name: "United States Minor Outlying Islands" },
	{ code: "URY", name: "Uruguay" },
	{ code: "USA", name: "United States of America" },
	{ code: "UZB", name: "Uzbekistan" },
	{ code: "VAT", name: "Holy See" },
	{ code: "VCT", name: "Saint Vincent and the Grenadines" },
	{ code: "VEN", name: "Venezuela, Bolivarian Republic of" },
	{ code: "VGB", name: "Virgin Islands (British)" },
	{ code: "VIR", name: "Virgin Islands (U.S.)" },
	{ code: "VNM", name: "Viet Nam" },
	{ code: "VUT", name: "Vanuatu" },
	{ code: "WLF", name: "Wallis and Futuna" },
	{ code: "WSM", name: "Samoa" },
	{ code: "YEM", name: "Yemen" },
	{ code: "ZAF", name: "South Africa" },
	{ code: "ZMB", name: "Zambia" },
	{ code: "ZWE", name: "Zimbabwe" },
] as const;

export type CountryCode = (typeof ALL_COUNTRIES_AND_CODE)[number]["code"];
