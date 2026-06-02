import { Settings } from '../hooks/useSettings'

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

export default function SettingsTab({ settings, update }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Configurações</h2>
        <p className="text-sm text-gray-500 mt-0.5">Preferências da aplicação</p>
      </div>

      {/* Seção: Segurança */}
      <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Segurança</h3>
        </div>

        <div className="px-4 py-4">
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">
                Atraso de confirmação ao apagar
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Quando ativado, o botão <strong>"Sim, apagar"</strong> só aparece após
                5 segundos — evita exclusões acidentais de pastas.
              </p>
              {!settings.deleteDelay && (
                <p className="text-xs text-amber-600 mt-2 font-medium">
                  ⚠️ Atraso desativado — exclusões serão imediatas.
                </p>
              )}
            </div>

            {/* Toggle switch */}
            <div className="flex-shrink-0 pt-0.5">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.deleteDelay}
                  onChange={(e) => update({ deleteDelay: e.target.checked })}
                />
                <div className="w-11 h-6 bg-gray-200 rounded-full transition-colors peer-checked:bg-blue-600 peer-focus:ring-2 peer-focus:ring-blue-400 peer-focus:ring-offset-1" />
                <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
              </label>
            </div>
          </label>
        </div>
      </section>

      <p className="text-xs text-gray-400 text-center">
        As configurações são salvas automaticamente neste navegador.
      </p>
    </div>
  )
}
