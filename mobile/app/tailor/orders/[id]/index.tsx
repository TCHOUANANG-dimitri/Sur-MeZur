import { useLocalSearchParams } from "expo-router";
import React from "react";
import { OrderDetailScreen } from "../../../../src/screens/shared/OrderDetail";

export default function TailorOrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <OrderDetailScreen orderId={id} base="tailor" />;
}
