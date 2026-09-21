import os
from contextlib import contextmanager
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from pathlib import Path
from urllib.parse import urlparse

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def get_connection():
    # Support DATABASE_URL (for Docker) or individual params
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        parsed = urlparse(database_url)
        return psycopg2.connect(
            host=parsed.hostname,
            port=parsed.port or 5432,
            dbname=parsed.path.lstrip("/"),
            user=parsed.username,
            password=parsed.password,
        )
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "campusfind"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
    )


def run_query(sql, params=None, fetch="all"):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(sql, params)
        if fetch == "none":
            result = None
        elif fetch == "one":
            row = cur.fetchone()
            result = dict(row) if row else None
        else:
            result = [dict(row) for row in cur.fetchall()]
        conn.commit()
        return result
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@contextmanager
def get_db_cursor():
    """Transaction context manager. Commits on successful exit, rolls back on exception."""
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
