const API_BASE = "/api";

// --- XSS-safe HTML escaping ---
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- Token & Auth Helpers ---

function getToken() {
  return localStorage.getItem("token");
}

function setToken(token) {
  localStorage.setItem("token", token);
}

function clearToken() {
  localStorage.removeItem("token");
}

function getUserRoleFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role;
  } catch (e) {
    return null;
  }
}

function getCurrentUserIdFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return Number(payload.sub);
  } catch (e) {
    return null;
  }
}

function logout() {
  clearToken();
  window.location.href = "index.html";
}

async function apiRequest(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(API_BASE + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearToken();
    const banner = document.getElementById("session-banner");
    if (banner) banner.style.display = "block";
    setTimeout(() => { window.location.href = "login.html"; }, 2000);
    throw new Error("Session expired. Please log in again.");
  }
  if (!res.ok) {
    throw new Error(data.detail || "Request failed");
  }
  return data;
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
    el.style.display = "block";
  }
}

function hideError(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = "";
    el.style.display = "none";
  }
}

function formatStatus(status) {
  if (!status) return "";
  return status.replace(/_/g, " ");
}

// --- Toast Notification System ---

function showToast(message, type) {
  type = type || "info";
  const container = document.getElementById("toast-container");
  if (!container) return;
  const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  const toast = document.createElement("div");
  toast.className = "toast toast-" + type;
  toast.innerHTML =
    '<span class="toast-icon">' + (icons[type] || "ℹ️") + "</span>" +
    '<span class="toast-body">' + escapeHtml(message) + "</span>";
  toast.onclick = function () { removeToast(toast); };
  container.appendChild(toast);
  setTimeout(function () { removeToast(toast); }, 4000);
}

function removeToast(toast) {
  if (toast.classList.contains("removing")) return;
  toast.classList.add("removing");
  setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 280);
}

// --- Confirmation Modal ---

function confirmAction(title, message, onConfirm) {
  const overlay = document.getElementById("confirm-modal-overlay");
  const titleEl = document.getElementById("confirm-modal-title");
  const msgEl   = document.getElementById("confirm-modal-msg");
  const okBtn   = document.getElementById("confirm-modal-ok");
  const cancelBtn = document.getElementById("confirm-modal-cancel");
  if (!overlay) { if (onConfirm) onConfirm(); return; }

  if (titleEl) titleEl.textContent = title || "Confirm";
  if (msgEl)   msgEl.textContent   = message || "Are you sure?";

  overlay.classList.add("open");

  function close() {
    overlay.classList.remove("open");
    okBtn.onclick = null;
    cancelBtn.onclick = null;
  }

  okBtn.onclick = function () { close(); if (onConfirm) onConfirm(); };
  cancelBtn.onclick = close;
}

// --- Navigation & Notification Badge ---

let _notifPollHandle = null;

async function updateNotificationBadge() {
  const token = getToken();
  if (!token) return;

  try {
    const data = await apiRequest("/notifications/unread-count");
    const count = data.count || 0;
    const badge = document.getElementById("nav-notif-count");
    if (badge) {
      if (count > 0) {
        badge.textContent = count > 99 ? "99+" : count;
        badge.style.display = "inline-block";
      } else {
        badge.textContent = "";
        badge.style.display = "none";
      }
    }
  } catch (err) {
    // silent – badge is best-effort
  }
}

function startNotifPolling(intervalMs) {
  stopNotifPolling();
  intervalMs = intervalMs || 30000;
  updateNotificationBadge();
  _notifPollHandle = setInterval(updateNotificationBadge, intervalMs);
}

function stopNotifPolling() {
  if (_notifPollHandle) { clearInterval(_notifPollHandle); _notifPollHandle = null; }
}

function buildNav() {
  const nav = document.querySelector(".nav");
  if (!nav) return;

  const token = getToken();
  const isLoggedIn = !!token;
  const isAdmin = token && getUserRoleFromToken(token) === "ADMIN";

  const path = window.location.pathname.split("/").pop() || "index.html";

  let links = [];

  if (!isLoggedIn) {
    // Public Navigation
    links = [
      { href: "index.html", label: "Home", show: true },
      { href: "items.html", label: "Browse Items", show: true },
      { href: "report.html", label: "Report Item", show: true },
      { href: "index.html#how-it-works", label: "How It Works", show: true },
      { href: "login.html", label: "Login", show: true },
      { href: "register.html", label: "Register", show: true },
    ];
  } else if (isAdmin) {
    // Admin Navigation
    links = [
      { href: "admin.html", label: "Dashboard", show: true },
      { href: "items.html", label: "Listings", show: true },
      { href: "admin_users.html", label: "Users", show: true },
      { href: "dashboard.html", label: "My Activity", show: true },
      { href: "notifications.html", label: 'Notifications <span id="nav-notif-count" class="nav-badge" style="display:none;"></span>', show: true, raw: true },
      { href: "#", label: "Logout", show: true, logout: true },
    ];
  } else {
    // Student Navigation
    links = [
      { href: "index.html", label: "Home", show: true },
      { href: "items.html", label: "Browse Items", show: true },
      { href: "report.html", label: "Report Item", show: true },
      { href: "dashboard.html", label: "My Activity", show: true },
      { href: "index.html#how-it-works", label: "How It Works", show: true },
      { href: "notifications.html", label: 'Notifications <span id="nav-notif-count" class="nav-badge" style="display:none;"></span>', show: true, raw: true },
      { href: "#", label: "Logout", show: true, logout: true },
    ];
  }

  nav.innerHTML = links.map(function (link) {
    if (!link.show) return "";
    const active = link.href === path ? " active" : "";
    const logoutAttr = link.logout ? 'id="logout-nav-btn" onclick="logout(); return false;"' : "";
    return '<a class="' + active + '" href="' + link.href + '" ' + logoutAttr + '>' + link.label + '</a>';
  }).join("");

  // Re-attach menu toggle
  setupMenu();

  // Load badge count if logged in
  if (isLoggedIn) {
    updateNotificationBadge();
  }
}

