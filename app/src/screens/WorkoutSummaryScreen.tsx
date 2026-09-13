import { useParams } from "react-router-dom";

export function WorkoutSummaryScreen() {
  const { id } = useParams<{ id: string }>();

  return (
    <section>
      <h1>Workout Summary</h1>
      <p>This screen will show the details of workout {id ?? "(unknown id)"}.</p>
    </section>
  );
}
