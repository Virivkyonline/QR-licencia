const API_BASE = "https://qr-kody-platinum-api.virivkyonlinecz.workers.dev";
const QR_API_BASE = "https://qr-generator-real.virivkyonlinecz.workers.dev";
const REMEMBER_ADMIN_KEY = "qr_platinum_remember_admin";
const DELETED_LICENSES_KEY = "qr_platinum_deleted_licenses";

const LICENSE_PAYMENT = {
  amount: 99,
  iban: "SK3883300000002201671168",
  bic: "FIOZSKBAXXX",
  beneficiaryName: "Stavby1 s.r.o.",
  paymentNote: "Licencia QR kódy Platinum"
};

const state = {
  me: {
    id: "",
    email: "",
    role: "user",
    status: "pending",
    license: {
      status: "pending",
      licenseType: "one_time",
      activatedAt: "",
      variableSymbol: "",
      paymentStatus: "waiting_payment"
    }
  },
  companies: [],
  adminUsers: []
};

function qs(id) { return document.getElementById(id); }
function qsa(selector) { return Array.from(document.querySelectorAll(selector)); }

function setStatus(el, msg, type = "") {
  if (!el) return;
  el.textContent = msg || "";
  el.className = "inline-status" + (type ? " " + type : "");
}

function money(v) {
  return `${Number(v || 0).toFixed(2)} EUR`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function loadRememberedAdminLogin() {
  try {
    return JSON.parse(localStorage.getItem(REMEMBER_ADMIN_KEY) || "null") || {};
  } catch {
    return {};
  }
}

function prefillRememberedAdminLogin() {
  const remembered = loadRememberedAdminLogin();
  if (!remembered.email && !remembered.password) return;
  if (qs("loginEmail") && !qs("loginEmail").value) qs("loginEmail").value = remembered.email || "";
  if (qs("loginPassword") && !qs("loginPassword").value) qs("loginPassword").value = remembered.password || "";
  if (qs("rememberAdminLogin")) qs("rememberAdminLogin").checked = true;
}

function saveRememberedAdminLogin(email, password, remember, role) {
  if (!remember || role !== "admin") {
    localStorage.removeItem(REMEMBER_ADMIN_KEY);
    return;
  }
  localStorage.setItem(REMEMBER_ADMIN_KEY, JSON.stringify({ email, password }));
}

function loadDeletedLicenseIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(DELETED_LICENSES_KEY) || "[]");
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveDeletedLicenseIds(ids) {
  localStorage.setItem(DELETED_LICENSES_KEY, JSON.stringify([...ids].map(String)));
}

function rememberDeletedLicense(id) {
  const ids = loadDeletedLicenseIds();
  ids.add(String(id));
  saveDeletedLicenseIds(ids);
}

function forgetDeletedLicense(id) {
  const ids = loadDeletedLicenseIds();
  ids.delete(String(id));
  saveDeletedLicenseIds(ids);
}

