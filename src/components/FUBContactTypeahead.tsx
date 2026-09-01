import { useFubEnabled } from '@/hooks/useTenant';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, X, Check } from 'lucide-react';
import { followUpBossApi, FUBPerson } from '@/lib/api/followUpBoss';

interface SelectedContact {
  id: number;
  name: string;
  email?: string;
  phone?: string;
}

interface FUBContactTypeaheadProps {
  selectedContact: SelectedContact | null;
  onSelect: (contact: SelectedContact) => void;
  onClear: () => void;
}

function FUBContactTypeaheadInner({ selectedContact, onSelect, onClear }: FUBContactTypeaheadProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FUBPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setShowDropdown(false);
      setHasSearched(false);
      return;
    }
    setLoading(true);
    try {
      const response = await followUpBossApi.searchPeople(q, 10);
      if (response.success && response.data?.people) {
        setResults(response.data.people);
        setShowDropdown(true);
        setHasSearched(true);
      } else {
        // Failed search: show nothing rather than stale/unfiltered contacts.
        setResults([]);
        setShowDropdown(false);
        setHasSearched(false);
      }
    } catch {
      setResults([]);
      setShowDropdown(false);
      setHasSearched(false);
    } finally {
      setLoading(false);
    }
  }, []);


  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const handleSelect = (person: FUBPerson) => {
    onSelect({
      id: person.id,
      name: person.name || `${person.firstName} ${person.lastName}`,
      email: person.emails?.[0]?.value,
      phone: person.phones?.[0]?.value,
    });
    setQuery('');
    setResults([]);
    setShowDropdown(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (selectedContact) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-md border border-green-500/30 bg-green-500/5">
        <Check className="h-4 w-4 text-green-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{selectedContact.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            FUB #{selectedContact.id}
            {selectedContact.email && ` • ${selectedContact.email}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="p-1 rounded hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search FUB by name, email, or phone..."
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          className="pl-9 pr-8"
          autoFocus
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-60 overflow-y-auto">
          {results.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => handleSelect(person)}
              className="w-full text-left px-3 py-2 hover:bg-accent transition-colors border-b border-border last:border-0"
            >
              <p className="text-sm font-medium">
                {person.name || `${person.firstName} ${person.lastName}`}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {person.emails?.[0]?.value && <span>{person.emails[0].value}</span>}
                {person.phones?.[0]?.value && <span>{person.phones[0].value}</span>}
                {person.stage && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">{person.stage}</Badge>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {showDropdown && results.length === 0 && !loading && query.length >= 2 && hasSearched && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md p-4 text-center">
          <p className="text-sm font-medium text-foreground">No matching contact in Follow Up Boss</p>
          <p className="text-xs text-muted-foreground mt-1">
            Please add or update the contact in Follow Up Boss, then return here to select them.
          </p>
        </div>
      )}

    </div>
  );
}

/**
 * Teams without Follow Up Boss enter the contact by hand instead of searching.
 */
function ManualContactEntry({ selectedContact, onSelect, onClear }: FUBContactTypeaheadProps) {
  const [name, setName] = useState(selectedContact?.name ?? '');
  const [email, setEmail] = useState(selectedContact?.email ?? '');
  const [phone, setPhone] = useState(selectedContact?.phone ?? '');

  const commit = (next: { name?: string; email?: string; phone?: string }) => {
    const merged = { name, email, phone, ...next };
    if (!merged.name.trim()) {
      onClear();
      return;
    }
    onSelect({ id: selectedContact?.id ?? 0, ...merged });
  };

  return (
    <div className="space-y-2">
      <Input
        placeholder="Client name"
        value={name}
        onChange={(e) => { setName(e.target.value); commit({ name: e.target.value }); }}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => { setEmail(e.target.value); commit({ email: e.target.value }); }}
        />
        <Input
          placeholder="Phone (optional)"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); commit({ phone: e.target.value }); }}
        />
      </div>
    </div>
  );
}

export function FUBContactTypeahead(props: FUBContactTypeaheadProps) {
  const fubEnabled = useFubEnabled();
  if (!fubEnabled) return <ManualContactEntry {...props} />;
  return <FUBContactTypeaheadInner {...props} />;
}
