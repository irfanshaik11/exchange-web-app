"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

interface SearchContextValue {
  isOpen: boolean;
  query: string;
  openSearch: (initialQuery?: string) => void;
  closeSearch: () => void;
  setSearchQuery: (query: string) => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const openSearch = useCallback((initialQuery?: string) => {
    if (initialQuery !== undefined) {
      setQuery(initialQuery);
    }
    setIsOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setIsOpen(false);
    // Clear query on close so next open starts fresh
    setQuery("");
  }, []);

  const setSearchQuery = useCallback((newQuery: string) => {
    setQuery(newQuery);
  }, []);

  return (
    <SearchContext.Provider
      value={useMemo(() => ({ isOpen, query, openSearch, closeSearch, setSearchQuery }), [isOpen, query, openSearch, closeSearch, setSearchQuery])}
    >
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error("useSearch must be used within a SearchProvider");
  }
  return context;
}
