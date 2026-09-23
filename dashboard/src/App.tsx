import { Route, Routes } from "react-router-dom";
import SessionList from "./pages/SessionList";
import SessionView from "./pages/SessionView";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SessionList />} />
      <Route path="/sessions/:id" element={<SessionView />} />
    </Routes>
  );
}
