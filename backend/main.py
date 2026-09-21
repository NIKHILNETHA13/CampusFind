import os
import sys
import uuid
from pathlib import Path
from typing import List, Optional

# Ensure backend directory is prioritized in sys.path over any external PYTHONPATH entries
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi import FastAPI, HTTPException, Query, Depends, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr

try:
    from backend.database import run_query, get_db_cursor
    from backend.auth import hash_password, verify_password
    from backend.tokens import create_access_token, get_current_user, require_admin
except ImportError:
    from database import run_query, get_db_cursor
    from auth import hash_password, verify_password
    from tokens import create_access_token, get_current_user, require_admin


app = FastAPI(title="CampusFind API", version="0.5.0")

# Allow frontend (file:// or localhost) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Upload configuration
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}

# Serve uploaded files statically
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# --- Models ---

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    invite_code: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    status: str
    created_at: str


class ItemCreate(BaseModel):
    title: str
    type: str
    category: str
    location: str
    date: str
    description: str
    emoji: str = "📦"
    image_url: Optional[str] = None
    handover_method: Optional[str] = None
    handover_note: Optional[str] = None


class ItemUpdate(BaseModel):
    title: str
    type: str
    category: str
    location: str
    date: str
    description: str


class ClaimCreate(BaseModel):
    message: Optional[str] = None
    additional_info: Optional[str] = None
    handover_note: Optional[str] = None


class RoleUpdate(BaseModel):
    role: str


class StatusUpdate(BaseModel):
    status: str


class GuidelineCreate(BaseModel):
    title: str
    content: str


class GuidelineUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


# --- Helpers ---

def item_sql(row: dict) -> dict:
    created_at = row.get("created_at")
    if hasattr(created_at, "isoformat"):
        created_at_str = created_at.isoformat()
    else:
        created_at_str = str(created_at) if created_at else ""

    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "title": row["title"],
        "type": row["type"],
        "category": row["category"],
        "location": row["location"],
        "date": str(row["date_occurred"]),
        "status": row["status"],
        "description": row["description"],
        "emoji": row.get("emoji", "📦"),
        "image_url": row.get("image_url"),
        "handover_method": row.get("handover_method"),
        "handover_note": row.get("handover_note"),
        "interest_count": int(row.get("interest_count") or 0),
        "created_at": created_at_str,
    }


def claim_json(row: dict) -> dict:
    created_at = row.get("created_at")
    if hasattr(created_at, "isoformat"):
        created_at_str = created_at.isoformat()
    else:
        created_at_str = str(created_at) if created_at else ""

    return {
        "id": row["id"],
        "item_id": row["item_id"],
        "item_title": row.get("item_title"),
        "item_type": row.get("item_type"),
        "item_status": row.get("item_status"),
        "category": row.get("category"),
        "location": row.get("location"),
        "claimant_id": row["claimant_id"],
        "claimant_name": row.get("claimant_name") or f"User #{row['claimant_id']}",
        "claimant_email": row.get("claimant_email"),
        "message": row.get("message"),
        "additional_info": row.get("additional_info"),
        "handover_note": row.get("handover_note"),
        "created_at": created_at_str,
        "reporter_name": row.get("reporter_name"),
        "reporter_email": row.get("reporter_email"),
    }


def notification_json(row: dict) -> dict:
    created_at = row.get("created_at")
    if hasattr(created_at, "isoformat"):
        created_at_str = created_at.isoformat()
    else:
        created_at_str = str(created_at) if created_at else ""

    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "type": row["type"],
        "title": row["title"],
        "message": row["message"],
        "item_id": row.get("item_id"),
        "claim_id": row.get("claim_id"),
        "is_read": bool(row.get("is_read", False)),
        "created_at": created_at_str,
    }


CLAIM_SELECT = """
    SELECT c.id, c.item_id, c.claimant_id, c.message, c.additional_info, c.handover_note, c.created_at,
           u.name AS claimant_name, u.email AS claimant_email
    FROM claims c
    JOIN users u ON c.claimant_id = u.id
"""


# --- Auth Routes ---

