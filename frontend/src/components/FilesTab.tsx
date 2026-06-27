import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { Settings } from '../hooks/useSettings'
import ConfirmDeleteModal from './ConfirmDeleteModal'

const PAGE_SIZE = 20

interface FileItem {
  id: number
  folder_id: string
  folder_name: string
  path: string
  name: string
  size: number
}

interface FilesResponse {
  total: number
  files: FileItem[]
}

interface Props {
  settings: Settings
}

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'heic', 'avif', 'raw'].includes(ext)) return '🖼️'
  if (['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'm4v', '3gp', 'ts'].includes(ext)) return '🎬'
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus', 'mid', 'midi'].includes(ext)) return '🎵'
  if (ext === 'pdf') return '📕'
  if (['doc', 'docx', 'odt', 'rtf', 'pages'].includes(ext)) return '📝'
  if (['xls', 'xlsx', 'ods', 'csv', 'numbers'].includes(ext)) return '📊'
  if (['ppt', 'pptx', 'odp', 'key'].includes(ext)) return '📎'
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst', 'lzma', 'cab'].includes(ext)) return '🗜️'
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'rb', 'swift', 'kt', 'dart', 'lua', 'r', 'sh', 'bat', 'ps1'].includes(ext)) return '💻'
  if (['html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte'].includes(ext)) return '🌐'
  if (['json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'lock'].includes(ext)) return '⚙️'
  if (['txt', 'md', 'log', 'readme', 'rst', 'nfo'].includes(ext)) return '📄'
  if (['exe', 'msi', 'dmg', 'deb', 'rpm', 'appimage', 'apk', 'ipa'].includes(ext)) return '⚡'
  if (['ttf', 'otf', 'woff', 'woff2', 'eot'].includes(ext)) return '🔤'
  if (['db', 'sqlite', 'sqlite3', 'sql'].includes(ext)) return '🗄️'
  if (['iso', 'img', 'vmdk', 'vhd', 'vdi'].includes(ext)) return '💿'
  return '📄'
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function truncateMiddle(name: string, maxChars = 32): string {
  if (name.length <= maxChars) return name
  const dotIdx = name.lastIndexOf('.')
  const ext = dotIdx > 0 && name.length - dotIdx <= 7 ? name.slice(dotIdx) : ''
  const base = ext ? name.slice(0, dotIdx) : name
  const available = maxChars - ext.length - 3
  if (available < 6) return name.slice(0, maxChars - 3) + '...'
  const startChars = Math.ceil(available / 2)
  const endChars = Math.floor(available / 2)
  return base.slice(0, startChars) + '...' + (endChars > 0 ? base.slice(-endChars) : '') + ext
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function FilesTab({ settings }: Props) {
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<FileItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchFiles = useCallback(async (q: string, offset: number, append: boolean) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const { data } = await axios.get<FilesResponse>('/api/files', {
        params: { q, offset, limit: PAGE_SIZE },
      })
      setTotal(data.total)
      setFiles((prev) => (append ? [...prev, ...data.files] : data.files))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    fetchFiles('', 0, false)
  }, [fetchFiles])

  const handleSearch = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchFiles(value, 0, false), 300)
  }

  const downloadFile = async (file: FileItem) => {
    setDownloadingId(file.id)
    try {
      const { data } = await axios.get(`/api/folders/${file.folder_id}/file`, {
        params: { path: file.path },
        responseType: 'blob',
      })
      triggerDownload(data, file.name)
    } finally {
      setDownloadingId(null)
    }
  }

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return
    await axios.delete(`/api/files/${fileToDelete.id}`)
    setFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id))
    setTotal((prev) => prev - 1)
    setFileToDelete(null)
  }

  const hasMore = files.length < total

  return (
    <>
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base select-none pointer-events-none">
            🔍
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar por nome, extensão..."
            className="w-full pl-10 pr-9 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          />
          {query && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold px-1"
            >
              ✕
            </button>
          )}
        </div>

        {/* Count bar */}
        {!loading && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {total === 0
                ? 'Nenhum arquivo encontrado'
                : `${total} arquivo${total !== 1 ? 's' : ''}${query ? ` encontrado${total !== 1 ? 's' : ''}` : ''}`}
              {files.length > 0 && files.length < total ? ` — mostrando ${files.length}` : ''}
            </p>
            <button
              onClick={() => fetchFiles(query, 0, false)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              ↺ Atualizar
            </button>
          </div>
        )}

        {/* Loading initial */}
        {loading && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3 animate-pulse">📂</div>
            <p className="text-sm">Carregando arquivos...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && files.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">{query ? '🔍' : '📭'}</div>
            <p className="font-medium">
              {query ? 'Nenhum arquivo corresponde à busca' : 'Nenhum arquivo disponível'}
            </p>
            {!query && (
              <p className="text-sm mt-1">Envie uma pasta na aba Enviar primeiro</p>
            )}
          </div>
        )}

        {/* File list */}
        {!loading && files.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="divide-y divide-gray-100">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <span className="text-2xl flex-shrink-0 select-none leading-none">
                    {getFileIcon(file.name)}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 leading-tight" title={file.name}>
                      {truncateMiddle(file.name)}
                    </p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{file.folder_name}</p>
                  </div>

                  <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block tabular-nums">
                    {formatBytes(file.size)}
                  </span>

                  {/* Download button */}
                  <button
                    onClick={() => downloadFile(file)}
                    disabled={downloadingId === file.id}
                    title="Baixar arquivo"
                    className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0 disabled:opacity-40"
                  >
                    {downloadingId === file.id ? (
                      <span className="inline-block w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                    ) : (
                      <DownloadIcon />
                    )}
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={() => setFileToDelete(file)}
                    title="Apagar arquivo"
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Load more */}
        {hasMore && !loading && (
          <button
            onClick={() => fetchFiles(query, files.length, true)}
            disabled={loadingMore}
            className="w-full py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loadingMore ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                Carregando...
              </>
            ) : (
              `Mostrar mais (${total - files.length} restante${total - files.length !== 1 ? 's' : ''})`
            )}
          </button>
        )}
      </div>

      {/* Modal de confirmação de exclusão */}
      {fileToDelete && (
        <ConfirmDeleteModal
          name={fileToDelete.name}
          subtitle={`${formatBytes(fileToDelete.size)} · ${fileToDelete.folder_name}`}
          type="file"
          delayEnabled={settings.deleteDelay}
          onConfirm={confirmDeleteFile}
          onCancel={() => setFileToDelete(null)}
        />
      )}
    </>
  )
}

function DownloadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}