async function api(path, options = {}) {
  const token = localStorage.getItem("token");
  const headers = { ...(options.headers || {}) };
  const hasBody = options.body !== undefined && options.body !== null;

  if (hasBody && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }


  let res;
  try {
    res = await fetch(API_BASE + path, {
      credentials: "include",
      ...options,
      headers: {
        ...headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
  } catch {
    throw new Error("Nepodarilo sa spojiť so serverom.");
  }

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json().catch(() => ({}))
    : await res.text().catch(() => "");

  if (!res.ok) {
    const message = typeof data === "string"
      ? data
      : data?.error || data?.message || data?.detail || "API chyba";
    throw new Error(message);
  }

  return data;
}


async function qrApi(path, payload) {
  let res;
  try {
    res = await fetch(QR_API_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
  } catch {
    throw new Error("Nepodarilo sa spojiť s QR serverom.");
  }

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json().catch(() => ({}))
    : await res.text().catch(() => "");

  if (!res.ok) {
    const message = typeof data === "string"
      ? data
      : data?.error || data?.message || data?.detail || "QR API chyba";
    throw new Error(message);
  }

  return data;
}

function setCurrentUserFromApi(data) {
  const user = data?.user || {};
  const license = data?.license || {};
  state.me = {
    id: user.id || "",
    email: user.email || "",
    role: user.role || "user",
    status: user.status || "pending",
    license: {
      status: license.status || "pending",
      licenseType: license.licenseType || "one_time",
      activatedAt: license.activatedAt || "",
      variableSymbol: license.variableSymbol || "",
      paymentStatus: license.paymentStatus || (license.status === "active" ? "paid" : "waiting_payment")
    }
  };
}

async function loadMeFromApi() {
  const data = await api("/api/auth/me", { method: "GET" });
  setCurrentUserFromApi(data);
  return data;
}

async function requireAuth() {
  if (!document.body.dataset.protected) return true;

  try {
    await loadMeFromApi();
  } catch {
    location.href = "index.html";
    return false;
  }

  if (qs("userEmailPill")) qs("userEmailPill").textContent = state.me.email || "neprihlásený";

  if (document.body.dataset.admin === "true" && state.me.role !== "admin") {
    alert("Táto sekcia je len pre admina.");
    location.href = "dashboard.html";
    return false;
  }

  return true;
}

function activateTabs() {
  qsa(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      qsa(".tab-btn").forEach((x) => x.classList.remove("active"));
      qsa(".tab-panel").forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
      document.querySelector(`[data-panel="${tab}"]`)?.classList.add("active");
    });
  });
}

function bindAuth() {
  const loginForm = qs("loginForm");
  const registerForm = qs("registerForm");
  const forgotForm = qs("forgotPasswordForm");
  const resetForm = qs("resetPasswordForm");
  prefillRememberedAdminLogin();

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = qs("loginEmail")?.value.trim() || "";
    const password = qs("loginPassword")?.value || "";
    const rememberAdmin = !!qs("rememberAdminLogin")?.checked;

    try {
      const loginData = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      if (loginData?.token) {
        localStorage.setItem("token", loginData.token);
      }

      await loadMeFromApi();
      saveRememberedAdminLogin(email, password, rememberAdmin, state.me.role);

      setStatus(qs("loginStatus"), "Prihlásenie prebehlo úspešne.", "ok");
      setTimeout(() => { location.href = "dashboard.html"; }, 300);
    } catch (err) {
      setStatus(qs("loginStatus"), err.message, "err");
    }
  });

  registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = qs("registerEmail")?.value.trim() || "";
    const password = qs("registerPassword")?.value || "";
    const password2 = qs("registerPassword2")?.value || "";

    try {
      if (password !== password2) throw new Error("Heslá sa nezhodujú.");

      const registerData = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      const loginData = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      if (loginData?.token) {
        localStorage.setItem("token", loginData.token);
      }

      await loadMeFromApi();

      setStatus(qs("registerStatus"), "Účet bol vytvorený. Nižšie sú platobné údaje.", "ok");

      const card = qs("registrationPaymentCard");
      if (card) card.classList.remove("hidden");

      const payment = await api("/api/license/payment-qr", {
        method: "POST",
        body: JSON.stringify({
          variableSymbol: loginData?.license?.variableSymbol || registerData?.license?.variableSymbol || ""
        })
      });

      if (qs("postRegisterEmail")) qs("postRegisterEmail").textContent = email;
      if (qs("postRegisterVs")) qs("postRegisterVs").textContent = payment?.payment?.variableSymbol || loginData?.license?.variableSymbol || registerData?.license?.variableSymbol || "—";
      if (qs("postRegisterAmount")) qs("postRegisterAmount").textContent = money(payment?.payment?.amount || 0);
      if (qs("postRegisterIban")) qs("postRegisterIban").textContent = payment?.payment?.iban || "—";
      if (qs("postRegisterBic")) qs("postRegisterBic").textContent = payment?.payment?.bic || "—";
      if (qs("postRegisterBeneficiary")) qs("postRegisterBeneficiary").textContent = payment?.payment?.beneficiaryName || "—";
      if (qs("postRegisterNote")) qs("postRegisterNote").textContent = payment?.payment?.paymentNote || "—";

      const img = qs("postRegisterQrImage");
      const placeholder = qs("postRegisterQrPlaceholder");
      if (img && payment?.imageBase64) {
        img.src = `data:image/png;base64,${payment.imageBase64}`;
        img.style.display = "block";
        if (placeholder) placeholder.style.display = "none";
      }
    } catch (err) {
      setStatus(qs("registerStatus"), err.message, "err");
    }
  });

  forgotForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = qs("forgotEmail")?.value.trim() || "";

    try {
      await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email })
      });

      setStatus(qs("forgotPasswordStatus"), "Ak účet existuje, email bol odoslaný.", "ok");
      forgotForm.reset();
    } catch (err) {
      setStatus(qs("forgotPasswordStatus"), err.message, "err");
    }
  });

  resetForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const token = qs("resetToken")?.value.trim() || "";
    const password = qs("resetPassword")?.value || "";
    const password2 = qs("resetPassword2")?.value || "";

    try {
      if (!token) throw new Error("Chýba reset token.");
      if (password !== password2) throw new Error("Heslá sa nezhodujú.");

      await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password })
      });

      setStatus(qs("resetPasswordStatus"), "Heslo obnovené.", "ok");
      resetForm.reset();

      setTimeout(() => {
        location.href = "index.html";
      }, 2000);
    } catch (err) {
      setStatus(qs("resetPasswordStatus"), err.message, "err");
    }
  });

  qs("logoutBtn")?.addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {}
    localStorage.removeItem("token");
    location.href = "index.html";
  });
}

