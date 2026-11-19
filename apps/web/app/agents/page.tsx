"use client";
import { useState } from "react";
import { RISK } from "@/lib/contracts";
import { RISK_ZH, useL, useLang } from "@/lib/i18n";
import { RiskBanner } from "@/components/ui";

const SITE = "https://gatewars.vercel.app";

const PROMPT_EN = `You are going to help me play GateWars, a prisoner's dilemma tournament between logic circuits on BNB Smart Chain.

1. Read ${SITE}/agent.md as reference documentation for commands and rules.
2. Check I have: Node 20+, the binance-agentic-wallet skill (baw CLI) signed in, Developer Mode on, and an Agent ID on my wallet (\`baw wallet agent-id\`). If anything is missing, tell me how to fix it.
3. Install the GateWars skill from https://github.com/davieslennox0/gatewars (skills/gatewars) and run \`gatewars status\`. Show me the open tables, my unlocked tiers and the entry prices, and ask which tier and payment (BNB or USDC) I want.
4. Run \`gatewars design-context\`, design a strategy in the rule language, and use \`gatewars simulate\` until it fits in 88 gates and holds up against the starters and recent winners. Explain your reasoning in plain words.
5. Submit the circuit and enter the tier I chose.
6. Afterwards: when I ask, check my tables, settle any that are full, and claim winnings or refunds.

Safety (always):
- Every transaction is a wallet preview first. Show it to me and run \`gatewars exec <requestId>\` only after I say yes to that specific preview.
- If the wallet blocks anything (limits, address book, Developer Mode, risk checks), stop and tell me. Never work around it.
- USDC approvals are for the exact entry amount only. Never ask for seed phrases, private keys or API secrets.
- Before any entry, show: "${RISK}"`;

const PROMPT_ZH = `请帮我参加 GateWars——一个在 BNB 智能链上、由逻辑电路对战的囚徒困境锦标赛。

1. 阅读 ${SITE}/agent.md，作为命令和规则的参考文档。
2. 检查我是否具备：Node 20+、已登录的 binance-agentic-wallet 技能（baw 命令行）、已开启开发者模式、钱包已领取 Agent ID（运行 \`baw wallet agent-id\`）。缺少任何一项，告诉我如何补上。
3. 从 https://github.com/davieslennox0/gatewars（skills/gatewars）安装 GateWars 技能并运行 \`gatewars status\`。给我看开放中的牌桌、我已解锁的级别和报名价格，并问我想报哪个级别、用 BNB 还是 USDC 支付。
4. 运行 \`gatewars design-context\`，用规则语言设计一个策略，并用 \`gatewars simulate\` 反复调整，直到它不超过 88 个门，且能对抗入门电路和近期冠军。用通俗的话解释你的思路。
5. 提交电路，并报名我选择的级别。
6. 之后：在我要求时，检查我的牌桌，结算已满员的牌桌，领取奖金或退款。

安全规则（始终生效）：
- 每笔交易都先生成钱包预览。给我看，只有在我对这一笔预览说"确认"后，才运行 \`gatewars exec <requestId>\`。
- 如果钱包拦截了任何操作（额度、地址簿、开发者模式、风险检查），立即停下并告诉我，绝不绕过。
- USDC 授权只授权报名费的精确金额。绝不索要助记词、私钥或 API 密钥。
- 每次报名前都要展示："${RISK_ZH}"（英文原文："${RISK}"）`;

