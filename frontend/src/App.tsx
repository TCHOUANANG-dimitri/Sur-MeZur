import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout, ClientLayout, TailorLayout } from "./components/Layouts";
import { ProtectedRoute } from "./components/ProtectedRoute";

import Splash from "./pages/auth/Splash";
import LanguagePage from "./pages/auth/Language";
import Onboarding from "./pages/auth/Onboarding";
import RoleChoice from "./pages/auth/RoleChoice";
import Register from "./pages/auth/Register";
import Login from "./pages/auth/Login";

import Home from "./pages/client/Home";
import Search from "./pages/client/Search";
import TailorProfilePage from "./pages/client/TailorProfilePage";
import Gallery from "./pages/client/Gallery";
import ModelDetail from "./pages/client/ModelDetail";
import ReadyToWearDetail from "./pages/client/ReadyToWearDetail";
import MeasurementFlow from "./pages/client/MeasurementFlow";
import AvatarPage from "./pages/client/Avatar";
import TryOn from "./pages/client/TryOn";
import UseExistingMeasurements from "./pages/client/UseExistingMeasurements";
import OrderCreate from "./pages/client/OrderCreate";
import OrderList from "./pages/client/OrderList";
import Payment from "./pages/client/Payment";
import Review from "./pages/client/Review";
import ClientProfile from "./pages/client/Profile";

import TailorVerification from "./pages/tailor/Verification";
import TailorDashboard from "./pages/tailor/Dashboard";
import TailorOrders from "./pages/tailor/TailorOrders";
import QuoteForm from "./pages/tailor/QuoteForm";
import PatternView from "./pages/tailor/PatternView";
import TailorReadyToWear from "./pages/tailor/ReadyToWear";
import TailorFinances from "./pages/tailor/Finances";
import TailorProfileSelf from "./pages/tailor/Profile";

import AdminVerifications from "./pages/admin/Verifications";
import AdminDisputes from "./pages/admin/Disputes";
import AdminReviewModeration from "./pages/admin/ReviewModeration";
import AdminCommissionSettings from "./pages/admin/CommissionSettings";

import OrderDetail from "./pages/shared/OrderDetail";
import Negotiation from "./pages/shared/Negotiation";
import ChatScreen from "./pages/shared/ChatScreen";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/language" element={<LanguagePage />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/role" element={<RoleChoice />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute role="client" />}>
          <Route element={<ClientLayout />}>
            <Route path="/client/home" element={<Home />} />
            <Route path="/client/search" element={<Search />} />
            <Route path="/client/orders" element={<OrderList />} />
            <Route path="/client/profile" element={<ClientProfile />} />
            <Route path="/client/tryon" element={<TryOn />} />
          </Route>
          <Route path="/client/tailors/:id" element={<TailorProfilePage />} />
          <Route path="/client/models" element={<Gallery />} />
          <Route path="/client/models/:id" element={<ModelDetail />} />
          <Route path="/client/ready-to-wear/:id" element={<ReadyToWearDetail />} />
          <Route path="/client/measurements" element={<MeasurementFlow />} />
          <Route path="/client/avatar" element={<AvatarPage />} />
          <Route path="/client/tryon/pick-measurement" element={<UseExistingMeasurements />} />
          <Route path="/client/orders/new" element={<OrderCreate />} />
          <Route path="/client/orders/:id" element={<OrderDetail />} />
          <Route path="/client/orders/:id/negotiation" element={<Negotiation />} />
          <Route path="/client/orders/:id/payment" element={<Payment />} />
          <Route path="/client/orders/:id/chat" element={<ChatScreen />} />
          <Route path="/client/orders/:id/review" element={<Review />} />
        </Route>

        <Route element={<ProtectedRoute role="tailor" />}>
          <Route path="/tailor/verification" element={<TailorVerification />} />
          <Route element={<TailorLayout />}>
            <Route path="/tailor/dashboard" element={<TailorDashboard />} />
            <Route path="/tailor/orders" element={<TailorOrders />} />
            <Route path="/tailor/ready-to-wear" element={<TailorReadyToWear />} />
            <Route path="/tailor/finances" element={<TailorFinances />} />
            <Route path="/tailor/profile" element={<TailorProfileSelf />} />
          </Route>
          <Route path="/tailor/orders/:id" element={<OrderDetail />} />
          <Route path="/tailor/orders/:id/quote" element={<QuoteForm />} />
          <Route path="/tailor/orders/:id/pattern" element={<PatternView />} />
          <Route path="/tailor/orders/:id/negotiation" element={<Negotiation />} />
          <Route path="/tailor/orders/:id/chat" element={<ChatScreen />} />
        </Route>

        <Route element={<ProtectedRoute role="admin" />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin/verifications" element={<AdminVerifications />} />
            <Route path="/admin/disputes" element={<AdminDisputes />} />
            <Route path="/admin/reviews" element={<AdminReviewModeration />} />
            <Route path="/admin/commission" element={<AdminCommissionSettings />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