function populateDashboard() {
  if (!qs("accountEmail")) return;

  qs("accountEmail").textContent = state.me.email || "—";
  qs("accountRole").textContent = state.me.role || "user";
  qs("accountStatus").textContent = state.me.status || "pending";

  const badge = qs("licenseStatusBadge");
  if (badge) {
    badge.textContent = state.me.license.status || "pending";
    badge.className = "status-badge " + (
      state.me.license.status === "active"
        ? "active"
        : state.me.license.status === "blocked"
          ? "blocked"
          : "pending"
    );
  }

  if (qs("companiesCount")) qs("companiesCount").textContent = String(state.companies.length);
  if (qs("lastQrCount")) qs("lastQrCount").textContent = localStorage.getItem("qr_count") || "0";
}

async function loadCompanies() {
  const data = await api("/api/companies", { method: "GET" });
  state.companies = (data.companies || []).map((c) => ({
    id: c.id,
    companyName: c.company_name,
    beneficiaryName: c.beneficiary_name,
    iban: c.iban,
    bic: c.bic || "",
    addressLine: c.address_line || "",
    city: c.city || "",
    postalCode: c.postal_code || "",
    countryCode: c.country_code || "SK",
    isDefault: !!c.is_default,
    createdAt: c.created_at || "",
    updatedAt: c.updated_at || ""
  }));
  renderCompanies();
}

function renderCompanies() {
  const list = qs("companiesList");
  const select = qs("genCompany");

  if (list) {
    list.innerHTML = state.companies.length ? "" : '<div class="table-note">Zatiaľ nemáš pridanú žiadnu firmu.</div>';
    state.companies.forEach((company) => {
      const item = document.createElement("article");
      item.className = "company-item";
      item.innerHTML = `
        <div class="company-top">
          <div>
            <strong>${escapeHtml(company.companyName)}</strong>
            <div class="muted">${escapeHtml(company.beneficiaryName)}</div>
            <div class="muted">${escapeHtml(company.iban)}</div>
          </div>
          ${company.isDefault ? '<span class="status-badge active">predvolená</span>' : ''}
        </div>
        <div class="item-actions">
          <button class="btn-small btn-edit" data-edit="${company.id}">Upraviť</button>
          <button class="btn-small btn-delete" data-delete="${company.id}">Vymazať</button>
        </div>
      `;
      list.appendChild(item);
    });

    list.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => editCompany(btn.dataset.edit)));
    list.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => deleteCompany(btn.dataset.delete)));
  }

  [select].forEach((sel) => {
    if (!sel) return;
    sel.innerHTML = state.companies.length ? "" : '<option value="">Najprv pridaj firmu</option>';
    state.companies.forEach((c) => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = `${c.companyName} • ${c.iban}`;
      sel.appendChild(o);
    });
  });

  if (qs("companiesCount")) qs("companiesCount").textContent = String(state.companies.length);
}

function resetCompanyForm() {
  ["companyId", "companyName", "beneficiaryName", "iban", "bic", "addressLine", "city", "postalCode"].forEach((id) => {
    const e = qs(id);
    if (e) e.value = "";
  });
  if (qs("countryCode")) qs("countryCode").value = "SK";
  if (qs("isDefault")) qs("isDefault").checked = false;
  if (qs("companyFormTitle")) qs("companyFormTitle").textContent = "Pridať firmu";
}

