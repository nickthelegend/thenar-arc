// Generated from contracts/out/AxonProtocol.sol/AxonProtocol.json — do not edit by hand.
export const AXON_ABI = [
  {
    "type": "function",
    "name": "ACCEPT_FLOOR",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_SCORE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_SHARDS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PROTOCOL_FEE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "RUNS_PER_ACCOUNT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SLOTS_PER_SHARD",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "capTable",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "who",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "weightBps",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "payout",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claim",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimable",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "contributorsOf",
    "inputs": [
      {
        "name": "taskId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "createTask",
    "inputs": [
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "slots",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "rewardPerTrajectory",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "scenario",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "difficulty",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "taskId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "fundTask",
    "inputs": [
      {
        "name": "taskId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "getPolicy",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct AxonProtocol.Policy",
        "components": [
          {
            "name": "taskId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "minter",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "trajectories",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "mintedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "licenceFee",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "licencesSold",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "distributed",
            "type": "uint128",
            "internalType": "uint128"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTask",
    "inputs": [
      {
        "name": "taskId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "t",
        "type": "tuple",
        "internalType": "struct AxonProtocol.Task",
        "components": [
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "funder",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "rewardPerTrajectory",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "escrow",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "slotsTotal",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "slotsFilled",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "scenario",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "difficulty",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "policyMinted",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTasks",
    "inputs": [
      {
        "name": "offset",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "limit",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "type": "tuple[]",
        "internalType": "struct AxonProtocol.Task[]",
        "components": [
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "funder",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "rewardPerTrajectory",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "escrow",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "slotsTotal",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "slotsFilled",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "scenario",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "difficulty",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "policyMinted",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTrajectory",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct AxonProtocol.Trajectory",
        "components": [
          {
            "name": "taskId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "contributor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "trajHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "cid",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "score",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "paid",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "at",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "licensePolicy",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "mintPolicy",
    "inputs": [
      {
        "name": "taskId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "licenceFee",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "outputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "passkeys",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IPasskeyRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "policyCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "policyOfTask",
    "inputs": [
      {
        "name": "taskId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "minted",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "runDigest",
    "inputs": [
      {
        "name": "taskId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "contributor",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "trajHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "cid",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "score",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "runsOnTask",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "shardHasRoom",
    "inputs": [
      {
        "name": "taskId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "who",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "slotsFilledOf",
    "inputs": [
      {
        "name": "taskId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "total",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "stats",
    "inputs": [
      {
        "name": "who",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "runs",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "earned",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "meanScore",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "submitTrajectory",
    "inputs": [
      {
        "name": "taskId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "trajHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "cid",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "score",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "signature",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "trajectoryId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitTrajectoryWithPasskey",
    "inputs": [
      {
        "name": "taskId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "trajHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "cid",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "score",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "verifierSig",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "pr",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "ps",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "trajectoryId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "taskCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "taskTrajectories",
    "inputs": [
      {
        "name": "taskId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalEarned",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalRuns",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalScore",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "trajectoriesOf",
    "inputs": [
      {
        "name": "who",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "trajectoryCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "trajectoryUsed",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "treasury",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "verifier",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "weightOnTask",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "Claimed",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ContributorPaid",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "contributor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PasskeyRun",
    "inputs": [
      {
        "name": "trajectoryId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "contributor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PaymentDeferred",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PolicyLicensed",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "buyer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "paidOut",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PolicyMinted",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "taskId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "contributors",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "licenceFee",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TaskCreated",
    "inputs": [
      {
        "name": "taskId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "funder",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "name",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "slots",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "rewardPerTrajectory",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "scenario",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "difficulty",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TaskFilled",
    "inputs": [
      {
        "name": "taskId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TaskFunded",
    "inputs": [
      {
        "name": "taskId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TrajectoryAccepted",
    "inputs": [
      {
        "name": "trajectoryId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "taskId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "contributor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "trajHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "cid",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "score",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "paid",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyMinted",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AlreadySubmitted",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadPasskeySignature",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadSignature",
    "inputs": []
  },
  {
    "type": "error",
    "name": "CapReached",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EscrowEmpty",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoPasskey",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoPolicy",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoSlots",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotFilled",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotVerifier",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToClaim",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ScoreTooHigh",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ScoreTooLow",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ShardFull",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TaskClosed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TooManyContributors",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Underfunded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WrongFee",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroReward",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroSlots",
    "inputs": []
  }
] as const;
