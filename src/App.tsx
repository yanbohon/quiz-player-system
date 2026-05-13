import { Navigate, Route, Routes } from "react-router-dom";
import { Providers } from "@/providers/AppProviders";
import { FlexibleLayout } from "@/lib/flexible";
import LoginPage from "@/pages/LoginPage";
import QuizPage from "@/pages/QuizPage";
import WaitingPage from "@/pages/WaitingPage";

export function App() {
  return (
    <>
      <FlexibleLayout />
      <Providers>
        <Routes>
          <Route path="/" element={<WaitingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/waiting" element={<WaitingPage />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Providers>
    </>
  );
}