function editCompany(id) {
  const c = state.companies.find((x) => x.id === id);
  if (!c) return;
  qs("companyId").value = c.id;
  qs("companyName").value = c.companyName || "";
  qs("beneficiaryName").value = c.beneficiaryName || "";
  qs("iban").value = c.iban || "";
  qs("bic").value = c.bic || "";
  qs("addressLine").value = c.addressLine || "";
  qs("city").value = c.city || "";
  qs("postalCode").value = c.postalCode || "";
  qs("countryCode").value = c.countryCode || "SK";
  qs("isDefault").checked = !!c.isDefault;
  qs("companyFormTitle").textContent = "Upraviť firmu";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteCompany(id) {
  try {
    await api(`/api/companies/${id}`, { method: "DELETE" });
    await loadCompanies();
    setStatus(qs("companyStatus"), "Firma bola vymazaná.", "ok");
  } catch (err) {
    setStatus(qs("companyStatus"), err.message, "err");
  }
}

function bindCompanies() {
  const form = qs("companyForm");
  if (!form) return;

  loadCompanies().catch((err) => setStatus(qs("companyStatus"), err.message, "err"));

  qs("resetCompanyForm")?.addEventListener("click", resetCompanyForm);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      id: qs("companyId")?.value || "",
      companyName: qs("companyName")?.value.trim() || "",
      beneficiaryName: qs("beneficiaryName")?.value.trim() || "",
      iban: qs("iban")?.value.trim() || "",
      bic: qs("bic")?.value.trim() || "",
      addressLine: qs("addressLine")?.value.trim() || "",
      city: qs("city")?.value.trim() || "",
      postalCode: qs("postalCode")?.value.trim() || "",
      countryCode: qs("countryCode")?.value.trim() || "SK",
      isDefault: !!qs("isDefault")?.checked
    };

    if (!payload.companyName || !payload.beneficiaryName || !payload.iban) {
      return setStatus(qs("companyStatus"), "Vyplň názov firmy, príjemcu a IBAN.", "err");
    }

    try {
      const body = JSON.stringify({
        companyName: payload.companyName,
        beneficiaryName: payload.beneficiaryName,
        iban: payload.iban,
        bic: payload.bic,
        addressLine: payload.addressLine,
        city: payload.city,
        postalCode: payload.postalCode,
        countryCode: payload.countryCode,
        isDefault: payload.isDefault
      });

      if (payload.id) {
        await api(`/api/companies/${payload.id}`, { method: "PUT", body });
      } else {
        await api("/api/companies", { method: "POST", body });
      }

      await loadCompanies();
      resetCompanyForm();
      setStatus(qs("companyStatus"), "Firma bola uložená.", "ok");
    } catch (err) {
      setStatus(qs("companyStatus"), err.message, "err");
    }
  });
}

function bindGenerator() {
  const form = qs("generatorForm");
  if (!form) return;

  loadCompanies().catch(() => {});

 const due = qs("genDueDate");
if (due && !due.value) {
  const d = new Date();
  due.value = d.toISOString().slice(0, 10);
}

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (state.me.license.status !== "active") {
      return setStatus(qs("generatorStatus"), "Generovanie je zamknuté, kým nie je licencia aktívna.", "err");
    }

    const company = state.companies.find((c) => c.id === qs("genCompany")?.value);
    if (!company) return setStatus(qs("generatorStatus"), "Najprv pridaj firmu.", "err");

    const amount = qs("genAmount")?.value;
    if (!amount) return setStatus(qs("generatorStatus"), "Zadaj sumu.", "err");

    try {
      const data = await qrApi("/", {
  amount: Number(amount),
  iban: company.iban,
  beneficiaryName: company.beneficiaryName || company.companyName || "",
  variableSymbol: qs("genVs")?.value.trim() || "",
  specificSymbol: qs("genSs")?.value.trim() || "",
  constantSymbol: qs("genKs")?.value.trim() || "",
  dueDate: qs("genDueDate")?.value || "",
  paymentNote: qs("genNote")?.value.trim() || "",
  bic: company.bic || ""
});

      const img = qs("qrPreviewImage");
      if (img && data?.svg) {
  img.src = "data:image/svg+xml;base64," + btoa(data.svg);
  img.style.display = "block";
  if (qs("qrPreviewPlaceholder")) qs("qrPreviewPlaceholder").style.display = "none";
}

      qs("generatorSummary")?.classList.remove("hidden");
      if (qs("sumGenCompany")) qs("sumGenCompany").textContent = company.companyName;
      if (qs("sumGenAmount")) qs("sumGenAmount").textContent = money(amount);
      if (qs("sumGenVs")) qs("sumGenVs").textContent = qs("genVs")?.value || "—";
      if (qs("sumGenNote")) qs("sumGenNote").textContent = qs("genNote")?.value || "—";

      localStorage.setItem("qr_count", String(Number(localStorage.getItem("qr_count") || "0") + 1));
      if (qs("lastQrCount")) qs("lastQrCount").textContent = localStorage.getItem("qr_count");
      setStatus(qs("generatorStatus"), "QR bolo úspešne vygenerované.", "ok");
    } catch (err) {
      setStatus(qs("generatorStatus"), err.message, "err");
    }
  });
}

