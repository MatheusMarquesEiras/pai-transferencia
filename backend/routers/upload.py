import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from models import File, Folder

router = APIRouter()
UPLOAD_DIR = Path("all_files")


def validate_path(relative_path: str) -> Path:
    safe = Path(relative_path.replace("\\", "/").lstrip("/"))
    for part in safe.parts:
        if part in ("..", "."):
            raise HTTPException(status_code=400, detail="Caminho inválido")
    return safe


@router.post("/start")
async def start_upload(
    folder_name: str = Form(...),
    total_files: int = Form(...),
    db: Session = Depends(get_db),
):
    session_id = str(uuid.uuid4())
    (UPLOAD_DIR / session_id).mkdir(parents=True, exist_ok=True)

    folder = Folder(
        id=session_id,
        original_name=folder_name,
        total_files=total_files,
        total_size=0,
    )
    db.add(folder)
    db.commit()
    return {"session_id": session_id}


@router.post("/{session_id}/file")
async def upload_file(
    session_id: str,
    file: UploadFile,
    relative_path: str = Form(...),
    db: Session = Depends(get_db),
):
    folder = db.get(Folder, session_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")

    safe_path = validate_path(relative_path)
    dest = UPLOAD_DIR / session_id / safe_path
    dest.parent.mkdir(parents=True, exist_ok=True)

    size = 0
    async with aiofiles.open(dest, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            await f.write(chunk)
            size += len(chunk)

    db.add(
        File(
            folder_id=session_id,
            relative_path=str(safe_path).replace("\\", "/"),
            filename=safe_path.name,
            size=size,
        )
    )
    folder.total_size = (folder.total_size or 0) + size
    db.commit()

    uploaded = db.query(File).filter(File.folder_id == session_id).count()
    return {"uploaded": uploaded, "total": folder.total_files}


@router.post("/{session_id}/complete")
async def complete_upload(
    session_id: str,
    db: Session = Depends(get_db),
):
    folder = db.get(Folder, session_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")

    folder.total_files = db.query(File).filter(File.folder_id == session_id).count()
    db.commit()
    db.refresh(folder)

    return {
        "folder_id": folder.id,
        "original_name": folder.original_name,
        "total_files": folder.total_files,
        "total_size": folder.total_size,
    }
