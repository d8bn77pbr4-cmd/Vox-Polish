export type Tab = 'today' | 'wardrobe' | 'import' | 'doll' | 'me'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Heute', icon: 'M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10l1.4 1.4M3 12h2m14 0h2M5.6 18.4L7 17m10-10l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z' },
  { id: 'wardrobe', label: 'Schrank', icon: 'M4 3h16v18H4zM12 3v18M9 11v2M15 11v2' },
  { id: 'import', label: 'Import', icon: 'M12 5v14M5 12h14' },
  { id: 'doll', label: 'Puppe', icon: 'M12 2a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM7 9h10l-1.5 6H14l-.5 7h-3L10 15H8.500z' },
  { id: 'me', label: 'Ich', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0' },
]

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="Hauptnavigation">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tab ${tab === t.id ? 'on' : ''} ${t.id === 'import' ? 'plus' : ''}`}
          onClick={() => onChange(t.id)}
          aria-current={tab === t.id ? 'page' : undefined}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={t.icon} />
          </svg>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
