import os
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")


def get_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "campusfind"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
    )


def run_migration():
    migration_file = PROJECT_ROOT / "database" / "migrations" / "002_final_repair.sql"
    print(f"Reading migration from {migration_file}...")
    with open(migration_file, "r", encoding="utf-8") as f:
        sql = f.read()

    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(sql)
        conn.commit()
        print("Migration 002 applied successfully!")
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    run_migration()
