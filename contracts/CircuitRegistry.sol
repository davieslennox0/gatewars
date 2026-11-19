// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {IAgentID, ITapeOutFactory, ITapeOutCPU, ITransistors, ICircuitRegistry} from "./interfaces/External.sol";

/// @title GateWars CircuitRegistry
/// @notice Strategies are TapeOut circuits with 6 inputs and 1 output. A player submits a NAND netlist; this
///         contract tapes it out on the GateWars TapeOut processor (it pays with transistors it holds and owns the
///         circuit NFT on chain), evaluates it on all 64 inputs in the same transaction, and stores the result as a
///         uint64 table. Matches only read that table.
///
/// @dev Input encoding (TAP-02 §5 packing, LSB first) — the circuit's input i is bit i of the packed byte:
///        bit0 = own move t-1 (most recent), bit1 = own t-2, bit2 = own t-3,
///        bit3 = opponent move t-1,          bit4 = opp t-2,  bit5 = opp t-3.
///      Move 1 = cooperate, 0 = defect. History starts as all cooperate (1). Output 1 = cooperate.
///      table bit k = circuit output for packed input k.
///
///      Netlists are restricted to NAND records (opcode 0x00, 7 bytes each): no LATCH (state would make the
///      strategy non-cacheable) and no REF (gate cost not visible from the bytes). gateCount = netlist.length / 7.
contract CircuitRegistry is ICircuitRegistry, Ownable2Step, Pausable, ReentrancyGuard, ERC1155Holder, ERC721Holder {
    using SafeERC20 for IERC20;

    /// @notice 88 gates keeps tape-out + 64 evals inside one transaction (measured in phase1/gas.md).
    uint32 public constant MAX_GATES = 88;
    uint256 internal constant NAND_ID = 0;

    IAgentID public immutable agentId;
    ITapeOutFactory public immutable factory;
    IERC20 public immutable bem;

    ITapeOutCPU public cpu;
    ITransistors public transistors;

    /// @notice BNB charged per gate on top of the TapeOut fee, to cover the transistors this contract burns.
    ///         Owner-settable (OWNER_POWERS.md). Default 0: GateWars transistors cost 1e-8 BEM each.
    uint256 public feePerGateWei;
    /// @notice Per-gate fees collected (the TapeOut fee itself is forwarded in the same call). Owner-withdrawable.
    uint256 public feesAccrued;

    struct Circuit {
        address owner; // msg.sender at submission; address(this) for starters
        uint64 table;
        uint32 gates;
        uint40 createdAt;
        bytes32 netlistHash;
    }

    mapping(uint256 => Circuit) internal _circuits;
    mapping(address => uint256[]) internal _byOwner;
    mapping(uint256 => bool) public isStarter;
    uint256 public TIT_FOR_TAT;
    uint256 public GRIM_TRIGGER;
    uint256 public ALWAYS_DEFECT;

    event ProcessorCreated(address cpu, address transistors, uint256 supply, uint256 mintPrice);
    event TransistorsMinted(uint256 amount, uint256 bemPaid);
    event CircuitSubmitted(uint256 indexed circuitId, address indexed owner, string handle, uint32 gateCount, uint64 table);
    event FeePerGateSet(uint256 weiPerGate);
    event FeesWithdrawn(address to, uint256 amount);
    event TokenRescued(address token, address to, uint256 amount);

    error NotAgent();
    error BadNetlist();
    error TooManyGates(uint256 gates);
    error WrongFee(uint256 expected, uint256 sent);
    error NoProcessor();
    error AlreadySet();
    error BadShape();

    modifier onlyAgent() {
        if (agentId.balanceOf(msg.sender) == 0) revert NotAgent();
        _;
    }

    constructor(address owner_, IAgentID agentId_, ITapeOutFactory factory_) Ownable(owner_) {
        agentId = agentId_;
        factory = factory_;
        bem = IERC20(factory_.bem());
    }

    // ------------------------------------------------------------------ setup (owner, once)

    /// @notice Create the GateWars processor. This contract must already hold `factory.deployFee()` BEM.
    function createProcessor(uint256 supply, uint256 mintPrice) external onlyOwner {
        if (address(cpu) != address(0)) revert AlreadySet();
        uint256 fee = factory.deployFee();
        bem.forceApprove(address(factory), fee);
        (address t, address c) = factory.createCPU("GateWars", "GWAR", "GateWars strategy circuits", supply, mintPrice);
        bem.forceApprove(address(factory), 0);
        cpu = ITapeOutCPU(c);
        transistors = ITransistors(t);
        emit ProcessorCreated(c, t, supply, mintPrice);
    }

    /// @notice Buy NAND transistors with BEM this contract holds (exact approval, reset after).
    function mintTransistors(uint256 amount) external onlyOwner {
        if (address(transistors) == address(0)) revert NoProcessor();
        uint256 cost = transistors.mintPrice() * amount + transistors.protocolFee();
        uint256 before = bem.balanceOf(address(this));
        bem.forceApprove(address(transistors), cost);
        transistors.mint(NAND_ID, amount);
        bem.forceApprove(address(transistors), 0);
        emit TransistorsMinted(amount, before - bem.balanceOf(address(this)));
    }

    /// @notice Tape out the three starter strategies, owned by this contract and usable by anyone.
    /// @dev msg.value = 3 * TAPEOUT_FEE.
    function seedStarters() external payable onlyOwner {
        if (TIT_FOR_TAT != 0) revert AlreadySet();
        uint256 f = _cpu().TAPEOUT_FEE();
        if (msg.value != 3 * f) revert WrongFee(3 * f, msg.value);
        TIT_FOR_TAT = _register(hex"0000000500000500000008000008", address(this), f);
        GRIM_TRIGGER = _register(hex"0000000200000500000008000008", address(this), f);
        ALWAYS_DEFECT = _register(hex"00000001000001", address(this), f);
        isStarter[TIT_FOR_TAT] = true;
        isStarter[GRIM_TRIGGER] = true;
        isStarter[ALWAYS_DEFECT] = true;
    }

    // ------------------------------------------------------------------ player

    /// @notice Total BNB `submitCircuit` requires for a netlist of `gates` gates.
    function tapeOutFee(uint256 gates) public view returns (uint256) {
        return _cpu().TAPEOUT_FEE() + gates * feePerGateWei;
    }

    /// @notice Submit a strategy. msg.value must equal `tapeOutFee(netlist.length / 7)` exactly.
    /// @return circuitId the circuit id on the GateWars processor (also the id used everywhere in GateWars).
    function submitCircuit(bytes calldata netlist) external payable whenNotPaused nonReentrant onlyAgent returns (uint256 circuitId) {
        uint256 gates = gateCount(netlist);
        if (gates > MAX_GATES) revert TooManyGates(gates);
        uint256 f = _cpu().TAPEOUT_FEE();
        uint256 expected = f + gates * feePerGateWei;
        if (msg.value != expected) revert WrongFee(expected, msg.value);
        feesAccrued += msg.value - f;
        circuitId = _register(netlist, msg.sender, f);
    }

    /// @notice Validates the NAND-only format and returns the gate count. Reverts BadNetlist otherwise.
    function gateCount(bytes calldata netlist) public pure returns (uint256) {
        uint256 n = netlist.length;
        if (n == 0 || n % 7 != 0) revert BadNetlist();
        for (uint256 i; i < n; i += 7) {
            if (netlist[i] != 0x00) revert BadNetlist();
        }
        return n / 7;
    }

    function _register(bytes memory netlist, address owner_, uint256 fee) internal returns (uint256 id) {
        ITapeOutCPU c = _cpu();
        id = c.tapeout{value: fee}(netlist, 6, 1);
        (uint32 nIn, uint32 nOut, uint32 nState, uint32 g) = c.circuitInfo(id);
        if (nIn != 6 || nOut != 1 || nState != 0 || g != netlist.length / 7) revert BadShape();
        uint64 t;
        for (uint256 k; k < 64; ++k) {
            if (uint8(c.eval(id, abi.encodePacked(uint8(k)))[0]) & 1 == 1) t |= uint64(1 << k);
        }
        _circuits[id] = Circuit({
            owner: owner_, table: t, gates: g, createdAt: uint40(block.timestamp), netlistHash: keccak256(netlist)
        });
        _byOwner[owner_].push(id);
        emit CircuitSubmitted(id, owner_, owner_ == address(this) ? "" : agentId.handleOf(owner_), g, t);
    }

    function _cpu() internal view returns (ITapeOutCPU c) {
        c = cpu;
        if (address(c) == address(0)) revert NoProcessor();
    }

    // ------------------------------------------------------------------ views

    function tableOf(uint256 circuitId) external view returns (uint64) {
        return _circuits[circuitId].table;
    }

    /// @notice Strategy owner in GateWars (submitter; this contract for starters). 0 if unknown.
    function ownerOf(uint256 circuitId) external view returns (address) {
        return _circuits[circuitId].owner;
    }

    function circuit(uint256 circuitId) external view returns (Circuit memory) {
        return _circuits[circuitId];
    }

    function circuitsOf(address owner_) external view returns (uint256[] memory) {
        return _byOwner[owner_];
    }

    function starters() external view returns (uint256 tft, uint256 grim, uint256 alld) {
        return (TIT_FOR_TAT, GRIM_TRIGGER, ALWAYS_DEFECT);
    }

    function nandBalance() external view returns (uint256) {
        return address(transistors) == address(0) ? 0 : transistors.balanceOf(address(this), NAND_ID);
    }

    // ------------------------------------------------------------------ owner (all listed in OWNER_POWERS.md)

    function setFeePerGate(uint256 weiPerGate) external onlyOwner {
        feePerGateWei = weiPerGate;
        emit FeePerGateSet(weiPerGate);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Withdraw collected per-gate fees. This contract holds no player funds.
    function withdrawFees(address payable to, uint256 amount) external onlyOwner nonReentrant {
        feesAccrued -= amount; // reverts on underflow
        (bool ok,) = to.call{value: amount}("");
        require(ok, "send");
        emit FeesWithdrawn(to, amount);
    }

    /// @notice Recover ERC-20s held for operations (BEM for transistors/processor). No player funds are ERC-20s here.
    function rescueToken(IERC20 token, address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
        emit TokenRescued(address(token), to, amount);
    }
}