@app.post("/auth/register", status_code=201)
def register(data: UserRegister):
    # Check if email exists
    existing = run_query("SELECT id FROM users WHERE email = %s", (data.email,), fetch="one")
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Determine role: only valid invite code grants admin
    invite_code = os.getenv("ADMIN_INVITE_CODE", "")
    if data.invite_code and data.invite_code == invite_code:
        role = "ADMIN"
    else:
        role = "STUDENT"

    sql = "INSERT INTO users (name, email, password_hash, role) VALUES (%s, %s, %s, %s) RETURNING id, name, email, role, status, created_at"
    row = run_query(sql, (data.name, data.email, hash_password(data.password), role), fetch="one")
    return row


@app.post("/auth/login", response_model=TokenResponse)
def login(data: UserLogin):
    user = run_query("SELECT * FROM users WHERE email = %s", (data.email,), fetch="one")
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.get("status") == "BLOCKED":
        raise HTTPException(status_code=403, detail="Your account has been blocked")

    token = create_access_token(user)
    return {"access_token": token, "token_type": "bearer"}


@app.get("/users/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


# --- Upload Routes ---

@app.post("/upload")
async def upload_image(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="File type not allowed. Use JPEG, PNG, GIF, or WebP.")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)} MB.")

    ext = Path(file.filename).suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        ext = ".jpg"
    safe_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / safe_name

    with open(file_path, "wb") as f:
        f.write(content)

    return {"url": f"/uploads/{safe_name}", "filename": safe_name}


# --- Health & Status Routes ---

@app.get("/health")
def health():
    return {"status": "ok"}


# --- Item Routes ---

@app.get("/")
def home():
    return {
        "project": "CampusFind",
        "phase": "Final Repair",
        "docs": "/docs",
        "message": "CampusFind API with reliable dashboard synchronization and notifications.",
    }


@app.get("/items")
def list_items(
    search: str = Query(default=""),
    type: str = Query(default=""),
    category: str = Query(default=""),
    location: str = Query(default=""),
):
    sql = """
        SELECT i.*, 
               COALESCE(claim_counts.cnt, 0) AS interest_count
        FROM items i
        LEFT JOIN (
            SELECT item_id, COUNT(*) AS cnt
            FROM claims
            GROUP BY item_id
        ) claim_counts ON i.id = claim_counts.item_id
        WHERE 1=1
    """
    params = []

    if search:
        sql += " AND (i.title ILIKE %s OR i.location ILIKE %s OR i.description ILIKE %s)"
        like = f"%{search}%"
        params.extend([like, like, like])

    if type:
        sql += " AND i.type = %s"
        params.append(type.upper())

    if category:
        sql += " AND i.category ILIKE %s"
        params.append(category)

    if location:
        sql += " AND i.location ILIKE %s"
        params.append(location)

    sql += " ORDER BY i.created_at DESC"
    rows = run_query(sql, params)
    return [item_sql(row) for row in rows]


@app.post("/items", status_code=201)
def create_item(data: ItemCreate, current_user: dict = Depends(get_current_user)):
    item_type = data.type.upper()
    if item_type not in ("LOST", "FOUND"):
        raise HTTPException(status_code=400, detail="type must be LOST or FOUND")

    sql = """
        INSERT INTO items (user_id, type, title, description, category, location, date_occurred, status, image_url, handover_method, handover_note)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'ACTIVE', %s, %s, %s)
        RETURNING *
    """
    params = (
        current_user["id"],
        item_type,
        data.title,
        data.description,
        data.category,
        data.location,
        data.date,
        data.image_url,
        data.handover_method,
        data.handover_note,
    )
    row = run_query(sql, params, fetch="one")
    row["interest_count"] = 0
    return item_sql(row)


@app.get("/items/{item_id}")
def get_item(item_id: int):
    row = run_query("""
        SELECT i.*, COALESCE(claim_counts.cnt, 0) AS interest_count
        FROM items i
        LEFT JOIN (
            SELECT item_id, COUNT(*) AS cnt
            FROM claims
            GROUP BY item_id
        ) claim_counts ON i.id = claim_counts.item_id
        WHERE i.id = %s
    """, (item_id,), fetch="one")
    if row is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return item_sql(row)


