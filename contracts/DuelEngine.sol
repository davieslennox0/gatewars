// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title DuelEngine
/// @notice Iterated prisoner's dilemma between two cached strategy tables. Pure; no storage, no calls.
///
/// @dev Strategy table: a uint64 whose bit k is the strategy's move for history index k.
///      History index (= the TapeOut circuit's packed 6-bit input, TAP-02 §5, LSB first):
///        bit0 = own move t-1 (most recent), bit1 = own t-2, bit2 = own t-3,
///        bit3 = opponent move t-1,          bit4 = opp t-2,  bit5 = opp t-3.
///      Move 1 = cooperate, 0 = defect. Before round 1 the history is all-cooperate (index 63).
///      Payoffs (A, B): CC 3/3, DC 5/0 (A defects, B cooperates), CD 0/5, DD 1/1.
///      Returned move histories: bit r = that player's move in round r (r = 0 first).
library DuelEngine {
    uint8 internal constant ROUNDS = 20;

    function play(uint64 a, uint64 b, uint8 rounds)
        internal
        pure
        returns (uint16 scoreA, uint16 scoreB, uint40 movesA, uint40 movesB)
    {
        require(rounds <= 40, "rounds");
        uint256 ha = 63;
        uint256 hb = 63;
        uint256 sa;
        uint256 sb;
        uint256 ma_;
        uint256 mb_;
        for (uint256 r; r < rounds; ++r) {
            uint256 ma = (a >> ha) & 1;
            uint256 mb = (b >> hb) & 1;
            // packed payoff table, index (ma<<1 | mb), entry (pa<<4 | pb):
            // 0: D,D -> 1/1   1: D,C -> 5/0   2: C,D -> 0/5   3: C,C -> 3/3
            uint256 p = (0x33055011 >> (((ma << 1) | mb) << 3)) & 0xff;
            sa += p >> 4;
            sb += p & 0xf;
            ma_ |= ma << r;
            mb_ |= mb << r;
            ha = (((ha << 1) | ma) & 7) | (((((ha >> 3) << 1) | mb) & 7) << 3);
            hb = (((hb << 1) | mb) & 7) | (((((hb >> 3) << 1) | ma) & 7) << 3);
        }
        return (uint16(sa), uint16(sb), uint40(ma_), uint40(mb_));
    }
}
