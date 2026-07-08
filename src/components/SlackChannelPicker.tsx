import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Check, ChevronsUpDown, Hash, Loader2, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_archived: boolean;
}

interface Props {
  value: string;
  onChange: (channelId: string) => void;
}

export function SlackChannelPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadChannels = async () => {
    setLoading(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke('slack-list-channels');
    if (fnError) {
      setError(fnError.message);
      toast({ title: 'Could not load Slack channels', description: fnError.message, variant: 'destructive' });
    } else if (data?.error) {
      setError(data.error);
      toast({ title: 'Slack error', description: data.error, variant: 'destructive' });
    } else {
      setChannels((data?.channels ?? []) as SlackChannel[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && channels.length === 0 && !loading) {
      loadChannels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selected = useMemo(
    () => channels.find((c) => c.id === value) || null,
    [channels, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                {selected.is_private ? <Lock className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
                {selected.name}
              </>
            ) : value ? (
              <span className="text-muted-foreground">{value}</span>
            ) : (
              <span className="text-muted-foreground">Select a Slack channel…</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search channels…" />
          <CommandList>
            {loading && (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading channels…
              </div>
            )}
            {!loading && error && (
              <div className="px-3 py-4 text-sm text-destructive">
                {error}
                <Button size="sm" variant="ghost" className="mt-2" onClick={loadChannels}>
                  Retry
                </Button>
              </div>
            )}
            {!loading && !error && (
              <>
                <CommandEmpty>No channels found.</CommandEmpty>
                <CommandGroup>
                  {channels.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.name} ${c.id}`}
                      onSelect={() => {
                        onChange(c.id);
                        setOpen(false);
                      }}
                    >
                      {c.is_private ? (
                        <Lock className="h-3.5 w-3.5 mr-2" />
                      ) : (
                        <Hash className="h-3.5 w-3.5 mr-2" />
                      )}
                      <span className="flex-1 truncate">{c.name}</span>
                      <Check
                        className={cn(
                          'h-4 w-4 ml-2',
                          value === c.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}