async function bindLicense() {
  if (!qs("licensePageStatus") && !qs("dashboardLicenseQrImage")) return;

  try {
    const data = await api("/api/license/me", { method: "GET" });
    state.me.license = {
      status: data.license?.status || "pending",
      licenseType: data.license?.licenseType || "one_time",
      activatedAt: data.license?.activatedAt || "",
      variableSymbol: data.license?.variableSymbol || state.me.license.variableSymbol || "",
      paymentStatus: data.license?.status === "active" ? "paid" : "waiting_payment"
    };
  } catch (err) {
    setStatus(qs("licenseStatusMessage") || qs("dashboardLicenseStatus"), err.message, "err");
    return;
  }

  const status = state.me.license.status || "pending";
  const isPaid = status === "active";
  const payment = {
    amount: LICENSE_PAYMENT.amount,
    iban: LICENSE_PAYMENT.iban,
    bic: LICENSE_PAYMENT.bic,
    beneficiaryName: LICENSE_PAYMENT.beneficiaryName,
    paymentNote: LICENSE_PAYMENT.paymentNote,
    variableSymbol: state.me.license.variableSymbol || "—"
  };

  const badge = qs("licensePageStatus");
  if (badge) {
    badge.textContent = status;
    badge.className = "status-badge " + (status === "active" ? "active" : status === "blocked" ? "blocked" : "pending");
  }
  if (qs("licenseType")) qs("licenseType").textContent = state.me.license.licenseType || "one_time";
  if (qs("licenseActivatedAt")) qs("licenseActivatedAt").textContent = state.me.license.activatedAt || "—";

  if (qs("licensePaymentState")) qs("licensePaymentState").textContent = isPaid ? "uhradené" : "čaká na úhradu";
  if (qs("licenseVariableSymbol")) qs("licenseVariableSymbol").textContent = payment.variableSymbol;
  if (qs("licenseAmount")) qs("licenseAmount").textContent = money(payment.amount);
  if (qs("licenseIban")) qs("licenseIban").textContent = payment.iban;
  if (qs("licenseBic")) qs("licenseBic").textContent = payment.bic || "—";
  if (qs("licenseBeneficiary")) qs("licenseBeneficiary").textContent = payment.beneficiaryName;
  if (qs("licensePaymentNote")) qs("licensePaymentNote").textContent = payment.paymentNote;

  if (qs("licenseMiniStatus")) qs("licenseMiniStatus").textContent = isPaid ? "uhradené" : "čaká na úhradu";
  if (qs("licenseMiniVs")) qs("licenseMiniVs").textContent = payment.variableSymbol;
  if (qs("licenseMiniAmount")) qs("licenseMiniAmount").textContent = money(payment.amount);
  if (qs("licenseStatusBadgeMirror")) qs("licenseStatusBadgeMirror").textContent = status;
  if (qs("licenseMiniVsMirror")) qs("licenseMiniVsMirror").textContent = payment.variableSymbol;

  try {
    const qrData = await qrApi("/", {
      amount: payment.amount,
      iban: payment.iban,
      beneficiaryName: payment.beneficiaryName,
      variableSymbol: state.me.license.variableSymbol || "",
      paymentNote: payment.paymentNote,
      bic: payment.bic || ""
    });

    const setQr = (imgId, placeholderId) => {
      const img = qs(imgId);
      const placeholder = qs(placeholderId);
      if (img && qrData?.svg) {
        img.src = "data:image/svg+xml;base64," + btoa(qrData.svg);
        img.style.display = "block";
        if (placeholder) placeholder.style.display = "none";
      }
    };

    setQr("licenseQrImage", "licenseQrPlaceholder");
    setQr("dashboardLicenseQrImage", "dashboardLicenseQrPlaceholder");
  } catch (err) {
    setStatus(qs("licenseStatusMessage") || qs("dashboardLicenseStatus"), err.message, "err");
  }

  qs("copyLicenseVsBtn")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.me.license.variableSymbol || "");
      setStatus(qs("licenseStatusMessage"), "VS skopírovaný.", "ok");
    } catch {
      setStatus(qs("licenseStatusMessage"), "Nepodarilo sa skopírovať VS.", "err");
    }
  });

  qs("copyVsBtn")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.me.license.variableSymbol || "");
      setStatus(qs("dashboardLicenseStatus"), "VS skopírovaný.", "ok");
    } catch {
      setStatus(qs("dashboardLicenseStatus"), "Nepodarilo sa skopírovať VS.", "err");
    }
  });

  const changePasswordForm = qs("changePasswordForm");
  changePasswordForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const currentPassword = qs("currentPassword")?.value || "";
    const newPassword = qs("newPassword")?.value || "";
    const newPassword2 = qs("newPassword2")?.value || "";

    try {
      if (newPassword !== newPassword2) throw new Error("Nové heslá sa nezhodujú.");

      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword })
      });

      setStatus(qs("changePasswordStatus"), "Heslo bolo zmenené.", "ok");
      changePasswordForm.reset();
    } catch (err) {
      setStatus(qs("changePasswordStatus"), err.message, "err");
    }
  });
}

