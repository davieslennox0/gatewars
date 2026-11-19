// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Arena} from "../contracts/Arena.sol";
import {DuelEngine} from "../contracts/DuelEngine.sol";
import {IAgentID, AggregatorV3Interface, ICircuitRegistry} from "../contracts/interfaces/External.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockAgentID, MockFeed, MockUSDC, MockRegistry} from "./mocks/Mocks.sol";
import {Fixtures} from "./fixtures/Fixtures.sol";

abstract contract ArenaBase is Test {
    MockAgentID aid;
    MockFeed feed;
    MockUSDC usdc;
    MockRegistry reg;
    Arena arena;
    address owner = makeAddr("owner");

    uint256 constant TFT = 1;
    uint256 constant GRIM = 2;
    uint256 constant ALLD = 3;
    uint256 agentNonce;

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        aid = new MockAgentID();
        feed = new MockFeed();
        usdc = new MockUSDC();
        reg = new MockRegistry();
        reg.set(TFT, address(reg), Fixtures.TIT_FOR_TAT_TABLE, true);
        reg.set(GRIM, address(reg), Fixtures.GRIM_TRIGGER_TABLE, true);
        reg.set(ALLD, address(reg), Fixtures.ALWAYS_DEFECT_TABLE, true);
        arena = new Arena(owner, IAgentID(address(aid)), ICircuitRegistry(address(reg)), AggregatorV3Interface(address(feed)), IERC20(address(usdc)));
    }

    function agent() internal returns (address a) {
        a = makeAddr(string.concat("agent", vm.toString(++agentNonce)));
        aid.set(a, string.concat("a", vm.toString(agentNonce)));
        vm.deal(a, 10 ether);
        usdc.mint(a, 1_000e18);
    }

    function enterBnb(address p, Arena.Tier t, uint256 c) internal returns (uint256 id) {
        (uint256 q,) = arena.quoteEntry(t);
        vm.prank(p);
        id = arena.enter{value: q}(t, c, Arena.PayAsset.BNB);
    }

    function enterUsdc(address p, Arena.Tier t, uint256 c) internal returns (uint256 id) {
        (, uint256 q) = arena.quoteEntry(t);
        vm.startPrank(p);
        usdc.approve(address(arena), q); // exact amount, never unlimited
        id = arena.enter(t, c, Arena.PayAsset.USDC);
        vm.stopPrank();
    }

    /// Fill a bracket of `tier` with `p` entering first (TFT) and fillers (TFT): everyone ties, earliest entry wins.
    function winBracket(Arena.Tier t, address p, address[] memory fillers) internal returns (uint256 id) {
        id = enterBnb(p, t, TFT);
        uint256 size = t == Arena.Tier.ROOKIE ? 8 : 4;
        for (uint256 i; i < size - 1; ++i) {
            enterBnb(fillers[i], t, TFT);
        }
        arena.settle(id);
        assertEq(arena.game(id).winner, p);
    }

    function fillers(uint256 n) internal returns (address[] memory f) {
        f = new address[](n);
        for (uint256 i; i < n; ++i) {
            f[i] = agent();
        }
    }

    function checkInvariants() internal view {
        assertGe(address(arena).balance, arena.locked(0) + arena.claimableTotal(0) + arena.treasury(0), "BNB invariant");
        assertGe(usdc.balanceOf(address(arena)), arena.locked(1) + arena.claimableTotal(1) + arena.treasury(1), "USDC invariant");
    }
}

