"use client";

export function ApplyFilters({ children, action }: { children: React.ReactNode; action: string }) {
  return (
    <form
      className="ops-toolbar"
      action={action}
      method="get"
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement) event.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
