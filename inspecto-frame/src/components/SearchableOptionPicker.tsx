import React, { useEffect, useMemo, useId, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type SearchableOptionPickerProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: string[];
  placeholder?: string;
  /**
   * When the typed string does not match a suggestion, show “Use this value”
   * so inspectors can add parts/types not in the list (vehicle map / catalog).
   */
  allowCustomValue?: boolean;
  /** Shown when there are no options at all. */
  emptyListHint?: string;
  disabled?: boolean;
};

/**
 * Searchable dropdown: filter-as-you-type list + optional custom value.
 */
export function SearchableOptionPicker({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = 'Search or choose…',
  allowCustomValue = false,
  emptyListHint = 'No suggestions match.',
  disabled = false,
}: SearchableOptionPickerProps) {
  const autoId = useId();
  const inputId = id ?? `searchable-${autoId}`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const trimmedQuery = query.trim();
  const tq = trimmedQuery.toLowerCase();
  const exactMatch = options.some((o) => o === trimmedQuery || o.toLowerCase() === tq);
  const showCustom = allowCustomValue && trimmedQuery.length > 0 && !exactMatch && filtered.length === 0;

  useEffect(() => {
    if (open) setQuery(value);
  }, [open, value]);

  const selectOption = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery(next);
  };

  return (
    <div className="w-full min-w-0">
      <label
        htmlFor={inputId}
        className="text-xs font-semibold text-foreground block mb-1.5"
      >
        {label}
      </label>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery(value);
        }}
        modal={false}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            id={inputId}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal h-11 px-3 text-left text-sm"
          >
            <span className={cn('truncate', !value && 'text-muted-foreground')}>
              {value || placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="z-[200] min-w-0 p-0 w-[var(--radix-popper-anchor-width)] max-w-[min(100vw-1rem,32rem)]"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="border-b border-border p-2">
            <Input
              autoFocus
              value={open ? query : value}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!open) setOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && showCustom) {
                  e.preventDefault();
                  selectOption(trimmedQuery);
                }
              }}
              placeholder={placeholder}
              className="h-9"
            />
          </div>
          <div
            className="max-h-[min(50vh,280px)] overflow-y-auto overscroll-contain p-1.5 [-webkit-overflow-scrolling:touch]"
            role="listbox"
          >
            {options.length === 0 && !allowCustomValue && (
              <p className="px-2 py-3 text-sm text-muted-foreground text-center">{emptyListHint}</p>
            )}
            {options.length > 0 && filtered.length === 0 && !showCustom && (
              <p className="px-2 py-3 text-sm text-muted-foreground text-center">No match — try different words</p>
            )}
            {options.length === 0 && allowCustomValue && !trimmedQuery && (
              <p className="px-2 py-2.5 text-xs text-muted-foreground text-center">Type a name, then use the button below</p>
            )}
            {showCustom && (
              <button
                type="button"
                onClick={() => selectOption(trimmedQuery)}
                className="w-full text-left rounded-md px-2 py-2.5 text-sm font-medium text-primary bg-primary/5 border border-dashed border-primary/30 mb-1 hover:bg-primary/10"
              >
                Use “{trimmedQuery}”
              </button>
            )}
            {filtered.map((opt) => (
              <button
                type="button"
                key={opt}
                onClick={() => selectOption(opt)}
                className={cn(
                  'w-full text-left flex items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground',
                  value === opt && 'bg-muted/80',
                )}
                role="option"
                aria-selected={value === opt}
              >
                <Check
                  className={cn('h-4 w-4 shrink-0', value === opt ? 'opacity-100' : 'opacity-0')}
                />
                <span className="min-w-0 break-words">{opt}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