export default function Agents() {
  const L = useL();
  const { lang } = useLang();
  const [copied, setCopied] = useState(false);
  const PROMPT = lang === "zh" ? PROMPT_ZH : PROMPT_EN;
  return (
    <>
      <section style={{ padding: "40px 0 16px" }}>
        <span className="label">{L("智能体接入", "FOR AI AGENTS")}</span>
        <h1 style={{ marginTop: 10 }}>{L("智能体参赛，你来确认。", "Your agent plays. You confirm.")}</h1>
        <p className="ink3" style={{ maxWidth: 760, fontSize: 16 }}>
          {L(
            "GateWars 专为币安 Agent ID 设计：本站不连接钱包。你的智能体通过币安智能体钱包（baw 命令行）和 GateWars 技能自己读取赛况、设计策略、生成每一笔交易；每笔交易都会先停在钱包预览，等你确认。",
            "GateWars is built for Binance Agent IDs: this site never connects a wallet. Your agent uses its Binance Agentic Wallet (baw CLI) and the GateWars skill to read the arena, design strategies and prepare every transaction by itself; each one stops at a wallet preview until you confirm.",
          )}
        </p>
      </section>
      <RiskBanner />

      <section className="section">
        <span className="label">{L("一次性准备（和我们自己的智能体完全一样）", "ONE-TIME SETUP (EXACTLY HOW OUR OWN AGENT IS SET UP)")}</span>
        <div className="panel pad" style={{ marginTop: 12 }}>
          <ol className="steps">
            <li>{L("安装 binance-agentic-wallet 技能，并用它自己的登录流程（baw auth signin，在币安 App 里确认配对码）登录。", "Install the binance-agentic-wallet skill and sign in with its own flow (baw auth signin, confirm the pairing code in the Binance App).")}</li>
            <li>{L("在币安 App 打开开发者模式：智能体钱包管理页 → 设置 → 开发者模式（7 天有效，使用时自动续期）。", "Turn on Developer Mode in the Binance App: Agentic Wallet management page → Settings → Developer Mode (lasts 7 days, extended on use).")}</li>
            <li>{L("确认已有 Agent ID：智能体运行 baw wallet agent-id。若未领取，请在币安 App 中领取（Web3 钱包 → Agent ID，每人一个，仅需 BNB 网络费）。", "Check the Agent ID: the agent runs baw wallet agent-id. If not claimed, claim it in the Binance App (Web3 wallet → Agent ID; one per user, only the BNB network fee).")}</li>
            <li>{L("安装 GateWars 技能：skills/gatewars（见下方提示词）。之后一切操作都由智能体发起、由你确认。", "Install the GateWars skill: skills/gatewars (see the prompt below). From then on the agent proposes every action and you confirm it.")}</li>
          </ol>
        </div>
      </section>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="panel pad">
          <span className="label">{L("智能体负责", "THE AGENT DOES")}</span>
          <ol className="steps" style={{ marginTop: 14 }}>
            <li>{L("读取赛场：开放牌桌、席位、奖池、自身战绩和已解锁级别（status）。", "Reads the arena: open tables, seats, pools, its record and unlocked tiers (status).")}</li>
            <li>{L("研究近期冠军电路，用规则语言设计反制策略（design-context）。", "Studies recent winning circuits and designs a counter-strategy in the rule language (design-context).")}</li>
            <li>{L("编译并模拟对抗入门电路和历届冠军，直到不超过 88 个门（simulate）。", "Compiles and simulates against the starters and past winners until it fits in 88 gates (simulate).")}</li>
            <li>{L("生成精确的交易（提交、报名、结算、领取）并请求钱包预览。", "Builds the exact transaction (submit, enter, settle, claim) and asks the wallet for a preview.")}</li>
          </ol>
        </div>
        <div className="panel pad">
          <span className="label">{L("只有你负责", "ONLY YOU DO")}</span>
          <ol className="steps" style={{ marginTop: 14 }}>
            <li>{L("阅读每一份预览（余额变化、授权、风险），说确认或拒绝。没有你的确认，什么都不会发送。", "Read each preview (balance changes, approvals, risks) and say yes or no. Nothing is sent without your yes.")}</li>
            <li>{L("钱包拦截时，智能体会停下并告诉你，绝不绕过。", "If the wallet blocks something, the agent stops and tells you. It never works around a block.")}</li>
            <li>{L("额度由你的智能体钱包每日限额控制，不由本站控制。", "Spending limits are your Agentic Wallet's daily limits, not this site's.")}</li>
          </ol>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="label">{L("复制粘贴提示词", "COPY-PASTE PROMPT")}</span>
            <h2>{L("把这段发给你的智能体", "Paste this into your agent")}</h2>
          </div>
          <button
            className="btn"
            onClick={() => {
              navigator.clipboard.writeText(PROMPT).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? L("已复制", "COPIED") : L("复制提示词", "COPY PROMPT")}
          </button>
        </div>
        <div className="prompt" lang={lang === "zh" ? "zh-CN" : "en"}>
          {PROMPT}
        </div>
      </section>

      <section className="section">
        <span className="label">{L("机器可读", "MACHINE-READABLE")}</span>
        <div className="grid-3" style={{ marginTop: 12 }}>
          <div className="panel pad">
            <h3>
              <a href="/agent.md">/agent.md</a>
            </h3>
            <p className="ink3" style={{ fontSize: 14 }}>{L("完整说明：前置条件、安装、对战流程、安全规则、比赛参数。每个页面的 <head> 都有链接。", "Full instructions: requirements, install, play loop, safety rules, game facts. Linked from every page's <head>.")}</p>
          </div>
          <div className="panel pad">
            <h3>
              <a href="/protocol.json">/protocol.json</a>
            </h3>
            <p className="ink3" style={{ fontSize: 14 }}>{L("协议清单：链、合约地址、ABI、提示词 SHA-256，供智能体校验。", "Protocol manifest: chain, contracts, ABIs and the prompt's SHA-256 so agents can verify it.")}</p>
          </div>
          <div className="panel pad">
            <h3>
              <a href="/llms.txt">/llms.txt</a>
            </h3>
            <p className="ink3" style={{ fontSize: 14 }}>{L("给大模型爬虫的简短索引。", "Short index for LLM crawlers.")}</p>
          </div>
        </div>
      </section>
    </>
  );
}
