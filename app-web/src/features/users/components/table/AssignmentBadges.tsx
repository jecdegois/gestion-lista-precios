import type { Assignment, Catalogs } from "../../types";

export default function AssignmentBadges({ assignments, roles }: { assignments: Assignment[]; roles: Catalogs["roles"] }) {
  if (!assignments.length) return <>Sin asignaciones</>;

  const roleName = (code: string) => roles.find((r) => r.code === code)?.name ?? code;
  return (
    <div className="flex flex-wrap gap-1">
      {assignments.map((a) => (
        <span key={a.company} className="badge badge-outline">
          <b>{a.company}</b> · {roleName(a.role)}
        </span>
      ))}
    </div>
  );
}