async function bindAdmin() {
  const list = qs("adminUsersList");
  if (!list) return;
  const deletedList = qs("adminDeletedLicensesList");

  async function getBillingConfigAdmin() {
    const data = await api("/api/admin/billing-company", { method: "GET" });
    const company = data?.company || {};
    return {
      beneficiaryName: company.beneficiaryName || "",
      iban: company.iban || "",
      bic: company.bic || "",
      amount: Number(company.amount || 99),
      paymentNote: company.paymentNote || ""
    };
  }

  async function saveBillingConfigAdmin(config) {
    return await api("/api/admin/billing-company", {
      method: "PUT",
      body: JSON.stringify({
        beneficiaryName: config.beneficiaryName,
        iban: String(config.iban || "").replace(/\s+/g, "").toUpperCase(),
        bic: String(config.bic || "").trim(),
        amount: Number(config.amount || 0),
        paymentNote: config.paymentNote || ""
      })
    });
  }

  const render = () => {
    const emailFilter = (qs("adminFilterEmail")?.value || "").trim().toLowerCase();
    const vsFilter = (qs("adminFilterVs")?.value || "").trim();
    const statusFilter = (qs("adminFilterStatus")?.value || "").trim();

    const visibleUsers = state.adminUsers.filter((user) => !user.licenseDeleted);
    const deletedUsers = state.adminUsers.filter((user) => user.licenseDeleted);

    const filtered = visibleUsers.filter((user) => {
      const paymentStatus = user.licenseStatus === "active"
        ? "active"
        : user.status === "blocked"
          ? "blocked"
          : (user.paymentStatus === "paid" ? "paid" : "pending");

      const okEmail = !emailFilter || user.email.toLowerCase().includes(emailFilter);
      const okVs = !vsFilter || String(user.variableSymbol || "").includes(vsFilter);
      const okStatus = !statusFilter || paymentStatus === statusFilter;

      return okEmail && okVs && okStatus;
    });

    list.innerHTML = filtered.length ? "" : '<div class="table-note">Zatia? nie s? akt?vne ani ?akaj?ce licencie.</div>';
    filtered.forEach((user) => {
      const paymentStatus = user.licenseStatus === "active"
        ? "active"
        : user.status === "blocked"
          ? "blocked"
          : (user.paymentStatus === "paid" ? "paid" : "pending");

      const item = document.createElement("article");
      item.className = "admin-item";
      item.innerHTML = `
        <div class="admin-top">
          <div>
            <strong>${escapeHtml(user.email)}</strong>
            <div class="muted">rola: ${escapeHtml(user.role)}</div>
            <div class="muted">status: ${escapeHtml(user.status)}</div>
            <div class="muted">VS: ${escapeHtml(user.variableSymbol || "—")}</div>
          </div>
          <span class="status-badge ${paymentStatus === "active" ? "active" : paymentStatus === "blocked" ? "blocked" : paymentStatus === "paid" ? "paid" : "pending"}">${paymentStatus === "paid" ? "uhradené" : paymentStatus}</span>
        </div>
        <div class="item-actions">
          <button class="btn-small btn-paid" data-paid="${user.id}">Označiť uhradené</button>
          <button class="btn-small btn-activate" data-activate="${user.id}">Aktivovať</button>
          <button class="btn-small btn-delete" data-delete-license="${user.id}">Vymazať licenciu</button>
          <button class="btn-small btn-delete" data-block="${user.id}">Blokovať</button>
          <button class="btn-small btn-reset" data-reset="${user.id}">Reset hesla</button>
        </div>
      `;
      list.appendChild(item);
    });

    list.querySelectorAll("[data-activate]").forEach((btn) => btn.addEventListener("click", async () => {
      try {
        forgetDeletedLicense(btn.dataset.activate);
        await api(`/api/admin/users/${btn.dataset.activate}/activate`, { method: "POST" });
        await loadAdminUsers();
        setStatus(qs("adminStatus"), "Používateľ bol aktivovaný.", "ok");
      } catch (err) {
        setStatus(qs("adminStatus"), err.message, "err");
      }
    }));

    list.querySelectorAll("[data-block]").forEach((btn) => btn.addEventListener("click", async () => {
      try {
        await api(`/api/admin/users/${btn.dataset.block}/block`, { method: "POST" });
        await loadAdminUsers();
        setStatus(qs("adminStatus"), "Používateľ bol zablokovaný.", "ok");
      } catch (err) {
        setStatus(qs("adminStatus"), err.message, "err");
      }
    }));

    list.querySelectorAll("[data-delete-license]").forEach((btn) => btn.addEventListener("click", async () => {
      try {
        const user = state.adminUsers.find((x) => String(x.id) === String(btn.dataset.deleteLicense));
        const label = user?.email ? ` pre ${user.email}` : "";
        if (!confirm(`Naozaj vymazať licenciu${label}? Používateľ zostane v systéme, ale licencia sa odstráni.`)) return;
        try {
          await api(`/api/admin/users/${btn.dataset.deleteLicense}/block`, { method: "POST" });
        } catch {}
        try {
          await api(`/api/admin/users/${btn.dataset.deleteLicense}/license`, { method: "DELETE" });
        } catch {
          try {
            await api(`/api/admin/users/${btn.dataset.deleteLicense}/delete-license`, { method: "POST" });
          } catch {}
        }
        await loadAdminUsers();
        setStatus(qs("adminStatus"), "Licencia bola vymazaná.", "ok");
      } catch (err) {
        setStatus(qs("adminStatus"), err.message, "err");
      }
    }));

    if (deletedList) {
      deletedList.innerHTML = deletedUsers.length ? "" : '<div class="table-note">Zatial nie su vymazane licencie.</div>';
      deletedUsers.forEach((user) => {
        const item = document.createElement("article");
        item.className = "admin-item";
        item.innerHTML = `
          <div class="admin-top">
            <div>
              <strong>${escapeHtml(user.email)}</strong>
              <div class="muted">status: vymazan? licencia</div>
              <div class="muted">VS: ${escapeHtml(user.variableSymbol || "?")}</div>
            </div>
            <span class="status-badge blocked">vymazan?</span>
          </div>
          <div class="item-actions">
            <button class="btn-small btn-activate" data-restore-license="${user.id}">Obnovit / aktivovat</button>
          </div>
        `;
        deletedList.appendChild(item);
      });

      deletedList.querySelectorAll("[data-restore-license]").forEach((btn) => btn.addEventListener("click", async () => {
        try {
          forgetDeletedLicense(btn.dataset.restoreLicense);
          await api(`/api/admin/users/${btn.dataset.restoreLicense}/activate`, { method: "POST" });
          await loadAdminUsers();
          setStatus(qs("adminStatus"), "Licencia bola obnoven? a aktivovan?.", "ok");
        } catch (err) {
          setStatus(qs("adminStatus"), err.message, "err");
        }
      }));
    }

    list.querySelectorAll("[data-paid]").forEach((btn) => btn.addEventListener("click", async () => {
      try {
        await api(`/api/admin/users/${btn.dataset.paid}/mark-paid`, { method: "POST" });
        await loadAdminUsers();
        setStatus(qs("adminStatus"), "Platba bola označená ako uhradená.", "ok");
      } catch (err) {
        setStatus(qs("adminStatus"), err.message, "err");
      }
    }));

    list.querySelectorAll("[data-reset]").forEach((btn) => btn.addEventListener("click", async () => {
      try {
        const newPassword = prompt("Zadaj nové heslo (min. 8 znakov):");
        if (!newPassword) return;
        if (newPassword.length < 8) throw new Error("Nové heslo musí mať aspoň 8 znakov.");

        await api(`/api/admin/users/${btn.dataset.reset}/reset-password`, {
          method: "POST",
          body: JSON.stringify({ newPassword })
        });
        setStatus(qs("adminStatus"), "Heslo bolo resetované.", "ok");
      } catch (err) {
        setStatus(qs("adminStatus"), err.message, "err");
      }
    }));
  };

  async function loadAdminUsers() {
    const data = await api("/api/admin/users", { method: "GET" });
    const deletedIds = loadDeletedLicenseIds();
    state.adminUsers = (data.users || []).map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      status: u.status,
      licenseStatus: u.license_status || "pending",
      licenseType: u.license_type || "one_time",
      activatedAt: u.activated_at || "",
      createdAt: u.created_at || "",
      variableSymbol: u.variable_symbol || "",
      paymentStatus: u.payment_status || "waiting_payment",
      licenseDeleted: deletedIds.has(String(u.id)) || u.license_status === "deleted" || u.payment_status === "deleted" || !!u.license_deleted || !!u.license_deleted_at
    }));
    render();
  }

  qs("refreshAdminBtn")?.addEventListener("click", () => {
    loadAdminUsers().then(() => {
      setStatus(qs("adminStatus"), "Zoznam používateľov obnovený.", "ok");
    }).catch((err) => setStatus(qs("adminStatus"), err.message, "err"));
  });

  ["adminFilterEmail", "adminFilterVs", "adminFilterStatus"].forEach((id) => {
    qs(id)?.addEventListener("input", render);
    qs(id)?.addEventListener("change", render);
  });

  const billingForm = qs("billingCompanyForm");
  if (billingForm) {
    try {
      const cfg = await getBillingConfigAdmin();
      if (qs("billingBeneficiaryName")) qs("billingBeneficiaryName").value = cfg.beneficiaryName || "";
      if (qs("billingIban")) qs("billingIban").value = cfg.iban || "";
      if (qs("billingBic")) qs("billingBic").value = cfg.bic || "";
      if (qs("billingAmount")) qs("billingAmount").value = String(cfg.amount || "");
      if (qs("billingPaymentNote")) qs("billingPaymentNote").value = cfg.paymentNote || "";
    } catch (err) {
      setStatus(qs("billingCompanyStatus"), err.message, "err");
    }

    billingForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await saveBillingConfigAdmin({
          beneficiaryName: qs("billingBeneficiaryName")?.value.trim(),
          iban: qs("billingIban")?.value.trim(),
          bic: qs("billingBic")?.value.trim(),
          amount: qs("billingAmount")?.value,
          paymentNote: qs("billingPaymentNote")?.value.trim()
        });
        setStatus(qs("billingCompanyStatus"), "Fakturačná firma bola uložená.", "ok");
      } catch (err) {
        setStatus(qs("billingCompanyStatus"), err.message, "err");
      }
    });
  }

  await loadAdminUsers().catch((err) => setStatus(qs("adminStatus"), err.message, "err"));
}

