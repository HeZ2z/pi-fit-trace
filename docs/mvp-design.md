# pi-fit-trace MVP Design

## Goal

Complete the minimal loop of "workout log import → workout analysis → next-session recommendation". The App handles collection and display; the pi plugin reads structured data, analyzes trends, and generates recommendations.

## Phase 1 scope

- Accept a single workout record as JSON
- Store queryable training history
- Output a summary of the current session
- Analyze training volume, intensity, RPE, and consistency based on recent workout records
- Generate a next-session recommendation with its rationale
- Provide safety notices for missing data, anomalous values, and pain fields

Out of scope for now: automatic wearable device connection, complex periodization models, medical diagnosis, and automatic modification of training records.

## Initial data protocol

```json
{
  "date": "2026-09-13",
  "session_type": "strength",
  "exercises": [
    {
      "name": "bench_press",
      "sets": [
        {"weight": 80, "reps": 5, "rpe": 8}
      ]
    }
  ],
  "duration_minutes": 60,
  "sleep_hours": 7.5,
  "pain": []
}
```

The protocol should be formalized with JSON Schema as early as possible, and units must be explicit (weight defaults to kg, duration defaults to minutes).

## Plugin capability draft

- `import_workout(record)`: validate and store a workout record
- `get_training_history(range)`: query historical records
- `analyze_progress(range)`: return metrics, trends, and anomalies
- `generate_next_plan(constraints)`: generate an explainable next-session recommendation

Each recommendation should include a `reason` that cites actual historical data; it is written back to the App only after user confirmation.

## Implementation order

1. Confirm the target pi version and plugin API (tool registration, persistence, context injection).
2. Build the TypeScript/JSON Schema data model and validator.
3. Implement in-memory or local JSON storage, and complete `import_workout` and `get_training_history`.
4. Implement basic metrics: training volume, estimated intensity, average RPE, and training interval.
5. Implement the analysis and plan generation tools.
6. Perform end-to-end validation with fixed and anomalous samples, then integrate with the App.