@app.put("/items/{item_id}")
def update_item(item_id: int, data: ItemUpdate, current_user: dict = Depends(get_current_user)):
    row = run_query("SELECT * FROM items WHERE id = %s", (item_id,), fetch="one")
    if row is None:
        raise HTTPException(status_code=404, detail="Item not found")

    if row["user_id"] != current_user["id"] and current_user["role"] != "ADMIN":
        raise HTTPException(status_code=403, detail="Not authorized to update this item")

    item_type = data.type.upper()
    if item_type not in ("LOST", "FOUND"):
        raise HTTPException(status_code=400, detail="type must be LOST or FOUND")

    sql = """
        UPDATE items
        SET title = %s, type = %s, category = %s, location = %s,
            date_occurred = %s, description = %s, updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        RETURNING *
    """
    params = (data.title, item_type, data.category, data.location, data.date, data.description, item_id)
    updated_row = run_query(sql, params, fetch="one")
    return item_sql(updated_row)


@app.delete("/items/{item_id}")
def delete_item(item_id: int, current_user: dict = Depends(get_current_user)):
    row = run_query("SELECT * FROM items WHERE id = %s", (item_id,), fetch="one")
    if row is None:
        raise HTTPException(status_code=404, detail="Item not found")

    if row["user_id"] != current_user["id"] and current_user["role"] != "ADMIN":
        raise HTTPException(status_code=403, detail="Not authorized to delete this item")

    run_query("DELETE FROM items WHERE id = %s", (item_id,), fetch="none")
    return {"message": "Item deleted", "id": item_id}


# --- Claim / Interest Routes ---

@app.post("/items/{item_id}/claims", status_code=201)
def create_claim(item_id: int, data: ClaimCreate, current_user: dict = Depends(get_current_user)):
    item = run_query("SELECT * FROM items WHERE id = %s", (item_id,), fetch="one")
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")

    if item["status"] != "ACTIVE":
        raise HTTPException(status_code=400, detail="Can only express interest in active items")

    if item["user_id"] == current_user["id"]:
        raise HTTPException(status_code=400, detail="You cannot express interest in your own item")

    # Check for duplicate interest
    existing = run_query(
        "SELECT id FROM claims WHERE item_id = %s AND claimant_id = %s",
        (item_id, current_user["id"]),
        fetch="one",
    )
    if existing:
        raise HTTPException(status_code=400, detail="You have already expressed interest in this item.")

    # Atomic insert of claim and notifications
    with get_db_cursor() as cur:
        insert_claim_sql = """
            INSERT INTO claims (item_id, claimant_id, message, additional_info, handover_note)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
        """
        cur.execute(
            insert_claim_sql,
            (item_id, current_user["id"], data.message, data.additional_info, data.handover_note),
        )
        claim_row = dict(cur.fetchone())
        claim_id = claim_row["id"]

        # Notification for Reporter (Student A)
        reporter_notif_sql = """
            INSERT INTO notifications (user_id, type, title, message, item_id, claim_id)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        reporter_msg = f"{current_user['name']} has indicated that the {item['title']} may be theirs."
        cur.execute(
            reporter_notif_sql,
            (item["user_id"], "INTEREST_RECEIVED", "Someone is interested in your item", reporter_msg, item_id, claim_id),
        )

        # Notification for Claimant (Student B)
        claimant_notif_sql = """
            INSERT INTO notifications (user_id, type, title, message, item_id, claim_id)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        claimant_msg = f"Your interest in the {item['title']} has been submitted to the reporter."
        cur.execute(
            claimant_notif_sql,
            (current_user["id"], "INTEREST_SUBMITTED", "Interest submitted", claimant_msg, item_id, claim_id),
        )

    # Attach item details for response
    claim_row["item_title"] = item["title"]
    claim_row["item_type"] = item["type"]
    claim_row["claimant_name"] = current_user["name"]
    claim_row["claimant_email"] = current_user["email"]

    return claim_json(claim_row)


@app.get("/items/{item_id}/my-claim")
def get_my_claim_for_item(item_id: int, current_user: dict = Depends(get_current_user)):
    """Returns the authenticated student's own interest for an item, preserving claimant privacy."""
    sql = """
        SELECT c.id, c.item_id, c.claimant_id, c.message, c.additional_info, c.handover_note, c.created_at,
               u.name AS claimant_name, u.email AS claimant_email,
               i.title AS item_title, i.type AS item_type, i.status AS item_status,
               rep.name AS reporter_name, rep.email AS reporter_email
        FROM claims c
        JOIN users u ON c.claimant_id = u.id
        JOIN items i ON c.item_id = i.id
        JOIN users rep ON i.user_id = rep.id
        WHERE c.item_id = %s AND c.claimant_id = %s
    """
    row = run_query(sql, (item_id, current_user["id"]), fetch="one")
    if not row:
        return {"claim": None}
    return {"claim": claim_json(row)}


