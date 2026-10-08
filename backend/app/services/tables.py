"""
Listes de l'administration web (0.4 a 0.6, exigence Q3).

Chaque liste admin passe par `TableParams` : pagination cote serveur, tri
par colonne, et le meme jeu de filtres sert l'affichage et l'export
(`format=csv`). L'export reprend donc exactement ce que l'administrateur
voit, filtres compris, sur toutes les pages.

CSV : separateur point-virgule et BOM UTF-8, ce qu'Excel attend en
configuration francaise pour ouvrir le fichier sans assistant d'import et
avec les accents corrects.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Callable, Iterable

from fastapi import HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Query as SAQuery

MAX_PAGE_SIZE = 200
MAX_EXPORT_ROWS = 50_000


@dataclass
class TableParams:
    page: int
    page_size: int
    sort: str | None
    dir: str
    format: str

    @property
    def is_csv(self) -> bool:
        return self.format == "csv"


def table_params(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=MAX_PAGE_SIZE),
    sort: str | None = None,
    dir: str = Query("desc", pattern="^(asc|desc)$"),
    format: str = Query("json", pattern="^(json|csv)$"),
) -> TableParams:
    return TableParams(page=page, page_size=page_size, sort=sort, dir=dir, format=format)


def apply_sort(query: SAQuery, params: TableParams, sort_map: dict[str, Any], default: str) -> SAQuery:
    key = params.sort if params.sort in sort_map else default
    column = sort_map[key]
    ordered = column.asc() if params.dir == "asc" else column.desc()
    # `nulls_last` n'existe pas en SQLite avant 3.30 : on trie d'abord sur
    # « est vide » pour garder les valeurs manquantes en fin de liste.
    return query.order_by(column.is_(None), ordered)


def page_of(query: SAQuery, params: TableParams) -> tuple[list[Any], int]:
    total = query.order_by(None).count()
    if params.is_csv:
        if total > MAX_EXPORT_ROWS:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Export limité à {MAX_EXPORT_ROWS} lignes : affinez les filtres",
            )
        return query.all(), total
    rows = query.offset((params.page - 1) * params.page_size).limit(params.page_size).all()
    return rows, total


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "oui" if value else "non"
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, (float, Decimal)):
        # Virgule decimale : format attendu par Excel en francais.
        return f"{float(value):.2f}".replace(".", ",").replace(",00", "")
    if hasattr(value, "value"):
        return str(value.value)
    if isinstance(value, (list, dict)):
        return str(value)
    return str(value)


def csv_response(filename: str, columns: list[tuple[str, str]], rows: Iterable[dict[str, Any]]) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", quoting=csv.QUOTE_MINIMAL)
    writer.writerow([label for _key, label in columns])
    for row in rows:
        writer.writerow([_cell(row.get(key)) for key, _label in columns])
    content = "﻿" + buffer.getvalue()
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    return Response(
        content=content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}-{stamp}.csv"'},
    )


def table_response(
    params: TableParams,
    rows: list[Any],
    total: int,
    serialize: Callable[[Any], dict[str, Any]],
    filename: str,
    columns: list[tuple[str, str]],
    extra: dict[str, Any] | None = None,
):
    items = [serialize(r) for r in rows]
    if params.is_csv:
        return csv_response(filename, columns, items)
    out = {"items": items, "total": total, "page": params.page, "page_size": params.page_size}
    if extra:
        out.update(extra)
    return out


def parse_ids(values: list[str] | None) -> list[str]:
    return [v for v in (values or []) if v]
