// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Arena} from "../contracts/Arena.sol";
import {IAgentID, AggregatorV3Interface, ICircuitRegistry} from "../contracts/interfaces/External.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockAgentID, MockFeed, MockUSDC, MockRegistry} from "./mocks/Mocks.sol";
import {Fixtures} from "./fixtures/Fixtures.sol";

contract Handler is Test {
    Arena public arena;
    MockUSDC public usdc;
    MockFeed public feed;
    address public owner;
    address[] public agents;
    uint256[] public ids;

    constructor(Arena a, MockUSDC u, MockFeed f, address o, address[] memory ag) {
        arena = a;
        usdc = u;
        feed = f;
        owner = o;
        agents = ag;
    }

    function _agent(uint256 s) internal view returns (address) {
        return agents[s % agents.length];
    }

    function enter(uint256 who, uint256 circ, bool useUsdc, uint256 overpayBps, bool pro) external {
        address p = _agent(who);
        Arena.Tier t = pro ? Arena.Tier.PRO : Arena.Tier.ROOKIE;
        uint256 c = 1 + (circ % 3);
        (uint256 qb, uint256 qu) = arena.quoteEntry(t);
        vm.startPrank(p);
        if (useUsdc) {
            usdc.approve(address(arena), qu);
            try arena.enter(t, c, Arena.PayAsset.USDC) returns (uint256 id) { ids.push(id); } catch {}
            usdc.approve(address(arena), 0);
        } else {
            uint256 v = qb + qb * (overpayBps % 500) / 10_000;
            try arena.enter{value: v}(t, c, Arena.PayAsset.BNB) returns (uint256 id) { ids.push(id); } catch {}
        }
        vm.stopPrank();
    }

    function challenge(uint256 who, uint256 circ, bool useUsdc) external {
        address p = _agent(who);
        (uint256 qb, uint256 qu) = arena.quoteEntry(Arena.Tier.CHAMPION);
        vm.startPrank(p);
        if (useUsdc) {
            usdc.approve(address(arena), qu);
            try arena.createChallenge(1 + circ % 3, Arena.PayAsset.USDC) returns (uint256 id) { ids.push(id); } catch {}
        } else {
            try arena.createChallenge{value: qb}(1 + circ % 3, Arena.PayAsset.BNB) returns (uint256 id) { ids.push(id); } catch {}
        }
        vm.stopPrank();
    }

    function accept(uint256 who, uint256 idx, uint256 circ, bool useUsdc) external {
        if (ids.length == 0) return;
        uint256 id = ids[idx % ids.length];
        address p = _agent(who);
        (uint256 qb, uint256 qu) = arena.quoteEntry(Arena.Tier.CHAMPION);
        vm.startPrank(p);
        if (useUsdc) {
            usdc.approve(address(arena), qu);
            try arena.acceptChallenge(id, 1 + circ % 3, Arena.PayAsset.USDC) {} catch {}
        } else {
            try arena.acceptChallenge{value: qb}(id, 1 + circ % 3, Arena.PayAsset.BNB) {} catch {}
        }
        vm.stopPrank();
    }

    function settle(uint256 idx) external {
        if (ids.length == 0) return;
        try arena.settle(ids[idx % ids.length]) {} catch {}
    }

    function warpAndExpire(uint256 idx, uint256 dt) external {
        dt = dt % 2 days;
        vm.warp(block.timestamp + dt);
        feed.set(int256(300e8 + int256(dt % 600e8)), block.timestamp); // price moves, stays fresh
        if (ids.length == 0) return;
        try arena.expire(ids[idx % ids.length]) {} catch {}
    }

    function refund(uint256 who, uint256 idx) external {
        if (ids.length == 0) return;
        vm.prank(_agent(who));
        try arena.claimRefund(ids[idx % ids.length]) {} catch {}
    }

    function claim(uint256 who) external {
        vm.prank(_agent(who));
        try arena.claim() {} catch {}
    }

    function withdraw(bool useUsdc, uint256 amt) external {
        Arena.PayAsset a = useUsdc ? Arena.PayAsset.USDC : Arena.PayAsset.BNB;
        uint256 t = arena.treasury(useUsdc ? 1 : 0);
        if (t == 0) return;
        vm.prank(owner);
        arena.withdrawTreasury(a, payable(owner), amt % (t + 1));
    }
}

contract ArenaInvariantTest is StdInvariant, Test {
    Arena arena;
    MockUSDC usdc;
    Handler h;

    function setUp() public {
        vm.warp(1_800_000_000);
        MockAgentID aid = new MockAgentID();
        MockFeed feed = new MockFeed();
        usdc = new MockUSDC();
        MockRegistry reg = new MockRegistry();
        reg.set(1, address(reg), Fixtures.TIT_FOR_TAT_TABLE, true);
        reg.set(2, address(reg), Fixtures.GRIM_TRIGGER_TABLE, true);
        reg.set(3, address(reg), Fixtures.ALWAYS_DEFECT_TABLE, true);
        address owner = makeAddr("owner");
        arena = new Arena(owner, IAgentID(address(aid)), ICircuitRegistry(address(reg)), AggregatorV3Interface(address(feed)), IERC20(address(usdc)));
        address[] memory ag = new address[](12);
        for (uint256 i; i < 12; ++i) {
            ag[i] = makeAddr(string.concat("p", vm.toString(i)));
            aid.set(ag[i], string.concat("p", vm.toString(i)));
            vm.deal(ag[i], 1_000 ether);
            usdc.mint(ag[i], 1_000_000e18);
        }
        // let some players unlock Pro/Champion quickly: grant via genuine play is slow; the handler still
        // exercises Pro/Champion reverts (Locked) and Rookie fully.
        h = new Handler(arena, usdc, feed, owner, ag);
        targetContract(address(h));
    }

    function invariant_bnbSolvent() public view {
        assertGe(address(arena).balance, arena.locked(0) + arena.claimableTotal(0) + arena.treasury(0));
    }

    function invariant_usdcSolvent() public view {
        assertGe(usdc.balanceOf(address(arena)), arena.locked(1) + arena.claimableTotal(1) + arena.treasury(1));
    }
}