@app.get("/items/{item_id}/claims")
def get_item_claims(item_id: int, current_user: dict = Depends(get_current_user)):
    """Only the item reporter or admin can see all claims on an item."""
    item = run_query("SELECT * FROM items WHERE id = %s", (item_id,), fetch="one")
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")

    if item["user_id"] != current_user["id"] and current_user["role"] != "ADMIN":
        raise HTTPException(status_code=403, detail="Not authorized to view claims on this item")

    sql = """
        SELECT c.id, c.item_id, c.claimant_id, c.message, c.additional_info, c.handover_note, c.created_at,
               u.name AS claimant_name, u.email AS claimant_email,
               i.title AS item_title, i.type AS item_type
        FROM claims c
        JOIN users u ON c.claimant_id = u.id
        JOIN items i ON c.item_id = i.id
        WHERE c.item_id = %s
        ORDER BY c.created_at DESC
    """
    rows = run_query(sql, (item_id,))
    return {"claims": [claim_json(r) for r in rows]}


@app.get("/claims/my")
def my_claims(current_user: dict = Depends(get_current_user)):
    sql = """
        SELECT c.id, c.item_id, c.claimant_id, c.message, c.additional_info, c.handover_note, c.created_at,
               u.name AS claimant_name, u.email AS claimant_email,
               i.title AS item_title, i.type AS item_type, i.status AS item_status,
               i.category, i.location, i.image_url AS item_image,
               reporter.name AS reporter_name, reporter.email AS reporter_email
        FROM claims c
        JOIN users u ON c.claimant_id = u.id
        JOIN items i ON c.item_id = i.id
        JOIN users reporter ON i.user_id = reporter.id
        WHERE c.claimant_id = %s
        ORDER BY c.created_at DESC
    """
    rows = run_query(sql, (current_user["id"],))
    return {"claims": [claim_json(r) for r in rows]}


