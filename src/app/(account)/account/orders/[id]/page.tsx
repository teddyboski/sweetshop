interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AccountOrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;
  return <h1>Order Detail Placeholder ({id})</h1>;
}
