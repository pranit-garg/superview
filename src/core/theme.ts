import type { ThemeMode } from '../types.js';

export const THEMES = {
  day: {
    bg: '#F5F2E8',
    surface: '#FEFEFE',
    accent: '#2A7047',
    gold: '#B8892A',
    text: '#1C1C1A',
    muted: '#6A6B5E',
    border: 'rgba(28, 28, 26, 0.1)',
    selection: 'rgba(42, 112, 71, 0.15)',
    cardShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  night: {
    bg: '#080810',
    surface: '#161412',
    accent: '#D43030',
    gold: '#D49828',
    text: '#EDE8E0',
    muted: '#908878',
    border: 'rgba(237, 232, 224, 0.08)',
    selection: 'rgba(212, 48, 48, 0.25)',
    cardShadow: '0 1px 3px rgba(0,0,0,0.3)',
  },
} as const;

export function getThemeCSS(): string {
  return `
    html.day {
      --sv-bg: ${THEMES.day.bg};
      --sv-surface: ${THEMES.day.surface};
      --sv-accent: ${THEMES.day.accent};
      --sv-gold: ${THEMES.day.gold};
      --sv-text: ${THEMES.day.text};
      --sv-muted: ${THEMES.day.muted};
      --sv-border: ${THEMES.day.border};
      --sv-selection: ${THEMES.day.selection};
      --sv-card-shadow: ${THEMES.day.cardShadow};
    }
    html.night {
      --sv-bg: ${THEMES.night.bg};
      --sv-surface: ${THEMES.night.surface};
      --sv-accent: ${THEMES.night.accent};
      --sv-gold: ${THEMES.night.gold};
      --sv-text: ${THEMES.night.text};
      --sv-muted: ${THEMES.night.muted};
      --sv-border: ${THEMES.night.border};
      --sv-selection: ${THEMES.night.selection};
      --sv-card-shadow: ${THEMES.night.cardShadow};
    }
  `;
}

export function getThemeScript(mode: ThemeMode): string {
  return `
    (function() {
      var stored = localStorage.getItem('sv-theme');
      var theme = stored || '${mode === 'auto' ? 'auto' : mode}';
      if (theme === 'auto') {
        var hour = new Date().getHours();
        theme = (hour >= 18 || hour < 6) ? 'night' : 'day';
      }
      document.documentElement.className = theme;
      window.__svTheme = theme;
    })();
  `;
}

export function getThemeToggleScript(): string {
  return `
    function toggleTheme() {
      var current = document.documentElement.className;
      var next = current === 'day' ? 'night' : 'day';
      document.documentElement.className = next;
      window.__svTheme = next;
      localStorage.setItem('sv-theme', next);
      var btn = document.getElementById('sv-theme-toggle');
      if (btn) btn.textContent = next === 'day' ? '\\u263E' : '\\u2600';
      var tbLbl = document.querySelector('#sv-theme-btn .sv-theme-label');
      if (tbLbl) tbLbl.textContent = next === 'day' ? 'Night' : 'Day';
    }
  `;
}
