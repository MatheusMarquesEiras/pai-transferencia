import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { Settings } from '../hooks/useSettings'
import ConfirmDeleteModal from './ConfirmDeleteModal'

interface FolderInfo {
  id: string
  original_name: string
  created_at: string
  total_files: number
  total_size: number
}

interface TreeNode {
  name: string
  type: 'file' | 'directory'
  path?: string
  size?: number
  children?: TreeNode[]
}

interface Props {
  settings: Settings
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function getNodeAtPath(tree: TreeNode, path: string[]): TreeNode | null {
  let node = tree
  for (const part of path) {
    if (node.type !== 'directory' || !node.children) return null
    const child = node.children.find((c) => c.name === part)
    if (!child) return null
    node = child
  }
  return node
}

function countFiles(node: TreeNode): number {
  if (node.type === 'file') return 1
  return (node.children || []).reduce((s, c) => s + countFiles(c), 0)
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

export default function DownloadTab({ settings }: Props) {
  const [folders, setFolders] = useState<FolderInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'browse'>('list')
  const [selectedFolder, setSelectedFolder] = useState<FolderInfo | null>(null)
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [currentPath, setCurrentPath] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadingTree, setLoadingTree] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [folderToDelete, setFolderToDelete] = useState<FolderInfo | null>(null)

  const loadFolders = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await axios.get<FolderInfo[]>('/api/folders')
      setFolders(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadFolders() }, [loadFolders])

  const openBrowser = async (folder: FolderInfo) => {
    setSelectedFolder(folder)
    setLoadingTree(true)
    setCurrentPath([])
    setSelected(new Set())
    setView('browse')
    try {
      const { data } = await axios.get<{ tree: TreeNode }>(`/api/folders/${folder.id}/files`)
      setTree(data.tree)
    } finally {
      setLoadingTree(false)
    }
  }

  const downloadFolderZip = async (folder: FolderInfo) => {
    setDownloadingId(folder.id)
    try {
      const { data } = await axios.get(`/api/folders/${folder.id}/download`, { responseType: 'blob' })
      triggerDownload(data, `${folder.original_name}.zip`)
    } finally {
      setDownloadingId(null)
    }
  }

  const downloadSingleFile = async (path: string, filename: string) => {
    const { data } = await axios.get(`/api/folders/${selectedFolder!.id}/file`, {
      params: { path }, responseType: 'blob',
    })
    triggerDownload(data, filename)
  }

  const downloadBatch = async () => {
    if (selected.size === 0 || !selectedFolder) return
    const { data } = await axios.post(
      `/api/folders/${selectedFolder.id}/download-batch`,
      { paths: Array.from(selected) },
      { responseType: 'blob' }
    )
    triggerDownload(data, 'arquivos_selecionados.zip')
  }

  const confirmDelete = async () => {
    if (!folderToDelete) return
    await axios.delete(`/api/folders/${folderToDelete.id}`)
    // Se estava navegando dentro da pasta deletada, volta para a lista
    if (selectedFolder?.id === folderToDelete.id) {
      setView('list')
      setTree(null)
      setSelectedFolder(null)
    }
    setFolders((prev) => prev.filter((f) => f.id !== folderToDelete.id))
    setFolderToDelete(null)
  }

  const toggleFile = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const currentNode = tree ? getNodeAtPath(tree, currentPath) : null
  const currentChildren = currentNode?.children || []
  const filesInView = currentChildren.filter((c) => c.type === 'file' && c.path)
  const allViewSelected = filesInView.length > 0 && filesInView.every((f) => selected.has(f.path!))

