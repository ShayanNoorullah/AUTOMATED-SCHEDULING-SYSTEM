import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSegments } from "expo-router";
import type { Contact, Group, Template, UserSettings } from "../types";
import { api } from "../api/endpoints";
import { getAccessToken } from "../store/auth";

type DataContextValue = {
  groups: Group[];
  contacts: Contact[];
  templates: Template[];
  settings: UserSettings | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setGroups: (g: Group[]) => void;
  setContacts: (c: Contact[]) => void;
  setTemplates: (t: Template[]) => void;
};

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [g, t, c, s] = await Promise.all([
        api.getGroups(),
        api.getTemplates(),
        api.getContacts(),
        api.getSettings(),
      ]);
      setGroups(g);
      setTemplates(t);
      setContacts(c);
      setSettings(s);
    } finally {
      setLoading(false);
    }
  }, []);

  const segments = useSegments();

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (segments[0] === "(drawer)") {
      refresh().catch(() => {});
    }
  }, [segments, refresh]);

  return (
    <DataContext.Provider
      value={{
        groups,
        contacts,
        templates,
        settings,
        loading,
        refresh,
        setGroups,
        setContacts,
        setTemplates,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData outside provider");
  return ctx;
}