function setupMenu() {
  const button = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav");
  if (!button || !nav) return;
  button.onclick = function () {
    nav.classList.toggle("open");
  };
}

// --- Item Cards & Listing ---

function itemCard(item) {
  const interestCount = Number(item.interest_count || 0);
  const imageHtml = item.image_url
    ? `<img src="${API_BASE}${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" style="height: 150px; width: 100%; object-fit: cover;">`
    : `<div class="item-photo">${escapeHtml(item.emoji || "📦")}</div>`;

  return `
    <article class="item-card">
      ${imageHtml}
      <div class="item-body">
        <div>
          <span class="badge badge-${escapeHtml(item.type.toLowerCase())}">${escapeHtml(item.type)}</span>
          <span class="badge badge-${escapeHtml(item.status.toLowerCase())}">${escapeHtml(formatStatus(item.status))}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="meta">${escapeHtml(item.category)} · ${escapeHtml(item.location)}</p>
        <p class="meta">${escapeHtml(item.date)}</p>
        <p class="meta" style="color: var(--gold);">
          <strong>${interestCount}</strong> ${interestCount === 1 ? "student interested" : "students interested"}
        </p>
        <a class="btn btn-navy" href="item.html?id=${encodeURIComponent(item.id)}">View Details</a>
      </div>
    </article>
  `;
}


function filterItems(list, searchText, category, type) {
  const search = (searchText || "").toLowerCase();
  return list.filter(function (item) {
    const matchesSearch =
      item.title.toLowerCase().includes(search) ||
      item.location.toLowerCase().includes(search) ||
      item.description.toLowerCase().includes(search);
    const matchesCategory = !category || item.category === category;
    const matchesType = !type || item.type === type;
    return matchesSearch && matchesCategory && matchesType;
  });
}

function renderGrid(targetId, list) {
  const target = document.getElementById(targetId);
  if (!target) return;
  if (list.length === 0) {
    target.innerHTML = '<p class="empty">No items match your search.</p>';
    return;
  }
  target.innerHTML = list.map(itemCard).join("");
}

// --- Page: Home ---

async function setupHome() {
  if (!document.getElementById("stat-lost")) return;

  try {
    const items = await apiRequest("/items");
    const lostCount = items.filter(function (item) { return item.type === "LOST"; }).length;
    const foundCount = items.filter(function (item) { return item.type === "FOUND"; }).length;
    const returnedCount = items.filter(function (item) { return item.status === "RETURNED"; }).length;

    const lostEl = document.getElementById("stat-lost");
    const foundEl = document.getElementById("stat-found");
    const returnedEl = document.getElementById("stat-returned");
    if (lostEl) lostEl.textContent = lostCount;
    if (foundEl) foundEl.textContent = foundCount;
    if (returnedEl) returnedEl.textContent = returnedCount;

    renderGrid("recent-items", items.slice(0, 3));
  } catch (err) {
    console.error("Failed to load home items:", err);
    const target = document.getElementById("recent-items");
    if (target) target.innerHTML = '<p class="error">Failed to load items.</p>';
  }

  const homeForm = document.getElementById("home-search");
  if (homeForm) {
    homeForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const value = document.getElementById("home-search-input").value;
      window.location.href = "items.html?search=" + encodeURIComponent(value);
    });
  }
}

// --- Page: Browse Items ---

function setupBrowse() {
  const searchInput = document.getElementById("search-input");
  const categorySelect = document.getElementById("category-filter");
  const typeSelect = document.getElementById("type-filter");
  if (!searchInput) return;

  const params = new URLSearchParams(window.location.search);
  searchInput.value = params.get("search") || "";

  apiRequest("/items").then(allItems => {
    function updateList() {
      const filtered = filterItems(
        allItems,
        searchInput.value,
        categorySelect.value,
        typeSelect.value
      );
      renderGrid("items-grid", filtered);
    }

    searchInput.addEventListener("input", updateList);
    categorySelect.addEventListener("change", updateList);
    typeSelect.addEventListener("change", updateList);
    updateList();
  }).catch(err => {
    console.error("Failed to load items:", err);
    const target = document.getElementById("items-grid");
    if (target) target.innerHTML = '<p class="error">Failed to load items. Please try again.</p>';
  });
}

