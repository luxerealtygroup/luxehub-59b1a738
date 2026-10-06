import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trophy } from 'lucide-react';

export function LevelUpDialog({ unlocked, onClose }: { unlocked: { level: number; name: string } | null; onClose: () => void }) {
  return (
    <Dialog open={!!unlocked} onOpenChange={o => !o && onClose()}>
      <DialogContent className="text-center sm:max-w-md" data-testid="sb-level-up">
        <div className="mx-auto mt-2 flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 animate-scale-in">
          <Trophy className="h-10 w-10 text-primary" />
        </div>
        <DialogHeader className="items-center">
          <DialogTitle className="font-display text-3xl">Level {unlocked?.level} unlocked</DialogTitle>
          <DialogDescription className="text-base">
            You cleared the last level. Next up: <span className="font-semibold text-foreground">{unlocked?.name}</span>. The leads get tougher from here, and earlier levels stay open for warm-ups.
          </DialogDescription>
        </DialogHeader>
        <Button onClick={onClose} className="mt-2">Let's go</Button>
      </DialogContent>
    </Dialog>
  );
}
