const API_BASE = "https://qr-kody-platinum-api.virivkyonlinecz.workers.dev";
const PRODUCT_CODE = "qr-platinum";

const state = {
  me: {
    id: "",
    email: "",
    role: "user",
    status: "pending",
    license: {
      status: "pending",
      licenseType: "time_limited",
      activatedAt: "",
      validFrom: "",
      validUntil: "",
      productCode: PRODUCT_CODE,
      variableSymbol: "",
      paymentStatus: "waiting_payment",
      isValid: false,
      daysRemaining: 0
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

function parseUtcDate(value) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? `${value}T23:59:59.999Z`
    : String(value);
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeLicense(raw = {}) {
  const status = String(raw.status || raw.license_status || "pending").toLowerCase();
  const validUntil = raw.validUntil || raw.valid_until || raw.expiresAt || raw.expires_at || "";
  const expiry = parseUtcDate(validUntil);
  const isValid = status === "active" && !!expiry && expiry.getTime() > Date.now();
  const daysRemaining = isValid
    ? Math.max(1, Math.ceil((expiry.getTime() - Date.now()) / 86400000))
    : 0;

  return {
    status: status === "active" && !isValid ? "expired" : status,
    licenseType: raw.licenseType || raw.license_type || "time_limited",
    activatedAt: raw.activatedAt || raw.activated_at || "",
    validFrom: raw.validFrom || raw.valid_from || raw.activatedAt || raw.activated_at || "",
    validUntil,
    productCode: raw.productCode || raw.product_code || PRODUCT_CODE,
    variableSymbol: raw.variableSymbol || raw.variable_symbol || "",
    paymentStatus: raw.paymentStatus || raw.payment_status || (isValid ? "paid" : "waiting_payment"),
    isValid,
    daysRemaining
  };
}

function isLicenseActive(license = state.me.license) {
  return !!license?.isValid;
}

function hasProductAccess() {
  return state.me.role === "admin" || (
    state.me.license.productCode === PRODUCT_CODE && isLicenseActive()
  );
}

function formatDate(value) {
  const date = parseUtcDate(value);
  return date ? date.toLocaleDateString("sk-SK") : "—";
}

function formatDateTime(value) {
  const date = parseUtcDate(value);
  return date
    ? date.toLocaleString("sk-SK", { dateStyle: "short", timeStyle: "short" })
    : "—";
}

function manualLicenseEnd(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error("Zadaj platný dátum a čas licencie.");
  return date.toISOString();
}

function manualLicenseEndFromParts(dateValue, timeValue) {
  const datePart = String(dateValue || "").trim();
  const timePart = String(timeValue || "").trim();
  if (!datePart && !timePart) return null;
  if (!datePart) throw new Error("Vyber deň, mesiac a rok platnosti licencie.");
  return manualLicenseEnd(`${datePart}T${timePart || "23:59"}`);
}

function licenseStatusText(license = state.me.license) {
  if (license?.isValid) return `aktívna (${license.daysRemaining} dní)`;
  if (license?.status === "expired") return "platnosť vypršala";
  if (license?.status === "blocked") return "zablokovaná";
  if (license?.status === "deleted") return "vymazaná";
  return "čaká na aktiváciu";
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
    const error = new Error(message);
    error.status = res.status;
    error.code = typeof data === "object" ? data?.code || "" : "";
    throw error;
  }

  return data;
}


function setCurrentUserFromApi(data) {
  const user = data?.user || {};
  const license = normalizeLicense(data?.license || user?.license || data?.entitlement || {});
  state.me = {
    id: user.id || "",
    email: user.email || "",
    role: user.role || "user",
    status: user.status || "pending",
    license
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
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = qs("loginEmail")?.value.trim() || "";
    const password = qs("loginPassword")?.value || "";
    try {
      const loginData = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      if (loginData?.token) {
        localStorage.setItem("token", loginData.token);
      }

      await loadMeFromApi();

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
      if (password.length < 8) throw new Error("Heslo musí mať aspoň 8 znakov.");
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
          productCode: PRODUCT_CODE,
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
      const registrationQr = payment?.imageBase64
        ? `data:image/png;base64,${payment.imageBase64}`
        : payment?.svg
          ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(payment.svg)}`
          : "";
      if (img && registrationQr) {
        img.src = registrationQr;
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
      if (password.length < 8) throw new Error("Heslo musí mať aspoň 8 znakov.");
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
    badge.textContent = licenseStatusText();
    badge.className = "status-badge " + (
      state.me.license.isValid
        ? "active"
        : ["blocked", "expired", "deleted"].includes(state.me.license.status)
          ? "blocked"
          : "pending"
    );
  }

  if (qs("licenseValidUntil")) qs("licenseValidUntil").textContent = formatDate(state.me.license.validUntil);
  if (qs("licenseDaysRemaining")) qs("licenseDaysRemaining").textContent = String(state.me.license.daysRemaining || 0);

  const licenseBox = qs("licenseStatusBadgeMirror")?.closest(".account-box");
  if (licenseBox && !qs("dashboardLicenseValidity")) {
    const row = document.createElement("div");
    row.id = "dashboardLicenseValidity";
    row.className = "account-row";
    row.innerHTML = '<span>Platná do</span><strong id="dashboardLicenseValidUntil">—</strong>';
    licenseBox.insertBefore(row, licenseBox.querySelector(".form-actions"));
  }
  if (qs("dashboardLicenseValidUntil")) {
    qs("dashboardLicenseValidUntil").textContent = formatDate(state.me.license.validUntil);
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

  if (!hasProductAccess()) {
    form.querySelectorAll("input, select, textarea, button").forEach((el) => { el.disabled = true; });
    setStatus(qs("companyStatus"), "Správa firiem je zablokovaná, pretože licencia nie je platná.", "err");
    return;
  }

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

  if (!hasProductAccess()) {
    form.querySelectorAll("input, select, textarea, button").forEach((el) => { el.disabled = true; });
    setStatus(qs("generatorStatus"), "Generovanie je zablokované, pretože licencia nie je platná.", "err");
    return;
  }

  loadCompanies().catch((err) => setStatus(qs("generatorStatus"), err.message, "err"));

 const due = qs("genDueDate");
if (due && !due.value) {
  const d = new Date();
  due.value = d.toISOString().slice(0, 10);
}

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!hasProductAccess()) {
      return setStatus(qs("generatorStatus"), "Generovanie je zamknuté, pretože licencia nie je platná.", "err");
    }

    const company = state.companies.find((c) => c.id === qs("genCompany")?.value);
    if (!company) return setStatus(qs("generatorStatus"), "Najprv pridaj firmu.", "err");

    const amount = qs("genAmount")?.value;
    if (!amount) return setStatus(qs("generatorStatus"), "Zadaj sumu.", "err");

    try {
      const data = await api("/api/qr/generate", {
        method: "POST",
        body: JSON.stringify({
          companyId: company.id,
          amount: Number(amount),
          currencyCode: "EUR",
          variableSymbol: qs("genVs")?.value.trim() || "",
          specificSymbol: qs("genSs")?.value.trim() || "",
          constantSymbol: qs("genKs")?.value.trim() || "",
          dueDate: qs("genDueDate")?.value || "",
          paymentNote: qs("genNote")?.value.trim() || ""
        })
      });

      const img = qs("qrPreviewImage");
      if (img && data?.svg) {
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.svg)}`;
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

  let licenseData = {};
  let paymentData = {};
  try {
    licenseData = await api(`/api/license/me?product=${encodeURIComponent(PRODUCT_CODE)}`, { method: "GET" });
    state.me.license = normalizeLicense({
      ...(licenseData.license || licenseData.entitlement || {}),
      variableSymbol: licenseData.license?.variableSymbol || licenseData.license?.variable_symbol || licenseData.entitlement?.variableSymbol || state.me.license.variableSymbol
    });
  } catch (err) {
    setStatus(qs("licenseStatusMessage") || qs("dashboardLicenseStatus"), err.message, "err");
    return;
  }

  try {
    paymentData = await api("/api/license/payment-qr", {
      method: "POST",
      body: JSON.stringify({
        productCode: PRODUCT_CODE,
        variableSymbol: state.me.license.variableSymbol || ""
      })
    });
  } catch (err) {
    setStatus(qs("licenseStatusMessage") || qs("dashboardLicenseStatus"), err.message, "err");
  }

  const status = state.me.license.status;
  const isPaid = state.me.license.paymentStatus === "paid" || state.me.license.isValid;
  const sourcePayment = paymentData.payment || licenseData.payment || {};
  const payment = {
    amount: Number(sourcePayment.amount || 0),
    iban: sourcePayment.iban || "—",
    bic: sourcePayment.bic || "",
    beneficiaryName: sourcePayment.beneficiaryName || sourcePayment.beneficiary_name || "—",
    paymentNote: sourcePayment.paymentNote || sourcePayment.payment_note || "—",
    variableSymbol: sourcePayment.variableSymbol || sourcePayment.variable_symbol || state.me.license.variableSymbol || "—"
  };

  const badge = qs("licensePageStatus");
  if (badge) {
    badge.textContent = licenseStatusText();
    badge.className = "status-badge " + (state.me.license.isValid ? "active" : ["blocked", "expired", "deleted"].includes(status) ? "blocked" : "pending");
  }
  if (qs("licenseType")) qs("licenseType").textContent = state.me.license.licenseType || "time_limited";
  if (qs("licenseActivatedAt")) qs("licenseActivatedAt").textContent = formatDate(state.me.license.activatedAt);

  const activatedCard = qs("licenseActivatedAt")?.closest("article");
  if (activatedCard && !qs("licenseValiditySummary")) {
    const validity = document.createElement("p");
    validity.id = "licenseValiditySummary";
    validity.className = "muted";
    activatedCard.appendChild(validity);
  }
  if (qs("licenseValiditySummary")) {
    qs("licenseValiditySummary").textContent = `Platná do: ${formatDate(state.me.license.validUntil)} · zostáva ${state.me.license.daysRemaining} dní`;
  }

  if (qs("licensePaymentState")) {
    qs("licensePaymentState").textContent = state.me.license.isValid
      ? "uhradené a aktívne"
      : status === "expired"
        ? "uhradené, platnosť vypršala"
        : isPaid
          ? "uhradené, čaká na aktiváciu"
          : "čaká na úhradu";
  }
  if (qs("licenseVariableSymbol")) qs("licenseVariableSymbol").textContent = payment.variableSymbol;
  if (qs("licenseAmount")) qs("licenseAmount").textContent = money(payment.amount);
  if (qs("licenseIban")) qs("licenseIban").textContent = payment.iban;
  if (qs("licenseBic")) qs("licenseBic").textContent = payment.bic || "—";
  if (qs("licenseBeneficiary")) qs("licenseBeneficiary").textContent = payment.beneficiaryName;
  if (qs("licensePaymentNote")) qs("licensePaymentNote").textContent = payment.paymentNote;

  if (qs("licenseMiniStatus")) qs("licenseMiniStatus").textContent = licenseStatusText();
  if (qs("licenseMiniVs")) qs("licenseMiniVs").textContent = payment.variableSymbol;
  if (qs("licenseMiniAmount")) qs("licenseMiniAmount").textContent = money(payment.amount);
  if (qs("licenseStatusBadgeMirror")) qs("licenseStatusBadgeMirror").textContent = licenseStatusText();
  if (qs("licenseMiniVsMirror")) qs("licenseMiniVsMirror").textContent = payment.variableSymbol;

  const qrSource = paymentData.imageBase64
    ? `data:image/png;base64,${paymentData.imageBase64}`
    : paymentData.svg
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(paymentData.svg)}`
      : "";
  const setQr = (imgId, placeholderId) => {
    const img = qs(imgId);
    const placeholder = qs(placeholderId);
    if (img && qrSource) {
      img.src = qrSource;
      img.style.display = "block";
      if (placeholder) placeholder.style.display = "none";
    }
  };

  setQr("licenseQrImage", "licenseQrPlaceholder");
  setQr("dashboardLicenseQrImage", "dashboardLicenseQrPlaceholder");

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
      if (newPassword.length < 8) throw new Error("Nové heslo musí mať aspoň 8 znakov.");
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
  const currentAdminProductCode = () => qs("quickLicenseProduct")?.value || qs("adminProductCode")?.value || PRODUCT_CODE;
  const adminFilters = qs("adminFilterEmail")?.closest(".admin-filters");
  if (adminFilters && !qs("adminProductCode")) {
    const productLabel = document.createElement("label");
    productLabel.className = "full-span";
    productLabel.innerHTML = '<span>Produkt licencie</span><select id="adminProductCode"><option value="qr-platinum">QR Platinum</option><option value="lech-play-tv">Lech Play TV</option></select>';
    adminFilters.prepend(productLabel);
  }

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

    const quickUserSelect = qs("quickLicenseUser");
    if (quickUserSelect) {
      const previousUserId = quickUserSelect.value;
      const customers = visibleUsers.filter((user) => user.role !== "admin");
      quickUserSelect.innerHTML = customers.length
        ? '<option value="">Vyber zákazníka</option>' + customers.map((user) => (
            `<option value="${user.id}">${escapeHtml(user.email)} – ${escapeHtml(user.status)}</option>`
          )).join("")
        : '<option value="">Žiadny zákazník</option>';
      if (customers.some((user) => String(user.id) === String(previousUserId))) {
        quickUserSelect.value = previousUserId;
      }
    }

    const filtered = visibleUsers.filter((user) => {
      const paymentStatus = user.status === "blocked"
        ? "blocked"
        : user.license.status === "expired"
          ? "expired"
          : user.license.isValid
            ? "active"
            : (user.license.paymentStatus === "paid" ? "paid" : "pending");

      const okEmail = !emailFilter || user.email.toLowerCase().includes(emailFilter);
      const okVs = !vsFilter || String(user.variableSymbol || "").includes(vsFilter);
      const okStatus = !statusFilter || paymentStatus === statusFilter;

      return okEmail && okVs && okStatus;
    });

    list.innerHTML = filtered.length ? "" : '<div class="table-note">Zatiaľ nie sú aktívne ani čakajúce licencie.</div>';
    filtered.forEach((user) => {
      const paymentStatus = user.status === "blocked"
        ? "blocked"
        : user.license.status === "expired"
          ? "expired"
          : user.license.isValid
            ? "active"
            : (user.license.paymentStatus === "paid" ? "paid" : "pending");
      const badgeClass = paymentStatus === "active" ? "active" : ["blocked", "expired"].includes(paymentStatus) ? "blocked" : paymentStatus === "paid" ? "paid" : "pending";
      const isAdmin = user.role === "admin";
      const validUntilLabel = isAdmin ? "trvalo (bez expirácie)" : formatDateTime(user.license.validUntil);
      const blockAction = user.status === "blocked"
        ? `<button class="btn-small btn-activate" data-unblock="${user.id}">Odblokovať</button>`
        : `<button class="btn-small btn-delete" data-block="${user.id}">Blokovať</button>`;
      const licenseEditor = isAdmin ? `
        <div class="license-validity-editor">
          <span>Trvalý administrátorský prístup – nedá sa zablokovať ani vymazať.</span>
        </div>
      ` : `
        <div class="license-validity-editor">
          <label>
            <span>Predĺžiť alebo aktivovať na obdobie</span>
            <select data-duration-months="${user.id}">
              <option value="">Vyber platnosť</option>
              <option value="1">1 mesiac</option>
              <option value="12">1 rok</option>
              <option value="24">2 roky</option>
            </select>
          </label>
          <div class="license-validity-separator">alebo</div>
          <div class="license-datetime-title">Ručne nastaviť konkrétny deň platnosti</div>
          <div class="license-datetime-grid">
            <label>
              <span>Dátum platnosti (deň / mesiac / rok)</span>
              <input type="date" data-valid-until-date="${user.id}">
            </label>
            <label>
              <span>Čas platnosti (hodina / minúta)</span>
              <input type="time" value="23:59" step="60" data-valid-until-time="${user.id}">
            </label>
          </div>
          <small>Ručný dátum má prednosť. Môže byť aj v minulosti na okamžitý test vypnutia.</small>
        </div>
      `;
      const licenseActions = isAdmin ? `
          <button class="btn-small btn-reset" data-reset="${user.id}">Reset hesla</button>
      ` : `
          <button class="btn-small btn-paid" data-paid="${user.id}">Označiť uhradené</button>
          <button class="btn-small btn-activate" data-save-license="${user.id}">Uložiť a aktivovať</button>
          <button class="btn-small btn-delete" data-delete-license="${user.id}">Vymazať licenciu</button>
          ${blockAction}
          <button class="btn-small btn-reset" data-reset="${user.id}">Reset hesla</button>
      `;

      const item = document.createElement("article");
      item.className = "admin-item";
      item.innerHTML = `
        <div class="admin-top">
          <div>
            <strong>${escapeHtml(user.email)}</strong>
            <div class="muted">rola: ${escapeHtml(user.role)}</div>
            <div class="muted">status: ${escapeHtml(user.status)}</div>
            <div class="muted">VS: ${escapeHtml(user.variableSymbol || "—")}</div>
            <div class="muted">produkt: ${escapeHtml(user.license.productCode)}</div>
            <div class="muted">platná do: ${escapeHtml(validUntilLabel)}</div>
          </div>
          <span class="status-badge ${badgeClass}">${paymentStatus === "paid" ? "uhradené" : paymentStatus === "expired" ? "vypršala" : paymentStatus}</span>
        </div>
        ${licenseEditor}
        <div class="item-actions">
          ${licenseActions}
        </div>
      `;
      list.appendChild(item);
    });

    list.querySelectorAll("[data-save-license]").forEach((btn) => btn.addEventListener("click", async () => {
      try {
        const id = btn.dataset.saveLicense;
        const durationMonths = Number(list.querySelector(`[data-duration-months="${id}"]`)?.value || 0);
        const validUntil = manualLicenseEndFromParts(
          list.querySelector(`[data-valid-until-date="${id}"]`)?.value,
          list.querySelector(`[data-valid-until-time="${id}"]`)?.value
        );
        if (!validUntil && ![1, 12, 24].includes(durationMonths)) {
          throw new Error("Vyber obdobie alebo zadaj presný dátum a čas.");
        }
        await api(`/api/admin/users/${id}/license`, {
          method: "PUT",
          body: JSON.stringify({
            status: "active",
            productCode: currentAdminProductCode(),
            ...(validUntil ? { validUntil } : { durationMonths })
          })
        });
        await loadAdminUsers();
        setStatus(qs("adminStatus"), "Licencia bola aktivovaná do zadaného dátumu.", "ok");
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

    list.querySelectorAll("[data-unblock]").forEach((btn) => btn.addEventListener("click", async () => {
      try {
        await api(`/api/admin/users/${btn.dataset.unblock}/unblock`, { method: "POST" });
        await loadAdminUsers();
        setStatus(qs("adminStatus"), "Používateľ bol odblokovaný. Platnosť licencie sa nezmenila.", "ok");
      } catch (err) {
        setStatus(qs("adminStatus"), err.message, "err");
      }
    }));

    list.querySelectorAll("[data-delete-license]").forEach((btn) => btn.addEventListener("click", async () => {
      try {
        const user = state.adminUsers.find((x) => String(x.id) === String(btn.dataset.deleteLicense));
        const label = user?.email ? ` pre ${user.email}` : "";
        if (!confirm(`Naozaj vymazať licenciu${label}? Používateľ zostane v systéme, ale licencia sa odstráni.`)) return;
        await api(`/api/admin/users/${btn.dataset.deleteLicense}/license?product=${encodeURIComponent(currentAdminProductCode())}`, { method: "DELETE" });
        await loadAdminUsers();
        setStatus(qs("adminStatus"), "Licencia bola vymazaná.", "ok");
      } catch (err) {
        setStatus(qs("adminStatus"), err.message, "err");
      }
    }));

    if (deletedList) {
      deletedList.innerHTML = deletedUsers.length ? "" : '<div class="table-note">Zatiaľ nie sú vymazané licencie.</div>';
      deletedUsers.forEach((user) => {
        const item = document.createElement("article");
        item.className = "admin-item";
        item.innerHTML = `
          <div class="admin-top">
            <div>
              <strong>${escapeHtml(user.email)}</strong>
              <div class="muted">status: vymazaná licencia</div>
              <div class="muted">VS: ${escapeHtml(user.variableSymbol || "—")}</div>
            </div>
            <span class="status-badge blocked">vymazaná</span>
          </div>
          <div class="license-validity-editor">
            <label>
              <span>Obnoviť na obdobie</span>
              <select data-restore-duration-months="${user.id}">
                <option value="">Vyber platnosť</option>
                <option value="1">1 mesiac</option>
                <option value="12">1 rok</option>
                <option value="24">2 roky</option>
              </select>
            </label>
            <div class="license-validity-separator">alebo</div>
            <div class="license-datetime-title">Ručne nastaviť konkrétny deň platnosti</div>
            <div class="license-datetime-grid">
              <label>
                <span>Dátum platnosti (deň / mesiac / rok)</span>
                <input type="date" data-restore-valid-until-date="${user.id}">
              </label>
              <label>
                <span>Čas platnosti (hodina / minúta)</span>
                <input type="time" value="23:59" step="60" data-restore-valid-until-time="${user.id}">
              </label>
            </div>
          </div>
          <div class="item-actions">
            <button class="btn-small btn-activate" data-restore-license="${user.id}">Obnoviť a aktivovať</button>
            <button class="btn-small btn-delete" data-permanent-delete="${user.id}">Úplne zmazať účet</button>
          </div>
        `;
        deletedList.appendChild(item);
      });

      deletedList.querySelectorAll("[data-restore-license]").forEach((btn) => btn.addEventListener("click", async () => {
        try {
          const id = btn.dataset.restoreLicense;
          const durationMonths = Number(deletedList.querySelector(`[data-restore-duration-months="${id}"]`)?.value || 0);
          const validUntil = manualLicenseEndFromParts(
            deletedList.querySelector(`[data-restore-valid-until-date="${id}"]`)?.value,
            deletedList.querySelector(`[data-restore-valid-until-time="${id}"]`)?.value
          );
          if (!validUntil && ![1, 12, 24].includes(durationMonths)) {
            throw new Error("Vyber obdobie alebo zadaj presný dátum a čas.");
          }
          await api(`/api/admin/users/${id}/license`, {
            method: "PUT",
            body: JSON.stringify({
              status: "active",
              productCode: currentAdminProductCode(),
              ...(validUntil ? { validUntil } : { durationMonths })
            })
          });
          await loadAdminUsers();
          setStatus(qs("adminStatus"), "Licencia bola obnovená a aktivovaná.", "ok");
        } catch (err) {
          setStatus(qs("adminStatus"), err.message, "err");
        }
      }));

      deletedList.querySelectorAll("[data-permanent-delete]").forEach((btn) => btn.addEventListener("click", async () => {
        try {
          const user = state.adminUsers.find((x) => String(x.id) === String(btn.dataset.permanentDelete));
          const label = user?.email ? ` ${user.email}` : "";
          if (!confirm(`Naozaj úplne zmazať účet${label}? Zmažú sa všetky jeho licencie a údaje. Túto operáciu nemožno vrátiť späť.`)) return;
          await api(`/api/admin/users/${btn.dataset.permanentDelete}/permanent`, { method: "DELETE" });
          await loadAdminUsers();
          setStatus(qs("adminStatus"), "Používateľ a všetky jeho licencie boli úplne zmazané.", "ok");
        } catch (err) {
          setStatus(qs("adminStatus"), err.message, "err");
        }
      }));
    }

    list.querySelectorAll("[data-paid]").forEach((btn) => btn.addEventListener("click", async () => {
      try {
        await api(`/api/admin/users/${btn.dataset.paid}/mark-paid`, {
          method: "POST",
          body: JSON.stringify({ productCode: currentAdminProductCode() })
        });
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
    const data = await api(`/api/admin/users?product=${encodeURIComponent(currentAdminProductCode())}`, { method: "GET" });
    state.adminUsers = (data.users || []).map((u) => {
      const license = normalizeLicense(u.license || u);
      return {
        id: u.id,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.created_at || u.createdAt || "",
        variableSymbol: u.variable_symbol || u.variableSymbol || license.variableSymbol || "",
        license,
        licenseDeleted: license.status === "deleted" || !!u.license_deleted || !!u.license_deleted_at
      };
    });
    render();
  }

  qs("refreshAdminBtn")?.addEventListener("click", () => {
    loadAdminUsers().then(() => {
      setStatus(qs("adminStatus"), "Zoznam používateľov obnovený.", "ok");
    }).catch((err) => setStatus(qs("adminStatus"), err.message, "err"));
  });

  qs("adminProductCode")?.addEventListener("change", () => {
    if (qs("quickLicenseProduct")) qs("quickLicenseProduct").value = qs("adminProductCode").value;
    state.adminUsers = [];
    loadAdminUsers().catch((err) => setStatus(qs("adminStatus"), err.message, "err"));
  });

  qs("quickLicenseProduct")?.addEventListener("change", () => {
    if (qs("adminProductCode")) qs("adminProductCode").value = qs("quickLicenseProduct").value;
    state.adminUsers = [];
    loadAdminUsers().catch((err) => setStatus(qs("quickLicenseStatus"), err.message, "err"));
  });

  const selectedQuickUserId = () => {
    const userId = qs("quickLicenseUser")?.value || "";
    if (!userId) throw new Error("Najprv vyber zákazníka.");
    return userId;
  };

  qs("quickSaveLicense")?.addEventListener("click", async () => {
    try {
      const userId = selectedQuickUserId();
      const durationMonths = Number(qs("quickLicenseDuration")?.value || 0);
      const validUntil = manualLicenseEndFromParts(qs("quickLicenseDate")?.value, qs("quickLicenseTime")?.value);
      if (!validUntil && ![1, 12, 24].includes(durationMonths)) {
        throw new Error("Vyber obdobie alebo zadaj dátum platnosti.");
      }
      await api(`/api/admin/users/${userId}/license`, {
        method: "PUT",
        body: JSON.stringify({
          status: "active",
          productCode: currentAdminProductCode(),
          ...(validUntil ? { validUntil } : { durationMonths })
        })
      });
      await loadAdminUsers();
      setStatus(qs("quickLicenseStatus"), "Licencia bola uložená a aktivovaná.", "ok");
    } catch (err) {
      setStatus(qs("quickLicenseStatus"), err.message, "err");
    }
  });

  qs("quickUnblockUser")?.addEventListener("click", async () => {
    try {
      const userId = selectedQuickUserId();
      await api(`/api/admin/users/${userId}/unblock`, { method: "POST" });
      await loadAdminUsers();
      setStatus(qs("quickLicenseStatus"), "Účet bol odblokovaný. Dátum licencie sa nezmenil.", "ok");
    } catch (err) {
      setStatus(qs("quickLicenseStatus"), err.message, "err");
    }
  });

  qs("quickBlockUser")?.addEventListener("click", async () => {
    try {
      const userId = selectedQuickUserId();
      await api(`/api/admin/users/${userId}/block`, { method: "POST" });
      await loadAdminUsers();
      setStatus(qs("quickLicenseStatus"), "Účet bol zablokovaný.", "ok");
    } catch (err) {
      setStatus(qs("quickLicenseStatus"), err.message, "err");
    }
  });

  ["adminFilterEmail", "adminFilterVs", "adminFilterStatus"].forEach((id) => {
    qs(id)?.addEventListener("input", render);
    qs(id)?.addEventListener("change", render);
  });

  const statusFilter = qs("adminFilterStatus");
  if (statusFilter && !statusFilter.querySelector('option[value="expired"]')) {
    const option = document.createElement("option");
    option.value = "expired";
    option.textContent = "vypršané";
    statusFilter.appendChild(option);
  }

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
