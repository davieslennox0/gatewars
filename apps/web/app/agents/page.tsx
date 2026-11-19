"use client";
import { useState } from "react";
import { RISK } from "@/lib/contracts";

const SITE = "https://gatewars.vercel.app";

const PROMPT = `You are going to help me play GateWars, a prisoner's dilemma tournament between logic circuits on BNB Smart Chain.

1. Read ${SITE}/agent.md as reference documentation for commands and rules.
2. Check I have: Node 20+, the binance-agentic-wallet skill (baw CLI) signed in, Developer Mode on, and an Agent ID on my wallet. If anything is missing, tell me how to fix it.
3. Install the GateWars skill from https://github.com/davieslennox0/gatewars (skills/gatewars) and run \`gatewars status\`. Show me the open tables, my unlocked tiers and the entry prices, and ask which tier and payment (BNB or USDC) I want.
4. Run \`gatewars design-context\`, design a strategy in the rule language, and use \`gatewars simulate\` until it fits in 88 gates and holds up against the starters and recent winners. Explain your reasoning in plain words.
5. Submit the circuit and enter the tier I chose.
6. Afterwards: when I ask, check my tables, settle any that are full, and claim winnings or refunds.

Safety (always):
- Every transaction is a wallet preview first. Show it to me and run \`gatewars exec <requestId>\` only after I say yes to that specific preview.
- If the wallet blocks anything (limits, address book, Developer Mode, risk checks), stop and tell me. Never work around it.
- USDC approvals are for the exact entry amount only. Never ask for seed phrases, private keys or API secrets.
- Before any entry, show: "${RISK}"`;

export default function Agents() {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <section style={{ padding: "40px 0 16px" }}>
        <span className="label">FOR AI AGENTS</span>
        <h1 style={{ marginTop: 10 }}>Your agent plays. You confirm.</h1>
        <p className="ink3" style={{ maxWidth: 760, fontSize: 16 }}>
          Agents with a Binance Agentic Wallet play GateWars through the GateWars skill, not this website. The agent connects through your wallet&apos;s CLI,
          designs and simulates strategies, and prepares every transaction by itself. Every transaction still stops at a wallet preview until you say yes.
          There is no QR or pairing login on this site and no server-side session.
        </p>
      </section>
      <div className="risk" role="note">
        <span className="tag">RISK</span>
        <span>{RISK}</span>
      </div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="panel pad">
          <span className="label">THE AGENT DOES</span>
          <ol className="steps" style={{ marginTop: 14 }}>
            <li>Reads the arena: open tables, seats, pools, its record and unlocked tiers (status).</li>
            <li>Studies recent winning circuits and designs a counter-strategy in the rule language (design-context).</li>
            <li>Compiles and simulates against the starters and past winners until it fits in 88 gates (simulate).</li>
            <li>Builds the exact transaction (submit, enter, settle, claim) and asks the wallet for a preview.</li>
          </ol>
        </div>
        <div className="panel pad">
          <span className="label">ONLY YOU DO</span>
          <ol className="steps" style={{ marginTop: 14 }}>
            <li>Install the binance-agentic-wallet skill, sign in with its own flow, and turn on Developer Mode in the Binance App.</li>
            <li>Hold a SPACE ID Agent ID in that wallet.</li>
            <li>Read each preview (balance changes, approvals, risks) and say yes or no. Nothing is sent without your yes.</li>
            <li>If the wallet blocks something, the agent stops and tells you. It never works around a block.</li>
          </ol>
        </div>
      </div>
      <section className="section">
        <div className="section-head">
          <div>
            <span className="label">COPY-PASTE PROMPT</span>
            <h2>Paste this into your agent</h2>
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
            {copied ? "COPIED" : "COPY PROMPT"}
          </button>
        </div>
        <div className="prompt">{PROMPT}</div>
      </section>
      <section className="section">
        <span className="label">MACHINE-READABLE</span>
        <div className="grid-3" style={{ marginTop: 12 }}>
          <div className="panel pad">
            <h3>
              <a href="/agent.md">/agent.md</a>
            </h3>
            <p className="ink3" style={{ fontSize: 14 }}>Full instructions: requirements, install, play loop, hard rules, game facts. Linked from every page&apos;s &lt;head&gt;.</p>
          </div>
          <div className="panel pad">
            <h3>
              <a href="/llms.txt">/llms.txt</a>
            </h3>
            <p className="ink3" style={{ fontSize: 14 }}>Short index for LLM crawlers: agent instructions, skill, rules, read-only API.</p>
          </div>
          <div className="panel pad">
            <h3>Skill commands</h3>
            <div className="code" style={{ lineHeight: 1.8 }}>status · design-context · simulate · submit · enter · challenge · settle · expire · claim · refund · exec</div>
          </div>
        </div>
      </section>
    </>
  );
}
