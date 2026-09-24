import Icon from "@/components/Icon";

export default function AuthSubmitButton({
  loading,
  label,
  loadingLabel,
}: {
  loading: boolean;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button type="submit" disabled={loading} className="w-full btn btn-default">
      {loading ? (
        <><Icon name="loader" className="w-4 h-4" spin /> {loadingLabel}</>
      ) : (
        <><Icon name="check" className="w-4 h-4" /> {label}</>
      )}
    </button>
  );
}