// --- Page: Item Details ---

async function setupDetails() {
  const root = document.getElementById("item-details");
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get("id"));
  if (!id) {
    root.innerHTML = '<p class="error">Item not specified.</p>';
    return;
  }

  const token = getToken();
  const currentUserId = token ? getCurrentUserIdFromToken(token) : null;
  const isAdmin = token && getUserRoleFromToken(token) === "ADMIN";

  try {
    const item = await apiRequest("/items/" + id);
    const isOwner = currentUserId && currentUserId === item.user_id;
    const isReturned = item.status === "RETURNED";
    const interestCount = Number(item.interest_count || 0);

    const imageHtml = item.image_url
      ? `<img src="${API_BASE}${item.image_url}" alt="${item.title}" style="width: 100%; height: 280px; object-fit: cover; border-radius: 10px;">`
      : `<div class="item-photo" style="height: 280px;">${item.emoji || "📦"}</div>`;

    const handoverHtml = (item.handover_method || item.handover_note) ? `
      <div class="handover-info" style="margin-top: 14px; padding: 12px; background: var(--bg); border-radius: 8px;">
        <h4 style="margin-top: 0; margin-bottom: 6px;">Handover Information</h4>
        ${item.handover_method ? `<p style="margin: 4px 0;"><strong>Method:</strong> ${item.handover_method.replace('_', ' ')}</p>` : ''}
        ${item.handover_note ? `<p style="margin: 4px 0;"><strong>Note:</strong> ${item.handover_note}</p>` : ''}
      </div>
    ` : '';

    let interestSectionHtml = "";
    let actionButtonsHtml = "";

    if (isOwner) {
      // Reporter view: Can see all interested claimants
      try {
        const claimsData = await apiRequest(`/items/${id}/claims`);
        const claims = claimsData.claims || [];
        
        let claimsListHtml = "";
        if (claims.length === 0) {
          claimsListHtml = "<p class='meta'>No students have expressed interest yet.</p>";
        } else {
          claimsListHtml = claims.map(claim => `
            <div class="claim-item" style="border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 12px; background: var(--surface, #fff);">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <strong>${claim.claimant_name}</strong>
                  <br><small style="color: var(--navy);">Email: <strong>${claim.claimant_email}</strong></small>
                </div>
                <span class="meta">${claim.created_at ? new Date(claim.created_at).toLocaleDateString() : ""}</span>
              </div>
              ${claim.message ? `<p style="margin-top: 8px;"><strong>Message:</strong> ${claim.message}</p>` : ''}
              ${claim.additional_info ? `<p class="meta" style="margin-top: 4px;"><strong>Additional Details:</strong> ${claim.additional_info}</p>` : ''}
              ${claim.handover_note ? `<p class="meta" style="margin-top: 4px;"><strong>Availability:</strong> ${claim.handover_note}</p>` : ''}
            </div>
          `).join("");
        }

        interestSectionHtml = `
          <div class="interested-section" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border);">
            <h3>Interested Students (${claims.length})</h3>
            ${claimsListHtml}
          </div>
        `;
      } catch (err) {
        console.error("Failed to load claims for owner:", err);
      }

      if (!isReturned) {
        actionButtonsHtml = `
          <div style="margin-top: 16px;">
            <button class="btn btn-gold" id="mark-returned-btn" type="button">Mark as Returned</button>
          </div>
        `;
      } else {
        actionButtonsHtml = `
          <div style="margin-top: 16px;">
            <p class="meta" style="font-weight: 600; color: var(--navy);">✓ This item has been marked as returned.</p>
          </div>
        `;
      }
    } else if (currentUserId) {
      // Logged-in non-owner: Can only see their OWN claim
      try {
        const myClaimData = await apiRequest(`/items/${id}/my-claim`);
        const myClaim = myClaimData.claim;

        if (myClaim) {
          // Already submitted interest
          interestSectionHtml = `
            <div class="interested-section" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border);">
              <h3 style="color: var(--found);">✓ You have expressed interest in this item</h3>
              <div class="claim-item" style="border: 1px solid var(--border); border-radius: 8px; padding: 14px; background: #fafbfc;">
                <p class="meta" style="margin-top: 0;"><strong>Reporter:</strong> ${myClaim.reporter_name} (${myClaim.reporter_email})</p>
                <p style="margin: 6px 0;"><strong>Your Message:</strong> ${myClaim.message || '<em>None</em>'}</p>
                ${myClaim.additional_info ? `<p class="meta" style="margin: 4px 0;"><strong>Additional Info:</strong> ${myClaim.additional_info}</p>` : ''}
                ${myClaim.handover_note ? `<p class="meta" style="margin: 4px 0;"><strong>Availability / Handover Note:</strong> ${myClaim.handover_note}</p>` : ''}
                <p class="meta" style="margin-bottom: 0;"><small>Submitted: ${myClaim.created_at ? new Date(myClaim.created_at).toLocaleDateString() : ""}</small></p>
              </div>
            </div>
          `;
          actionButtonsHtml = isReturned
            ? '<p class="meta" style="margin-top: 16px; font-weight: 600;">✓ This item has been returned.</p>'
            : '<p class="meta" style="margin-top: 16px;">The reporter has received your contact info. Please communicate via campus email to arrange handover.</p>';
        } else {
          // Has not submitted interest
          if (isReturned) {
            actionButtonsHtml = '<p class="meta" style="margin-top: 16px; font-weight: 600;">This item has been returned and cannot receive new interest.</p>';
          } else {
            actionButtonsHtml = `
              <div style="margin-top: 16px;">
                <button class="btn btn-gold" id="claim-btn" type="button">I Think This Is Mine</button>
              </div>
            `;
          }
        }
      } catch (err) {
        console.error("Failed to load claimant status:", err);
      }
    } else {
      // Not logged in
      if (isReturned) {
        actionButtonsHtml = '<p class="meta" style="margin-top: 16px; font-weight: 600;">This item has been returned.</p>';
      } else {
        actionButtonsHtml = `
          <div style="margin-top: 16px;">
            <button class="btn btn-gold" id="claim-btn" type="button">I Think This Is Mine</button>
          </div>
        `;
      }
    }

    root.innerHTML = `
      ${imageHtml}
      <div class="panel">
        <div>
          <span class="badge badge-${item.type.toLowerCase()}">${item.type}</span>
          <span class="badge badge-${item.status.toLowerCase()}">${formatStatus(item.status)}</span>
        </div>
        <h1 style="margin: 12px 0 6px;">${item.title}</h1>
        <p>${item.description}</p>
        <p class="meta"><strong>Category:</strong> ${item.category}</p>
        <p class="meta"><strong>Location:</strong> ${item.location}</p>
        <p class="meta"><strong>Date:</strong> ${item.date}</p>
        <p class="meta"><strong>Status:</strong> ${formatStatus(item.status)}</p>
        <p class="meta"><strong>Interested:</strong> ${interestCount} ${interestCount === 1 ? "student" : "students"}</p>
        ${handoverHtml}
        ${interestSectionHtml}
        ${actionButtonsHtml}
        <p class="error" id="details-error" style="display:none;"></p>
      </div>
    `;

    // Attach listeners
    const claimBtn = document.getElementById("claim-btn");
    if (claimBtn) {
      claimBtn.addEventListener("click", function () {
        if (!getToken()) {
          alert("Please log in to express interest in this item.");
          window.location.href = "login.html";
          return;
        }
        window.location.href = "claim.html?item=" + item.id;
      });
    }

    const markReturnedBtn = document.getElementById("mark-returned-btn");
    if (markReturnedBtn) {
      markReturnedBtn.addEventListener("click", async function () {
        if (!confirm("Has this item been returned? This action will mark it returned and notify interested students.")) return;
        try {
          await apiRequest(`/items/${id}/returned`, { method: "PUT" });
          alert("Item marked as returned!");
          setupDetails();
          updateNotificationBadge();
        } catch (err) {
          showError("details-error", err.message);
        }
      });
    }

  } catch (err) {
    root.innerHTML = `<p class="error">Failed to load item: ${err.message}</p>`;
  }
}

