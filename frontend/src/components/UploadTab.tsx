import { useState, useRef, useEffect } from 'react'
import axios from 'axios'

type FileEntry = { file: File; relativePath: string }
type FolderUpload = { name: string; files: FileEntry[]; totalSize: number }
type UploadStatus = 'idle' | 'ready' | 'uploading' | 'done' | 'error'

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = []
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((res) => reader.readEntries(res))
    if (batch.length === 0) break
    all.push(...batch)
  }
  return all
}

async function traverseEntry(entry: FileSystemEntry, path = ''): Promise<FileEntry[]> {
  if (entry.isFile) {
    const fe = entry as FileSystemFileEntry
    const file = await new Promise<File>((res) => fe.file(res))
    return [{ file, relativePath: path + entry.name }]
  }
  const de = entry as FileSystemDirectoryEntry
  const entries = await readAllEntries(de.createReader())
  const results: FileEntry[] = []
  for (const e of entries) {
    results.push(...(await traverseEntry(e, path + entry.name + '/')))
  }
  return results
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export default function UploadTab() {
  const [folders, setFolders] = useState<FolderUpload[]>([])
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [currentFolderIndex, setCurrentFolderIndex] = useState(0)
  const [currentProgress, setCurrentProgress] = useState(0)
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const totalFiles = folders.reduce((s, f) => s + f.files.length, 0)
  const totalSize = folders.reduce((s, f) => s + f.totalSize, 0)
  const overallProgress =
    folders.length === 0
      ? 0
      : Math.round(((currentFolderIndex + currentProgress / 100) / folders.length) * 100)

  // Volta para idle se todas as pastas forem removidas
  useEffect(() => {
    if (folders.length === 0 && status === 'ready') setStatus('idle')
  }, [folders, status])

  const addFolders = (incoming: FolderUpload[]) => {
    if (incoming.length === 0) return
    setFolders((prev) => [...prev, ...incoming])
    setStatus('ready')
    setError('')
  }

  const removeFolder = (index: number) => {
    setFolders((prev) => prev.filter((_, i) => i !== index))
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (status === 'uploading') return

    const incoming: FolderUpload[] = []
    for (const item of Array.from(e.dataTransfer.items)) {
      const entry = item.webkitGetAsEntry()
      if (!entry) continue
      const files = await traverseEntry(entry)
      if (files.length > 0) {
        incoming.push({ name: entry.name, files, totalSize: files.reduce((s, f) => s + f.file.size, 0) })
      }
    }
    addFolders(incoming)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || [])
    if (fileList.length === 0) return
    const files: FileEntry[] = fileList.map((f) => ({
      file: f,
      relativePath: f.webkitRelativePath || f.name,
    }))
    const name = files[0].relativePath.split('/')[0]
    addFolders([{ name, files, totalSize: files.reduce((s, f) => s + f.file.size, 0) }])
    // Limpa o input para permitir selecionar a mesma pasta novamente
    e.target.value = ''
  }

  const handleUpload = async () => {
    setStatus('uploading')
    setCurrentFolderIndex(0)
    setCurrentProgress(0)
    setError('')

    const CHUNK_SIZE = 64 * 1024 * 1024 // 64 MB

    try {
      for (let fi = 0; fi < folders.length; fi++) {
        setCurrentFolderIndex(fi)
        setCurrentProgress(0)

        const { name, files } = folders[fi]
        const startForm = new FormData()
        startForm.append('folder_name', name)
        startForm.append('total_files', String(files.length))

        const { data } = await axios.post<{ session_id: string }>('/api/upload/start', startForm)
        const sessionId = data.session_id

        for (let i = 0; i < files.length; i++) {
          const { file, relativePath } = files[i]

          if (file.size <= CHUNK_SIZE) {
            const fd = new FormData()
            fd.append('file', file, file.name)
            fd.append('relative_path', relativePath)
            await axios.post(`/api/upload/${sessionId}/file`, fd, {
              onUploadProgress: (ev) => {
                const pct = ev.total ? ev.loaded / ev.total : 1
                setCurrentProgress(Math.round(((i + pct) / files.length) * 100))
              },
            })
          } else {
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
            for (let ci = 0; ci < totalChunks; ci++) {
              const start = ci * CHUNK_SIZE
              const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size))
              const fd = new FormData()
              fd.append('file', chunk, file.name)
              fd.append('relative_path', relativePath)
              fd.append('chunk_index', String(ci))
              fd.append('total_chunks', String(totalChunks))
              fd.append('total_size', String(file.size))
              await axios.post(`/api/upload/${sessionId}/file-chunk`, fd, {
                onUploadProgress: (ev) => {
                  const chunkPct = ev.total ? ev.loaded / ev.total : 1
                  const filePct = (ci + chunkPct) / totalChunks
                  setCurrentProgress(Math.round(((i + filePct) / files.length) * 100))
                },
              })
            }
          }

          setCurrentProgress(Math.round(((i + 1) / files.length) * 100))
        }

        await axios.post(`/api/upload/${sessionId}/complete`)
      }

      setStatus('done')
      setCurrentProgress(100)
    } catch {
      setStatus('error')
      setError('Erro ao enviar. Verifique a conexão e tente novamente.')
    }
  }

  const reset = () => {
    setFolders([])
    setStatus('idle')
    setCurrentFolderIndex(0)
    setCurrentProgress(0)
    setError('')
  }

  const isUploading = status === 'uploading'
  const currentFolderName = folders[currentFolderIndex]?.name ?? ''

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); if (!isUploading) setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => !isUploading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl text-center transition-all select-none
          ${isUploading ? 'cursor-not-allowed opacity-50 p-6' : 'cursor-pointer'}
          ${status === 'ready' ? 'p-5' : 'p-10'}
          ${
            isDragging
              ? 'border-blue-500 bg-blue-50 scale-[1.01]'
              : status === 'error'
              ? 'border-red-400 bg-red-50'
              : status === 'done'
              ? 'border-green-400 bg-green-50'
              : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          // @ts-ignore — webkitdirectory é não-padrão mas amplamente suportado
          webkitdirectory=""
          multiple
          className="hidden"
          onChange={handleInputChange}
        />

        {status === 'idle' && (
          <>
            <div className="text-5xl mb-3">📁</div>
            <p className="text-lg font-semibold text-gray-700">Arraste pastas aqui</p>
            <p className="text-sm text-gray-400 mt-1">ou clique para abrir o explorador</p>
            <p className="text-xs text-gray-300 mt-1">Suporta múltiplas pastas de uma vez</p>
          </>
        )}

        {status === 'ready' && (
          <>
            <div className="text-2xl mb-1">➕</div>
            <p className="text-sm font-medium text-blue-600">Adicionar mais pastas</p>
            <p className="text-xs text-gray-400 mt-0.5">arraste ou clique aqui</p>
          </>
        )}

        {isUploading && (
          <>
            <div className="text-2xl mb-1">⏳</div>
            <p className="text-sm text-gray-500">Enviando... aguarde</p>
          </>
        )}

        {status === 'done' && (
          <>
            <div className="text-3xl mb-1">✅</div>
            <p className="text-sm font-semibold text-green-700">
              {folders.length} pasta{folders.length !== 1 ? 's' : ''} enviada{folders.length !== 1 ? 's' : ''}!
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Clique para enviar mais</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-3xl mb-1">❌</div>
            <p className="text-sm font-medium text-red-600">{error}</p>
            <p className="text-xs text-gray-400 mt-0.5">Clique para adicionar pastas novamente</p>
          </>
        )}
      </div>

      {/* Lista de pastas selecionadas */}
      {folders.length > 0 && !isUploading && status !== 'done' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {folders.length} pasta{folders.length !== 1 ? 's' : ''} &middot; {totalFiles} arquivo{totalFiles !== 1 ? 's' : ''} &middot; {formatBytes(totalSize)}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); reset() }}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Limpar tudo
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {folders.map((folder, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xl flex-shrink-0">📁</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{folder.name}</p>
                  <p className="text-xs text-gray-400">
                    {folder.files.length} arquivo{folder.files.length !== 1 ? 's' : ''} &middot; {formatBytes(folder.totalSize)}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFolder(i) }}
                  className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 text-lg leading-none"
                  title="Remover"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barra de progresso durante upload */}
      {isUploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium text-gray-700">
            <span>
              Pasta {currentFolderIndex + 1} de {folders.length}
              {currentFolderName && (
                <span className="font-normal text-gray-500"> — {currentFolderName}</span>
              )}
            </span>
            <span>{overallProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className="bg-blue-600 h-4 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 text-center">Não feche esta janela durante o envio</p>
        </div>
      )}

      {/* Banner de sucesso */}
      {status === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-green-700 font-semibold">
            ✓ {folders.length} pasta{folders.length !== 1 ? 's' : ''} enviada{folders.length !== 1 ? 's' : ''} com sucesso!
          </p>
          <p className="text-xs text-green-600 mt-1">
            {totalFiles} arquivos &middot; {formatBytes(totalSize)} &middot; acesse a aba <strong>Receber</strong> para baixar
          </p>
        </div>
      )}

      {/* Botões de ação */}
      {status === 'ready' && (
        <button
          onClick={handleUpload}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-xl font-semibold text-sm hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
        >
          Enviar {folders.length} pasta{folders.length !== 1 ? 's' : ''}
        </button>
      )}

      {status === 'done' && (
        <button
          onClick={reset}
          className="w-full border border-gray-300 bg-white text-gray-700 py-3 px-6 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
        >
          Enviar Mais Pastas
        </button>
      )}

      {status === 'error' && (
        <div className="flex gap-3">
          <button
            onClick={handleUpload}
            className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
          >
            Tentar Novamente
          </button>
          <button
            onClick={reset}
            className="flex-1 border border-gray-300 bg-white text-gray-700 py-3 px-6 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            Limpar
          </button>
        </div>
      )}
    </div>
  )
}
