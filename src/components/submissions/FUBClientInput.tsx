import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { FUBClientSearch } from '@/components/FUBClientSearch';

export interface FUBClient {
  id: number;
  name: string;
  email?: string;
  phone?: string;
}

interface FUBClientInputProps {
  value: string;
  onChange: (value: string) => void;
  onClientSelect?: (client: FUBClient) => void;
  placeholder?: string;
  className?: string;
}

export function FUBClientInput({ 
  value, 
  onChange, 
  onClientSelect,
  placeholder = "Enter client name",
  className 
}: FUBClientInputProps) {
  const handleClientSelect = (client: FUBClient) => {
    onChange(client.name);
    onClientSelect?.(client);
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1"
      />
      <FUBClientSearch
        onSelectClient={handleClientSelect}
        trigger={
          <Button variant="outline" size="icon" type="button" title="Search Follow Up Boss">
            <Search className="h-4 w-4" />
          </Button>
        }
      />
    </div>
  );
}
