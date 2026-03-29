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
import { Zap } from "lucide-react";

interface CreditConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditCost: number;
  currentBalance: number;
  actionLabel: string;
  onConfirm: () => void;
}

const CreditConfirmModal = ({
  open,
  onOpenChange,
  creditCost,
  currentBalance,
  actionLabel,
  onConfirm,
}: CreditConfirmModalProps) => {
  const insufficient = currentBalance < creditCost;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-foreground flex items-center gap-2">
            <Zap size={18} className="text-primary" />
            Confirm Credit Usage
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {insufficient ? (
              <>
                You need <span className="text-primary font-bold">{creditCost} credits</span> but only
                have <span className="text-destructive-foreground font-bold">{currentBalance}</span>.
                Please upgrade your subscription or wait for your next billing cycle.
              </>
            ) : (
              <>
                This will cost <span className="text-primary font-bold">{creditCost} credits</span>.
                You currently have <span className="font-bold text-foreground">{currentBalance} credits</span>.
                After this action you'll have <span className="font-bold text-foreground">{currentBalance - creditCost} credits</span> remaining.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-secondary text-foreground border-border hover:bg-secondary/80">
            Cancel
          </AlertDialogCancel>
          {!insufficient && (
            <AlertDialogAction
              onClick={onConfirm}
              className="gradient-primary text-primary-foreground border-0"
            >
              {actionLabel} ({creditCost} credits)
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CreditConfirmModal;
