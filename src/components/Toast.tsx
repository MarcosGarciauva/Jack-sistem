import { CheckCircle2 } from "lucide-react";

export function Toast({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div className="j-toast animate-rise">
      <CheckCircle2 size={16} />
      {message}
    </div>
  );
}