// --- Page: Claim / Interest Form ---

function setupClaim() {
  const form = document.getElementById("claim-form");
  const summaryDiv = document.getElementById("item-summary");
  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const itemId = Number(params.get("item"));
  if (!itemId) {
    if (summaryDiv) summaryDiv.innerHTML = '<p class="error">No item specified.</p>';
    return;
  }

  const token = getToken();
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  // Load item details
  apiRequest("/items/" + itemId).then(item => {
    if (summaryDiv) {
      summaryDiv.innerHTML = `
        <div class="panel" style="padding: 16px;">
          <h3 style="margin-top: 0; margin-bottom: 6px;">${item.title} (${item.type})</h3>
          <span class="meta">${item.category} · ${item.location} · ${item.date}</span>
          <br><span class="badge badge-${item.status.toLowerCase()}" style="margin-top: 6px;">${formatStatus(item.status)}</span>
        </div>
      `;
    }

    if (item.status !== "ACTIVE") {
      showError("claim-error", "This item is no longer active. You cannot submit an interest.");
      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.disabled = true;
    }
  }).catch(err => {
    if (summaryDiv) summaryDiv.innerHTML = '<p class="error">Failed to load item summary.</p>';
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    hideError("claim-error");

    const message = document.getElementById("message")?.value.trim() || null;
    const additional_info = document.getElementById("additional_info")?.value.trim() || null;
    const handover_note = document.getElementById("handover_note")?.value.trim() || null;

    const claimData = {
      message: message,
      additional_info: additional_info,
      handover_note: handover_note
    };

    try {
      await apiRequest(`/items/${itemId}/claims`, {
        method: "POST",
        body: JSON.stringify(claimData)
      });
      alert("Your interest has been submitted to the reporter!");
      window.location.href = "dashboard.html";
    } catch (err) {
      showError("claim-error", err.message);
    }
  });
}