  const toggleAllInView = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allViewSelected) filesInView.forEach((f) => next.delete(f.path!))
      else filesInView.forEach((f) => next.add(f.path!))
      return next
    })
  }

  const goBack = () => {
    setView('list')
    setTree(null)
    setCurrentPath([])
    setSelected(new Set())
    loadFolders()
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">Pastas disponíveis</h2>
            <button
              onClick={loadFolders}
              disabled={loading}
              className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 font-medium"
            >
              {loading ? 'Carregando...' : '↺ Atualizar'}
            </button>
          </div>

          {loading && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3 animate-pulse">📂</div>
              <p className="text-sm">Carregando pastas...</p>
            </div>
          )}

          {!loading && folders.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-3">📭</div>
              <p className="font-medium">Nenhuma pasta disponível</p>
              <p className="text-sm mt-1">Envie uma pasta na aba Enviar primeiro</p>
            </div>
          )}

          <div className="space-y-3">
            {folders.map((folder) => (
              <div
                key={folder.id}
                className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <span className="text-3xl flex-shrink-0 mt-0.5">📁</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate text-sm sm:text-base">
                      {folder.original_name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {folder.total_files} arquivo{folder.total_files !== 1 ? 's' : ''} &middot; {formatBytes(folder.total_size)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(folder.created_at)}</p>
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => downloadFolderZip(folder)}
                    disabled={downloadingId === folder.id}
                    className="flex-1 text-sm bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 font-medium"
                  >
                    {downloadingId === folder.id ? 'Preparando...' : '⬇ Baixar ZIP'}
                  </button>
                  <button
                    onClick={() => openBrowser(folder)}
                    className="flex-1 text-sm border border-gray-300 bg-white text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    🔍 Navegar
                  </button>
                  <button
                    onClick={() => setFolderToDelete(folder)}
                    className="text-sm border border-red-200 bg-white text-red-500 px-3 py-2 rounded-lg hover:bg-red-50 hover:border-red-400 transition-colors font-medium"
                    title="Apagar pasta"
                  >
                    🗑️
                  </button>
                </div>

              </div>
            ))}
          </div>
        </div>

        {/* Modal de confirmação */}
        {folderToDelete && (
          <ConfirmDeleteModal
            name={folderToDelete.original_name}
            subtitle={`${folderToDelete.total_files} arquivo${folderToDelete.total_files !== 1 ? 's' : ''} · ${formatBytes(folderToDelete.total_size)}`}
            type="folder"
            delayEnabled={settings.deleteDelay}
            onConfirm={confirmDelete}
            onCancel={() => setFolderToDelete(null)}
          />
        )}
      </>
    )
  }

  // ── BROWSE VIEW ────────────────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={goBack}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Voltar
          </button>
          <span className="text-gray-300">|</span>
          <span className="font-semibold text-gray-800 text-sm truncate max-w-xs">
            {selectedFolder?.original_name}
          </span>
          <button
            onClick={() => selectedFolder && setFolderToDelete(selectedFolder)}
            className="ml-auto text-xs border border-red-200 text-red-500 px-2.5 py-1 rounded-lg hover:bg-red-50 hover:border-red-400 transition-colors font-medium flex-shrink-0"
          >
            🗑️ Apagar pasta
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm flex-wrap bg-gray-100 rounded-lg px-3 py-2">
          <button onClick={() => setCurrentPath([])} className="text-blue-600 hover:text-blue-800 font-medium">
            📁 Raiz
          </button>
          {currentPath.map((part, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-gray-400">/</span>
              <button
                onClick={() => setCurrentPath(currentPath.slice(0, i + 1))}
                className={i === currentPath.length - 1
                  ? 'text-gray-700 font-medium cursor-default'
                  : 'text-blue-600 hover:text-blue-800'}
              >
                {part}
              </button>
            </span>
          ))}
        </div>

        {/* Batch action bar */}
        {selected.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm text-blue-700 font-medium">
              {selected.size} arquivo{selected.size !== 1 ? 's' : ''} selecionado{selected.size !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setSelected(new Set())} className="text-sm text-gray-600 hover:text-gray-800 font-medium">
                Limpar
              </button>
              <button
                onClick={downloadBatch}
                className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 font-medium"
              >
                ⬇ Baixar Selecionados
              </button>
            </div>
          </div>
        )}

        {loadingTree && (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-3 animate-pulse">📂</div>
            <p className="text-sm">Carregando arquivos...</p>
          </div>
        )}

        {!loadingTree && currentNode && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            {filesInView.length > 0 && (
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="select-all"
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                  checked={allViewSelected}
                  onChange={toggleAllInView}
                />
                <label htmlFor="select-all" className="text-xs text-gray-500 cursor-pointer select-none">
                  Selecionar todos os arquivos desta pasta
                </label>
              </div>
            )}

            {currentChildren.length === 0 && (
              <div className="py-10 text-center text-gray-400 text-sm">Pasta vazia</div>
            )}

            <div className="divide-y divide-gray-100">
              {currentChildren.map((node) => {
                const fileCount = node.type === 'directory' ? countFiles(node) : 0
                return (
                  <div key={node.name} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                    {node.type === 'file' ? (
                      <>
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-blue-600 flex-shrink-0 cursor-pointer"
                          checked={selected.has(node.path!)}
                          onChange={() => toggleFile(node.path!)}
                        />
                        <span className="text-xl flex-shrink-0 select-none">📄</span>
                        <span className="flex-1 text-sm text-gray-800 truncate" title={node.name}>{node.name}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">{formatBytes(node.size || 0)}</span>
                        <button
                          onClick={() => downloadSingleFile(node.path!, node.name)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium flex-shrink-0 ml-1 px-2 py-1 rounded hover:bg-blue-50"
                        >
                          Baixar
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="w-4 flex-shrink-0" />
                        <span className="text-xl flex-shrink-0 select-none">📁</span>
                        <button
                          onClick={() => setCurrentPath([...currentPath, node.name])}
                          className="flex-1 text-sm text-blue-700 hover:text-blue-900 text-left font-medium truncate"
                          title={node.name}
                        >
                          {node.name}
                        </button>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {fileCount} arq.
                        </span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal de confirmação */}
      {folderToDelete && (
        <ConfirmDeleteModal
          name={folderToDelete.original_name}
          subtitle={`${folderToDelete.total_files} arquivo${folderToDelete.total_files !== 1 ? 's' : ''} · ${formatBytes(folderToDelete.total_size)}`}
          type="folder"
          delayEnabled={settings.deleteDelay}
          onConfirm={confirmDelete}
          onCancel={() => setFolderToDelete(null)}
        />
      )}
    </>
  )
}
