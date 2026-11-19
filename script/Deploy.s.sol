// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Arena} from "../contracts/Arena.sol";
import {CircuitRegistry} from "../contracts/CircuitRegistry.sol";
import {IAgentID, ITapeOutFactory, AggregatorV3Interface, ICircuitRegistry} from "../contracts/interfaces/External.sol";

/// @notice Deploys GateWars on BSC mainnet.
///   1. CircuitRegistry
///   2. send BEM_FUND BEM to the registry (deployer must hold it)
///   3. registry.createProcessor(PROCESSOR_SUPPLY, MINT_PRICE)  -> GateWars TapeOut processor (0.1 BEM deploy fee)
///   4. registry.mintTransistors(INITIAL_NAND)                    -> NAND stock (mintPrice*n + 0.01 BEM protocol fee)
///   5. registry.seedStarters{value: 3 * TAPEOUT_FEE}             -> TIT_FOR_TAT, GRIM_TRIGGER, ALWAYS_DEFECT
///   6. Arena
///   7. write deployments/bsc.json
///
/// Dry run (fork, no broadcast; SIMULATE_BEM=1 gives the sender BEM in the simulation only):
///   SIMULATE_BEM=1 forge script script/Deploy.s.sol --fork-url $BSC_RPC_URL --sender <deployer>
/// Real run (STOP: only with the owner's explicit go):
///   forge script script/Deploy.s.sol --rpc-url $BSC_RPC_URL --account $DEPLOYER_ACCOUNT --sender <deployer> --broadcast
contract Deploy is Script, StdCheats {
    IAgentID constant AGENT_ID = IAgentID(0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F);
    ITapeOutFactory constant FACTORY = ITapeOutFactory(0x68224F668083c29e9800Be2a646d42d18cedF7e2);
    AggregatorV3Interface constant FEED = AggregatorV3Interface(0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE);
    IERC20 constant USDC = IERC20(0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d);
    IERC20 constant BEM = IERC20(0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a);

    uint256 constant PROCESSOR_SUPPLY = 1_000_000; // NAND cap of the GateWars processor
    uint256 constant MINT_PRICE = 1; // 1e-8 BEM per transistor
    uint256 constant INITIAL_NAND = 50_000; // ~550 max-size circuits, ~25,000 TFT-size
    // 0.1 BEM deploy fee + INITIAL_NAND * 1 unit + 0.01 BEM protocol fee = 0.1105 BEM; keep a small buffer
    uint256 constant BEM_FUND = 0.12e8;

    function run() external {
        address deployer = msg.sender;
        bool sim = vm.envOr("SIMULATE_BEM", uint256(0)) == 1;
        if (sim) {
            require(block.chainid == 56, "fork only");
            deal(address(BEM), deployer, BEM_FUND); // simulation only: never part of a broadcast
        }
        require(BEM.balanceOf(deployer) >= BEM_FUND, "deployer needs BEM_FUND BEM");
        uint256 deployFee = FACTORY.deployFee();
        console2.log("factory deployFee (BEM units)", deployFee);
        require(deployFee <= 0.11e8, "factory deploy fee changed - re-check PHASE0 A2");

        vm.startBroadcast(deployer);
        CircuitRegistry reg = new CircuitRegistry(deployer, AGENT_ID, FACTORY);
        BEM.transfer(address(reg), BEM_FUND);
        reg.createProcessor(PROCESSOR_SUPPLY, MINT_PRICE);
        reg.mintTransistors(INITIAL_NAND);
        uint256 tf = reg.cpu().TAPEOUT_FEE();
        reg.seedStarters{value: 3 * tf}();
        Arena arena = new Arena(deployer, AGENT_ID, ICircuitRegistry(address(reg)), FEED, USDC);
        vm.stopBroadcast();

        (uint256 tft, uint256 grim, uint256 alld) = reg.starters();
        string memory k = "bsc";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "owner", deployer);
        vm.serializeAddress(k, "CircuitRegistry", address(reg));
        vm.serializeAddress(k, "Arena", address(arena));
        vm.serializeAddress(k, "processor", address(reg.cpu()));
        vm.serializeAddress(k, "transistors", address(reg.transistors()));
        vm.serializeAddress(k, "agentId", address(AGENT_ID));
        vm.serializeAddress(k, "tapeoutFactory", address(FACTORY));
        vm.serializeAddress(k, "bnbUsdFeed", address(FEED));
        vm.serializeAddress(k, "usdc", address(USDC));
        vm.serializeUint(k, "TIT_FOR_TAT", tft);
        vm.serializeUint(k, "GRIM_TRIGGER", grim);
        vm.serializeUint(k, "ALWAYS_DEFECT", alld);
        string memory json = vm.serializeUint(k, "block", block.number);
        vm.writeJson(json, sim ? "./deployments/bsc.dryrun.json" : "./deployments/bsc.json");

        console2.log("CircuitRegistry", address(reg));
        console2.log("Arena", address(arena));
        console2.log("processor", address(reg.cpu()));
        console2.log("NAND stock", reg.nandBalance());
        console2.log("starters TFT/GRIM/ALLD", tft, grim, alld);
    }
}