// --- Page: Report Item ---

function setupReport() {
  const form = document.getElementById("report-form");
  if (!form) return;

  const token = getToken();
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const typeField = document.getElementById("type");
  if (params.get("type") === "FOUND" && typeField) typeField.value = "FOUND";
  if (params.get("type") === "LOST" && typeField) typeField.value = "LOST";

  const imageInput = document.getElementById("image");
  const previewDiv = document.getElementById("image-preview");
  const previewImg = document.getElementById("preview-img");
  const removeBtn = document.getElementById("remove-image");
  let uploadedImageUrl = "";

  if (imageInput) {
    imageInput.addEventListener("change", function () {
      const file = this.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
          if (previewImg) previewImg.src = e.target.result;
          if (previewDiv) previewDiv.style.display = "block";
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener("click", function () {
      if (imageInput) imageInput.value = "";
      if (previewDiv) previewDiv.style.display = "none";
      if (previewImg) previewImg.src = "";
      uploadedImageUrl = "";
      hideError("image-error");
    });
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    let valid = true;

    const fields = ["type", "title", "category", "description", "location", "date"];
    fields.forEach(function (name) {
      const input = document.getElementById(name);
      const error = document.getElementById(name + "-error");
      if (!input || !input.value.trim()) {
        if (error) error.textContent = "This field is required.";
        valid = false;
      } else {
        if (error) error.textContent = "";
      }
    });

    if (!valid) return;

    // Upload image if selected
    const imageFile = imageInput?.files[0];
    if (imageFile) {
      try {
        const formData = new FormData();
        formData.append("file", imageFile);
        const curToken = getToken();
        const res = await fetch(API_BASE + "/upload", {
          method: "POST",
          headers: { "Authorization": "Bearer " + curToken },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Upload failed");
        uploadedImageUrl = data.url;
      } catch (err) {
        showError("image-error", err.message);
        return;
      }
    }

    try {
      const itemData = {
        type: document.getElementById("type").value,
        title: document.getElementById("title").value.trim(),
        category: document.getElementById("category").value,
        description: document.getElementById("description").value.trim(),
        location: document.getElementById("location").value.trim(),
        date: document.getElementById("date").value,
        image_url: uploadedImageUrl || null,
        handover_method: document.getElementById("handover_method")?.value || null,
        handover_note: document.getElementById("handover_note")?.value.trim() || null
      };

      await apiRequest("/items", {
        method: "POST",
        body: JSON.stringify(itemData)
      });
      alert("Item reported successfully!");
      window.location.href = "dashboard.html";
    } catch (err) {
      showError("report-error", err.message);
    }
  });
}

// --- Page: Dashboard / My Activity ---

async function loadDashboard() {
  const token = getToken();
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  hideError("dashboard-error");

  try {
    // 1. Load user identity
    const user = await apiRequest("/users/me");
    const nameEl = document.getElementById("user-name");
    const emailEl = document.getElementById("user-email");
    const roleEl = document.getElementById("user-role");
    if (nameEl) nameEl.textContent = user.name;
    if (emailEl) emailEl.textContent = user.email;
    if (roleEl) roleEl.textContent = user.role;

    // 2. Fetch all dashboard data from single source of truth: GET /dashboard
    const dashboardData = await apiRequest("/dashboard");
    const stats = dashboardData.stats || {};
    const reports = dashboardData.reports || [];
    const interests = dashboardData.interests || [];

    // Render Stats
    const statMyReports = document.getElementById("stat-my-reports");
    const statActiveReports = document.getElementById("stat-active-reports");
    const statReturnedReports = document.getElementById("stat-returned-reports");
    const statMyInterests = document.getElementById("stat-my-interests");
    const statUnreadNotifs = document.getElementById("stat-unread-notifs");

    if (statMyReports) statMyReports.textContent = stats.my_reports ?? 0;
    if (statActiveReports) statActiveReports.textContent = stats.active_reports ?? 0;
    if (statReturnedReports) statReturnedReports.textContent = stats.returned_reports ?? 0;
    if (statMyInterests) statMyInterests.textContent = stats.my_interests ?? 0;
    if (statUnreadNotifs) statUnreadNotifs.textContent = stats.unread_notifications ?? 0;

    // Render My Reports Table
    const reportsTable = document.querySelector("#my-reports-table");
    if (reportsTable) {
      if (reports.length === 0) {
        reportsTable.innerHTML = "<tr><td colspan='6' class='meta'>You have not reported any items yet.</td></tr>";
      } else {
        reportsTable.innerHTML = reports.map(item => {
          const interestCount = Number(item.interest_count || 0);
          return `
            <tr>
              <td><strong><a href="item.html?id=${item.id}">${item.title}</a></strong></td>
              <td><span class="badge badge-${item.type.toLowerCase()}">${item.type}</span></td>
              <td>${item.category || "—"} · ${item.location || "—"}</td>
              <td><span class="badge badge-${item.status.toLowerCase()}">${formatStatus(item.status)}</span></td>
              <td><strong>${interestCount}</strong></td>
              <td>
                <a class="btn btn-light btn-sm" href="item.html?id=${item.id}">View</a>
                ${item.status === 'ACTIVE' ? `
                  <button class="btn btn-gold btn-sm btn-mark-returned" data-item-id="${item.id}" style="margin-left: 6px;">Mark Returned</button>
                ` : ''}
              </td>
            </tr>
          `;
        }).join("");

        // Attach Mark Returned handlers
        reportsTable.querySelectorAll(".btn-mark-returned").forEach(btn => {
          btn.addEventListener("click", async function () {
            const itemId = this.dataset.itemId;
            if (!confirm("Has this item been returned? This action will mark it returned and notify interested students.")) return;
            try {
              await apiRequest(`/items/${itemId}/returned`, { method: "PUT" });
              alert("Item marked as returned!");
              await loadDashboard();
              updateNotificationBadge();
            } catch (err) {
              alert("Failed: " + err.message);
            }
          });
        });
      }
    }

    // Render My Interests Table
    const interestsTable = document.querySelector("#my-interests-table");
    if (interestsTable) {
      if (interests.length === 0) {
        interestsTable.innerHTML = "<tr><td colspan='7' class='meta'>You have not expressed interest in any items yet.</td></tr>";
      } else {
        interestsTable.innerHTML = interests.map(interest => {
          const dateStr = interest.created_at ? new Date(interest.created_at).toLocaleDateString() : "—";
          const reporterContact = interest.reporter_name && interest.reporter_email
            ? `${interest.reporter_name} (<a href="mailto:${interest.reporter_email}">${interest.reporter_email}</a>)`
            : (interest.reporter_name || "—");

          return `
            <tr>
              <td><strong><a href="item.html?id=${interest.item_id}">${interest.item_title || "Item #" + interest.item_id}</a></strong></td>
              <td>${interest.item_type ? `<span class="badge badge-${interest.item_type.toLowerCase()}">${interest.item_type}</span>` : "—"}</td>
              <td>${interest.item_status ? `<span class="badge badge-${interest.item_status.toLowerCase()}">${formatStatus(interest.item_status)}</span>` : "—"}</td>
              <td>${reporterContact}</td>
              <td>${dateStr}</td>
              <td>${interest.handover_note || "<em>None</em>"}</td>
              <td><a class="btn btn-light btn-sm" href="item.html?id=${interest.item_id}">View</a></td>
            </tr>
          `;
        }).join("");
      }
    }

    // Update notification badge on navigation
    updateNotificationBadge();

  } catch (err) {
    console.error("Dashboard error:", err);
    showError("dashboard-error", "Unable to load dashboard data: " + err.message);
    const reportsTable = document.querySelector("#my-reports-table");
    if (reportsTable) reportsTable.innerHTML = "<tr><td colspan='6' class='error'>Failed to load reports.</td></tr>";
    const interestsTable = document.querySelector("#my-interests-table");
    if (interestsTable) interestsTable.innerHTML = "<tr><td colspan='7' class='error'>Failed to load interests.</td></tr>";
  }
}

function setupDashboard() {
  if (!window.location.pathname.endsWith("dashboard.html")) return;
  loadDashboard();
}

// --- Page: Notifications ---

async function loadNotifications() {
  const container = document.getElementById("notifications-list");
  if (!container) return;

  hideError("notifications-error");

  try {
    const notifs = await apiRequest("/notifications");
    if (notifs.length === 0) {
      container.innerHTML = '<p class="empty">No notifications yet.</p>';
      return;
    }

    container.innerHTML = notifs.map(n => {
      const isUnread = !n.is_read;
      const dateStr = n.created_at ? new Date(n.created_at).toLocaleString() : "";
      return `
        <div class="notif-card ${isUnread ? 'unread' : ''}" id="notif-${n.id}">
          <div class="notif-header">
            <div>
              <span class="badge ${n.type === 'ITEM_RETURNED' ? 'badge-returned' : 'badge-found'}">${formatStatus(n.type)}</span>
              <span class="notif-title" style="margin-left: 8px;">${n.title}</span>
            </div>
            <span class="meta">${dateStr}</span>
          </div>
          <div class="notif-body">${n.message}</div>
          <div class="notif-actions">
            ${n.item_id ? `<a class="btn btn-light btn-sm" href="item.html?id=${n.item_id}">View Item</a>` : ''}
            ${isUnread ? `<button class="btn btn-gold btn-sm btn-mark-read" data-notif-id="${n.id}">Mark as read</button>` : '<span class="meta" style="font-size: 0.8rem;">Read</span>'}
          </div>
        </div>
      `;
    }).join("");

    // Attach mark-read handlers
    container.querySelectorAll(".btn-mark-read").forEach(btn => {
      btn.addEventListener("click", async function () {
        const notifId = this.dataset.notifId;
        try {
          await apiRequest(`/notifications/${notifId}/read`, { method: "PUT" });
          await loadNotifications();
          updateNotificationBadge();
        } catch (err) {
          alert("Failed to mark as read: " + err.message);
        }
      });
    });

  } catch (err) {
    showError("notifications-error", "Failed to load notifications: " + err.message);
    container.innerHTML = '<p class="error">Unable to load notifications.</p>';
  }
}

function setupNotifications() {
  if (!window.location.pathname.endsWith("notifications.html")) return;

  const token = getToken();
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  loadNotifications();

  const markAllBtn = document.getElementById("mark-all-read-btn");
  if (markAllBtn) {
    markAllBtn.addEventListener("click", async function () {
      try {
        await apiRequest("/notifications/read-all", { method: "PUT" });
        await loadNotifications();
        updateNotificationBadge();
      } catch (err) {
        alert("Failed to mark all as read: " + err.message);
      }
    });
  }
}

// --- Page: Admin ---

async function setupAdmin() {
  if (!window.location.pathname.endsWith("admin.html")) return;

  const token = getToken();
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  try {
    const user = await apiRequest("/users/me");
    if (user.role !== "ADMIN") {
      window.location.href = "dashboard.html";
      return;
    }

    const [users, items, claims] = await Promise.all([
      apiRequest("/admin/users"),
      apiRequest("/items"),
      apiRequest("/admin/claims")
    ]);

    const statsContainer = document.getElementById("admin-stats");
    if (statsContainer) {
      const totalItems = items.length;
      const activeItems = items.filter(i => i.status === "ACTIVE").length;
      const usersCount = users.length;
      const interestsCount = claims.length;

      statsContainer.innerHTML = `
        <article class="stat-card">
          <h3>${usersCount}</h3>
          <p>Total users</p>
        </article>
        <article class="stat-card">
          <h3>${totalItems}</h3>
          <p>Total items</p>
        </article>
        <article class="stat-card">
          <h3>${activeItems}</h3>
          <p>Active items</p>
        </article>
        <article class="stat-card">
          <h3>${interestsCount}</h3>
          <p>Total interests</p>
        </article>
      `;
    }

    // Populate Admin Users
    const usersTable = document.querySelector("#admin-users-table tbody");
    if (usersTable) {
      usersTable.innerHTML = users.map(u => `
        <tr>
          <td>${u.id}</td>
          <td>${u.name}</td>
          <td>${u.email}</td>
          <td>${u.role}</td>
        </tr>
      `).join("");
    }

    // Populate Admin Items
    const itemsTable = document.querySelector("#admin-items-table tbody");
    if (itemsTable) {
      itemsTable.innerHTML = items.map(item => `
        <tr>
          <td><a href="item.html?id=${item.id}">${item.title}</a></td>
          <td><span class="badge badge-${item.type.toLowerCase()}">${item.type}</span></td>
          <td>User #${item.user_id}</td>
          <td><span class="badge badge-${item.status.toLowerCase()}">${formatStatus(item.status)}</span></td>
          <td>${item.date}</td>
        </tr>
      `).join("");
    }

    // Populate Admin Interests
    const interestsTable = document.querySelector("#admin-interests-table tbody");
    if (interestsTable) {
      if (claims.length === 0) {
        interestsTable.innerHTML = "<tr><td colspan='5'>No interests found</td></tr>";
      } else {
        interestsTable.innerHTML = claims.map(c => `
          <tr>
            <td><a href="item.html?id=${c.item_id}">${c.item_title || "Item #" + c.item_id}</a></td>
            <td>${c.item_type ? `<span class="badge badge-${c.item_type.toLowerCase()}">${c.item_type}</span>` : ""}</td>
            <td>${c.claimant_name}</td>
            <td>${c.claimant_email}</td>
            <td>${c.created_at ? new Date(c.created_at).toLocaleDateString() : ""}</td>
          </tr>
        `).join("");
      }
    }

  } catch (err) {
    console.error("Failed to load admin panel:", err);
  }
}

// --- Page: Admin Users Management ---

async function setupAdminUsers() {
  if (!window.location.pathname.endsWith("admin_users.html")) return;

  const token = getToken();
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  try {
    const user = await apiRequest("/users/me");
    if (user.role !== "ADMIN") {
      window.location.href = "dashboard.html";
      return;
    }
    loadAdminUsersList();
  } catch (err) {
    clearToken();
    window.location.href = "login.html";
  }
}

async function loadAdminUsersList() {
  try {
    const users = await apiRequest("/admin/users");
    const tbody = document.querySelector("#users-table tbody");
    if (!tbody) return;

    tbody.innerHTML = users.map(u => `
      <tr>
        <td>${u.id}</td>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>
          <select class="role-select" data-user-id="${u.id}" style="padding: 4px;">
            <option value="STUDENT" ${u.role === "STUDENT" ? "selected" : ""}>STUDENT</option>
            <option value="ADMIN" ${u.role === "ADMIN" ? "selected" : ""}>ADMIN</option>
          </select>
        </td>
        <td>
          <select class="status-select" data-user-id="${u.id}" style="padding: 4px;">
            <option value="ACTIVE" ${u.status === "ACTIVE" ? "selected" : ""}>ACTIVE</option>
            <option value="BLOCKED" ${u.status === "BLOCKED" ? "selected" : ""}>BLOCKED</option>
          </select>
        </td>
        <td>
          <button class="btn btn-light btn-save-role" data-user-id="${u.id}" style="padding: 4px 8px; font-size: 0.85rem;">Save Role</button>
          <button class="btn btn-light btn-save-status" data-user-id="${u.id}" style="padding: 4px 8px; font-size: 0.85rem; margin-left: 4px;">Save Status</button>
          <button class="btn btn-light btn-delete-user" data-user-id="${u.id}" style="padding: 4px 8px; font-size: 0.85rem; margin-left: 4px; color: var(--lost);">Delete</button>
        </td>
      </tr>
    `).join("");

    // Attach actions
    tbody.querySelectorAll(".btn-save-role").forEach(btn => {
      btn.addEventListener("click", async function () {
        const userId = this.dataset.userId;
        const select = tbody.querySelector(`.role-select[data-user-id="${userId}"]`);
        try {
          await apiRequest(`/admin/users/${userId}/role`, {
            method: "PUT",
            body: JSON.stringify({ role: select.value })
          });
          alert("Role updated!");
          loadAdminUsersList();
        } catch (err) {
          alert("Failed: " + err.message);
        }
      });
    });

    tbody.querySelectorAll(".btn-save-status").forEach(btn => {
      btn.addEventListener("click", async function () {
        const userId = this.dataset.userId;
        const select = tbody.querySelector(`.status-select[data-user-id="${userId}"]`);
        try {
          await apiRequest(`/admin/users/${userId}/status`, {
            method: "PUT",
            body: JSON.stringify({ status: select.value })
          });
          alert("Status updated!");
          loadAdminUsersList();
        } catch (err) {
          alert("Failed: " + err.message);
        }
      });
    });

    tbody.querySelectorAll(".btn-delete-user").forEach(btn => {
      btn.addEventListener("click", async function () {
        const userId = this.dataset.userId;
        if (!confirm("Delete this user? This cannot be undone.")) return;
        try {
          await apiRequest(`/admin/users/${userId}`, { method: "DELETE" });
          alert("User deleted!");
          loadAdminUsersList();
        } catch (err) {
          alert("Failed: " + err.message);
        }
      });
    });

  } catch (err) {
    alert("Failed to load users: " + err.message);
  }
}

// --- Auth Forms ---

function setupAuthForms() {
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value.trim();
      hideError("login-error");

      try {
        const data = await apiRequest("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });
        setToken(data.access_token);
        const role = getUserRoleFromToken(data.access_token);
        window.location.href = role === "ADMIN" ? "admin.html" : "dashboard.html";
      } catch (err) {
        showError("login-error", err.message);
      }
    });
  }

  const registerForm = document.getElementById("register-form");
  if (registerForm) {
    registerForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const name = document.getElementById("name").value.trim();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value.trim();
      const invite_code = document.getElementById("invite_code")?.value.trim() || null;
      hideError("register-error");

      if (!name || !email || !password) {
        showError("register-error", "All fields are required.");
        return;
      }
      if (password.length < 6) {
        showError("register-error", "Password must be at least 6 characters.");
        return;
      }

      try {
        await apiRequest("/auth/register", {
          method: "POST",
          body: JSON.stringify({ name, email, password, invite_code })
        });
        alert("Registration successful! Please log in.");
        window.location.href = "login.html";
      } catch (err) {
        showError("register-error", err.message);
      }
    });
  }

  // Auto redirect if already logged in and visiting login/register
  const token = getToken();
  if (token && (window.location.pathname.endsWith("login.html") || window.location.pathname.endsWith("register.html"))) {
    window.location.href = "dashboard.html";
  }
}

