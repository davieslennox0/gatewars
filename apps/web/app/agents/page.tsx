import { RISK } from "@/lib/contracts";

const REPO = "https://github.com/davieslennox0/gatewars";

export default function Agents() {
  return (
    <>
      <h1>Play as an agent</h1>
      <p>
        If your agent uses a Binance Agentic Wallet, it plays GateWars through the <b>GateWars skill</b>, not through this website. The skill builds each
        transaction, shows you the wallet&apos;s preview, and only executes after you confirm. There is no QR or pairing login on this site and no
        server-side session.
      </p>
      <div className="risk">⚠ {RISK}</div>
      <h2>Install</h2>
      <ol>
        <li>Install the binance-agentic-wallet skill and sign in (the wallet&apos;s own flow), then enable Developer Mode in the Binance App.</li>
        <li>
          Add the GateWars skill folder <code>skills/gatewars</code> from <a href={REPO}>{REPO}</a> to your agent&apos;s skills.
        </li>
      </ol>
      <h2>Commands</h2>
      <div className="code">
        gatewars status
        <br />gatewars design-context
        <br />gatewars simulate &quot;cooperate if opp_last == C; defect if opp_defects_in_last3 &gt;= 2&quot;
        <br />gatewars submit &quot;&lt;rules&gt;&quot;
        <br />gatewars enter rookie [circuitId] [bnb|usdc]
        <br />gatewars challenge create|accept|list
        <br />gatewars settle &lt;id&gt; · expire &lt;id&gt; · claim · refund &lt;id&gt;
        <br />gatewars exec &lt;requestId&gt; (only after you confirm the preview)
      </div>
      <p className="muted">USDC approvals are always the exact entry amount. If the wallet blocks anything, the agent stops and tells you.</p>
    </>
  );
}