@app.get("/claims/{claim_id}")
def get_claim(claim_id: int, current_user: dict = Depends(get_current_user)):
    row = run_query(CLAIM_SELECT + " WHERE c.id = %s", (claim_id,), fetch="one")
    if row is None:
        raise HTTPException(status_code=404, detail="Claim not found")

    item = run_query("SELECT user_id FROM items WHERE id = %s", (row["item_id"],), fetch="one")
    if (
        row["claimant_id"] != current_user["id"]
        and current_user["role"] != "ADMIN"
        and item["user_id"] != current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Not authorized to view this claim")

    return claim_json(row)


# --- Mark as Returned ---

@app.put("/items/{item_id}/returned")
def mark_returned(item_id: int, current_user: dict = Depends(get_current_user)):
    item = run_query("SELECT * FROM items WHERE id = %s", (item_id,), fetch="one")
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")

    if item["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the reporter can mark this item as returned")

    if item["status"] == "RETURNED":
        raise HTTPException(status_code=400, detail="Item is already marked as returned")

    # In atomic transaction: update item status and notify all claimants
    with get_db_cursor() as cur:
        cur.execute(
            "UPDATE items SET status = 'RETURNED', updated_at = CURRENT_TIMESTAMP WHERE id = %s",
            (item_id,),
        )

        # Find all interested claimants
        cur.execute("SELECT DISTINCT claimant_id FROM claims WHERE item_id = %s", (item_id,))
        claimant_rows = cur.fetchall()

        # Insert notification for each claimant
        notif_sql = """
            INSERT INTO notifications (user_id, type, title, message, item_id)
            VALUES (%s, %s, %s, %s, %s)
        """
        for c in claimant_rows:
            msg = f"The {item['title']} has been marked as returned by the reporter."
            cur.execute(notif_sql, (c["claimant_id"], "ITEM_RETURNED", "Item marked as returned", msg, item_id))

    return {"message": "Item marked as returned", "id": item_id, "status": "RETURNED"}


# --- Dashboard API ---

@app.get("/dashboard")
def get_dashboard(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]

    # 1. User reports
    reports_sql = """
        SELECT i.*, COALESCE(claim_counts.cnt, 0) AS interest_count
        FROM items i
        LEFT JOIN (
            SELECT item_id, COUNT(*) AS cnt
            FROM claims
            GROUP BY item_id
        ) claim_counts ON i.id = claim_counts.item_id
        WHERE i.user_id = %s
        ORDER BY i.created_at DESC
    """
    reports = run_query(reports_sql, (user_id,))

    # 2. User interests
    interests_sql = """
        SELECT c.id, c.item_id, c.claimant_id, c.message, c.additional_info, c.handover_note, c.created_at,
               i.title AS item_title, i.type AS item_type, i.status AS item_status,
               i.category, i.location,
               u.name AS reporter_name, u.email AS reporter_email
        FROM claims c
        JOIN items i ON c.item_id = i.id
        JOIN users u ON i.user_id = u.id
        WHERE c.claimant_id = %s
        ORDER BY c.created_at DESC
    """
    interests = run_query(interests_sql, (user_id,))

    # 3. Notifications count & recent notifications
    unread_row = run_query(
        "SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = %s AND is_read = false",
        (user_id,),
        fetch="one",
    )
    unread_count = int(unread_row["cnt"]) if unread_row else 0

    recent_notifs = run_query(
        "SELECT * FROM notifications WHERE user_id = %s ORDER BY created_at DESC LIMIT 10",
        (user_id,),
    )

    my_reports = len(reports)
    active_reports = sum(1 for r in reports if r["status"] == "ACTIVE")
    returned_reports = sum(1 for r in reports if r["status"] == "RETURNED")
    my_interests = len(interests)

    return {
        "stats": {
            "my_reports": my_reports,
            "active_reports": active_reports,
            "returned_reports": returned_reports,
            "my_interests": my_interests,
            "unread_notifications": unread_count,
        },
        "reports": [item_sql(r) for r in reports],
        "interests": [claim_json(c) for c in interests],
        "recent_notifications": [notification_json(n) for n in recent_notifs],
    }


# --- Notification Routes ---

@app.get("/notifications")
def list_notifications(current_user: dict = Depends(get_current_user)):
    rows = run_query(
        "SELECT * FROM notifications WHERE user_id = %s ORDER BY created_at DESC",
        (current_user["id"],),
    )
    return [notification_json(r) for r in rows]


@app.get("/notifications/unread-count")
def get_unread_notification_count(current_user: dict = Depends(get_current_user)):
    row = run_query(
        "SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = %s AND is_read = false",
        (current_user["id"],),
        fetch="one",
    )
    count = int(row["cnt"]) if row else 0
    return {"count": count}


@app.put("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, current_user: dict = Depends(get_current_user)):
    notif = run_query(
        "SELECT * FROM notifications WHERE id = %s AND user_id = %s",
        (notification_id, current_user["id"]),
        fetch="one",
    )
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    updated = run_query(
        "UPDATE notifications SET is_read = true WHERE id = %s RETURNING *",
        (notification_id,),
        fetch="one",
    )
    return notification_json(updated)


@app.put("/notifications/read-all")
def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    run_query(
        "UPDATE notifications SET is_read = true WHERE user_id = %s",
        (current_user["id"],),
        fetch="none",
    )
    return {"message": "All notifications marked as read"}


# --- Admin Routes ---

@app.get("/admin/claims")
def admin_claims(admin_user: dict = Depends(require_admin)):
    sql = """
        SELECT c.id, c.item_id, c.claimant_id, c.message, c.additional_info, c.handover_note, c.created_at,
               u.name AS claimant_name, u.email AS claimant_email,
               i.title AS item_title, i.type AS item_type, i.status AS item_status
        FROM claims c
        JOIN users u ON c.claimant_id = u.id
        JOIN items i ON c.item_id = i.id
        ORDER BY c.created_at DESC
    """
    rows = run_query(sql)
    return [claim_json(r) for r in rows]


@app.delete("/admin/items/{item_id}")
def admin_delete_item(item_id: int, admin_user: dict = Depends(require_admin)):
    row = run_query("SELECT * FROM items WHERE id = %s", (item_id,), fetch="one")
    if row is None:
        raise HTTPException(status_code=404, detail="Item not found")

    run_query("DELETE FROM items WHERE id = %s", (item_id,), fetch="none")
    return {"message": "Item deleted", "id": item_id}


@app.get("/admin/users", response_model=list[UserResponse])
def admin_users(admin_user: dict = Depends(require_admin)):
    rows = run_query("SELECT id, name, email, role, status, created_at FROM users ORDER BY id")
    for row in rows:
        if row.get("created_at"):
            row["created_at"] = row["created_at"].isoformat()
    return rows


@app.put("/admin/users/{user_id}/role")
def update_user_role(user_id: int, data: RoleUpdate, admin_user: dict = Depends(require_admin)):
    if data.role not in ("STUDENT", "ADMIN"):
        raise HTTPException(status_code=400, detail="role must be STUDENT or ADMIN")
    if user_id == admin_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    row = run_query("SELECT * FROM users WHERE id = %s", (user_id,), fetch="one")
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    run_query("UPDATE users SET role = %s WHERE id = %s", (data.role, user_id), fetch="none")
    return {"id": user_id, "role": data.role}


@app.put("/admin/users/{user_id}/status")
def update_user_status(user_id: int, data: StatusUpdate, admin_user: dict = Depends(require_admin)):
    if data.status not in ("ACTIVE", "BLOCKED"):
        raise HTTPException(status_code=400, detail="status must be ACTIVE or BLOCKED")
    if user_id == admin_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot change your own status")
    row = run_query("SELECT * FROM users WHERE id = %s", (user_id,), fetch="one")
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    run_query("UPDATE users SET status = %s WHERE id = %s", (data.status, user_id), fetch="none")
    return {"id": user_id, "status": data.status}


@app.delete("/admin/users/{user_id}")
def delete_user(user_id: int, admin_user: dict = Depends(require_admin)):
    if user_id == admin_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    row = run_query("SELECT * FROM users WHERE id = %s", (user_id,), fetch="one")
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    run_query("DELETE FROM users WHERE id = %s", (user_id,), fetch="none")
    return {"message": "User deleted", "id": user_id}


# --- Guidelines Routes ---

@app.get("/guidelines")
def list_guidelines():
    rows = run_query("SELECT * FROM guidelines ORDER BY id")
    for row in rows:
        if row.get("updated_at"):
            row["updated_at"] = row["updated_at"].isoformat()
    return rows


@app.post("/guidelines", status_code=201)
def create_guideline(data: GuidelineCreate, admin_user: dict = Depends(require_admin)):
    sql = "INSERT INTO guidelines (title, content) VALUES (%s, %s) RETURNING *"
    row = run_query(sql, (data.title, data.content), fetch="one")
    if row.get("updated_at"):
        row["updated_at"] = row["updated_at"].isoformat()
    return row


@app.put("/guidelines/{guideline_id}")
def update_guideline(guideline_id: int, data: GuidelineUpdate, admin_user: dict = Depends(require_admin)):
    row = run_query("SELECT * FROM guidelines WHERE id = %s", (guideline_id,), fetch="one")
    if row is None:
        raise HTTPException(status_code=404, detail="Guideline not found")

    updates = []
    params = []
    if data.title is not None:
        updates.append("title = %s")
        params.append(data.title)
    if data.content is not None:
        updates.append("content = %s")
        params.append(data.content)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    params.append(guideline_id)
    sql = f"UPDATE guidelines SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = %s RETURNING *"
    row = run_query(sql, params, fetch="one")
    if row.get("updated_at"):
        row["updated_at"] = row["updated_at"].isoformat()
    return row


@app.delete("/guidelines/{guideline_id}")
def delete_guideline(guideline_id: int, admin_user: dict = Depends(require_admin)):
    row = run_query("SELECT * FROM guidelines WHERE id = %s", (guideline_id,), fetch="one")
    if row is None:
        raise HTTPException(status_code=404, detail="Guideline not found")
    run_query("DELETE FROM guidelines WHERE id = %s", (guideline_id,), fetch="none")
    return {"message": "Guideline deleted", "id": guideline_id}
