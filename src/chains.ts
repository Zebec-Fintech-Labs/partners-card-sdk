/**
 * Supported Chain Ids by SDK
 */
export enum SupportedEvmChain {
	Mainnet = 1,
	Sepolia = 11155111,
	Base = 8453,
	Bsc = 56,
	BscTestnet = 97,
	// OdysseyTestnet = 131313,
	// Odyssey = 153153,
	Polygon = 137,
	PolygonAmoy = 80002,
}

export enum BittensorChain {
	Mainnet = 558,
	Testnet = 559,
}

export function parseSupportedChain(chainId: number) {
	switch (chainId) {
		case 1:
			return SupportedEvmChain.Mainnet;
		case 11155111:
			return SupportedEvmChain.Sepolia;
		case 8453:
			return SupportedEvmChain.Base;
		case 56:
			return SupportedEvmChain.Bsc;
		case 97:
			return SupportedEvmChain.BscTestnet;
		// case 131313:
		// 	return SupportedEvmChain.OdysseyTestnet;
		// case 153153:
		// 	return SupportedEvmChain.Odyssey;
		case 137:
			return SupportedEvmChain.Polygon;
		case 80002:
			return SupportedEvmChain.PolygonAmoy;
		default:
			throw new Error(`Chain Id: ${chainId} not supported.`);
	}
}

// /**
//  * Odyssey chain ids
//  */
// export const ODYSSEY_CHAIN_IDS = [SupportedEvmChain.Odyssey, SupportedEvmChain.OdysseyTestnet];

export const TESTNET_CHAINIDS = [
	SupportedEvmChain.BscTestnet,
	// SupportedEvmChain.OdysseyTestnet,
	SupportedEvmChain.PolygonAmoy,
	SupportedEvmChain.Sepolia,
];