contract DuelEngineTest is Test {
    function test_scores() public pure {
        (uint16 a, uint16 b,,) = DuelEngine.play(Fixtures.TIT_FOR_TAT_TABLE, Fixtures.ALWAYS_DEFECT_TABLE, 20);
        assertEq(a, 19);
        assertEq(b, 24);
        (a, b,,) = DuelEngine.play(Fixtures.TIT_FOR_TAT_TABLE, Fixtures.TIT_FOR_TAT_TABLE, 20);
        assertEq(a, 60);
        assertEq(b, 60);
        (a, b,,) = DuelEngine.play(Fixtures.GRIM_TRIGGER_TABLE, Fixtures.TIT_FOR_TAT_TABLE, 20);
        assertEq(a, 60);
        assertEq(b, 60);
    }

    function test_moves() public pure {
        (,, uint40 ma, uint40 mb) = DuelEngine.play(Fixtures.TIT_FOR_TAT_TABLE, Fixtures.ALWAYS_DEFECT_TABLE, 20);
        assertEq(ma, 1); // TFT cooperates in round 0 only
        assertEq(mb, 0);
        (,, ma, mb) = DuelEngine.play(Fixtures.TIT_FOR_TAT_TABLE, Fixtures.TIT_FOR_TAT_TABLE, 20);
        assertEq(ma, (1 << 20) - 1);
    }

    /// Fuzz: scores are symmetric under swapping the players, and bounded by 5 per round.
    function testFuzz_symmetry(uint64 a, uint64 b) public pure {
        (uint16 sa, uint16 sb, uint40 ma, uint40 mb) = DuelEngine.play(a, b, 20);
        (uint16 sb2, uint16 sa2, uint40 mb2, uint40 ma2) = DuelEngine.play(b, a, 20);
        assertEq(sa, sa2);
        assertEq(sb, sb2);
        assertEq(ma, ma2);
        assertEq(mb, mb2);
        assertLe(uint256(sa) + sb, 120);
    }
}

