import io
import shutil
import zipfile
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import File, Folder

router = APIRouter()
UPLOAD_DIR = Path("all_files")


def build_tree(files: list) -> dict:
    root: dict = {"name": "", "type": "directory", "children": {}}

    for f in files:
        parts = Path(f.relative_path.replace("\\", "/")).parts
        node = root
        for part in parts[:-1]:
            if part not in node["children"]:
                node["children"][part] = {
                    "name": part,
                    "type": "directory",
                    "children": {},
                }
            node = node["children"][part]
        node["children"][parts[-1]] = {
            "name": parts[-1],
            "type": "file",
            "path": f.relative_path.replace("\\", "/"),
            "size": f.size,
        }

    def to_list(node: dict) -> dict:
        if node["type"] == "file":
            return node
        children = sorted(
            node["children"].values(),
            key=lambda x: (0 if x["type"] == "directory" else 1, x["name"].lower()),
        )
        return {**node, "children": [to_list(c) for c in children]}

    top = sorted(root["children"].values(), key=lambda x: x["name"].lower())
    if len(top) == 1:
        return to_list(top[0])
    return {"name": "", "type": "directory", "children": [to_list(c) for c in top]}


@router.get("/folders")
async def list_folders(db: Session = Depends(get_db)):
    folders = db.query(Folder).order_by(Folder.created_at.desc()).all()
    return [
        {
            "id": f.id,
            "original_name": f.original_name,
            "created_at": f.created_at.isoformat(),
            "total_files": f.total_files,
            "total_size": f.total_size,
        }
        for f in folders
    ]


@router.get("/folders/{folder_id}/files")
async def list_files(folder_id: str, db: Session = Depends(get_db)):
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Pasta não encontrada")

    files = db.query(File).filter(File.folder_id == folder_id).all()
    return {
        "folder": {"id": folder.id, "name": folder.original_name},
        "tree": build_tree(files),
    }


@router.get("/folders/{folder_id}/download")
async def download_folder(folder_id: str, db: Session = Depends(get_db)):
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Pasta não encontrada")

    folder_path = UPLOAD_DIR / folder_id
    if not folder_path.exists():
        raise HTTPException(status_code=404, detail="Arquivos não encontrados no disco")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
        for fp in folder_path.rglob("*"):
            if fp.is_file():
                zf.write(fp, fp.relative_to(folder_path))
    buf.seek(0)

    safe_name = folder.original_name.replace('"', "").replace("/", "_")
    return StreamingResponse(
        iter([buf.read()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.zip"'},
    )


@router.get("/folders/{folder_id}/file")
async def download_file(
    folder_id: str,
    path: str = Query(...),
    db: Session = Depends(get_db),
):
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Pasta não encontrada")

    safe = Path(path.replace("\\", "/").lstrip("/"))
    if any(p == ".." for p in safe.parts):
        raise HTTPException(status_code=400, detail="Caminho inválido")

    fp = UPLOAD_DIR / folder_id / safe
    if not fp.exists() or not fp.is_file():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    return FileResponse(fp, filename=safe.name)


@router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str, db: Session = Depends(get_db)):
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Pasta não encontrada")

    folder_path = UPLOAD_DIR / folder_id
    if folder_path.exists():
        shutil.rmtree(folder_path)

    db.delete(folder)
    db.commit()
    return {"ok": True}


@router.get("/files")
async def list_all_files(
    q: str = Query(""),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(File).join(Folder)
    if q:
        query = query.filter(File.relative_path.ilike(f"%{q}%"))

    total = query.count()
    files = (
        query.order_by(func.lower(File.filename), func.lower(File.relative_path))
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "files": [
            {
                "id": f.id,
                "folder_id": f.folder_id,
                "folder_name": f.folder.original_name,
                "path": f.relative_path,
                "name": f.filename,
                "size": f.size,
            }
            for f in files
        ],
    }


@router.delete("/files/{file_id}")
async def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
):
    file_record = db.get(File, file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    folder = file_record.folder
    safe = Path(file_record.relative_path.replace("\\", "/").lstrip("/"))
    fp = UPLOAD_DIR / file_record.folder_id / safe

    if fp.exists():
        fp.unlink()

    folder.total_files = max(0, folder.total_files - 1)
    folder.total_size = max(0, folder.total_size - file_record.size)

    db.delete(file_record)
    db.commit()

    return {"ok": True}


class BatchRequest(BaseModel):
    paths: List[str]


@router.post("/folders/{folder_id}/download-batch")
async def download_batch(
    folder_id: str,
    body: BatchRequest,
    db: Session = Depends(get_db),
):
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Pasta não encontrada")

    base = UPLOAD_DIR / folder_id
    buf = io.BytesIO()

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
        for path_str in body.paths:
            safe = Path(path_str.replace("\\", "/").lstrip("/"))
            if any(p == ".." for p in safe.parts):
                continue
            fp = base / safe
            if fp.exists() and fp.is_file():
                zf.write(fp, safe)

    buf.seek(0)
    return StreamingResponse(
        iter([buf.read()]),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="arquivos_selecionados.zip"'
        },
    )
