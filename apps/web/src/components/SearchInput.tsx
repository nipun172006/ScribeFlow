import { Search } from "lucide-react";
import type { FormEvent } from "react";

type SearchInputProps = {
  value: string;
  placeholder: string;
  label: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
};

export function SearchInput({
  value,
  placeholder,
  label,
  onChange,
  onSubmit,
}: SearchInputProps) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit?.();
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <label className="sr-only" htmlFor="search-input">
        {label}
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        size={18}
      />
      <input
        id="search-input"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="sf-field pl-10"
      />
    </form>
  );
}
