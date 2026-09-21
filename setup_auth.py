import os
from pathlib import Path
import sys

import psycopg2
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent

sys.path.insert(0, str(PROJECT_ROOT / "backend"))

load_dotenv(PROJECT_ROOT / ".env", override=True)

from backend.auth import hash_password


def main():
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )

    cur = conn.cursor()

    try:
        cur.execute(
            "UPDATE users SET password_hash = %s WHERE email = %s",
            (hash_password("student123"), "student@campus.edu"),
        )

        cur.execute(
            "UPDATE users SET password_hash = %s WHERE email = %s",
            (hash_password("student123"), "sam@campus.edu"),
        )

        cur.execute(
            "UPDATE users SET password_hash = %s WHERE email = %s",
            (hash_password("admin123"), "admin@campus.edu"),
        )

        conn.commit()

        print("Sample passwords updated")

    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()