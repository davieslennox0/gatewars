// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {Netlists} from "./Netlists.sol";
import {RegistryBench, ArenaBench, ICPU, TapeoutProxyBench} from "../src/Bench.sol";
import {DuelEngine} from "../src/DuelEngine.sol";

interface IFactory {
    function createCPU(string calldata, string calldata, string calldata, uint256 transistorSupply, uint256 mintPrice)
        external
        payable
        returns (address transistors, address circuits);
    function cpuCount() external view returns (uint256);
    function cpuAt(uint256) external view returns (address);
    function deployFee() external view returns (uint256);
    function protocolFee() external view returns (uint256);
    function bem() external view returns (address);
}

interface ICircuits {
    function tapeout(bytes calldata netlist, uint32 nIn, uint32 nOut) external payable returns (uint256);
    function transistors() external view returns (address);
    function TAPEOUT_FEE() external view returns (uint256);
    function nextId() external view returns (uint256);
}

interface ITransistors {
    function mint(uint256 id, uint256 amount) external payable;
    function mintPrice() external view returns (uint256);
    function protocolFee() external view returns (uint256);
    function balanceOf(address, uint256) external view returns (uint256);
    function safeTransferFrom(address, address, uint256, uint256, bytes calldata) external;
}

interface IERC20 {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface IAgentID {
    function balanceOf(address) external view returns (uint256);
    function handleOf(address) external view returns (string memory);
    function ownerOf(uint256) external view returns (address);
    function transferFrom(address, address, uint256) external;
}

/// Phase 0 fork benchmarks. Run: FORK_RPC=<archive-capable BSC RPC> forge test -vv
contract Phase0Test is Test {
    IFactory constant FACTORY = IFactory(0x68224F668083c29e9800Be2a646d42d18cedF7e2);
    address constant BEM = 0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a;
    IAgentID constant AGENT_ID = IAgentID(0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F);
    // Mainnet circuit used by TAP-02 for its 2,317 gas/gate figure family: 1,204 NAND, nIn 16, top-level only.
    address constant CPU_1204 = 0x54840f62c9D6cF322A3972A6bE0bE16e76077cC0;
    address constant OWNER_WALLET = 0xaca76DDEDDCe90B0f472922c39aC32B4D71760CD; // has an Agent ID ("syke")

    ICircuits cpu;
    ITransistors tr;
    RegistryBench reg;
    ArenaBench arena;
    uint256 idALLD;
    uint256 idTFT;
    uint256 idGRIM;
    uint256 idLUT;
    uint256 idARGMAX;

    function setUp() public {
        vm.createSelectFork(vm.envString("FORK_RPC"));
        vm.deal(address(this), 100 ether);

        // 1. Create a processor. Factory deploy fee is pulled in BEM (factory.bem() == BEM).
        uint256 fee = FACTORY.deployFee();
        deal(BEM, address(this), 100_000 * 1e8);
        IERC20(BEM).approve(address(FACTORY), type(uint256).max);
        uint256 bemBefore = IERC20(BEM).balanceOf(address(this));
        (address t, address c) = FACTORY.createCPU("GateWars Bench", "GWB", "phase0", 100_000, 1);
        console2.log("createCPU: deployFee (raw)", fee, "BEM spent (1e8 units)", bemBefore - IERC20(BEM).balanceOf(address(this)));
        cpu = ICircuits(c);
        tr = ITransistors(t);
        require(ICircuits(c).transistors() == t, "transistors mismatch");

        // 2. Mint NAND transistors (id 0). Price = mintPrice * amount + protocolFee (from the official frontend).
        uint256 need = 2000;
        uint256 v = tr.mintPrice() * need + tr.protocolFee();
        uint256 bnbBefore = address(this).balance;
        bemBefore = IERC20(BEM).balanceOf(address(this));
        try tr.mint{value: v}(0, need) {}
        catch {
            IERC20(BEM).approve(address(tr), type(uint256).max);
            tr.mint(0, need);
        }
        console2.log("mint 2000 NAND: BNB spent", bnbBefore - address(this).balance, "BEM spent", bemBefore - IERC20(BEM).balanceOf(address(this)));
        require(tr.balanceOf(address(this), 0) >= need, "no transistors");

        // 3. Tape out the reference netlists.
        uint256 tf = cpu.TAPEOUT_FEE();
        idALLD = _tapeout(Netlists.ALLD, 6, 1, tf, "ALLD");
        idTFT = _tapeout(Netlists.TFT, 6, 1, tf, "TFT");
        idGRIM = _tapeout(Netlists.GRIM, 6, 1, tf, "GRIM");
        idLUT = _tapeout(Netlists.LUT_RANDOM, 6, 1, tf, "LUT_RANDOM");
        idARGMAX = _tapeout(Netlists.ARGMAX8x10, 80, 3, tf, "ARGMAX8x10");

        reg = new RegistryBench();
        arena = new ArenaBench();
    }

    function _tapeout(bytes memory n, uint32 nIn, uint32 nOut, uint256 tf, string memory name) internal returns (uint256 id) {
        uint256 g = gasleft();
        id = cpu.tapeout{value: tf}(n, nIn, nOut);
        console2.log(string.concat("tapeout ", name, ": id / gas / netlist bytes"), id, g - gasleft(), n.length);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // ---------------------------------------------------------------- A3/B5: single eval

    function test_B5_evalOnce() public view {
        _evalOnce(idALLD, "ALLD", Netlists.ALLD_GATES);
        _evalOnce(idTFT, "TFT", Netlists.TFT_GATES);
        _evalOnce(idGRIM, "GRIM", Netlists.GRIM_GATES);
        _evalOnce(idLUT, "LUT_RANDOM", Netlists.LUT_RANDOM_GATES);
    }

    function _evalOnce(uint256 id, string memory name, uint32 gates) internal view {
        // first call in the test is cold (account + SSTORE2 chunk), second is warm
        uint256 g = gasleft();
        ICPU(address(cpu)).eval(id, hex"2a");
        uint256 cold = g - gasleft();
        g = gasleft();
        ICPU(address(cpu)).eval(id, hex"15");
        uint256 warm = g - gasleft();
        console2.log(string.concat("eval ", name, " gates / cold gas / warm gas"), gates, cold, warm);
    }

    /// A3: a third-party contract can call eval in a view; it moves no tokens.
    function test_A3_thirdPartyEvalIsViewAndFree() public {
        uint256 bal = tr.balanceOf(address(this), 0);
        assertEq(reg.evalOnce(address(cpu), idTFT, 0x08), 1); // opp cooperated last -> cooperate
        assertEq(reg.evalOnce(address(cpu), idTFT, 0x07), 0); // opp defected last -> defect
        assertEq(tr.balanceOf(address(this), 0), bal, "eval must not burn transistors");
        vm.prank(address(0xBEEF)); // any caller, not the circuit owner
        assertEq(reg.evalOnce(address(cpu), idGRIM, 0x09), 1);
    }

    function test_B5_eval1204GateMainnetCircuit() public view {
        (,,, uint32 gates) = ICPU(CPU_1204).circuitInfo(1);
        uint256 g = gasleft();
        ICPU(CPU_1204).eval(1, hex"0000");
        uint256 cold = g - gasleft();
        g = gasleft();
        ICPU(CPU_1204).eval(1, hex"ffff");
        uint256 warm = g - gasleft();
        console2.log("eval mainnet 0x5484..#1 gates / cold / warm", gates, cold, warm);
        console2.log("  warm gas per gate x100", warm * 100 / gates);
    }

    function test_B9_evalArgmaxCircuit() public view {
        uint256 g = gasleft();
        bytes memory o = ICPU(address(cpu)).eval(idARGMAX, Netlists.ARGMAX_IN0);
        uint256 cold = g - gasleft();
        assertEq(uint8(o[0]) & 7, Netlists.ARGMAX_WIN0);
        g = gasleft();
        o = ICPU(address(cpu)).eval(idARGMAX, Netlists.ARGMAX_IN1);
        uint256 warm = g - gasleft();
        assertEq(uint8(o[0]) & 7, Netlists.ARGMAX_WIN1);
        console2.log("eval ARGMAX8x10 gates / cold / warm", Netlists.ARGMAX8x10_GATES, cold, warm);
        console2.log("  warm gas per gate x100", warm * 100 / Netlists.ARGMAX8x10_GATES);
    }

    // ---------------------------------------------------------------- B6: cache build

    function test_B6_cacheBuild() public {
        _cache(idALLD, "ALLD", Netlists.ALLD_TABLE);
        _cache(idTFT, "TFT", Netlists.TFT_TABLE);
        _cache(idGRIM, "GRIM", Netlists.GRIM_TABLE);
        _cache(idLUT, "LUT_RANDOM", Netlists.LUT_RANDOM_TABLE);
    }

    function _cache(uint256 id, string memory name, uint64 want) internal {
        RegistryBench r = new RegistryBench(); // fresh storage: SSTORE 0 -> nonzero, cold cpu
        uint256 g = gasleft();
        uint64 t = r.submit(address(cpu), id);
        uint256 used = g - gasleft();
        assertEq(t, want, "table mismatch vs TAP-02 reference simulator");
        console2.log(string.concat("cache64 ", name, " exec gas"), used);
    }

    function test_B6_cacheSplit() public {
        RegistryBench r = new RegistryBench();
        uint256 g = gasleft();
        r.submitRange(address(cpu), idLUT, 0, 32);
        uint256 a = g - gasleft();
        g = gasleft();
        r.submitRange(address(cpu), idLUT, 32, 64);
        uint256 b = g - gasleft();
        assertEq(r.strats(address(cpu), idLUT), Netlists.LUT_RANDOM_TABLE);
        console2.log("cache LUT split 2x32 exec gas", a, b);
    }

    // ---------------------------------------------------------------- B7: one match

    function test_B7_match() public view {
        uint64[4] memory ts = [Netlists.TFT_TABLE, Netlists.GRIM_TABLE, Netlists.ALLD_TABLE, Netlists.LUT_RANDOM_TABLE];
        for (uint256 rr = 10; rr <= 20; rr += 10) {
            uint256 g = gasleft();
            (uint256 a, uint256 b) = arena.match1(ts[0], ts[2], rr);
            uint256 used = g - gasleft();
            console2.log("match TFT vs ALLD rounds / gas / scores", rr, used, a * 1000 + b);
        }
        // semantic checks
        (uint256 x, uint256 y) = DuelEngine.play(Netlists.TFT_TABLE, Netlists.ALLD_TABLE, 10);
        assertEq(x, 9); // 0 + 9x1
        assertEq(y, 14); // 5 + 9x1
        (x, y) = DuelEngine.play(Netlists.TFT_TABLE, Netlists.GRIM_TABLE, 10);
        assertEq(x, 30);
        assertEq(y, 30);
        (x, y) = DuelEngine.play(Netlists.GRIM_TABLE, Netlists.ALLD_TABLE, 20);
        assertEq(x, 19);
        assertEq(y, 24);
    }

    // ---------------------------------------------------------------- B8/B9: bracket settle + argmax

    function _load8() internal {
        arena.load(
            [
                Netlists.TFT_TABLE,
                Netlists.GRIM_TABLE,
                Netlists.ALLD_TABLE,
                Netlists.LUT_RANDOM_TABLE,
                uint64(0xFFFFFFFFFFFFFFFF), // always cooperate
                uint64(0x0F0F0F0F0F0F0F0F),
                uint64(0x123456789ABCDEF0),
                uint64(0xDEADBEEFCAFEBABE)
            ]
        );
    }

    function test_B8_settleRookieAndPro() public {
        _load8();
        for (uint256 rr = 10; rr <= 20; rr += 10) {
            uint256 g = gasleft();
            (uint256 w,) = arena.settle(8, rr);
            uint256 rookie = g - gasleft();
            g = gasleft();
            (uint256 w4,) = arena.settle(4, rr);
            uint256 pro = g - gasleft();
            console2.log("settle rounds / rookie(8p,28m) gas / pro(4p,6m) gas", rr, rookie, pro);
            console2.log("  winners", w, w4);
        }
    }

    function test_B9_argmaxSolidity() public view {
        uint256[8] memory s = [uint256(210), 260, 155, 260, 300, 120, 199, 300];
        uint256 g = gasleft();
        uint256 w = arena.argmax(s, 8, 0);
        uint256 used = g - gasleft();
        assertEq(w, 4); // tie 4 vs 7 at 300, no h2h bit -> earliest entry
        console2.log("argmax solidity (external call) gas", used);
        g = gasleft();
        uint256 w2 = arena.argmaxCircuit(address(cpu), idARGMAX, s);
        used = g - gasleft();
        assertEq(w2, 4);
        console2.log("argmax via TapeOut circuit (external call) gas", used);
    }

    // ---------------------------------------------------------------- D14: Agent ID

    function test_D14_agentId() public {
        assertGt(AGENT_ID.balanceOf(OWNER_WALLET), 0);
        assertEq(AGENT_ID.balanceOf(address(0xBEEF)), 0);
        string memory h = AGENT_ID.handleOf(OWNER_WALLET);
        console2.log("handleOf(owner wallet)", h);
        uint256 tokenId = uint256(keccak256(bytes(h)));
        assertEq(AGENT_ID.ownerOf(tokenId), OWNER_WALLET);
        vm.prank(OWNER_WALLET);
        vm.expectRevert(bytes4(keccak256("Soulbound()")));
        AGENT_ID.transferFrom(OWNER_WALLET, address(0xBEEF), tokenId);
    }

    // ---------------------------------------------------------------- Architecture: tape out via our contract

    function test_A2_tapeoutViaContract() public {
        TapeoutProxyBench px = new TapeoutProxyBench();
        tr.safeTransferFrom(address(this), address(px), 0, 100, "");
        uint256 mine = tr.balanceOf(address(this), 0);
        uint256 g = gasleft();
        uint256 id = px.submitNetlist{value: cpu.TAPEOUT_FEE()}(address(cpu), Netlists.TFT);
        console2.log("tapeout TFT via contract: gas", g - gasleft());
        assertEq(ICPU(address(cpu)).ownerOf(id), address(px), "circuit NFT goes to the calling contract");
        assertEq(tr.balanceOf(address(px), 0), 98, "burned 2 NAND from the contract");
        assertEq(tr.balanceOf(address(this), 0), mine, "user transistors untouched");
        RegistryBench r = new RegistryBench();
        assertEq(r.submit(address(cpu), id), Netlists.TFT_TABLE);
    }
}
