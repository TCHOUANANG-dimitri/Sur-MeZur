import { Enquete } from "@/components/Enquete";

export default async function PageEnquete({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Enquete token={token} />;
}
