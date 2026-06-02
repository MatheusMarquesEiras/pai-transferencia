import { useState, useEffect } from 'react'

interface FolderInfo {
  id: string
  original_name: string
  total_files: number
  total_size: number
}

interface Props {
  folder: FolderInfo
  delayEnabled: boolean
  onConfirm: () => Promise<void>
  onCancel: () => void
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

const DELAY = 5

export default function ConfirmDeleteModal({ folder, delayEnabled, onConfirm, onCancel }: Props) {
  const [count, setCount] = useState(delayEnabled ? DELAY : 0)
  const [confirming, setConfirming] = useState(false)
  const ready = count === 0

  // Decrementa o contador a cada segundo
  useEffect(() => {
    if (count <= 0) return
    const t = setTimeout(() => setCount((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [count])

  const handleConfirm = async () => {
    setConfirming(true)
    await onConfirm()
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        {/* Cabeçalho vermelho */}
        <div className="bg-red-50 px-6 pt-6 pb-4 border-b border-red-100 text-center">
          <div className="text-4xl mb-2">🗑️</div>
          <h2 className="text-lg font-bold text-gray-800">Apagar pasta?</h2>
          <p className="text-sm text-gray-500 mt-1">Esta ação não pode ser desfeita.</p>
        </div>

        {/* Detalhes da pasta */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📁</span>
            <div className="min-w-0">
              <p className="font-semibold text-gray-800 truncate">{folder.original_name}</p>
              <p className="text-xs text-gray-500">
                {folder.total_files} arquivo{folder.total_files !== 1 ? 's' : ''} &middot; {formatBytes(folder.total_size)}
              </p>
            </div>
          </div>
        </div>

        {/* Botões */}
        <div className="px-6 py-4 flex gap-3">
          <button
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 border border-gray-300 bg-white text-gray-700 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>

          {ready ? (
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex-1 bg-red-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {confirming ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Apagando...
                </>
              ) : (
                'Sim, apagar'
              )}
            </button>
          ) : (
            // Botão bloqueado com contador
            <div className="flex-1 bg-gray-200 text-gray-400 py-2.5 rounded-xl font-semibold text-sm text-center select-none flex items-center justify-center gap-2 cursor-not-allowed">
              {/* Anel de progresso circular */}
              <span className="relative inline-flex items-center justify-center w-5 h-5">
                <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="8" fill="none" stroke="#d1d5db" strokeWidth="2.5" />
                  <circle
                    cx="10" cy="10" r="8" fill="none" stroke="#6b7280" strokeWidth="2.5"
                    strokeDasharray={`${2 * Math.PI * 8}`}
                    strokeDashoffset={`${2 * Math.PI * 8 * (count / DELAY)}`}
                    className="transition-all duration-1000 ease-linear"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute text-[9px] font-bold text-gray-500">{count}</span>
              </span>
              Aguarde...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
