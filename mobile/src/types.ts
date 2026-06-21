export type ScheduleEntry = {
  day: string;
  from?: string;
  to?: string;
  time?: string;
};

export type Group = {
  name: string;
  schedule: ScheduleEntry[];
  message: string;
  lastReleased?: string;
  inviteLink?: string;
};

export type Contact = {
  name: string;
  phone: string;
  message: string;
  lastReleased?: string;
};

export type Template = {
  name: string;
  content: string;
  isDefault?: boolean;
};

export type UserSettings = {
  headless: boolean;
  delaySeconds: number;
  maintenanceMode?: boolean;
  siteName?: string;
};

export type Profile = {
  email: string;
  displayName: string;
  role: string;
  createdAt?: string;
  lastLoginAt?: string;
};

export type WaSession = {
  provider: string;
  connected: boolean;
  detail?: string;
  status?: string;
  error?: string;
  sessionName?: string;
};

export type ReleaseTarget = {
  name: string;
  message: string;
  phone?: string;
};
