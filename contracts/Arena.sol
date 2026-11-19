// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAgentID, AggregatorV3Interface, ICircuitRegistry} from "./interfaces/External.sol";
import {DuelEngine} from "./DuelEngine.sol";

/// @title GateWars Arena
/// @notice Agent ID-gated tournaments between TapeOut strategy circuits, and the prize vault.
///
///   ROOKIE   8 players, round robin (28 matches), $1 entry, open to any Agent ID
///   PRO      4 players, round robin (6 matches),  $5 entry, needs 1 Rookie win
///   CHAMPION 1v1 open challenge,                  $10 entry each, needs 3 Pro wins
///
///   Entry fees are USD amounts (8 decimals), paid either in native BNB at the Chainlink BNB/USD price
///   (excess refunded in the same call) or in USDC (exact amount, pulled with transferFrom — approve the
///   exact entry amount, never unlimited). Brackets are not split by asset; a pool can hold both.
///   80% of each paid amount goes to the game's prize pool, 20% to the treasury — the 20% is only booked to the
///   treasury when the game settles, so a refund always returns the full amount paid.
///
///   Skill tournament. Entry fees can be lost. No returns are promised.
///
/// @dev Accounting, per asset (0 = BNB, 1 = USDC):
///        locked    = everything paid into games that are not settled and not refunded (pools + refundable)
///        claimable = credited to winners, not yet claimed
///        treasury  = owner-withdrawable
///      Invariant: balance(asset) >= locked + claimable + treasury.
contract Arena is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Tier {
        ROOKIE,
        PRO,
        CHAMPION
    }

    enum PayAsset {
        BNB,
        USDC
    }

    enum State {
        NONE,
        OPEN,
        FULL,
        SETTLED,
        EXPIRED
    }

    struct Entry {
        address player;
        uint48 circuitId;
        PayAsset asset;
        bool refunded;
        uint64 table; // strategy snapshot taken at entry
        uint128 paid; // in `asset` units: BNB wei or USDC base units
    }

    /// @dev A Champion challenge is a game of size 2 created by its first entrant.
    struct Game {
        Tier tier;
        State state;
        uint8 size;
        uint40 openedAt;
        address winner; // 0 for a Champion tie
        uint128 poolBnb; // 80% parts (prize)
        uint128 poolUsdc;
        uint128 paidBnb; // 100% of what entrants paid and have not had refunded
        uint128 paidUsdc;
    }

    struct Record {
        uint32 matchesPlayed;
        uint32 wins;
        uint32 losses;
        uint32 draws;
        uint32 rookieWins;
        uint32 proWins;
        uint32 championWins;
        uint32 gamesEntered;
    }

    struct GameView {
        uint256 id;
        Tier tier;
        State state;
        uint8 size;
        uint40 openedAt;
        uint40 expiresAt;
        address winner;
        address[] players;
        uint256[] circuits;
        string[] handles;
        PayAsset[] assets;
        uint256[] paid;
        uint256 poolBnb;
        uint256 poolUsdc;
        uint256 poolUsd; // 8 decimals, BNB valued at the current feed answer (0 if the feed is unusable)
    }

    uint256 public constant EXPIRY = 24 hours;
    uint256 public constant POOL_BPS = 8000;
    uint256 public constant MIN_PRICE_AGE = 5 minutes;
    uint256 public constant MAX_PRICE_AGE_CAP = 2 hours;

    IAgentID public immutable agentId;
    ICircuitRegistry public immutable registry;
    AggregatorV3Interface public immutable bnbUsdFeed;
    IERC20 public immutable usdc;
    uint8 public immutable usdcDecimals;

    /// @notice Entry fee per tier in USD, 8 decimals. Owner-settable; applies to new entries only.
    uint256[3] public tierFeeUsd;
    /// @notice Oldest Chainlink answer accepted. Owner-settable within [5 minutes, 2 hours].
    uint256 public maxPriceAge = 1 hours;

    uint256 public nextGameId = 1;
    mapping(uint256 => Game) internal _games;
    mapping(uint256 => Entry[]) internal _entries;
    mapping(uint256 => mapping(address => uint256)) internal _slotPlus1;
    uint256[2] public openBracketOf; // ROOKIE, PRO; 0 = none
    uint256[] internal _openChallenges;
    mapping(uint256 => uint256) internal _openChallengeIdxPlus1;

    mapping(address => Record) internal _records;
    mapping(address => uint256) public claimableBnb;
    mapping(address => uint256) public claimableUsdc;

    uint256[2] public locked;
    uint256[2] public claimableTotal;
    uint256[2] public treasury;

    event GameOpened(uint256 indexed id, Tier tier, address indexed creator);
    event Entered(uint256 indexed id, address indexed player, uint256 circuitId, uint8 slot, string handle);
    event EntryPaid(uint256 indexed id, address indexed player, PayAsset asset, uint256 amount, uint256 priceUsed, uint256 excess);
    event GameFull(uint256 indexed id);
    event MatchPlayed(uint256 indexed id, address indexed a, address indexed b, uint16 scoreA, uint16 scoreB, uint40 movesA, uint40 movesB);
    event Settled(uint256 indexed id, address indexed winner, uint256 poolBnb, uint256 poolUsdc);
    event Expired(uint256 indexed id);
    event Refunded(uint256 indexed id, address indexed player, PayAsset asset, uint256 amount);
    event Claimed(address indexed player, uint256 bnbAmount, uint256 usdcAmount);
    event TierFeeUsdSet(Tier tier, uint256 usd);
    event MaxPriceAgeSet(uint256 secondsAge);
    event TreasuryWithdrawn(PayAsset asset, address to, uint256 amount);

    error NotAgent();
    error BadTier();
    error Locked(); // tier not unlocked for this player
    error NotYourCircuit();
    error UnknownCircuit();
    error AlreadyEntered();
    error BadState();
    error NotExpired();
    error Expired_();
    error OwnChallenge();
    error BadPayment();
    error StalePrice();
    error BadPrice();
    error NothingToClaim();
    error NotEntrant();
    error OutOfRange();

    modifier onlyAgent() {
        if (agentId.balanceOf(msg.sender) == 0) revert NotAgent();
        _;
    }

    constructor(address owner_, IAgentID agentId_, ICircuitRegistry registry_, AggregatorV3Interface feed_, IERC20 usdc_)
        Ownable(owner_)
    {
        require(feed_.decimals() == 8, "feed decimals");
        agentId = agentId_;
        registry = registry_;
        bnbUsdFeed = feed_;
        usdc = usdc_;
        usdcDecimals = IERC20Metadata(address(usdc_)).decimals();
        tierFeeUsd = [uint256(1e8), 5e8, 10e8];
    }

    // ================================================================== pricing

    /// @notice BNB/USD price (8 decimals) from Chainlink, with staleness and sanity checks.
    function price() public view returns (uint256) {
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = bnbUsdFeed.latestRoundData();
        if (answer <= 0) revert BadPrice();
        if (answeredInRound < roundId) revert StalePrice();
        if (updatedAt == 0 || updatedAt > block.timestamp || block.timestamp - updatedAt > maxPriceAge) revert StalePrice();
        return uint256(answer);
    }

    /// @notice What one entry into `tier` costs right now. Send bnbWei * 1.01 for BNB (excess is refunded),
    ///         or approve exactly usdcAmount for USDC.
    function quoteEntry(Tier tier) public view returns (uint256 bnbWei, uint256 usdcAmount) {
        uint256 usd = tierFeeUsd[uint8(tier)];
        bnbWei = usd * 1e18 / price();
        usdcAmount = _usdToUsdc(usd);
    }

    function _usdToUsdc(uint256 usd8) internal view returns (uint256) {
        return usd8 * 10 ** usdcDecimals / 1e8;
    }

    /// @dev Collects the entry fee. Returns (paid, priceUsed, excess). BNB excess is sent back by the caller
    ///      at the end of the external function, after all state updates.
    function _collect(Tier tier, PayAsset asset) internal returns (uint256 paid, uint256 priceUsed, uint256 excess) {
        uint256 usd = tierFeeUsd[uint8(tier)];
        if (asset == PayAsset.BNB) {
            if (msg.value == 0) revert BadPayment();
            priceUsed = price();
            paid = usd * 1e18 / priceUsed;
            if (msg.value < paid) revert BadPayment();
            excess = msg.value - paid;
        } else {
            if (msg.value != 0) revert BadPayment();
            paid = _usdToUsdc(usd);
            usdc.safeTransferFrom(msg.sender, address(this), paid);
        }
    }

    function _refundExcess(uint256 excess) internal {
        if (excess > 0) {
            (bool ok,) = msg.sender.call{value: excess}("");
            require(ok, "excess refund");
        }
    }

    // ================================================================== brackets (ROOKIE / PRO)

    /// @notice Join the open bracket of `tier` (opens a new one if none is open), with a circuit you own or a
    ///         starter circuit. One entry per address per bracket.
    function enter(Tier tier, uint256 circuitId, PayAsset asset)
        external
        payable
        whenNotPaused
        nonReentrant
        onlyAgent
        returns (uint256 id)
    {
        if (tier == Tier.CHAMPION) revert BadTier();
        if (tier == Tier.PRO && _records[msg.sender].rookieWins < 1) revert Locked();
        uint64 table = _usableTable(circuitId);
        (uint256 paid, uint256 priceUsed, uint256 excess) = _collect(tier, asset);

        id = openBracketOf[uint8(tier)];
        if (id != 0 && block.timestamp >= _games[id].openedAt + EXPIRY) {
            _expire(id); // stale open bracket: close it so its entrants can refund, and open a fresh one
            id = 0;
        }
        if (id == 0) {
            id = _newGame(tier, tier == Tier.ROOKIE ? 8 : 4);
            openBracketOf[uint8(tier)] = id;
        }
        _join(id, circuitId, table, asset, paid, priceUsed, excess);
        Game storage g = _games[id];
        if (_entries[id].length == g.size) {
            g.state = State.FULL;
            openBracketOf[uint8(tier)] = 0;
            emit GameFull(id);
        }
        _refundExcess(excess);
    }

    /// @notice Play every match of a full bracket and credit the winner. Anyone can call.
    function settle(uint256 id) external nonReentrant {
        Game storage g = _games[id];
        if (g.state != State.FULL || g.tier == Tier.CHAMPION) revert BadState();
        Entry[] storage es = _entries[id];
        uint256 n = es.length;
        uint256[8] memory total;
        uint16[8][8] memory pts;
        for (uint256 i; i < n; ++i) {
            for (uint256 j = i + 1; j < n; ++j) {
                (uint16 sa, uint16 sb) = _playAndRecord(id, es[i], es[j]);
                pts[i][j] = sa;
                pts[j][i] = sb;
                total[i] += sa;
                total[j] += sb;
            }
        }
        uint256 w = pickWinner(total, pts, n);
        address winner = es[w].player;
        if (g.tier == Tier.ROOKIE) _records[winner].rookieWins++;
        else _records[winner].proWins++;
        g.state = State.SETTLED;
        g.winner = winner;
        _payout(g, winner, address(0));
        emit Settled(id, winner, g.poolBnb, g.poolUsdc);
    }

    /// @notice Tie-break: highest total score -> highest head-to-head score against the other tied players
    ///         -> earliest entry (lowest slot).
    function pickWinner(uint256[8] memory total, uint16[8][8] memory pts, uint256 n) public pure returns (uint256 w) {
        uint256 best;
        for (uint256 i; i < n; ++i) {
            if (total[i] > best) best = total[i];
        }
        uint256 tied; // bitmask
        uint256 count;
        for (uint256 i; i < n; ++i) {
            if (total[i] == best) {
                tied |= 1 << i;
                count++;
            }
        }
        if (count == 1) {
            for (uint256 i; i < n; ++i) {
                if (tied & (1 << i) != 0) return i;
            }
        }
        uint256 bestH2h;
        bool found;
        for (uint256 i; i < n; ++i) {
            if (tied & (1 << i) == 0) continue;
            uint256 h;
            for (uint256 j; j < n; ++j) {
                if (j != i && tied & (1 << j) != 0) h += pts[i][j];
            }
            if (!found || h > bestH2h) {
                bestH2h = h;
                w = i; // strict > keeps the earliest entry on equal head-to-head
                found = true;
            }
        }
    }

    /// @notice Close a bracket or challenge that stayed OPEN for 24h. Anyone can call.
    function expire(uint256 id) external {
        Game storage g = _games[id];
        if (g.state != State.OPEN) revert BadState();
        if (block.timestamp < g.openedAt + EXPIRY) revert NotExpired();
        _expire(id);
    }

    function _expire(uint256 id) internal {
        Game storage g = _games[id];
        g.state = State.EXPIRED;
        if (g.tier != Tier.CHAMPION) {
            if (openBracketOf[uint8(g.tier)] == id) openBracketOf[uint8(g.tier)] = 0;
        } else {
            _removeOpenChallenge(id);
        }
        emit Expired(id);
    }

    // ================================================================== Champion challenges

    /// @notice Open a 1v1 challenge anyone eligible can accept within 24h.
    function createChallenge(uint256 circuitId, PayAsset asset)
        external
        payable
        whenNotPaused
        nonReentrant
        onlyAgent
        returns (uint256 id)
    {
        if (_records[msg.sender].proWins < 3) revert Locked();
        uint64 table = _usableTable(circuitId);
        (uint256 paid, uint256 priceUsed, uint256 excess) = _collect(Tier.CHAMPION, asset);
        id = _newGame(Tier.CHAMPION, 2);
        _openChallengeIdxPlus1[id] = _openChallenges.length + 1;
        _openChallenges.push(id);
        _join(id, circuitId, table, asset, paid, priceUsed, excess);
        _refundExcess(excess);
    }

    /// @notice Accept an open challenge: pays your own quote and plays the match immediately.
    ///         Winner takes the pool; a tie splits each asset's pool in half (odd base unit to the creator).
    function acceptChallenge(uint256 id, uint256 circuitId, PayAsset asset)
        external
        payable
        whenNotPaused
        nonReentrant
        onlyAgent
    {
        Game storage g = _games[id];
        if (g.tier != Tier.CHAMPION || g.state != State.OPEN) revert BadState();
        if (block.timestamp >= g.openedAt + EXPIRY) revert Expired_();
        if (_entries[id][0].player == msg.sender) revert OwnChallenge();
        if (_records[msg.sender].proWins < 3) revert Locked();
        uint64 table = _usableTable(circuitId);
        (uint256 paid, uint256 priceUsed, uint256 excess) = _collect(Tier.CHAMPION, asset);
        _join(id, circuitId, table, asset, paid, priceUsed, excess);
        _removeOpenChallenge(id);

        Entry storage c = _entries[id][0];
        Entry storage a = _entries[id][1];
        (uint16 sc, uint16 sa) = _playAndRecord(id, c, a);
        g.state = State.SETTLED;
        if (sc != sa) {
            address winner = sc > sa ? c.player : a.player;
            g.winner = winner;
            _records[winner].championWins++;
            _payout(g, winner, address(0));
        } else {
            _payout(g, c.player, a.player);
        }
        emit Settled(id, g.winner, g.poolBnb, g.poolUsdc);
        _refundExcess(excess);
    }

    // ================================================================== payouts

    /// @notice Withdraw everything you have won, in both assets. Pull payment only.
    function claim() external nonReentrant onlyAgent {
        uint256 b = claimableBnb[msg.sender];
        uint256 u = claimableUsdc[msg.sender];
        if (b == 0 && u == 0) revert NothingToClaim();
        claimableBnb[msg.sender] = 0;
        claimableUsdc[msg.sender] = 0;
        claimableTotal[0] -= b;
        claimableTotal[1] -= u;
        if (u > 0) usdc.safeTransfer(msg.sender, u);
        if (b > 0) {
            (bool ok,) = msg.sender.call{value: b}("");
            require(ok, "send");
        }
        emit Claimed(msg.sender, b, u);
    }

    /// @notice Get back exactly what you paid, in the asset you paid, from a bracket or challenge that expired
    ///         unfilled / unaccepted. Expires the game first if its 24h are up.
    function claimRefund(uint256 id) external nonReentrant onlyAgent {
        Game storage g = _games[id];
        if (g.state == State.OPEN && block.timestamp >= g.openedAt + EXPIRY) _expire(id);
        if (g.state != State.EXPIRED) revert BadState();
        uint256 s = _slotPlus1[id][msg.sender];
        if (s == 0) revert NotEntrant();
        Entry storage e = _entries[id][s - 1];
        if (e.refunded) revert NotEntrant();
        e.refunded = true;
        uint256 amt = e.paid;
        uint256 poolPart = amt * POOL_BPS / 10_000;
        uint8 ai = uint8(e.asset);
        if (ai == 0) {
            g.paidBnb -= uint128(amt);
            g.poolBnb -= uint128(poolPart);
        } else {
            g.paidUsdc -= uint128(amt);
            g.poolUsdc -= uint128(poolPart);
        }
        locked[ai] -= amt;
        if (ai == 0) {
            (bool ok,) = msg.sender.call{value: amt}("");
            require(ok, "send");
        } else {
            usdc.safeTransfer(msg.sender, amt);
        }
        emit Refunded(id, msg.sender, e.asset, amt);
    }

    // ================================================================== internals

    function _usableTable(uint256 circuitId) internal view returns (uint64) {
        address o = registry.ownerOf(circuitId);
        if (o == address(0)) revert UnknownCircuit();
        if (o != msg.sender && !registry.isStarter(circuitId)) revert NotYourCircuit();
        return registry.tableOf(circuitId);
    }

    function _newGame(Tier tier, uint8 size) internal returns (uint256 id) {
        id = nextGameId++;
        Game storage g = _games[id];
        g.tier = tier;
        g.state = State.OPEN;
        g.size = size;
        g.openedAt = uint40(block.timestamp);
        emit GameOpened(id, tier, msg.sender);
    }

    function _join(uint256 id, uint256 circuitId, uint64 table, PayAsset asset, uint256 paid, uint256 priceUsed, uint256 excess)
        internal
    {
        if (_slotPlus1[id][msg.sender] != 0) revert AlreadyEntered();
        Entry[] storage es = _entries[id];
        es.push(
            Entry({
                player: msg.sender,
                circuitId: uint48(circuitId),
                asset: asset,
                refunded: false,
                table: table,
                paid: uint128(paid)
            })
        );
        uint8 slot = uint8(es.length - 1);
        _slotPlus1[id][msg.sender] = es.length;
        Game storage g = _games[id];
        uint256 poolPart = paid * POOL_BPS / 10_000;
        if (asset == PayAsset.BNB) {
            g.paidBnb += uint128(paid);
            g.poolBnb += uint128(poolPart);
        } else {
            g.paidUsdc += uint128(paid);
            g.poolUsdc += uint128(poolPart);
        }
        locked[uint8(asset)] += paid;
        _records[msg.sender].gamesEntered++;
        emit Entered(id, msg.sender, circuitId, slot, agentId.handleOf(msg.sender));
        emit EntryPaid(id, msg.sender, asset, paid, priceUsed, excess);
    }

    function _playAndRecord(uint256 id, Entry storage a, Entry storage b) internal returns (uint16 sa, uint16 sb) {
        uint40 ma;
        uint40 mb;
        (sa, sb, ma, mb) = DuelEngine.play(a.table, b.table, DuelEngine.ROUNDS);
        emit MatchPlayed(id, a.player, b.player, sa, sb, ma, mb);
        Record storage ra = _records[a.player];
        Record storage rb = _records[b.player];
        ra.matchesPlayed++;
        rb.matchesPlayed++;
        if (sa > sb) {
            ra.wins++;
            rb.losses++;
        } else if (sb > sa) {
            rb.wins++;
            ra.losses++;
        } else {
            ra.draws++;
            rb.draws++;
        }
    }

    /// @dev Moves a settled game's money: pool -> claimable (winner, or split between a and b on a tie),
    ///      the rest (20%) -> treasury. `b` = address(0) means no split.
    function _payout(Game storage g, address a, address b) internal {
        uint256 pb = g.poolBnb;
        uint256 pu = g.poolUsdc;
        locked[0] -= g.paidBnb;
        locked[1] -= g.paidUsdc;
        treasury[0] += g.paidBnb - pb;
        treasury[1] += g.paidUsdc - pu;
        claimableTotal[0] += pb;
        claimableTotal[1] += pu;
        if (b == address(0)) {
            claimableBnb[a] += pb;
            claimableUsdc[a] += pu;
        } else {
            // tie: creator (a) gets the odd base unit
            claimableBnb[b] += pb / 2;
            claimableUsdc[b] += pu / 2;
            claimableBnb[a] += pb - pb / 2;
            claimableUsdc[a] += pu - pu / 2;
        }
    }

    function _removeOpenChallenge(uint256 id) internal {
        uint256 ip1 = _openChallengeIdxPlus1[id];
        if (ip1 == 0) return;
        uint256 last = _openChallenges[_openChallenges.length - 1];
        _openChallenges[ip1 - 1] = last;
        _openChallengeIdxPlus1[last] = ip1;
        _openChallenges.pop();
        delete _openChallengeIdxPlus1[id];
    }

    // ================================================================== views

    function openBracket(Tier tier) external view returns (uint256) {
        if (tier == Tier.CHAMPION) return 0;
        return openBracketOf[uint8(tier)];
    }

    function game(uint256 id) public view returns (GameView memory v) {
        Game storage g = _games[id];
        Entry[] storage es = _entries[id];
        uint256 n = es.length;
        v.id = id;
        v.tier = g.tier;
        v.state = g.state;
        v.size = g.size;
        v.openedAt = g.openedAt;
        v.expiresAt = g.openedAt == 0 ? 0 : uint40(g.openedAt + EXPIRY);
        v.winner = g.winner;
        v.players = new address[](n);
        v.circuits = new uint256[](n);
        v.handles = new string[](n);
        v.assets = new PayAsset[](n);
        v.paid = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            v.players[i] = es[i].player;
            v.circuits[i] = es[i].circuitId;
            v.handles[i] = agentId.handleOf(es[i].player);
            v.assets[i] = es[i].asset;
            v.paid[i] = es[i].paid;
        }
        v.poolBnb = g.poolBnb;
        v.poolUsdc = g.poolUsdc;
        v.poolUsd = _poolUsd(g.poolBnb, g.poolUsdc);
    }

    function bracket(uint256 id) external view returns (GameView memory) {
        return game(id);
    }

    function challenge(uint256 id) external view returns (GameView memory) {
        return game(id);
    }

    function _poolUsd(uint256 bnbWei, uint256 usdcAmt) internal view returns (uint256 usd8) {
        usd8 = usdcAmt * 1e8 / 10 ** usdcDecimals;
        try bnbUsdFeed.latestRoundData() returns (uint80, int256 answer, uint256, uint256, uint80) {
            if (answer > 0) usd8 += bnbWei * uint256(answer) / 1e18;
        } catch {}
    }

    /// @notice Round-robin totals among the current entrants (final once the game is FULL/SETTLED).
    function standings(uint256 id) external view returns (address[] memory players, uint256[] memory scores) {
        Entry[] storage es = _entries[id];
        uint256 n = es.length;
        players = new address[](n);
        scores = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            players[i] = es[i].player;
            for (uint256 j = i + 1; j < n; ++j) {
                (uint16 sa, uint16 sb,,) = DuelEngine.play(es[i].table, es[j].table, DuelEngine.ROUNDS);
                scores[i] += sa;
                scores[j] += sb;
            }
        }
    }

    function record(address player) external view returns (Record memory) {
        return _records[player];
    }

    /// @notice Challenges that can still be accepted.
    function openChallenges() external view returns (uint256[] memory ids) {
        uint256 n = _openChallenges.length;
        uint256[] memory tmp = new uint256[](n);
        uint256 k;
        for (uint256 i; i < n; ++i) {
            uint256 id = _openChallenges[i];
            if (block.timestamp < _games[id].openedAt + EXPIRY) tmp[k++] = id;
        }
        ids = new uint256[](k);
        for (uint256 i; i < k; ++i) {
            ids[i] = tmp[i];
        }
    }

    // ================================================================== owner (all listed in OWNER_POWERS.md)

    function setTierFeeUsd(Tier tier, uint256 usd8) external onlyOwner {
        if (usd8 == 0) revert OutOfRange();
        tierFeeUsd[uint8(tier)] = usd8;
        emit TierFeeUsdSet(tier, usd8);
    }

    function setMaxPriceAge(uint256 secondsAge) external onlyOwner {
        if (secondsAge < MIN_PRICE_AGE || secondsAge > MAX_PRICE_AGE_CAP) revert OutOfRange();
        maxPriceAge = secondsAge;
        emit MaxPriceAgeSet(secondsAge);
    }

    /// @notice Blocks enter / createChallenge / acceptChallenge only. settle, expire, claim, claimRefund keep working.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Withdraw from the treasury of one asset. Can never touch locked (pools/refundable) or claimable funds.
    function withdrawTreasury(PayAsset asset, address payable to, uint256 amount) external onlyOwner nonReentrant {
        uint8 ai = uint8(asset);
        if (amount > treasury[ai]) revert OutOfRange();
        treasury[ai] -= amount;
        if (asset == PayAsset.BNB) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "send");
        } else {
            usdc.safeTransfer(to, amount);
        }
        emit TreasuryWithdrawn(asset, to, amount);
    }
}
