import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.tsx";
import { WorkoutStoreProvider } from "./state/WorkoutStoreContext.tsx";
import type { StorageAdapter } from "./storage/adapter.ts";
import { HistoryScreen } from "./screens/HistoryScreen.tsx";
import { WorkoutEditorScreen } from "./screens/WorkoutEditorScreen.tsx";
import { WorkoutSummaryScreen } from "./screens/WorkoutSummaryScreen.tsx";
import { AnalysisScreen } from "./screens/AnalysisScreen.tsx";
import { PlanScreen } from "./screens/PlanScreen.tsx";

export interface AppProps {
  /** Optional storage adapter for tests; defaults to `localStorage`. */
  adapter?: StorageAdapter;
}

export default function App({ adapter }: AppProps = {}) {
  return (
    <WorkoutStoreProvider adapter={adapter}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HistoryScreen />} />
            <Route path="/workout/new" element={<WorkoutEditorScreen />} />
            <Route path="/workout/:id" element={<WorkoutSummaryScreen />} />
            <Route path="/analysis" element={<AnalysisScreen />} />
            <Route path="/plan" element={<PlanScreen />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WorkoutStoreProvider>
  );
}
