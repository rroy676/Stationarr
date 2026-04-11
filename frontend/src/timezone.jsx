import { createContext, useContext, useState, useCallback } from 'react';

const TZCtx = createContext(null);

export function TimezoneProvider({ children }) {
  const [tz, setTz] = useState(() => localStorage.getItem('stationarr_tz') || Intl.DateTimeFormat().resolvedOptions().timeZone);

  const setTimezone = useCallback((newTz) => {
    localStorage.setItem('stationarr_tz', newTz);
    setTz(newTz);
  }, []);

  const fmt = useCallback((date, opts = {}) => {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString([], { timeZone: tz, ...opts });
  }, [tz]);

  const fmtTime = useCallback((date) => {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString([], { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  }, [tz]);

  const fmtDate = useCallback((date) => {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString([], { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
  }, [tz]);

  // Convert a UTC date to a Date object adjusted for display in the selected timezone
  const toTZ = useCallback((date) => {
    if (!date) return null;
    const d = typeof date === 'string' ? new Date(date) : date;
    // Returns offset-adjusted date for positioning calculations
    const offset = getTimezoneOffset(tz, d);
    return new Date(d.getTime() + offset * 60000);
  }, [tz]);

  return (
    <TZCtx.Provider value={{ tz, setTimezone, fmt, fmtTime, fmtDate, toTZ }}>
      {children}
    </TZCtx.Provider>
  );
}

export const useTZ = () => useContext(TZCtx);

// Get timezone offset in minutes for a given timezone and date
function getTimezoneOffset(timeZone, date = new Date()) {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate  = new Date(date.toLocaleString('en-US', { timeZone }));
  return (tzDate - utcDate) / 60000;
}

// List of common timezones grouped by region
export const TIMEZONE_GROUPS = [
  {
    label: 'North America',
    zones: [
      { label: 'Eastern (UTC-5/-4)',    value: 'America/New_York' },
      { label: 'Central (UTC-6/-5)',    value: 'America/Chicago' },
      { label: 'Mountain (UTC-7/-6)',   value: 'America/Denver' },
      { label: 'Pacific (UTC-8/-7)',    value: 'America/Los_Angeles' },
      { label: 'Alaska (UTC-9/-8)',     value: 'America/Anchorage' },
      { label: 'Hawaii (UTC-10)',       value: 'Pacific/Honolulu' },
      { label: 'Atlantic (UTC-4/-3)',   value: 'America/Halifax' },
      { label: 'Newfoundland (UTC-3.5)',value: 'America/St_Johns' },
    ],
  },
  {
    label: 'Canada',
    zones: [
      { label: 'Toronto / Montreal',   value: 'America/Toronto' },
      { label: 'Vancouver',            value: 'America/Vancouver' },
      { label: 'Winnipeg',             value: 'America/Winnipeg' },
    ],
  },
  {
    label: 'Europe',
    zones: [
      { label: 'London (GMT/BST)',      value: 'Europe/London' },
      { label: 'Paris / Berlin (CET)',  value: 'Europe/Paris' },
      { label: 'Helsinki (EET)',        value: 'Europe/Helsinki' },
      { label: 'Moscow (MSK)',          value: 'Europe/Moscow' },
    ],
  },
  {
    label: 'Asia / Pacific',
    zones: [
      { label: 'Dubai (GST)',           value: 'Asia/Dubai' },
      { label: 'Mumbai (IST)',          value: 'Asia/Kolkata' },
      { label: 'Bangkok (ICT)',         value: 'Asia/Bangkok' },
      { label: 'Singapore / KL (SGT)', value: 'Asia/Singapore' },
      { label: 'Tokyo (JST)',           value: 'Asia/Tokyo' },
      { label: 'Sydney (AEST)',         value: 'Australia/Sydney' },
      { label: 'Auckland (NZST)',       value: 'Pacific/Auckland' },
    ],
  },
  {
    label: 'UTC',
    zones: [
      { label: 'UTC',                   value: 'UTC' },
    ],
  },
];

export function getAllZones() {
  return TIMEZONE_GROUPS.flatMap(g => g.zones);
}