// --- App Initialization ---

document.addEventListener("DOMContentLoaded", function () {
  // Inject global UI elements into every page
  if (!document.getElementById("toast-container")) {
    const tc = document.createElement("div");
    tc.id = "toast-container";
    document.body.appendChild(tc);
  }

  if (!document.getElementById("session-banner")) {
    const sb = document.createElement("div");
    sb.id = "session-banner";
    sb.textContent = "Session expired — redirecting to login…";
    document.body.insertBefore(sb, document.body.firstChild);
  }

  if (!document.getElementById("confirm-modal-overlay")) {
    const overlay = document.createElement("div");
    overlay.id = "confirm-modal-overlay";
    overlay.innerHTML = `
      <div id="confirm-modal">
        <h3 id="confirm-modal-title">Confirm</h3>
        <p id="confirm-modal-msg">Are you sure?</p>
        <div id="confirm-modal-actions">
          <button id="confirm-modal-cancel" class="btn btn-outline">Cancel</button>
          <button id="confirm-modal-ok" class="btn btn-primary">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  buildNav();
  setupHome();
  setupBrowse();
  setupDetails();
  setupReport();
  setupClaim();
  setupAuthForms();
  setupDashboard();
  setupAdmin();
  setupAdminUsers();
  setupNotifications();

  // Start notification polling for logged-in users
  if (getToken()) {
    startNotifPolling(30000);
  }
});

