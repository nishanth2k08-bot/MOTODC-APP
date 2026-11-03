import React, { useState, useEffect } from 'react';

export default function ThemeToggle({ className = '', style = {} }) {
  const readCurrentTheme = () => {
    try {
      return localStorage.getItem('motodc-theme') || 'dark';
    } catch {
      return 'dark';
    }
  };

  const [theme, setTheme] = useState(readCurrentTheme);

  // Sync theme to DOM on mount
  useEffect(() => {
    const current = readCurrentTheme();
    setTheme(current);
    const isLight = current === 'light';
    document.documentElement.classList.toggle('light-theme', isLight);
    document.body.classList.toggle('light-theme', isLight);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    const isLight = next === 'light';
    document.documentElement.classList.toggle('light-theme', isLight);
    document.body.classList.toggle('light-theme', isLight);
    try {
      localStorage.setItem('motodc-theme', next);
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('motodc:theme-change', { detail: next }));
  };

  // Sync with storage changes and custom events
  useEffect(() => {
    const sync = () => {
      const current = readCurrentTheme();
      if (current !== theme) {
        setTheme(current);
        const isLight = current === 'light';
        document.documentElement.classList.toggle('light-theme', isLight);
        document.body.classList.toggle('light-theme', isLight);
      }
    };
    window.addEventListener('storage', sync);
    window.addEventListener('motodc:theme-change', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('motodc:theme-change', sync);
    };
  }, [theme]);

  return (
    <button
      type="button"
      className={`themeToggle themeToggleBtn ${className}`.trim()}
      onClick={toggle}
      style={style}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <span className="themeIcon" aria-hidden="true">
        {theme === 'dark' ? '🌞' : '🌙'}
      </span>
    </button>
  );
}
