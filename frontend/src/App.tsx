import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { homeFor, useAuth } from "./lib/auth";
import type { Role } from "./lib/types";
import { Loading } from "./components/ui";
import { AppShell } from "./components/AppShell";
import { PortalShell } from "./components/PortalShell";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Dashboard } from "./pages/Dashboard";
import { Members } from "./pages/Members";
import { MemberDetail } from "./pages/MemberDetail";
import { MemberForm } from "./pages/MemberForm";
import { Collect } from "./pages/Collect";
import { Ledger } from "./pages/Ledger";
import { Loans } from "./pages/Loans";
import { LoanNew } from "./pages/LoanNew";
import { LoanDetail } from "./pages/LoanDetail";
import { Bylaws } from "./pages/Bylaws";
import { Assistant } from "./pages/Assistant";
import { Settings } from "./pages/Settings";
import { PortalHome } from "./pages/portal/PortalHome";
import { PortalLoan } from "./pages/portal/PortalLoan";
import { PortalHistory } from "./pages/portal/PortalHistory";
import { PortalAsk } from "./pages/portal/PortalAsk";

function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

const STAFF: Role[] = ["admin", "staff"];
const ADMIN: Role[] = ["admin"];

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        element={
          <Guard roles={STAFF}>
            <AppShell />
          </Guard>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="members" element={<Members />} />
        <Route path="members/new" element={<Guard roles={ADMIN}><MemberForm /></Guard>} />
        <Route path="members/:id" element={<MemberDetail />} />
        <Route path="members/:id/edit" element={<Guard roles={ADMIN}><MemberForm /></Guard>} />
        <Route path="collect" element={<Collect />} />
        <Route path="ledger" element={<Ledger />} />
        <Route path="loans" element={<Loans />} />
        <Route path="loans/new" element={<Guard roles={ADMIN}><LoanNew /></Guard>} />
        <Route path="loans/:id" element={<LoanDetail />} />
        <Route path="bylaws" element={<Bylaws />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="settings" element={<Guard roles={ADMIN}><Settings /></Guard>} />
      </Route>

      <Route
        path="/me"
        element={
          <Guard roles={["customer"]}>
            <PortalShell />
          </Guard>
        }
      >
        <Route index element={<PortalHome />} />
        <Route path="loan" element={<PortalLoan />} />
        <Route path="history" element={<PortalHistory />} />
        <Route path="ask" element={<PortalAsk />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
