"""Exporta a base do aplicativo desktop para CSVs aceitos pelo Table Editor do Supabase.

Uso, a partir da pasta estoque-web:
  python supabase/export_sqlite.py --db ../estoque.db --output supabase/export
"""
import argparse
import csv
import sqlite3
from datetime import datetime
from pathlib import Path


TABLES = {
    "produtos": ("products.csv", ["codigo", "nome", "almox_inicial", "estoque_minimo"], ["code", "name", "initial_stock", "minimum_stock"]),
    "movimentacoes": ("movements.csv", ["produto_codigo", "tipo", "quantidade", "data"], ["product_code", "type", "quantity", "created_at"]),
    "condimentos": ("condiments.csv", ["codigo", "nome", "peso_unitario"], ["code", "name", "unit_weight"]),
    "movimentacoes_condimentos": ("condiment_counts.csv", ["condimento_codigo", "contagem", "peso_total", "data"], ["condiment_code", "count", "total_weight", "created_at"]),
    "relatorios": ("monthly_reports.csv", ["produto_codigo", "mes", "ano", "contagem", "consumo", "fechado"], ["product_code", "month", "year", "count", "consumption", "closed"]),
}


def transform(source, row):
    """Converte valores legados do SQLite para os tipos esperados pelo Postgres."""
    values = list(row)
    if source == "movimentacoes":
        values[1] = {"entrada": "entry", "saida": "exit"}.get(values[1], values[1])
    if source == "relatorios":
        values[5] = "true" if values[5] else "false"
    if source in {"movimentacoes", "movimentacoes_condimentos"} and values[-1]:
        # SQLite gravava "YYYY-MM-DD HH:MM:SS"; o formato ISO evita ambiguidade na importacao.
        values[-1] = datetime.strptime(values[-1], "%Y-%m-%d %H:%M:%S").isoformat() + "+00:00"
    return values


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(args.db)
    connection.row_factory = sqlite3.Row
    try:
        for source, (filename, source_columns, destination_columns) in TABLES.items():
            rows = connection.execute(f"SELECT {', '.join(source_columns)} FROM {source}").fetchall()
            output = args.output / filename
            with output.open("w", newline="", encoding="utf-8-sig") as file:
                writer = csv.writer(file)
                writer.writerow(destination_columns)
                writer.writerows([transform(source, [row[column] for column in source_columns]) for row in rows])
            print(f"{output}: {len(rows)} linhas")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