contract ArenaTest is ArenaBase {
    // ---------------------------------------------------------------- gate

    function test_agentGate() public {
        address stranger = makeAddr("stranger");
        vm.deal(stranger, 1 ether);
        (uint256 q,) = arena.quoteEntry(Arena.Tier.ROOKIE);
        vm.startPrank(stranger);
        vm.expectRevert(Arena.NotAgent.selector);
        arena.enter{value: q}(Arena.Tier.ROOKIE, TFT, Arena.PayAsset.BNB);
        vm.expectRevert(Arena.NotAgent.selector);
        arena.createChallenge{value: q}(TFT, Arena.PayAsset.BNB);
        vm.expectRevert(Arena.NotAgent.selector);
        arena.acceptChallenge{value: q}(1, TFT, Arena.PayAsset.BNB);
        vm.expectRevert(Arena.NotAgent.selector);
        arena.claim();
        vm.expectRevert(Arena.NotAgent.selector);
        arena.claimRefund(1);
        vm.stopPrank();
    }

    function test_circuitOwnership() public {
        address p = agent();
        address q = agent();
        reg.set(100, q, Fixtures.GATES_88_TABLE, false);
        (uint256 fee,) = arena.quoteEntry(Arena.Tier.ROOKIE);
        vm.prank(p);
        vm.expectRevert(Arena.NotYourCircuit.selector);
        arena.enter{value: fee}(Arena.Tier.ROOKIE, 100, Arena.PayAsset.BNB);
        vm.prank(p);
        vm.expectRevert(Arena.UnknownCircuit.selector);
        arena.enter{value: fee}(Arena.Tier.ROOKIE, 999, Arena.PayAsset.BNB);
        enterBnb(q, Arena.Tier.ROOKIE, 100); // own circuit ok
        enterBnb(p, Arena.Tier.ROOKIE, TFT); // starter ok
    }

    function test_oneEntryPerBracket() public {
        address p = agent();
        enterBnb(p, Arena.Tier.ROOKIE, TFT);
        (uint256 q,) = arena.quoteEntry(Arena.Tier.ROOKIE);
        vm.prank(p);
        vm.expectRevert(Arena.AlreadyEntered.selector);
        arena.enter{value: q}(Arena.Tier.ROOKIE, GRIM, Arena.PayAsset.BNB);
    }

    // ---------------------------------------------------------------- pricing

    function test_quoteMath() public view {
        (uint256 b, uint256 u) = arena.quoteEntry(Arena.Tier.ROOKIE);
        assertEq(b, uint256(1e8) * 1e18 / 600e8);
        assertEq(u, 1e18);
        (b, u) = arena.quoteEntry(Arena.Tier.CHAMPION);
        assertEq(b, uint256(10e8) * 1e18 / 600e8);
        assertEq(u, 10e18);
    }

    function test_overpayRefundsExcessExactly() public {
        address p = agent();
        (uint256 q,) = arena.quoteEntry(Arena.Tier.ROOKIE);
        uint256 before = p.balance;
        vm.prank(p);
        arena.enter{value: q * 101 / 100 + 7}(Arena.Tier.ROOKIE, TFT, Arena.PayAsset.BNB);
        assertEq(before - p.balance, q);
        assertEq(address(arena).balance, q);
        checkInvariants();
    }

    function test_underpayAndZeroRevert() public {
        address p = agent();
        (uint256 q,) = arena.quoteEntry(Arena.Tier.ROOKIE);
        vm.startPrank(p);
        vm.expectRevert(Arena.BadPayment.selector);
        arena.enter{value: q - 1}(Arena.Tier.ROOKIE, TFT, Arena.PayAsset.BNB);
        vm.expectRevert(Arena.BadPayment.selector);
        arena.enter{value: 0}(Arena.Tier.ROOKIE, TFT, Arena.PayAsset.BNB);
        vm.stopPrank();
    }

    function test_usdcWithValueReverts() public {
        address p = agent();
        vm.startPrank(p);
        usdc.approve(address(arena), 1e18);
        vm.expectRevert(Arena.BadPayment.selector);
        arena.enter{value: 1}(Arena.Tier.ROOKIE, TFT, Arena.PayAsset.USDC);
        vm.stopPrank();
    }

    function test_usdcInsufficientAllowanceReverts() public {
        address p = agent();
        vm.startPrank(p);
        usdc.approve(address(arena), 1e18 - 1);
        vm.expectRevert();
        arena.enter(Arena.Tier.ROOKIE, TFT, Arena.PayAsset.USDC);
        vm.stopPrank();
    }

    function test_stalePriceReverts() public {
        address p = agent();
        feed.set(600e8, vm.getBlockTimestamp());
        vm.warp(vm.getBlockTimestamp() + 1 hours + 1);
        vm.expectRevert(Arena.StalePrice.selector);
        arena.quoteEntry(Arena.Tier.ROOKIE);
        vm.prank(p);
        vm.expectRevert(Arena.StalePrice.selector);
        arena.enter{value: 1 ether}(Arena.Tier.ROOKIE, TFT, Arena.PayAsset.BNB);
        // USDC path never reads the oracle
        enterUsdcRaw(p, 1e18);
    }

    function enterUsdcRaw(address p, uint256 amt) internal {
        vm.startPrank(p);
        usdc.approve(address(arena), amt);
        arena.enter(Arena.Tier.ROOKIE, TFT, Arena.PayAsset.USDC);
        vm.stopPrank();
    }

    function test_badRoundAndAnswerRevert() public {
        feed.setRounds(5, 4);
        vm.expectRevert(Arena.StalePrice.selector);
        arena.price();
        feed.set(0, vm.getBlockTimestamp());
        vm.expectRevert(Arena.BadPrice.selector);
        arena.price();
        feed.set(-1, vm.getBlockTimestamp());
        vm.expectRevert(Arena.BadPrice.selector);
        arena.price();
    }

    // ---------------------------------------------------------------- full Rookie bracket, mixed assets

    function test_rookieMixedBracket() public {
        address[] memory ps = fillers(8);
        // slot 0 plays ALLD vs 7 TFT-ish: TFT entrants win. Make slot 3 (USDC) the unique winner: GRIM vs ALLD...
        // Entries: 0 ALLD(BNB) 1 TFT(USDC) 2 TFT(BNB) 3 GRIM(USDC) 4 TFT(BNB) 5 TFT(USDC) 6 TFT(BNB) 7 TFT(BNB)
        uint256 id = enterBnb(ps[0], Arena.Tier.ROOKIE, ALLD);
        enterUsdc(ps[1], Arena.Tier.ROOKIE, TFT);
        enterBnb(ps[2], Arena.Tier.ROOKIE, TFT);
        enterUsdc(ps[3], Arena.Tier.ROOKIE, GRIM);
        enterBnb(ps[4], Arena.Tier.ROOKIE, TFT);
        enterUsdc(ps[5], Arena.Tier.ROOKIE, TFT);
        enterBnb(ps[6], Arena.Tier.ROOKIE, TFT);
        assertEq(uint8(arena.game(id).state), uint8(Arena.State.OPEN));
        enterBnb(ps[7], Arena.Tier.ROOKIE, TFT);
        assertEq(uint8(arena.game(id).state), uint8(Arena.State.FULL));
        assertEq(arena.openBracket(Arena.Tier.ROOKIE), 0);
        checkInvariants();

        (uint256 qb, uint256 qu) = arena.quoteEntry(Arena.Tier.ROOKIE);
        uint256 poolB = 5 * (qb * 8000 / 10000);
        uint256 poolU = 3 * (qu * 8000 / 10000);
        assertEq(arena.game(id).poolBnb, poolB);
        assertEq(arena.game(id).poolUsdc, poolU);

        // everyone but ALLD scores 19 vs ALLD and 60 vs each other: all six TFT + GRIM tie at 379.
        // h2h among the tied seven: 60 x 6 = 360 each -> earliest entry among them = slot 1.
        arena.settle(id);
        address w = arena.game(id).winner;
        assertEq(w, ps[1]);
        assertEq(arena.record(w).rookieWins, 1);
        assertEq(arena.record(w).matchesPlayed, 7);
        assertEq(arena.record(ps[0]).wins, 7); // ALLD beats everyone head-to-head (24-19) but loses the bracket
        assertEq(arena.treasury(0), 5 * qb - poolB);
        assertEq(arena.treasury(1), 3 * qu - poolU);

        uint256 b0 = w.balance;
        uint256 u0 = usdc.balanceOf(w);
        vm.prank(w);
        arena.claim();
        assertEq(w.balance - b0, poolB);
        assertEq(usdc.balanceOf(w) - u0, poolU);
        vm.prank(w);
        vm.expectRevert(Arena.NothingToClaim.selector);
        arena.claim();
        checkInvariants();
        assertEq(address(arena).balance, arena.treasury(0));
        assertEq(usdc.balanceOf(address(arena)), arena.treasury(1));
    }

    function test_settleOnlyWhenFull() public {
        address p = agent();
        uint256 id = enterBnb(p, Arena.Tier.ROOKIE, TFT);
        vm.expectRevert(Arena.BadState.selector);
        arena.settle(id);
    }

    // ---------------------------------------------------------------- tie-breaks

    function test_tieBreak_headToHeadThenEarliest() public view {
        uint256[8] memory total;
        uint16[8][8] memory pts;
        // unique max
        total[2] = 10;
        total[5] = 9;
        assertEq(arena.pickWinner(total, pts, 8), 2);
        // tie on total, decided by head-to-head score
        total[5] = 10;
        pts[2][5] = 4;
        pts[5][2] = 9;
        assertEq(arena.pickWinner(total, pts, 8), 5);
        // tie on total and head-to-head -> earliest entry
        pts[2][5] = 9;
        assertEq(arena.pickWinner(total, pts, 8), 2);
        // three-way: h2h sums among the tied only
        total[7] = 10;
        pts[7][2] = 10;
        pts[7][5] = 10;
        assertEq(arena.pickWinner(total, pts, 8), 7);
    }

    // ---------------------------------------------------------------- Pro / Champion gating and flow

    function test_proUnlock() public {
        address p = agent();
        (uint256 q,) = arena.quoteEntry(Arena.Tier.PRO);
        vm.prank(p);
        vm.expectRevert(Arena.Locked.selector);
        arena.enter{value: q}(Arena.Tier.PRO, TFT, Arena.PayAsset.BNB);
        winBracket(Arena.Tier.ROOKIE, p, fillers(7));
        enterBnb(p, Arena.Tier.PRO, TFT);
    }

    function test_championFlowAndTieSplit() public {
        address x = agent();
        address y = agent();
        address[] memory pros = fillers(3);
        address[] memory rookies = fillers(7);
        winBracket(Arena.Tier.ROOKIE, x, rookies);
        winBracket(Arena.Tier.ROOKIE, y, rookies);
        for (uint256 i; i < 3; ++i) {
            winBracket(Arena.Tier.ROOKIE, pros[i], rookies);
        }
        (uint256 q,) = arena.quoteEntry(Arena.Tier.CHAMPION);
        vm.prank(x);
        vm.expectRevert(Arena.Locked.selector);
        arena.createChallenge{value: q}(TFT, Arena.PayAsset.BNB);
        for (uint256 k; k < 3; ++k) {
            winBracket(Arena.Tier.PRO, x, pros);
            winBracket(Arena.Tier.PRO, y, pros);
        }
        assertEq(arena.record(x).proWins, 3);

        vm.prank(x);
        uint256 cid = arena.createChallenge{value: q}(TFT, Arena.PayAsset.BNB);
        assertEq(arena.openChallenges().length, 1);
        vm.prank(x);
        vm.expectRevert(Arena.OwnChallenge.selector);
        arena.acceptChallenge{value: q}(cid, TFT, Arena.PayAsset.BNB);
        // locked acceptor
        vm.prank(pros[0]);
        vm.expectRevert(Arena.Locked.selector);
        arena.acceptChallenge{value: q}(cid, TFT, Arena.PayAsset.BNB);

        // y accepts paying USDC; TFT vs TFT = 60/60 -> split each asset
        (, uint256 qu) = arena.quoteEntry(Arena.Tier.CHAMPION);
        vm.startPrank(y);
        usdc.approve(address(arena), qu);
        arena.acceptChallenge(cid, TFT, Arena.PayAsset.USDC);
        vm.stopPrank();
        assertEq(arena.openChallenges().length, 0);
        uint256 pb = q * 8000 / 10000;
        uint256 pu = qu * 8000 / 10000;
        assertEq(arena.claimableBnb(x), pb - pb / 2);
        assertEq(arena.claimableBnb(y), pb / 2);
        assertEq(arena.claimableUsdc(x), pu - pu / 2);
        assertEq(arena.claimableUsdc(y), pu / 2);
        assertEq(arena.game(cid).winner, address(0));
        checkInvariants();
    }

    function test_championWinner() public {
        address x = agent();
        address y = agent();
        _forceChampions(x, y);
        (uint256 q,) = arena.quoteEntry(Arena.Tier.CHAMPION);
        vm.prank(x);
        uint256 cid = arena.createChallenge{value: q}(ALLD, Arena.PayAsset.BNB);
        vm.prank(y);
        arena.acceptChallenge{value: q}(cid, TFT, Arena.PayAsset.BNB); // ALLD 24 vs TFT 19
        assertEq(arena.game(cid).winner, x);
        assertEq(arena.claimableBnb(x), 2 * (q * 8000 / 10000));
        assertEq(arena.record(x).championWins, 1);
    }

    function _forceChampions(address x, address y) internal {
        address[] memory pros = fillers(3);
        address[] memory rookies = fillers(7);
        winBracket(Arena.Tier.ROOKIE, x, rookies);
        winBracket(Arena.Tier.ROOKIE, y, rookies);
        for (uint256 i; i < 3; ++i) {
            winBracket(Arena.Tier.ROOKIE, pros[i], rookies);
        }
        for (uint256 k; k < 3; ++k) {
            winBracket(Arena.Tier.PRO, x, pros);
            winBracket(Arena.Tier.PRO, y, pros);
        }
    }

    function test_challengeExpiryRefund() public {
        address x = agent();
        address y = agent();
        _forceChampions(x, y);
        (, uint256 qu) = arena.quoteEntry(Arena.Tier.CHAMPION);
        vm.startPrank(x);
        usdc.approve(address(arena), qu);
        uint256 cid = arena.createChallenge(TFT, Arena.PayAsset.USDC);
        vm.stopPrank();
        vm.warp(vm.getBlockTimestamp() + 24 hours);
        feed.set(600e8, vm.getBlockTimestamp());
        (uint256 q,) = arena.quoteEntry(Arena.Tier.CHAMPION);
        vm.prank(y);
        vm.expectRevert(Arena.Expired_.selector);
        arena.acceptChallenge{value: q}(cid, TFT, Arena.PayAsset.BNB);
        assertEq(arena.openChallenges().length, 0);
        uint256 u0 = usdc.balanceOf(x);
        vm.prank(x);
        arena.claimRefund(cid);
        assertEq(usdc.balanceOf(x) - u0, qu);
        checkInvariants();
    }

    // ---------------------------------------------------------------- expiry + refunds

    function test_expiryFullRefundsEvenIfPriceMoved() public {
        address a = agent();
        address b = agent();
        address c = agent();
        uint256 a0 = a.balance;
        (uint256 qb, uint256 qu) = arena.quoteEntry(Arena.Tier.ROOKIE);
        uint256 id = enterBnb(a, Arena.Tier.ROOKIE, TFT);
        enterUsdc(b, Arena.Tier.ROOKIE, TFT);
        enterBnb(c, Arena.Tier.ROOKIE, GRIM);
        vm.expectRevert(Arena.NotExpired.selector);
        arena.expire(id);
        vm.warp(vm.getBlockTimestamp() + 24 hours);
        feed.set(300e8, vm.getBlockTimestamp()); // BNB halves
        arena.expire(id);
        assertEq(arena.openBracket(Arena.Tier.ROOKIE), 0);

        vm.prank(a);
        arena.claimRefund(id);
        assertEq(a.balance, a0); // got exactly paidWei back
        uint256 bu = usdc.balanceOf(b);
        vm.prank(b);
        arena.claimRefund(id);
        assertEq(usdc.balanceOf(b) - bu, qu);
        vm.prank(b);
        vm.expectRevert(Arena.NotEntrant.selector);
        arena.claimRefund(id);
        vm.prank(agent());
        vm.expectRevert(Arena.NotEntrant.selector);
        arena.claimRefund(id);
        checkInvariants();
        assertEq(arena.locked(0), qb); // c not refunded yet
        assertEq(arena.treasury(0), 0);
        assertEq(arena.treasury(1), 0);
    }

    function test_staleOpenBracketRollsOver() public {
        address a = agent();
        uint256 id = enterBnb(a, Arena.Tier.ROOKIE, TFT);
        vm.warp(vm.getBlockTimestamp() + 24 hours);
        feed.set(600e8, vm.getBlockTimestamp());
        uint256 id2 = enterBnb(agent(), Arena.Tier.ROOKIE, TFT);
        assertTrue(id2 != id);
        assertEq(uint8(arena.game(id).state), uint8(Arena.State.EXPIRED));
        vm.prank(a);
        arena.claimRefund(id);
    }

    // ---------------------------------------------------------------- pause + owner powers

    function test_pauseNeverBlocksSettleClaimRefund() public {
        address[] memory ps = fillers(8);
        uint256 id;
        for (uint256 i; i < 8; ++i) {
            id = enterBnb(ps[i], Arena.Tier.ROOKIE, TFT);
        }
        address lone = agent();
        uint256 pid = enterUsdc(lone, Arena.Tier.ROOKIE, TFT); // next bracket, will expire

        vm.prank(owner);
        arena.pause();
        (uint256 q,) = arena.quoteEntry(Arena.Tier.ROOKIE);
        vm.prank(agent());
        vm.expectRevert();
        arena.enter{value: q}(Arena.Tier.ROOKIE, TFT, Arena.PayAsset.BNB);
        vm.prank(ps[0]);
        vm.expectRevert();
        arena.createChallenge{value: q}(TFT, Arena.PayAsset.BNB);

        arena.settle(id); // works while paused
        vm.prank(ps[0]);
        arena.claim(); // works while paused
        vm.warp(vm.getBlockTimestamp() + 24 hours);
        arena.expire(pid); // works while paused
        vm.prank(lone);
        arena.claimRefund(pid); // works while paused
        checkInvariants();
    }

    function test_ownerPowersBounded() public {
        address[] memory ps = fillers(8);
        uint256 id;
        for (uint256 i; i < 8; ++i) {
            id = enterBnb(ps[i], Arena.Tier.ROOKIE, TFT);
        }
        enterBnb(agent(), Arena.Tier.ROOKIE, TFT); // locked funds in the next bracket
        uint256 t0 = arena.treasury(0);
        assertEq(t0, 0); // 20% is booked only at settlement
        arena.settle(id);
        uint256 t = arena.treasury(0);
        vm.startPrank(owner);
        vm.expectRevert(Arena.OutOfRange.selector);
        arena.withdrawTreasury(Arena.PayAsset.BNB, payable(owner), t + 1);
        arena.withdrawTreasury(Arena.PayAsset.BNB, payable(owner), t);
        vm.expectRevert(Arena.OutOfRange.selector);
        arena.setMaxPriceAge(4 minutes);
        vm.expectRevert(Arena.OutOfRange.selector);
        arena.setMaxPriceAge(2 hours + 1);
        arena.setMaxPriceAge(2 hours);
        arena.setTierFeeUsd(Arena.Tier.ROOKIE, 2e8);
        vm.stopPrank();
        assertEq(owner.balance, t);
        checkInvariants();
        vm.prank(ps[1]);
        vm.expectRevert();
        arena.setTierFeeUsd(Arena.Tier.ROOKIE, 1);
        (, uint256 qu) = arena.quoteEntry(Arena.Tier.ROOKIE);
        assertEq(qu, 2e18);
    }
}
