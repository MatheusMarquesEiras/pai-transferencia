import { useState } from 'react'
import UploadTab from './components/UploadTab'
import DownloadTab from './components/DownloadTab'
import SettingsTab from './components/SettingsTab'
import { useSettings } from './hooks/useSettings'

type Tab = 'upload' | 'download' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'upload',   label: 'Enviar',        icon: '📤' },
  { id: 'download', label: 'Receber',       icon: '📥' },
  { id: 'settings', label: 'Configurações', icon: '⚙️' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('upload')
  const { settings, update } = useSettings()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 text-white shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="text-2xl">🗂️</span>
          <h1 className="text-xl font-bold">Transferência de Arquivos</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 sm:px-6 py-3 font-medium text-sm transition-colors border-b-2 flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {activeTab === 'upload'   && <UploadTab />}
        {activeTab === 'download' && <DownloadTab settings={settings} />}
        {activeTab === 'settings' && <SettingsTab settings={settings} update={update} />}
      </div>
    </div>
  )
}