const THEME_COLORS = {
  gold: "#0f172a",
  blue: "#0f172a",
  green: "#052e16",
  purple: "#2e1065"
};

function applyTheme(theme) {
  const safeTheme = ["gold", "blue", "green", "purple"].includes(theme) ? theme : "gold";
  document.body.classList.remove("theme-gold", "theme-blue", "theme-green", "theme-purple");
  document.body.classList.add(`theme-${safeTheme}`);
  localStorage.setItem("app_theme", safeTheme);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute("content", THEME_COLORS[safeTheme] || "#0f172a");
}

function initTheme() {
  applyTheme(localStorage.getItem("app_theme") || "gold");
  document.querySelectorAll("[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => applyTheme(btn.dataset.theme));
  });
}

// Service worker dočasne vypnutý kvôli cache starého app.js
// if ("serviceWorker" in navigator) {
//   window.addEventListener("load", () => {
//     navigator.serviceWorker.register("service-worker.js").catch((err) => console.log("SW ERROR", err));
//   });
// }

document.addEventListener("DOMContentLoaded", async () => {
  activateTabs();
  bindAuth();

  const tokenFromUrl = new URLSearchParams(location.search).get("token");
  if (qs("resetToken") && tokenFromUrl && !qs("resetToken").value) {
    qs("resetToken").value = tokenFromUrl;
  }

  const isProtected = document.body.dataset.protected === "true";
  if (isProtected) {
    const ok = await requireAuth();
    if (!ok) return;
  }

  if (qs("userEmailPill")) qs("userEmailPill").textContent = state.me.email || "neprihlásený";

  populateDashboard();
  bindCompanies();
  bindGenerator();
  await bindLicense();
  await bindAdmin();
  initTheme();
});
