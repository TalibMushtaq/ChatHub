"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../app/lib/api";
import { getErrorMessage } from "../../app/lib/errors";

export type User = {
  id: string;
  username: string;
  displayname: string;
};

type Props = {
  onSelect: (user: User) => void;
};

export default function UserSearch({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const res = await api.get(`/search/users?query=${query}`);
        setResults(res.data.users);
      } catch (err) {
        setResults([]);
        toast.error(getErrorMessage(err, "Search failed"));
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [query]);

  const handleSelect = (user: User) => {
    onSelect(user);
    setQuery("");
    setResults([]);
  };

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Search users..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-md bg-white/5 px-3 py-2 outline-none"
      />

      {results.length > 0 && (
        <div className="absolute mt-1 w-full rounded-md bg-bg border border-white/10 shadow-lg">
          {results.map((user) => (
            <div
              key={user.id}
              onClick={() => handleSelect(user)}
              className="cursor-pointer px-3 py-2 hover:bg-white/5"
            >
              <div className="font-medium">{user.displayname}</div>
              <div className="text-sm text-white/50">@{user.username}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
