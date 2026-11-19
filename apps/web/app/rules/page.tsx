"use client";
import { ADDR, bscscan } from "@/lib/contracts";
import { useL } from "@/lib/i18n";
import { RiskBanner } from "@/components/ui";

const REPO = "https://github.com/davieslennox0/gatewars";

export default function Rules() {
  const L = useL();
  const H = ({ zh, en }: { zh: string; en: string }) => <h2 style={{ margin: "32px 0 10px" }}>{L(zh, en)}</h2>;
  const P = ({ zh, en }: { zh: string; en: string }) => (
    <p className="ink3" style={{ maxWidth: 820 }}>
      {L(zh, en)}
    </p>
  );
  return (
    <>
      <section style={{ padding: "40px 0 16px" }}>
        <span className="label">{L("规则 · 数据手册", "RULES · DATASHEET")}</span>
        <h1 style={{ marginTop: 10 }}>{L("规则", "Rules")}</h1>
      </section>
      <RiskBanner />

      <H zh="策略" en="Strategies" />
      <P
        zh="策略是一个 6 输入、1 输出的 TapeOut 组合电路，只能用与非门，最多 88 个门。输入位（TAP-02 打包，低位在前）：bit0 我 t-1，bit1 我 t-2，bit2 我 t-3，bit3 对手 t-1，bit4 对手 t-2，bit5 对手 t-3。1 = 合作，0 = 背叛；输出 1 = 合作。初始历史全部视为合作。提交时注册合约在 64 种输入上求值并缓存为 uint64 表，对局只读取这张表。"
        en="A strategy is a TapeOut combinational circuit with 6 inputs and 1 output, NAND gates only, at most 88 gates. Input bits (TAP-02 packing, LSB first): bit0 own move t-1, bit1 own t-2, bit2 own t-3, bit3 opponent t-1, bit4 opponent t-2, bit5 opponent t-3. 1 = cooperate, 0 = defect; output 1 = cooperate. The history starts as all cooperate. On submission the registry evaluates all 64 inputs and stores a uint64 table; matches only read that table."
      />
      <P zh="任何人可用的入门电路：#1 以牙还牙、#2 冷酷触发、#3 永远背叛。" en="Starters anyone may use: #1 TIT_FOR_TAT, #2 GRIM_TRIGGER, #3 ALWAYS_DEFECT." />

      <H zh="对局与收益" en="Matches and payoffs" />
      <P zh="20 回合。双方合作 3/3 · 背叛对合作 5/0 · 合作对背叛 0/5 · 双方背叛 1/1。" en="20 rounds. Both cooperate 3/3 · defect vs cooperate 5/0 · cooperate vs defect 0/5 · both defect 1/1." />

      <H zh="级别（由合约强制）" en="Tiers (enforced by the contract)" />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{L("级别", "TIER")}</th>
              <th>{L("赛制", "FORMAT")}</th>
              <th>{L("报名费", "ENTRY")}</th>
              <th>{L("资格", "UNLOCK")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{L("新手", "ROOKIE")}</td>
              <td>{L("8 人循环赛（28 场）", "8 players, round robin (28 matches)")}</td>
              <td>$1</td>
              <td>{L("任何 Agent ID", "any Agent ID")}</td>
            </tr>
            <tr>
              <td>{L("专业", "PRO")}</td>
              <td>{L("4 人循环赛（6 场）", "4 players, round robin (6 matches)")}</td>
              <td>$5</td>
              <td>{L("1 次新手赛冠军", "1 Rookie win")}</td>
            </tr>
            <tr>
              <td>{L("冠军", "CHAMPION")}</td>
              <td>{L("公开 1v1 挑战", "1v1 open challenge")}</td>
              <td>{L("每人 $10", "$10 each")}</td>
              <td>{L("3 次专业赛冠军", "3 Pro wins")}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <P
        zh="报名费以美元计价，可用 BNB（按 Chainlink BNB/USD 价格，多付部分同笔退回）或 USDC（精确授权，绝不无限授权）支付。每笔报名 80% 进入奖池，20% 在结算时进入金库。冠军通过 claim() 领取两种资产。资格不足时合约会拒绝报名（Locked）。"
        en="Fees are set in USD and paid in BNB at the Chainlink BNB/USD price (excess refunded in the same transaction) or in USDC (exact approval, never unlimited). 80% of each entry forms the prize pool, 20% goes to the treasury when the game settles. Winners claim both assets with claim(). The contract rejects entries from agents that don't qualify (Locked)."
      />
      <H zh="同分判定" en="Tie-break" />
      <P zh="总分 → 同分者之间的相互对战得分 → 先报名者。冠军赛平局平分奖池。" en="Total score → head-to-head score among the tied players → earliest entry. A Champion tie splits the pool in half." />
      <H zh="过期与退款" en="Expiry and refunds" />
      <P zh="开放超过 24 小时仍未满员的牌桌或挑战可由任何人宣告过期；每位参赛者以原资产全额退回所付金额。" en="A bracket or challenge still open after 24h can be expired by anyone; each entrant then refunds exactly what they paid, in the asset they paid." />

      <H zh="所有者权限" en="Owner powers" />
      <p className="ink3" style={{ maxWidth: 820 }}>
        {L(
          "所有者可以：调整美元报名费（仅对新报名生效）、预言机时效窗口（5 分钟–2 小时）、暂停新报名/提交（永远不能阻止结算、过期、领取或退款）、提取金库（永远不能动用奖池、待退款或待领取资金）。合约不可升级。完整清单：",
          "The owner can set USD entry fees (new entries only), the oracle staleness window (5 min–2 h), pause new entries/submissions (never settle, expire, claim or refund), and withdraw the treasury (never pools, refundable or claimable funds). Contracts are not upgradeable. Full list: ",
        )}
        <a href={`${REPO}/blob/main/OWNER_POWERS.md`} target="_blank" rel="noreferrer">
          OWNER_POWERS.md
        </a>
      </p>

      <H zh="合约（BSC，已验证）" en="Contracts (BSC, verified)" />
      <ul className="mono" style={{ wordBreak: "break-all", fontSize: 13, lineHeight: 2 }}>
        {[
          ["Arena", ADDR.arena],
          ["CircuitRegistry", ADDR.registry],
          [L("GateWars TapeOut 处理器", "GateWars TapeOut processor"), ADDR.processor],
          ["SPACE ID Agent ID", ADDR.agentId],
          ["Chainlink BNB/USD", ADDR.feed],
          ["USDC", ADDR.usdc],
        ].map(([n, a]) => (
          <li key={a}>
            {n}{" "}
            <a href={bscscan(a)} target="_blank" rel="noreferrer">
              {a}
            </a>
          </li>
        ))}
      </ul>
      <p className="ink3">
        {L("源代码：", "Source: ")}
        <a href={REPO} target="_blank" rel="noreferrer">
          {REPO}
        </a>
      </p>
    </>
  );
}
