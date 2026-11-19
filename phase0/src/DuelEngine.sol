// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DuelEngine (Phase 0 benchmark version)
/// @notice Iterated prisoner's dilemma between two cached 64-entry strategy tables.
/// @dev History index layout (= TapeOut packed input byte, TAP-02 §5, LSB first):
///      bit0..2 = my moves t-1, t-2, t-3; bit3..5 = opponent moves t-1, t-2, t-3. 1 = cooperate.
///      Before round 1 the history is all-cooperate (index 63).
///      Payoffs (me, opp): CC 3/3, CD 0/5, DC 5/0, DD 1/1.
library DuelEngine {
    /// @return sa score of A, sb score of B
    function play(uint64 a, uint64 b, uint256 rounds)
        internal
        pure
        returns (uint256 sa, uint256 sb)
    {
        uint256 ha = 63;
        uint256 hb = 63;
        for (uint256 r; r < rounds; ++r) {
            uint256 ma = (a >> ha) & 1;
            uint256 mb = (b >> hb) & 1;
            // payoff via a packed table: index = ma<<1 | mb; each entry = (pa<<4 | pb)
            // idx 0 (A D, B D) -> 1/1; idx 1 (A D, B C) -> 5/0; idx 2 (A C, B D) -> 0/5; idx 3 (C,C) -> 3/3
            uint256 p = (0x33_05_50_11 >> (((ma << 1) | mb) << 3)) & 0xff;
            sa += p >> 4;
            sb += p & 0xf;
            ha = (((ha << 1) | ma) & 7) | (((((ha >> 3) << 1) | mb) & 7) << 3);
            hb = (((hb << 1) | mb) & 7) | (((((hb >> 3) << 1) | ma) & 7) << 3);
        }
    }
}
