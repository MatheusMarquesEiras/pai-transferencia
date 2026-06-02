# 🗂️ Transferência de Arquivos

Aplicação web para transferir pastas inteiras entre computadores pela rede doméstica, sem precisar de pen drive, cabo ou conta em nuvem.

Desenvolvida para uso familiar: interface simples em português, sem login, sem configuração manual.

---

## ✨ Funcionalidades

| | |
|---|---|
| 📤 **Enviar pasta** | Arraste uma pasta ou clique para selecionar — a estrutura interna é preservada |
| 📊 **Progresso em tempo real** | Barra de progresso arquivo a arquivo durante o envio |
| 📥 **Baixar ZIP** | Compacta e baixa uma pasta inteira com um clique |
| 🔍 **Navegar arquivos** | Explorador com navegação por subpastas e breadcrumb |
| ☑️ **Download em lote** | Selecione vários arquivos e baixe tudo de uma vez |
| 📱 **Responsivo** | Funciona em desktop, notebook e celular |

---

## 🛠️ Tecnologias

**Backend** — Python · [FastAPI](https://fastapi.tiangolo.com/) · [SQLAlchemy](https://www.sqlalchemy.org/) · SQLite · [uv](https://docs.astral.sh/uv/)

**Frontend** — [React](https://react.dev/) · [Vite](https://vitejs.dev/) · TypeScript · [Tailwind CSS](https://tailwindcss.com/)

---

## 📋 Pré-requisitos

| Ferramenta | Versão mínima | Download |
|---|---|---|
| **Python** | 3.11+ | https://www.python.org/downloads/ |
| **uv** | qualquer | https://docs.astral.sh/uv/getting-started/installation/ |
| **Node.js + npm** | 18+ | https://nodejs.org/ |

> **Windows:** durante a instalação do Python, marque a opção *"Add Python to PATH"*.

---

## 🚀 Como rodar

Clone o repositório e execute um único comando:

```bash
git clone https://github.com/seu-usuario/pai-transferencia.git
cd pai-transferencia
python start.py
```

Na primeira execução as dependências do frontend são instaladas automaticamente.

O script detecta uma porta livre para o backend e exibe os endereços de acesso:

```
────────────────────────────────────────────────────────
  Aplicação iniciada!
  Neste computador :  http://localhost:5173
  Na rede local    :  http://192.168.1.x:5173
  (passe esse endereço para o seu pai)
────────────────────────────────────────────────────────
  Pressione Ctrl+C para encerrar.
```

Para parar: **Ctrl+C** no terminal.

> **Nota:** se a porta 8000 estiver bloqueada pelo Windows o script avisa e usa a próxima disponível automaticamente — nenhuma configuração manual necessária.

---

## 📖 Como usar

### Aba Enviar

1. Arraste uma pasta para a área indicada **ou** clique para abrir o explorador
2. Verifique o nome e a quantidade de arquivos exibida
3. Clique em **Enviar Pasta** e aguarde a barra chegar a 100%

### Aba Receber

- **Baixar ZIP** — compacta e baixa a pasta inteira
- **Navegar** — abre um explorador de arquivos:
  - Clique em uma subpasta para entrar; use o caminho no topo para voltar
  - Marque os checkboxes e clique em **Baixar Selecionados** para um lote
  - Clique em **Baixar** ao lado de qualquer arquivo para baixá-lo individualmente

---

## 🗄️ Onde os arquivos ficam

Cada envio cria uma pasta com ID único dentro de `backend/all_files/`:

```
backend/
├── all_files/
│   └── a3f2c1d0-.../          ← ID único por envio (UUID)
│       └── nome-da-pasta/
│           ├── arquivo.txt
│           └── subpasta/
│               └── outro.pdf
└── transferencia.db            ← índice SQLite (mapeamento de pastas e arquivos)
```

---

## 🗂️ Estrutura do projeto

```
pai-transferencia/
├── start.py                ← inicia backend + frontend com um só comando
├── .gitignore
├── README.md
│
├── backend/
│   ├── pyproject.toml      ← dependências Python (gerenciado pelo uv)
│   ├── main.py             ← servidor FastAPI + CORS + criação das tabelas
│   ├── database.py         ← engine SQLAlchemy + sessão
│   ├── models.py           ← tabelas: Folder e File
│   └── routers/
│       ├── upload.py       ← POST /api/upload/*
│       └── download.py     ← GET/POST /api/folders/*
│
└── frontend/
    ├── package.json
    ├── vite.config.ts      ← proxy /api → backend (porta dinâmica)
    ├── tailwind.config.js
    └── src/
        ├── App.tsx          ← abas Enviar / Receber
        └── components/
            ├── UploadTab.tsx
            └── DownloadTab.tsx
```

---

## ⚙️ Execução manual (alternativa ao start.py)

Abra dois terminais na raiz do projeto:

**Terminal 1 — Backend:**
```bash
cd backend
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm install        # apenas na primeira vez
npm run dev
```

---

## 📦 Modo produção (porta única)

Para servir tudo pelo backend sem precisar do Vite rodando:

```bash
cd frontend && npm run build
cd ../backend && uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

Acesse em `http://IP_DO_SERVIDOR:8000`.
