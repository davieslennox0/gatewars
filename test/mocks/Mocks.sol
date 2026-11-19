// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IAgentID, AggregatorV3Interface, ICircuitRegistry} from "../../contracts/interfaces/External.sol";

contract MockAgentID is IAgentID {
    mapping(address => string) public handles;

    function set(address who, string calldata h) external {
        handles[who] = h;
    }

    function balanceOf(address who) external view returns (uint256) {
        return bytes(handles[who]).length > 0 ? 1 : 0;
    }

    function handleOf(address who) external view returns (string memory) {
        return handles[who];
    }
}

contract MockFeed is AggregatorV3Interface {
    uint80 public roundId = 1;
    int256 public answer = 600e8;
    uint256 public updatedAt;
    uint80 public answeredInRound = 1;

    constructor() {
        updatedAt = block.timestamp;
    }

    function set(int256 a, uint256 u) external {
        answer = a;
        updatedAt = u;
        roundId++;
        answeredInRound = roundId;
    }

    function setRounds(uint80 r, uint80 air) external {
        roundId = r;
        answeredInRound = air;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, updatedAt, updatedAt, answeredInRound);
    }
}

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }
}

contract MockRegistry is ICircuitRegistry {
    struct C {
        address owner;
        uint64 table;
        bool starter;
    }

    mapping(uint256 => C) public cs;

    function set(uint256 id, address owner, uint64 table, bool starter) external {
        cs[id] = C(owner, table, starter);
    }

    function tableOf(uint256 id) external view returns (uint64) {
        return cs[id].table;
    }

    function ownerOf(uint256 id) external view returns (address) {
        return cs[id].owner;
    }

    function isStarter(uint256 id) external view returns (bool) {
        return cs[id].starter;
    }
}
