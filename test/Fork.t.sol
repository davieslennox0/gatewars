// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {Arena} from "../contracts/Arena.sol";
import {CircuitRegistry} from "../contracts/CircuitRegistry.sol";
import {IAgentID, ITapeOutFactory, ITapeOutCPU, AggregatorV3Interface, ICircuitRegistry} from "../contracts/interfaces/External.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Fixtures} from "./fixtures/Fixtures.sol";

/// BSC mainnet fork tests. Run: forge test --match-path test/Fork.t.sol -vv  (BSC_RPC_URL in .env, archive-capable)
contract ForkTest is Test {
    IAgentID constant AGENT_ID = IAgentID(0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F);
    ITapeOutFactory constant FACTORY = ITapeOutFactory(0x68224F668083c29e9800Be2a646d42d18cedF7e2);
    AggregatorV3Interface constant FEED = AggregatorV3Interface(0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE);
    IERC20 constant USDC = IERC20(0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d);
    address constant BEM = 0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a;
    address constant HOLDER = 0xaca76DDEDDCe90B0f472922c39aC32B4D71760CD; // real Agent ID holder ("syke")

    CircuitRegistry reg;
    Arena arena;
    uint256 tft;
    uint256 grim;
    uint256 alld;
    uint256 n;

    function setUp() public {
        vm.createSelectFork(vm.envString("BSC_RPC_URL"));
        reg = new CircuitRegistry(address(this), AGENT_ID, FACTORY);
        deal(BEM, address(reg), 0.2e8); // 0.1 BEM deploy fee + transistor mint fees
        reg.createProcessor(1_000_000, 1);
        reg.mintTransistors(20_000);
        ITapeOutCPU cpu = reg.cpu();
        reg.seedStarters{value: 3 * cpu.TAPEOUT_FEE()}();
        (tft, grim, alld) = reg.starters();
        arena = new Arena(address(this), AGENT_ID, ICircuitRegistry(address(reg)), FEED, USDC);
    }

    receive() external payable {}

    /// Synthetic players: real Agent ID contract, balanceOf mocked to 1 for these addresses only.
    function agent() internal returns (address a) {
        a = makeAddr(string.concat("forkagent", vm.toString(++n)));
        vm.mockCall(address(AGENT_ID), abi.encodeWithSelector(IAgentID.balanceOf.selector, a), abi.encode(uint256(1)));
        vm.deal(a, 10 ether);
        deal(address(USDC), a, 1_000e18);
    }

    // ---------------------------------------------------------------- registry

    function test_fork_agentGateRealContract() public {
        assertGt(AGENT_ID.balanceOf(HOLDER), 0);
        address stranger = makeAddr("stranger");
        vm.deal(stranger, 1 ether);
        uint256 fee = reg.tapeOutFee(2);
        vm.prank(stranger);
        vm.expectRevert(CircuitRegistry.NotAgent.selector);
        reg.submitCircuit{value: fee}(Fixtures.TIT_FOR_TAT);
        vm.deal(HOLDER, 1 ether);
        vm.prank(HOLDER);
        uint256 id = reg.submitCircuit{value: fee}(Fixtures.TIT_FOR_TAT);
        assertEq(reg.ownerOf(id), HOLDER);
        assertEq(reg.cpu().ownerOf(id), address(reg), "registry owns the circuit NFT on chain");
        (uint256 q,) = arena.quoteEntry(Arena.Tier.ROOKIE);
        vm.prank(stranger);
        vm.expectRevert(Arena.NotAgent.selector);
        arena.enter{value: q}(Arena.Tier.ROOKIE, tft, Arena.PayAsset.BNB);
        vm.prank(HOLDER);
        arena.enter{value: q}(Arena.Tier.ROOKIE, id, Arena.PayAsset.BNB);
    }

    function test_fork_submitCacheMatchesDirectEval() public {
        address p = agent();
        bytes[3] memory nets = [Fixtures.TIT_FOR_TAT, Fixtures.GATES_88, Fixtures.GRIM_TRIGGER];
        ITapeOutCPU cpu = reg.cpu();
        for (uint256 k; k < 3; ++k) {
            uint256 fee = reg.tapeOutFee(nets[k].length / 7);
            vm.prank(p);
            uint256 id = reg.submitCircuit{value: fee}(nets[k]);
            uint64 t = reg.tableOf(id);
            for (uint256 i; i < 64; ++i) {
                uint8 direct = uint8(cpu.eval(id, abi.encodePacked(uint8(i)))[0]) & 1;
                assertEq((t >> i) & 1, direct, "cache != TapeOut eval");
            }
        }
        assertEq(reg.tableOf(tft), Fixtures.TIT_FOR_TAT_TABLE);
        assertEq(reg.tableOf(grim), Fixtures.GRIM_TRIGGER_TABLE);
        assertEq(reg.tableOf(alld), Fixtures.ALWAYS_DEFECT_TABLE);
        assertEq(reg.circuitsOf(p).length, 3);
    }

    function test_fork_submitFeeAndCaps() public {
        address p = agent();
        uint256 fee = reg.tapeOutFee(2);
        assertEq(fee, reg.cpu().TAPEOUT_FEE());
        vm.startPrank(p);
        vm.expectRevert(abi.encodeWithSelector(CircuitRegistry.WrongFee.selector, fee, fee + 1));
        reg.submitCircuit{value: fee + 1}(Fixtures.TIT_FOR_TAT);
        vm.expectRevert(abi.encodeWithSelector(CircuitRegistry.WrongFee.selector, fee, fee - 1));
        reg.submitCircuit{value: fee - 1}(Fixtures.TIT_FOR_TAT);
        vm.expectRevert(abi.encodeWithSelector(CircuitRegistry.TooManyGates.selector, 89));
        reg.submitCircuit{value: reg.tapeOutFee(89)}(Fixtures.GATES_89);
        vm.expectRevert(CircuitRegistry.BadNetlist.selector);
        reg.submitCircuit{value: fee}(hex"0100000200000500000008000008"); // LATCH opcode
        vm.expectRevert(CircuitRegistry.BadNetlist.selector);
        reg.submitCircuit{value: fee}(hex"000000020000");
        vm.stopPrank();
        // per-gate fee is exact too
        reg.setFeePerGate(1e12);
        assertEq(reg.tapeOutFee(2), fee + 2e12);
        vm.prank(p);
        reg.submitCircuit{value: fee + 2e12}(Fixtures.TIT_FOR_TAT);
        assertEq(reg.feesAccrued(), 2e12);
    }

    function test_fork_gas_submit() public {
        address p = agent();
        uint256 f2 = reg.tapeOutFee(2);
        uint256 f88 = reg.tapeOutFee(88);
        vm.prank(p);
        uint256 g = gasleft();
        reg.submitCircuit{value: f2}(Fixtures.TIT_FOR_TAT);
        console2.log("GAS submitCircuit 2-gate", g - gasleft());
        vm.prank(p);
        g = gasleft();
        reg.submitCircuit{value: f88}(Fixtures.GATES_88);
        console2.log("GAS submitCircuit 88-gate", g - gasleft());
    }

    // ---------------------------------------------------------------- pricing on the real feed

    function test_fork_quoteMatchesFeed() public view {
        (, int256 answer,, uint256 updatedAt,) = FEED.latestRoundData();
        assertGt(answer, 0);
        assertLe(vm.getBlockTimestamp() - updatedAt, 1 hours);
        (uint256 b, uint256 u) = arena.quoteEntry(Arena.Tier.ROOKIE);
        assertEq(b, uint256(1e8) * 1e18 / uint256(answer));
        assertEq(u, 1e18); // USDC has 18 decimals on BSC (checked on chain)
        console2.log("BNB/USD", uint256(answer), "rookie quote wei", b);
    }

    function test_fork_stalePriceReverts() public {
        (uint80 r, int256 a,, uint256 u,) = FEED.latestRoundData();
        vm.mockCall(address(FEED), abi.encodeWithSelector(AggregatorV3Interface.latestRoundData.selector), abi.encode(r, a, u, u, r));
        vm.warp(u + 1 hours + 1);
        vm.expectRevert(Arena.StalePrice.selector);
        arena.quoteEntry(Arena.Tier.ROOKIE);
    }

    function test_fork_overpayRefundAndRefundAfterPriceMove() public {
        address p = agent();
        (uint256 q,) = arena.quoteEntry(Arena.Tier.ROOKIE);
        uint256 b0 = p.balance;
        vm.prank(p);
        uint256 id = arena.enter{value: q * 101 / 100}(Arena.Tier.ROOKIE, tft, Arena.PayAsset.BNB);
        assertEq(b0 - p.balance, q);
        // price doubles, bracket expires, refund is still exactly q
        (uint80 r, int256 a,,,) = FEED.latestRoundData();
        vm.warp(vm.getBlockTimestamp() + 24 hours);
        vm.mockCall(address(FEED), abi.encodeWithSelector(AggregatorV3Interface.latestRoundData.selector), abi.encode(r + 1, a * 2, vm.getBlockTimestamp(), vm.getBlockTimestamp(), r + 1));
        vm.prank(p);
        arena.claimRefund(id);
        assertEq(p.balance, b0);
        _invariants();
    }

    // ---------------------------------------------------------------- full flows + gas

    function test_fork_mixedRookieBracketAndGas() public {
        address[8] memory ps;
        for (uint256 i; i < 8; ++i) {
            ps[i] = agent();
        }
        (uint256 qb, uint256 qu) = arena.quoteEntry(Arena.Tier.ROOKIE);
        uint256 id;
        // 5 BNB + 3 USDC. ps[0] plays ALLD; the seven cooperators tie and slot 1 wins on earliest entry.
        uint256 g;
        for (uint256 i; i < 8; ++i) {
            uint256 c = i == 0 ? alld : (i == 3 ? grim : tft);
            bool useUsdc = i == 1 || i == 3 || i == 5;
            if (useUsdc) {
                vm.prank(ps[i]);
                USDC.approve(address(arena), qu);
                vm.prank(ps[i]);
                g = gasleft();
                id = arena.enter(Arena.Tier.ROOKIE, c, Arena.PayAsset.USDC);
                if (i == 1) console2.log("GAS enter USDC (first entry, opens bracket)", g - gasleft());
                if (i == 5) console2.log("GAS enter USDC (mid bracket)", g - gasleft());
            } else {
                vm.prank(ps[i]);
                g = gasleft();
                id = arena.enter{value: qb * 101 / 100}(Arena.Tier.ROOKIE, c, Arena.PayAsset.BNB);
                if (i == 0) console2.log("GAS enter BNB (opens bracket, excess refund)", g - gasleft());
                if (i == 4) console2.log("GAS enter BNB (mid bracket, excess refund)", g - gasleft());
                if (i == 7) console2.log("GAS enter BNB (last entry -> FULL)", g - gasleft());
            }
        }
        g = gasleft();
        arena.settle(id);
        console2.log("GAS settle ROOKIE (8p, 28 matches x 20 rounds)", g - gasleft());
        address w = arena.game(id).winner;
        assertEq(w, ps[1]);
        uint256 pb = 5 * (qb * 8000 / 10000);
        uint256 pu = 3 * (qu * 8000 / 10000);
        uint256 b0 = w.balance;
        uint256 u0 = USDC.balanceOf(w);
        vm.prank(w);
        g = gasleft();
        arena.claim();
        console2.log("GAS claim (BNB + USDC)", g - gasleft());
        assertEq(w.balance - b0, pb);
        assertEq(USDC.balanceOf(w) - u0, pu);
        _invariants();
    }

    function test_fork_proAndChampionGas() public {
        address x = agent();
        address y = agent();
        address[] memory pros = new address[](3);
        address[] memory rook = new address[](7);
        for (uint256 i; i < 3; ++i) {
            pros[i] = agent();
        }
        for (uint256 i; i < 7; ++i) {
            rook[i] = agent();
        }
        _win(Arena.Tier.ROOKIE, x, rook);
        _win(Arena.Tier.ROOKIE, y, rook);
        for (uint256 i; i < 3; ++i) {
            _win(Arena.Tier.ROOKIE, pros[i], rook);
        }
        uint256 settleGas;
        for (uint256 k; k < 3; ++k) {
            settleGas = _win(Arena.Tier.PRO, x, pros);
            _win(Arena.Tier.PRO, y, pros);
        }
        console2.log("GAS settle PRO (4p, 6 matches x 20 rounds)", settleGas);
        (uint256 q,) = arena.quoteEntry(Arena.Tier.CHAMPION);
        vm.prank(x);
        uint256 g = gasleft();
        uint256 cid = arena.createChallenge{value: q}(tft, Arena.PayAsset.BNB);
        console2.log("GAS createChallenge BNB", g - gasleft());
        (, uint256 qu) = arena.quoteEntry(Arena.Tier.CHAMPION);
        vm.prank(y);
        USDC.approve(address(arena), qu);
        vm.prank(y);
        g = gasleft();
        arena.acceptChallenge(cid, grim, Arena.PayAsset.USDC); // TFT vs GRIM 60/60 -> tie split both assets
        console2.log("GAS acceptChallenge USDC (plays match, tie split)", g - gasleft());
        assertEq(arena.game(cid).winner, address(0));
        _invariants();
    }

    function _win(Arena.Tier t, address p, address[] memory f) internal returns (uint256 settleGas) {
        (uint256 q,) = arena.quoteEntry(t);
        vm.prank(p);
        uint256 id = arena.enter{value: q}(t, tft, Arena.PayAsset.BNB);
        uint256 size = t == Arena.Tier.ROOKIE ? 8 : 4;
        for (uint256 i; i < size - 1; ++i) {
            vm.prank(f[i]);
            arena.enter{value: q}(t, tft, Arena.PayAsset.BNB);
        }
        uint256 g = gasleft();
        arena.settle(id);
        settleGas = g - gasleft();
        assertEq(arena.game(id).winner, p);
    }

    function _invariants() internal view {
        assertGe(address(arena).balance, arena.locked(0) + arena.claimableTotal(0) + arena.treasury(0));
        assertGe(USDC.balanceOf(address(arena)), arena.locked(1) + arena.claimableTotal(1) + arena.treasury(1));
    }
}
