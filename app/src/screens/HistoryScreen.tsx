import { Link } from "react-router-dom";
import { summarizeMetrics } from "@pi-fit-trace/core";
import type { WorkoutRecord } from "@pi-fit-trace/core";
import { useWorkouts } from "../state/useWorkouts.ts";

function HistoryRow({ record }: { record: WorkoutRecord }) {
  const metrics = summarizeMetrics([record]);
  const avgRpe = metrics.avg_rpe === null ? "n/a" : metrics.avg_rpe;
  const setLabel = metrics.total_sets === 1 ? "set" : "sets";

  return (
    <li className="history-row">
      <Link
        to={`/workout/${record.id}`}
        aria-label={`View ${record.session_type} workout on ${record.date}`}
      >
        {record.date} — {record.session_type}
      </Link>
      <span className="history-summary">
        {`${metrics.total_sets} ${setLabel} · ${metrics.volume_kg} kg · avg RPE ${avgRpe}`}
      </span>
    </li>
  );
}

export function HistoryScreen() {
  const { records } = useWorkouts();

  // The store loads records in ascending date order; reverse explicitly so the
  // most recent workout appears first.
  const newestFirst = [...records].reverse();

  return (
    <section>
      <h1>Workout History</h1>

      {records.length === 0 ? (
        <div className="empty-state">
          <p>No workouts yet.</p>
          <Link to="/workout/new">Log your first workout</Link>
        </div>
      ) : (
        <ul className="history-list">
          {newestFirst.map((record) => (
            <HistoryRow key={record.id} record={record} />
          ))}
        </ul>
      )}
    </section>
  );
}
