import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

interface DealTypeDropdownProps {
  fubDealId: number;
  currentCategory: 'sale' | 'lease' | null;
  onchange: (fubDealId: number, category: 'sale' | 'lease') => void;
  compact?: boolean;
}

export function DealTypeDropdown({ fubDealId, currentCategory, onchange, compact }: DealTypeDropdownProps) {
  return (
    <div className="flex items-center gap-1">
      <Select
        value={currentCategory || 'sale'}
        onValueChange={(val) => onchange(fubDealId, val as 'sale' | 'lease')}
      >
        <SelectTrigger className={compact ? 'h-7 text-xs w-20 px-2' : 'h-8 text-xs w-24'}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="sale">Sale (1.0)</SelectItem>
          <SelectItem value="lease">Lease (0.33)</SelectItem>
        </SelectContent>
      </Select>
      {!currentCategory && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3.5 w-3.5 text-amber-500" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Not yet classified — defaulting to Sale</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
