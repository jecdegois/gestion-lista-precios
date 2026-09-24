import Icon from "@/components/Icon";

const VARIANTS = {
  error: { className: "bg-red-50 border-red-200 text-red-700", icon: "alertTriangle", role: "alert" },
  info: { className: "bg-blue-50 border-blue-200 text-blue-700", icon: "info", role: "status" },
} as const;

export default function AuthAlert({ variant, children }: { variant: keyof typeof VARIANTS; children: React.ReactNode }) {
  const { className, icon, role } = VARIANTS[variant];
  return (
    <div className={"rounded-lg border p-3 text-xs " + className} role={role}>
      <Icon name={icon} className="w-3.5 h-3.5 inline mr-1.5" />
      {children}
    </div>
  );
}
