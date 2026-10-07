/**
 * ERC-8004 on Arc: agent identity and reputation registries.
 *
 * Thenar's verifier is an agent in Arc's Identity Registry. ThenarVerdicts
 * writes every verdict that moved money to the Reputation Registry against
 * it (tag1 "runVerdict", tag2 "thenar", value = score with 2 decimals,
 * feedbackHash = the run id). Buyer agents are agents too: they rate the
 * verifier after a purchase (tag1 "corpusQuality", feedbackHash = sha256 of
 * the bytes they were served), and SalesLog records their agent id beside
 * each sale.
 *
 * Pure and browser-safe: ABIs and tags.
 */
import { parseAbi } from "viem";

export const TAG_VERDICT = "runVerdict";
export const TAG_SOURCE = "thenar";
export const TAG_CORPUS_QUALITY = "corpusQuality";

export const IDENTITY_REGISTRY_ABI = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

export const REPUTATION_REGISTRY_ABI = parseAbi([
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
  "function getClients(uint256 agentId) view returns (address[])",
  "function getLastIndex(uint256 agentId, address clientAddress) view returns (uint64)",
  "function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)",
]);

/** A summary value as a number: getSummary's (value, decimals). */
export const summaryNumber = (value: bigint, decimals: number) => Number(value) / 10 ** decimals;
