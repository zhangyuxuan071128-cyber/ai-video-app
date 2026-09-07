import type { Confirmation } from "./ui";

export interface ViewProps {
  refreshKey: number;
  notify: (tone: "success" | "error" | "info", title: string, message?: string) => void;
  requestConfirmation: (confirmation: Confirmation) => void;
}
