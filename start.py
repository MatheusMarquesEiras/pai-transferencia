#!/usr/bin/env python3
"""Inicia o backend e o frontend com um único comando.

Uso:
    python start.py
"""

import os
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

# UTF-8 no Windows para evitar erros com caracteres especiais
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore

ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
IS_WIN = sys.platform == "win32"

# Cores ANSI
BLUE  = "\033[94m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED   = "\033[91m"
BOLD  = "\033[1m"
RESET = "\033[0m"


def npm_cmd() -> str:
    return "npm.cmd" if IS_WIN else "npm"


def find_free_port(start: int = 8000) -> int:
    """Tenta portas a partir de `start` até encontrar uma disponível."""
    for port in range(start, start + 50):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    raise RuntimeError(f"Nenhuma porta livre encontrada entre {start} e {start + 50}")


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"


def check_tool(name: str) -> bool:
    cmd = [name, "--version"]
    if IS_WIN and name == "npm":
        cmd = ["npm.cmd", "--version"]
    try:
        subprocess.run(cmd, capture_output=True, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


def stream(proc: subprocess.Popen, prefix: str, color: str) -> None:
    """Lê stdout do processo e imprime com prefixo colorido."""
    assert proc.stdout is not None
    for raw in iter(proc.stdout.readline, b""):
        line = raw.decode("utf-8", errors="replace").rstrip()
        if line:
            print(f"{color}{BOLD}[{prefix}]{RESET} {line}", flush=True)


def install_frontend_deps() -> None:
    if (FRONTEND_DIR / "node_modules").exists():
        return
    print(f"{YELLOW}{BOLD}[SETUP]{RESET} Instalando dependencias do frontend (primeira vez)...")
    subprocess.run([npm_cmd(), "install"], cwd=FRONTEND_DIR, check=True)
    print(f"{GREEN}{BOLD}[SETUP]{RESET} Dependencias do frontend instaladas.")


def main() -> None:
    # Verificar ferramentas necessarias
    missing = []
    if not check_tool("uv"):
        missing.append("uv  →  https://docs.astral.sh/uv/getting-started/installation/")
    if not check_tool("npm"):
        missing.append("node/npm  →  https://nodejs.org/")
    if missing:
        print(f"{RED}{BOLD}Ferramentas nao encontradas:{RESET}")
        for m in missing:
            print(f"  • {m}")
        sys.exit(1)

    install_frontend_deps()

    # Encontrar porta livre para o backend
    backend_port = find_free_port(8000)
    if backend_port != 8000:
        print(f"{YELLOW}{BOLD}[SETUP]{RESET} Porta 8000 ocupada/bloqueada, usando {backend_port}.")

    # Iniciar backend
    backend = subprocess.Popen(
        [
            "uv", "run", "uvicorn", "main:app",
            "--host", "0.0.0.0",
            "--port", str(backend_port),
            "--reload",
        ],
        cwd=BACKEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    # Passar a porta escolhida para o Vite configurar o proxy corretamente
    frontend_env = {**os.environ, "BACKEND_PORT": str(backend_port)}

    # Iniciar frontend
    frontend = subprocess.Popen(
        [npm_cmd(), "run", "dev"],
        cwd=FRONTEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=frontend_env,
    )

    # Threads para imprimir saida dos dois processos em paralelo
    t_back  = threading.Thread(target=stream, args=(backend,  "BACKEND ", BLUE),  daemon=True)
    t_front = threading.Thread(target=stream, args=(frontend, "FRONTEND", GREEN), daemon=True)
    t_back.start()
    t_front.start()

    # Aguardar um instante para os processos subirem antes de mostrar a mensagem
    time.sleep(2)

    ip = get_local_ip()
    print(f"\n{BOLD}{'─' * 52}{RESET}")
    print(f"{BOLD}  Aplicacao iniciada!{RESET}")
    print(f"  Neste computador :  http://localhost:5173")
    print(f"  Na rede local    :  {GREEN}{BOLD}http://{ip}:5173{RESET}")
    print(f"  (passe esse endereco para o seu pai)")
    print(f"{BOLD}{'─' * 52}{RESET}")
    print(f"  Pressione {BOLD}Ctrl+C{RESET} para encerrar.\n")

    try:
        # Loop principal: encerra se qualquer processo sair sozinho
        while backend.poll() is None and frontend.poll() is None:
            time.sleep(0.5)
        exited = "BACKEND" if backend.poll() is not None else "FRONTEND"
        print(f"\n{YELLOW}{BOLD}[{exited}]{RESET} processo encerrou inesperadamente.")
    except KeyboardInterrupt:
        print(f"\n{BOLD}Encerrando...{RESET}")
    finally:
        if backend.poll() is None:
            backend.terminate()
        if frontend.poll() is None:
            frontend.terminate()
        backend.wait()
        frontend.wait()
        print("Ate logo!")


if __name__ == "__main__":
    main()
