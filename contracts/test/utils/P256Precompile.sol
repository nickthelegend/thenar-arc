// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {P256} from "@openzeppelin/contracts/utils/cryptography/P256.sol";

/**
 * Arc runs the secp256r1 verifier (RIP-7212 / EIP-7951) at 0x0100. The local
 * EVM (cancun, as foundry.toml pins it) has no precompile there, so the unit
 * suites install this stand-in at that address: the same 160-byte input, the
 * same answer (32 bytes of 1, or nothing), computed by OpenZeppelin's audited
 * Solidity P-256. The fork suites (test/fork) exercise Arc's real precompile.
 *
 * OpenZeppelin refuses high-s signatures and the precompile does not; tests
 * only ever feed it low-s signatures (see `lowS`).
 */
contract P256SolidityVerifier {
    fallback(bytes calldata input) external returns (bytes memory) {
        if (input.length != 160) return "";
        (bytes32 h, bytes32 r, bytes32 s, bytes32 x, bytes32 y) =
            abi.decode(input, (bytes32, bytes32, bytes32, bytes32, bytes32));
        return P256.verifySolidity(h, r, s, x, y) ? abi.encode(uint256(1)) : bytes("");
    }
}

library P256Precompile {
    address internal constant ADDR = address(0x100);
    uint256 internal constant N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;

    /// Install the stand-in at 0x0100 unless a real precompile already answers there.
    function ensure(Vm vm) internal {
        if (live(vm)) return;
        vm.etch(ADDR, address(new P256SolidityVerifier()).code);
    }

    /// Whether 0x0100 verifies a fresh signature.
    function live(Vm vm) internal view returns (bool) {
        uint256 key = 0xC0FFEE;
        bytes32 h = sha256("thenar p256 probe");
        (uint256 x, uint256 y) = vm.publicKeyP256(key);
        (bytes32 r, bytes32 s) = vm.signP256(key, h);
        s = lowS(s);
        (bool ok, bytes memory out) = ADDR.staticcall(abi.encodePacked(h, r, s, bytes32(x), bytes32(y)));
        return ok && out.length == 32 && uint256(bytes32(out)) == 1;
    }

    /// The low-s form of a P-256 signature's s (both forms are valid curve signatures).
    function lowS(bytes32 s) internal pure returns (bytes32) {
        return uint256(s) > N / 2 ? bytes32(N - uint256(s)) : s;
    }
}
