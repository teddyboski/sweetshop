import { Skeleton } from "@/components/ui/skeleton";

export default function BuildABoxLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
