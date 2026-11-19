// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice SPACE ID Agent ID (HandleRegistry), BSC 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F.
/// Soulbound ERC-721, one handle per address, tokenId = keccak256(handle). See PHASE0.md §D.
interface IAgentID {
    function balanceOf(address owner) external view returns (uint256);
    function handleOf(address owner) external view returns (string memory);
}

/// @notice TapeOut processor factory, BSC 0x68224F668083c29e9800Be2a646d42d18cedF7e2 (PHASE0.md §A1/A2).
/// Deploy fee is pulled in BEM via transferFrom (factory.bem()).
interface ITapeOutFactory {
    function createCPU(string calldata name, string calldata symbol, string calldata story, uint256 transistorSupply, uint256 mintPrice)
        external
        payable
        returns (address transistors, address circuits);
    function deployFee() external view returns (uint256);
    function bem() external view returns (address);
}

/// @notice TapeOut processor ("circuits") contract, TAP-02 §6.
interface ITapeOutCPU {
    function tapeout(bytes calldata netlist, uint32 nIn, uint32 nOut) external payable returns (uint256 id);
    function eval(uint256 id, bytes calldata inputs) external view returns (bytes memory);
    function circuitInfo(uint256 id) external view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount);
    function TAPEOUT_FEE() external view returns (uint256);
    function transistors() external view returns (address);
    function ownerOf(uint256 id) external view returns (address);
}

/// @notice TapeOut transistor contract (ERC-1155, id 0 = NAND, id 1 = LATCH). On processors made by the current
/// factory, mint is paid in BEM: mintPrice * amount + protocolFee per call (PHASE0.md §A2, measured).
interface ITransistors {
    function mint(uint256 id, uint256 amount) external payable;
    function mintPrice() external view returns (uint256);
    function protocolFee() external view returns (uint256);
    function balanceOf(address owner, uint256 id) external view returns (uint256);
    function withdraw() external;
}

/// @notice Chainlink AggregatorV3Interface (BNB / USD on BSC: 0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE).
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @notice What the Arena needs from the CircuitRegistry.
interface ICircuitRegistry {
    function tableOf(uint256 circuitId) external view returns (uint64);
    function ownerOf(uint256 circuitId) external view returns (address);
    function isStarter(uint256 circuitId) external view returns (bool);
}
