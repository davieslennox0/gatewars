// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DuelEngine} from "./DuelEngine.sol";

/// @dev TAP-02 §6 read-only processor interface (selectors confirmed in TAP-02 and the circuit impl bytecode).
interface ICPU {
    function eval(uint256 id, bytes calldata inputs) external view returns (bytes memory);
    function circuitInfo(uint256 id) external view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount);
    function ownerOf(uint256 id) external view returns (address);
}

/// @notice Phase 0 benchmark harness. NOT a production contract.
contract RegistryBench {
    mapping(address => mapping(uint256 => uint64)) public strats;

    /// One eval, for per-call gas.
    function evalOnce(address cpu, uint256 id, uint8 input) external view returns (uint8) {
        return uint8(ICPU(cpu).eval(id, abi.encodePacked(input))[0]) & 1;
    }

    /// Full 64-entry cache build: circuitInfo check + 64 evals + 1 SSTORE.
    function submit(address cpu, uint256 id) external returns (uint64 t) {
        (uint32 nIn, uint32 nOut, uint32 nState,) = ICPU(cpu).circuitInfo(id);
        require(nIn == 6 && nOut == 1 && nState == 0, "shape");
        for (uint256 k; k < 64; ++k) {
            if (uint8(ICPU(cpu).eval(id, abi.encodePacked(uint8(k)))[0]) & 1 == 1) t |= uint64(1 << k);
        }
        strats[cpu][id] = t;
    }

    /// Partial build (for split-tx measurement): evaluates inputs [from, to).
    function submitRange(address cpu, uint256 id, uint256 from, uint256 to) external returns (uint64 t) {
        t = strats[cpu][id];
        for (uint256 k = from; k < to; ++k) {
            if (uint8(ICPU(cpu).eval(id, abi.encodePacked(uint8(k)))[0]) & 1 == 1) t |= uint64(1 << k);
        }
        strats[cpu][id] = t;
    }
}

contract ArenaBench {
    uint64[8] public strats;
    uint256 public winner;

    function load(uint64[8] calldata t) external {
        strats = t;
    }

    function match1(uint64 a, uint64 b, uint256 rounds) external pure returns (uint256, uint256) {
        return DuelEngine.play(a, b, rounds);
    }

    /// Round robin over the first n stored strats, then Solidity argmax with tie-break
    /// (1) head-to-head result between exactly two tied leaders, (2) earliest entry (lowest index).
    /// Writes the winner (1 SSTORE) so the measurement includes the settle write.
    function settle(uint256 n, uint256 rounds) external returns (uint256 w, uint256[8] memory s) {
        uint64[8] memory t = strats;
        uint256 h2h; // bit (i*8+j) set if i beat j
        for (uint256 i; i < n; ++i) {
            for (uint256 j = i + 1; j < n; ++j) {
                (uint256 a, uint256 b) = DuelEngine.play(t[i], t[j], rounds);
                s[i] += a;
                s[j] += b;
                if (a > b) h2h |= 1 << (i * 8 + j);
                else if (b > a) h2h |= 1 << (j * 8 + i);
            }
        }
        w = argmax(s, n, h2h);
        winner = w;
    }

    function argmax(uint256[8] memory s, uint256 n, uint256 h2h) public pure returns (uint256 w) {
        uint256 best;
        uint256 ties;
        for (uint256 i; i < n; ++i) {
            if (s[i] > best || i == 0) {
                best = s[i];
                w = i;
                ties = 1;
            } else if (s[i] == best) {
                ties++;
                if (ties == 2 && (h2h >> (i * 8 + w)) & 1 == 1) w = i; // later entrant beat leader head-to-head
            }
        }
        // ties > 2: keep earliest entry among... the leader found first unless displaced above (documented rule)
    }

    /// Argmax via a taped-out comparator circuit: 80 inputs (8 x 10-bit scores), 3-bit index out.
    function argmaxCircuit(address cpu, uint256 id, uint256[8] calldata s) external view returns (uint256) {
        uint256 packed;
        for (uint256 i; i < 8; ++i) packed |= (s[i] & 1023) << (i * 10);
        bytes memory inp = new bytes(10);
        for (uint256 k; k < 10; ++k) inp[k] = bytes1(uint8(packed >> (8 * k)));
        return uint8(ICPU(cpu).eval(id, inp)[0]) & 7;
    }
}

interface ITapeout {
    function tapeout(bytes calldata netlist, uint32 nIn, uint32 nOut) external payable returns (uint256);
    function ownerOf(uint256 id) external view returns (address);
}

/// @notice Checks that a contract (our registry) can tape out a user's netlist itself, burning the
/// transistors it holds, so the user's only call is to our contract.
contract TapeoutProxyBench {
    function submitNetlist(address cpu, bytes calldata netlist) external payable returns (uint256 id) {
        id = ITapeout(cpu).tapeout{value: msg.value}(netlist, 6, 1);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
