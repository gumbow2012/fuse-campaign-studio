import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { describeRun, formatUsd, type RunEstimate } from "@/lib/campaign-director/costEstimate";
import type { DirectorProject } from "@/lib/campaign-director/types";

type Props = {
  estimate: RunEstimate | null;
  project: DirectorProject;
  onCancel: () => void;
  onApprove: (estimate: RunEstimate) => void;
};

export default function SpendDialog({ estimate, project, onCancel, onApprove }: Props) {
  return (
    <AlertDialog open={estimate !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Approve this spend?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>{estimate ? describeRun(estimate, project) : null}</p>
              <p className="text-base font-semibold text-foreground">Estimated total: {estimate ? formatUsd(estimate.usd) : ""}</p>
              <p className="text-xs">
                Billed to the FUSE fal account, not customer credits. Only shots that still need it are included. Nothing already generated is regenerated.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel autoFocus>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => estimate && onApprove(estimate)}>Approve and run</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
