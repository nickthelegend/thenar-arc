// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAxon {
    struct Trajectory {
        uint256 taskId;
        address contributor;
        bytes32 trajHash;
        string cid;
        uint16 score;
        uint128 paid;
        uint64 at;
    }
    function getTrajectory(uint256 id) external view returns (Trajectory memory);
    function trajectoryCount() external view returns (uint256);
}

/**
 * @title TrajectoryCertificate
 * @notice A token that says "I recorded this run", and nothing else.
 *
 * A token per trajectory was rejected for contradicting the corpus-as-asset
 * model, and it would if it sold the data. It does not. The corpus is licensed
 * whole by AxonProtocol and this cannot license anything, transfer any right
 * to a recording, or affect a payout — the trajectory it names remains in the
 * corpus and remains licensable exactly as before.
 *
 * What it is for is provenance in the direction the protocol does not already
 * cover. The chain records that an address was paid for a run; that record is
 * a row in a contract nobody outside this project reads. A certificate is the
 * same fact in a form every wallet, marketplace and explorer already displays,
 * which is the only reason to mint one.
 *
 * Nothing here is asserted by the minter. The contract reads the protocol
 * itself for the contributor, the score and the task, so a certificate cannot
 * claim a run somebody else recorded, and it cannot exist at all for a run the
 * protocol never accepted.
 *
 * Deliberately soulbound. A transferable certificate is a claim about who
 * recorded something that can end up on an address that did not, which is the
 * precise thing this exists to make checkable.
 */
contract TrajectoryCertificate {
    IAxon public immutable axon;

    string public constant name = "Thenar Trajectory";
    string public constant symbol = "TRAJ";

    /// tokenId is the protocol's own trajectory id. There is nothing to
    /// allocate: the run already has a number and inventing a second one would
    /// mean two identifiers for one thing.
    mapping(uint256 => address) private _owner;
    mapping(address => uint256) private _balance;
    mapping(uint256 => bool) public minted;

    error AlreadyMinted();
    error NotTheContributor();
    error NoSuchTrajectory();
    error Soulbound();
    error NoToken();

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    constructor(address protocol) {
        axon = IAxon(protocol);
    }

    /**
     * @notice Mint the certificate for a run you recorded.
     *
     * Anyone may pay the gas, but the token can only ever go to the address
     * the protocol recorded as the contributor — read from the protocol, not
     * taken from the caller.
     */
    function mint(uint256 trajectoryId) external returns (address to) {
        if (trajectoryId >= axon.trajectoryCount()) revert NoSuchTrajectory();
        if (minted[trajectoryId]) revert AlreadyMinted();

        IAxon.Trajectory memory t = axon.getTrajectory(trajectoryId);
        to = t.contributor;
        if (to == address(0)) revert NotTheContributor();

        minted[trajectoryId] = true;
        _owner[trajectoryId] = to;
        _balance[to] += 1;
        emit Transfer(address(0), to, trajectoryId);
    }

    // ------------------------------------------------------------ ERC-721 view

    function ownerOf(uint256 tokenId) public view returns (address o) {
        o = _owner[tokenId];
        if (o == address(0)) revert NoToken();
    }

    function balanceOf(address who) external view returns (uint256) {
        return _balance[who];
    }

    /**
     * @notice The certificate's metadata, assembled from the protocol.
     *
     * Built at read time rather than stored: every field is already on chain
     * in the contract that paid for the run, and copying them here would
     * create a second version of the truth that could disagree with the first.
     */
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);
        IAxon.Trajectory memory t = axon.getTrajectory(tokenId);
        return string.concat(
            'data:application/json;utf8,{"name":"Trajectory #', _dec(tokenId),
            '","description":"A robot manipulation trajectory recorded on Thenar and paid for on chain. This certificate names its recorder; it conveys no rights over the data.",',
            '"attributes":[',
            '{"trait_type":"Task","value":', _dec(t.taskId), '},',
            '{"trait_type":"Score","value":', _dec(t.score), ',"max_value":10000},',
            '{"trait_type":"Recorded at","display_type":"date","value":', _dec(t.at), '},',
            '{"trait_type":"Trajectory hash","value":"', _hex(t.trajHash), '"}',
            ']}'
        );
    }

    // --------------------------------------------------------------- soulbound

    /// Transfers revert. The whole content of this token is who recorded
    /// something, and a claim about that which can move is not a claim.
    function transferFrom(address, address, uint256) external pure { revert Soulbound(); }
    function safeTransferFrom(address, address, uint256) external pure { revert Soulbound(); }
    function safeTransferFrom(address, address, uint256, bytes calldata) external pure { revert Soulbound(); }
    function approve(address, uint256) external pure { revert Soulbound(); }
    function setApprovalForAll(address, bool) external pure { revert Soulbound(); }
    function getApproved(uint256) external pure returns (address) { return address(0); }
    function isApprovedForAll(address, address) external pure returns (bool) { return false; }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        // ERC-165 and ERC-721 metadata. Not ERC-721 itself: this does not
        // implement transfer, and claiming the interface would tell a
        // marketplace it can list something it cannot move.
        return id == 0x01ffc9a7 || id == 0x5b5e139f;
    }

    // ------------------------------------------------------------------ format

    function _dec(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0";
        uint256 n = v;
        uint256 digits;
        while (n != 0) { digits += 1; n /= 10; }
        bytes memory b = new bytes(digits);
        while (v != 0) { digits -= 1; b[digits] = bytes1(uint8(48 + (v % 10))); v /= 10; }
        return string(b);
    }

    function _hex(bytes32 v) private pure returns (string memory) {
        bytes memory hexes = "0123456789abcdef";
        bytes memory out = new bytes(66);
        out[0] = "0"; out[1] = "x";
        for (uint256 i = 0; i < 32; i += 1) {
            out[2 + i * 2] = hexes[uint8(v[i] >> 4)];
            out[3 + i * 2] = hexes[uint8(v[i] & 0x0f)];
        }
        return string(out);
    }
}
