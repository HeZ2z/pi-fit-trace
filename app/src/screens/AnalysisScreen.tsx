import { useState } from "react";
import type { ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { analyzeProgress } from "@pi-fit-trace/core";
import type { AnalysisResult } from "@pi-fit-trace/core";
import { readTextFile } from "../api/fileTransport.ts";
import { parseAnalysisResponse } from "../api/responseParsers.ts";
import { useWorkouts } from "../state/useWorkouts.ts";

function formatEvidenceValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(", ");
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function AnalysisView({ analysis }: { analysis: AnalysisResult }) {
  const { metrics } = analysis;

  return (
    <>
      <p className="analysis-period">
        {`Period: ${analysis.period.from ?? "n/a"} – ${analysis.period.to ?? "n/a"}`}
      </p>

      <section>
        <h2>Metrics</h2>
        <ul className="analysis-metrics">
          <li>{`Sessions: ${metrics.sessions}`}</li>
          <li>{`Sets: ${metrics.total_sets}`}</li>
          <li>{`Reps: ${metrics.total_reps}`}</li>
          <li>{`Volume: ${metrics.volume_kg} kg`}</li>
          <li>{`Average RPE: ${metrics.avg_rpe === null ? "n/a" : metrics.avg_rpe}`}</li>
          <li>{`Average rest: ${metrics.avg_rest_days} days`}</li>
          <li>{`Max gap: ${metrics.max_gap_days} days`}</li>
        </ul>
      </section>

      <section>
        <h2>Trends</h2>
        {analysis.trends.length === 0 ? (
          <p>No exercise trends yet.</p>
        ) : (
          <ul className="analysis-trends">
            {analysis.trends.map((trend) => (
              <li key={trend.exercise} data-trend-exercise={trend.exercise}>
                {`${trend.exercise}: ${trend.first} → ${trend.last} (${trend.delta >= 0 ? "+" : ""}${
                  trend.delta
                } kg, ${trend.delta_pct}%, ${trend.direction})`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Flags</h2>
        {analysis.flags.length === 0 ? (
          <p>No safety flags.</p>
        ) : (
          <ul className="analysis-flags">
            {analysis.flags.map((flag) => (
              <li
                key={flag.code}
                data-flag-code={flag.code}
                data-flag-severity={flag.severity}
              >
                {`${flag.code} (${flag.severity}): ${flag.message}`}
                <ul className="flag-evidence">
                  {Object.entries(flag.evidence).map(([key, value]) => (
                    <li key={key}>{`${key}: ${formatEvidenceValue(value)}`}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="analysis-source-count">
        {`Computed from ${analysis.source_records.length} record(s).`}
      </p>
    </>
  );
}

export function AnalysisScreen() {
  const { records } = useWorkouts();
  const [imported, setImported] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Single source of truth for rendering: local analysis unless an import
  // succeeded. A failed import never changes this.
  const localAnalysis = analyzeProgress([...records]);
  const analysis = imported ?? localAnalysis;
  const source = imported === null ? "local" : "imported";
  const showEmpty = records.length === 0 && imported === null;

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file === undefined) return;

    try {
      const text = await readTextFile(file);
      const parsed = parseAnalysisResponse(text);
      setImported(parsed);
      setError(null);
    } catch (caught) {
      // Keep the previously displayed analysis; only surface the error.
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      input.value = "";
    }
  }

  function showLocal(): void {
    setImported(null);
    setError(null);
  }

  return (
    <section>
      <h1>Progress Analysis</h1>

      <p data-testid="analysis-source">{`Analysis source: ${source}`}</p>

      <div className="field">
        <label htmlFor="analysis-import">Import analysis.json</label>
        <input
          id="analysis-import"
          type="file"
          accept="application/json"
          onChange={handleFileChange}
        />
      </div>

      {imported !== null && (
        <button type="button" onClick={showLocal}>
          Show local analysis
        </button>
      )}

      {error !== null && (
        <div role="alert" data-testid="analysis-error" className="validation-summary">
          {error}
        </div>
      )}

      {showEmpty ? (
        <div className="empty-state">
          <p>No workout history to analyse yet.</p>
          <Link to="/workout/new">Log your first workout</Link>
        </div>
      ) : (
        <AnalysisView analysis={analysis} />
      )}
    </section>
  );
}
