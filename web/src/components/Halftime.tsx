import type { HalftimeReport } from "../types/halftime";

const pct = (p: number) => `${Math.round(p * 100)}%`;

function ResultBar({ report }: { report: HalftimeReport }) {
  const { home_win, draw, away_win } = report.prediction.result;
  const segments = [
    { key: "home", label: `${report.home.short_name} win`, p: home_win },
    { key: "draw", label: "Draw", p: draw },
    { key: "away", label: `${report.away.short_name} win`, p: away_win },
  ];
  return (
    <section className="forecast" aria-labelledby="forecast-h">
      <h2 id="forecast-h">How the second half looks</h2>
      <div className="result-bar" role="img"
        aria-label={segments.map((s) => `${s.label} ${pct(s.p)}`).join(", ")}>
        {segments.map((s) => (
          <div key={s.key} className={`seg seg-${s.key}`} style={{ flexGrow: Math.max(s.p, 0.04) }}>
            <span className="seg-pct">{pct(s.p)}</span>
            <span className="seg-label">{s.label}</span>
          </div>
        ))}
      </div>
      <NextGoal report={report} />
    </section>
  );
}

function NextGoal({ report }: { report: HalftimeReport }) {
  const g = report.prediction.next_goal;
  return (
    <p className="next-goal">
      Next goal: <strong className="home-ink">{report.home.short_name} {pct(g.home)}</strong>,{" "}
      <strong className="away-ink">{report.away.short_name} {pct(g.away)}</strong>, no more goals{" "}
      {pct(g.none)}
    </p>
  );
}

function Story({ report }: { report: HalftimeReport }) {
  return (
    <section aria-labelledby="story-h">
      <h2 id="story-h">The first half</h2>
      <div className="story">
        {report.story.map((card) => (
          <article key={card.id} className="insight">
            <h3>{card.title}</h3>
            <p>{card.body}</p>
            {card.evidence.length > 0 && (
              <details>
                <summary>Evidence ({card.evidence.length})</summary>
                <ul>
                  {card.evidence.map((e) => (
                    <li key={e.event_id}>{e.description}</li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function Factors({ report }: { report: HalftimeReport }) {
  const max = Math.max(...report.prediction.factors.map((f) => Math.abs(f.impact)), 1e-6);
  return (
    <section aria-labelledby="factors-h">
      <h2 id="factors-h">Why the model thinks so</h2>
      <ul className="factors">
        {report.prediction.factors.map((f) => (
          <li key={f.feature}>
            <span className="factor-label">{f.label}</span>
            <span className="factor-track">
              <span className={`factor-fill ${f.favours}`}
                style={{ width: `${(Math.abs(f.impact) / max) * 100}%` }} />
            </span>
            <span className={`factor-side ${f.favours}-ink`}>
              {f.favours === "home" ? report.home.short_name : report.away.short_name}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Watch({ report }: { report: HalftimeReport }) {
  return (
    <section aria-labelledby="watch-h">
      <h2 id="watch-h">What to watch</h2>
      <ul className="watch">
        {report.what_to_watch.map((w) => (
          <li key={w.id}>
            <h3>{w.title}</h3>
            <p>{w.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stats({ report }: { report: HalftimeReport }) {
  return (
    <section aria-labelledby="stats-h">
      <h2 id="stats-h">First-half numbers</h2>
      <div className="momentum" role="img" aria-label="Final-third share by 15-minute block">
        {report.momentum.map((m) => (
          <div key={m.start_minute} className="mom-block">
            <div className="mom-bar">
              <span className="mom-home" style={{ width: pct(m.home_share) }} />
            </div>
            <span className="mom-label">{m.start_minute}–{m.end_minute}'</span>
          </div>
        ))}
      </div>
      <table className="stats">
        <thead>
          <tr>
            <th scope="col" className="home-ink">{report.home.short_name}</th>
            <th scope="col"><span className="sr-only">Stat</span></th>
            <th scope="col" className="away-ink">{report.away.short_name}</th>
          </tr>
        </thead>
        <tbody>
          {report.stats.map((s) => {
            const total = s.home + s.away || 1;
            return (
              <tr key={s.key}>
                <td className="stat-num">
                  {s.home}
                  <span className="stat-bar home" style={{ width: pct(s.home / total) }} />
                </td>
                <th scope="row">{s.label}</th>
                <td className="stat-num">
                  {s.away}
                  <span className="stat-bar away" style={{ width: pct(s.away / total) }} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

const AGENT_NAMES = { analyst: "Analyst", fact_checker: "Fact-checker", pipeline: "Pipeline" };

function AgentTrace({ report }: { report: HalftimeReport }) {
  const trace = report.meta.agent_trace ?? [];
  if (trace.length === 0) return null;
  return (
    <details className="agent-trace">
      <summary>
        How this story was made ({trace.length} {trace.length === 1 ? "step" : "steps"})
      </summary>
      <ol>
        {trace.map((step, i) => (
          <li key={i} className={`step-${step.action}`}>
            <strong>{AGENT_NAMES[step.agent]}</strong> {step.action}: {step.detail}
          </li>
        ))}
      </ol>
    </details>
  );
}

export function Halftime({ report }: { report: HalftimeReport }) {
  return (
    <main className="halftime">
      <ResultBar report={report} />
      <div className="columns">
        <div className="col-main">
          <Story report={report} />
          <Stats report={report} />
        </div>
        <aside className="col-side">
          <Watch report={report} />
          <Factors report={report} />
        </aside>
      </div>
      <footer className="meta">
        All match data is synthetic. Model {report.meta.model_version}, story from{" "}
        {report.meta.story_source === "llm" ? "Azure OpenAI agents" : "templates"}.
        <AgentTrace report={report} />
      </footer>
    </main>
  );
}
