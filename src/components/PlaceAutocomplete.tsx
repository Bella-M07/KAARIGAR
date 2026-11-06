import React, { useEffect, useRef, useState } from 'react';
import { fetchPlaceSuggestions } from '../lib/api';
import type { PlaceSuggestion } from '../types';

interface PlaceAutocompleteProps {
  value: string;
  onChange: (next: string) => void;
  onSelectPlace: (place: PlaceSuggestion, servicePrefix?: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  allowNearSyntax?: boolean; // e.g. "Tiffin near Shyamal" autocompletes "Shyamal"
  inputClassName?: string;
}

export const PlaceAutocomplete: React.FC<PlaceAutocompleteProps> = ({
  value,
  onChange,
  onSelectPlace,
  onSubmit,
  placeholder,
  ariaLabel,
  allowNearSyntax = false,
  inputClassName,
}) => {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Extract place portion if allowNearSyntax ("Tiffin near Shyamal" -> placeQuery = "Shyamal")
  const parsed = (() => {
    if (!allowNearSyntax) return { svcPrefix: '', placeQuery: value.trim() };
    const m = value.match(/^(.*?)\s+(?:near|in|around)\s+(.+)$/i);
    if (m) return { svcPrefix: m[1].trim(), placeQuery: m[2].trim() };
    return { svcPrefix: '', placeQuery: value.trim() };
  })();

  useEffect(() => {
    const q = parsed.placeQuery;
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const list = await fetchPlaceSuggestions(q);
      if (!cancelled) {
        setSuggestions(list);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [parsed.placeQuery]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div ref={wrapRef} className="ac-wrap">
      <input
        type="text"
        className={inputClassName}
        value={value}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setOpen(false);
            onSubmit?.();
          }
        }}
      />
      {open && suggestions.length > 0 && (
        <div className="ac-menu" role="listbox">
          {suggestions.map((s, idx) => (
            <button
              key={`${s.lat}-${s.lng}-${idx}`}
              type="button"
              className="ac-item"
              onClick={() => {
                setOpen(false);
                onSelectPlace(s, parsed.svcPrefix || undefined);
              }}
            >
              <span>📍</span>
              <span>
                {parsed.svcPrefix ? (
                  <>
                    <b>{parsed.svcPrefix}</b> near {s.label}
                  </>
                ) : (
                  s.label
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
