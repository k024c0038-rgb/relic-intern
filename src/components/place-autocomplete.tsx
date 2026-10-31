"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Input } from "@/components/ui/input";

export type Suggestion = { placeId: string; name: string; secondary: string };

/** Google Places Autocomplete（サーバー経由）で場所を選ぶ入力欄 */
export function PlaceAutocomplete({
  placeholder,
  onSelect,
  id,
}: {
  placeholder?: string;
  onSelect: (s: Suggestion) => void;
  id?: string;
}) {
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const session = useMemo(() => crypto.randomUUID(), []);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setItems([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const res = await fetch(
        `/api/places/autocomplete?q=${encodeURIComponent(query)}&lang=${locale}&session=${session}`,
      );
      const data = (await res.json()) as { suggestions: Suggestion[] };
      setItems(data.suggestions ?? []);
      setOpen(true);
    }, 250);
  }, [query, locale, session]);

  return (
    <div className="relative">
      <Input
        id={id}
        value={query}
        placeholder={placeholder}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open && items.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-background shadow-lg">
          {items.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(s);
                  setQuery("");
                  setItems([]);
                  setOpen(false);
                }}
              >
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.secondary}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-right text-[10px] text-muted-foreground">Powered by Google</p>
    </div>
  );
}
