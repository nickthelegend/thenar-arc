/**
 * Synthetic network state.
 *
 * Axon has no traffic yet. These rows exist so the leaderboard and the foundry
 * can be built and judged as real surfaces; every screen that renders them
 * says so on the page. Nothing here is presented as a live figure, and none of
 * it is used in any claim about the product.
 */

export type Operator = {
  rank: number;
  address: string;
  trajectories: number;
  meanScore: number;
  scenarios: number;
  skills: number;
  earnedMon: number;
};

export const OPERATORS: Operator[] = [
  { rank: 1, address: "0x7a3f9c2e18b45d6a0f3e91c7b28d5a4e6f019c3d", trajectories: 412, meanScore: 8734, scenarios: 6, skills: 9, earnedMon: 148.62 },
  { rank: 2, address: "0x2d81b40fa9e7c356182d4b9f0ea3c718d602f5b9", trajectories: 388, meanScore: 8612, scenarios: 6, skills: 8, earnedMon: 136.04 },
  { rank: 3, address: "0xc95e720a34f8db61790c5e2a8b34f61d07e9a248", trajectories: 351, meanScore: 8590, scenarios: 5, skills: 9, earnedMon: 122.87 },
  { rank: 4, address: "0x4b17e8d0629af35c8140b7e3d95a2c60f8b14e77", trajectories: 344, meanScore: 8402, scenarios: 6, skills: 7, earnedMon: 117.31 },
  { rank: 5, address: "0xe60d3f81b7429ca50e83d16f2b904a7c5d3e802f", trajectories: 309, meanScore: 8377, scenarios: 5, skills: 8, earnedMon: 104.95 },
  { rank: 6, address: "0x8f24a1c76e0b95d3428fa60e1c73b95d02a4e6f8", trajectories: 287, meanScore: 8241, scenarios: 4, skills: 7, earnedMon: 96.18 },
  { rank: 7, address: "0x1c6b9e05d38a742f0b91e6c4a85d20f39b7e15ca", trajectories: 264, meanScore: 8115, scenarios: 5, skills: 6, earnedMon: 87.44 },
  { rank: 8, address: "0xa38f5d1902e6b47cf10d29a856b3e04c7f2a91d6", trajectories: 241, meanScore: 7988, scenarios: 4, skills: 7, earnedMon: 78.62 },
  { rank: 9, address: "0x5e90c48b1d27fa63e05b8c19d47f206a3e81b5c4", trajectories: 218, meanScore: 7854, scenarios: 4, skills: 5, earnedMon: 69.03 },
  { rank: 10, address: "0xb72e16d9c48035af6e19b2d70c85a34f1e9d602b", trajectories: 196, meanScore: 7712, scenarios: 3, skills: 6, earnedMon: 60.85 },
];

export type Policy = {
  id: string;
  taskId: string;
  name: string;
  trajectories: number;
  contributors: number;
  meanScore: number;
  licenceMon: number;
  licencesSold: number;
  mintedAt: string;
  /** Top contributors by weight, as they were snapshotted at mint. */
  capTable: { address: string; weightBps: number }[];
};

export const POLICIES: Policy[] = [
  {
    id: "POL-004",
    taskId: "AX-0104",
    name: "Transfer the hot dog to the right of the cucumber",
    trajectories: 1200,
    contributors: 318,
    meanScore: 8244,
    licenceMon: 42,
    licencesSold: 3,
    mintedAt: "2026-08-14",
    capTable: [
      { address: "0x7a3f9c2e18b45d6a0f3e91c7b28d5a4e6f019c3d", weightBps: 412 },
      { address: "0x2d81b40fa9e7c356182d4b9f0ea3c718d602f5b9", weightBps: 388 },
      { address: "0xc95e720a34f8db61790c5e2a8b34f61d07e9a248", weightBps: 351 },
      { address: "0x4b17e8d0629af35c8140b7e3d95a2c60f8b14e77", weightBps: 297 },
    ],
  },
  {
    id: "POL-003",
    taskId: "AX-0096",
    name: "Separate the spoon from the toast",
    trajectories: 1200,
    contributors: 284,
    meanScore: 8106,
    licenceMon: 38,
    licencesSold: 2,
    mintedAt: "2026-08-11",
    capTable: [
      { address: "0x2d81b40fa9e7c356182d4b9f0ea3c718d602f5b9", weightBps: 455 },
      { address: "0xe60d3f81b7429ca50e83d16f2b904a7c5d3e802f", weightBps: 361 },
      { address: "0x8f24a1c76e0b95d3428fa60e1c73b95d02a4e6f8", weightBps: 298 },
      { address: "0x1c6b9e05d38a742f0b91e6c4a85d20f39b7e15ca", weightBps: 241 },
    ],
  },
];
