import Link from "next/link";
import { listCustomers } from "@/lib/supabase/queries/admin-customers";
import { formatPriceCents, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface AdminCustomersPageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function AdminCustomersPage({ searchParams }: AdminCustomersPageProps) {
  const { q, page } = await searchParams;
  const pageNum = page ? Number(page) : 1;
  const { customers, total } = await listCustomers({ search: q, page: pageNum });
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Customers</h1>

      <form className="mt-4 flex gap-2" action="/admin/customers">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by email"
          className="w-64 rounded-md border p-2 text-sm"
        />
        <button type="submit" className="rounded-md border px-3 py-2 text-sm">
          Search
        </button>
      </form>

      <div className="mt-4 divide-y rounded-lg border">
        {customers.map((customer) => (
          <Link
            key={customer.id}
            href={`/admin/customers/${customer.id}`}
            className="flex items-center justify-between p-4 text-sm hover:bg-muted"
          >
            <div>
              <p className="font-medium">{customer.email}</p>
              <p className="text-muted-foreground">
                {customer.role} - joined {formatDate(customer.createdAt)} - {customer.totalOrders} orders
              </p>
            </div>
            <span className="font-medium">{formatPriceCents(customer.totalSpendCents)}</span>
          </Link>
        ))}
        {customers.length === 0 && <p className="p-4 text-sm text-muted-foreground">No customers found.</p>}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/customers?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${p}`}
              className={`rounded-md border px-2.5 py-1 ${p === pageNum ? "bg-muted font-medium" : ""}`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
