/* global supabase, APP_CONFIG */
(() => {
  const $ = (selector) => document.querySelector(selector);
  const pageContent = $("#page-content");
  const modal = $("#modal");
  const state = { client: null, user: null, profile: null, page: "dashboard" };
  const titles = { dashboard: "Visao geral", products: "Produtos", movements: "Movimentacoes", condiments: "Condimentos", reports: "Relatorios mensais", users: "Usuarios" };
  const roleLabel = { admin: "Administrador", operator: "Operador", viewer: "Visualizador", pending: "Aguardando liberacao" };

  function escape(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }
  function number(value) { return Number(value || 0); }
  function fmt(value) { return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(number(value)); }
  function dateTime(value) { return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "-"; }
  function canWrite() { return state.profile?.role === "admin" || state.profile?.role === "operator"; }
  function isAdmin() { return state.profile?.role === "admin"; }
  function toast(message, error = false) { const el = $("#toast"); el.textContent = message; el.className = `toast show${error ? " error" : ""}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = "toast", 3600); }
  function fail(error) { console.error(error); toast(error?.message || "Nao foi possivel concluir a operacao.", true); }
  function setAuthMessage(message, error = true) { const el = $("#auth-message"); el.textContent = message; el.style.color = error ? "var(--danger)" : "var(--brand)"; }
  function requireConfig() {
    return window.APP_CONFIG?.supabaseUrl && !window.APP_CONFIG.supabaseUrl.includes("SEU-PROJETO") && window.APP_CONFIG?.supabasePublishableKey && !window.APP_CONFIG.supabasePublishableKey.includes("COLE_SUA");
  }

  async function getProfile() {
    const { data, error } = await state.client.from("profiles").select("id, full_name, email, role").eq("id", state.user.id).single();
    if (error) throw error;
    return data;
  }
  async function updateAuth(session) {
    state.user = session?.user || null;
    state.profile = null;
    if (!state.user) { $("#app").classList.add("hidden"); $("#auth-screen").classList.remove("hidden"); return; }
    try {
      state.profile = await getProfile();
      $("#auth-screen").classList.add("hidden"); $("#app").classList.remove("hidden");
      $("#user-name").textContent = state.profile.full_name || state.user.email;
      $("#user-role").textContent = roleLabel[state.profile.role] || state.profile.role;
      document.querySelectorAll("[data-admin-only]").forEach((el) => el.classList.toggle("hidden", !isAdmin()));
      render();
    } catch (error) { setAuthMessage("Sua conta ainda esta sendo preparada. Tente entrar novamente em alguns segundos."); console.error(error); }
  }
  async function initialize() {
    if (!requireConfig()) { setAuthMessage("Configure config.js com a URL e a chave publishable do Supabase."); return; }
    state.client = supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabasePublishableKey);
    const { data: { session } } = await state.client.auth.getSession();
    await updateAuth(session);
    state.client.auth.onAuthStateChange((_event, sessionValue) => { updateAuth(sessionValue); });
  }

  function openModal(title, fields, onSave, submit = "Salvar") {
    $("#modal-title").textContent = title; $("#modal-submit").textContent = submit;
    $("#modal-body").innerHTML = fields.map((field) => `<label>${escape(field.label)}<${field.type === "select" ? "select" : "input"} name="${escape(field.name)}" ${field.type === "select" ? "" : `type="${field.type || "text"}"`} ${field.step ? `step="${field.step}"` : ""} ${field.readonly ? "readonly" : ""} ${field.required === false ? "" : "required"} value="${field.type === "select" ? "" : escape(field.value ?? "")}">${field.type === "select" ? field.options.map((option) => `<option value="${escape(option.value)}" ${option.value === field.value ? "selected" : ""}>${escape(option.label)}</option>`).join("") + "</select>" : ""}</label>`).join("");
    const form = $("#modal-form"); form.onsubmit = async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(form)); try { await onSave(values); modal.close(); await render(); } catch (error) { fail(error); } };
    modal.showModal();
  }
  function table(headers, rows) { return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td class="empty" colspan="${headers.length}">Nenhum registro encontrado.</td></tr>`}</tbody></table></div>`; }
  function actionButtons(type, id, allowDelete = true) { if (!canWrite()) return ""; return `<div class="actions"><button data-action="edit-${type}" data-id="${id}" class="secondary">Editar</button>${allowDelete ? `<button data-action="delete-${type}" data-id="${id}" class="danger">Excluir</button>` : ""}</div>`; }
  async function allStock() {
    const [{ data: products, error: productError }, { data: movements, error: movementError }] = await Promise.all([
      state.client.from("products").select("*").order("name"), state.client.from("movements").select("product_code,type,quantity"),
    ]);
    if (productError) throw productError; if (movementError) throw movementError;
    return products.map((product) => { const movementsForProduct = movements.filter((movement) => movement.product_code === product.code); const entries = movementsForProduct.filter((movement) => movement.type === "entry").reduce((sum, movement) => sum + number(movement.quantity), 0); const exits = movementsForProduct.filter((movement) => movement.type === "exit").reduce((sum, movement) => sum + number(movement.quantity), 0); return { ...product, entries, exits, stock: number(product.initial_stock) + entries - exits }; });
  }
  async function dashboard() {
    const [stock, { data: movements, error }] = await Promise.all([allStock(), state.client.from("movements").select("id,type,quantity,created_at,products(name)").order("created_at", { ascending: false }).limit(12)]);
    if (error) throw error;
    const low = stock.filter((item) => item.stock <= number(item.minimum_stock));
    pageContent.innerHTML = `<div class="cards"><article class="card"><p>Produtos cadastrados</p><strong>${stock.length}</strong></article><article class="card"><p>Estoque baixo</p><strong>${low.length}</strong></article><article class="card"><p>Movimentacoes recentes</p><strong>${movements.length}</strong></article></div><section class="panel"><div class="panel-head"><h3>Ultimas movimentacoes</h3></div>${table(["Data", "Produto", "Tipo", "Quantidade"], movements.map((item) => `<tr><td>${dateTime(item.created_at)}</td><td>${escape(item.products?.name)}</td><td>${item.type === "entry" ? "Entrada" : "Saida"}</td><td>${fmt(item.quantity)}</td></tr>`).join(""))}</section>`;
  }
  async function products() {
    const stock = await allStock();
    pageContent.innerHTML = `<section class="panel"><div class="panel-head"><h3>Produtos</h3>${canWrite() ? '<button data-action="new-product">Novo produto</button>' : ""}</div>${table(["Codigo", "Nome", "Inicial", "Entradas", "Saidas", "Estoque atual", "Minimo", ""], stock.map((item) => `<tr class="${item.stock <= number(item.minimum_stock) ? "low-stock" : ""}"><td>${escape(item.code)}</td><td>${escape(item.name)}</td><td>${fmt(item.initial_stock)}</td><td>${fmt(item.entries)}</td><td>${fmt(item.exits)}</td><td><strong>${fmt(item.stock)}</strong></td><td>${fmt(item.minimum_stock)}</td><td>${actionButtons("product", item.code)}</td></tr>`).join(""))}</section>`;
  }
  async function movements() {
    const [{ data: movements, error }, { data: productsData, error: productError }] = await Promise.all([state.client.from("movements").select("id,product_code,type,quantity,created_at,products(name)").order("created_at", { ascending: false }), state.client.from("products").select("code,name").order("name")]);
    if (error) throw error; if (productError) throw productError;
    state.products = productsData;
    pageContent.innerHTML = `<section class="panel"><div class="panel-head"><h3>Entradas e saidas</h3>${canWrite() ? '<button data-action="new-movement">Registrar movimentacao</button>' : ""}</div>${table(["Data", "Produto", "Tipo", "Quantidade", ""], movements.map((item) => `<tr><td>${dateTime(item.created_at)}</td><td>${escape(item.products?.name || item.product_code)}</td><td>${item.type === "entry" ? "Entrada" : "Saida"}</td><td>${fmt(item.quantity)}</td><td>${actionButtons("movement", item.id)}</td></tr>`).join(""))}</section>`;
  }
  async function condiments() {
    const [{ data: condimentsData, error }, { data: counts, error: countError }] = await Promise.all([state.client.from("condiments").select("*").order("name"), state.client.from("condiment_counts").select("*").order("created_at", { ascending: false })]);
    if (error) throw error; if (countError) throw countError;
    const latest = new Map(); counts.forEach((item) => { if (!latest.has(item.condiment_code)) latest.set(item.condiment_code, item); });
    state.condiments = condimentsData;
    pageContent.innerHTML = `<section class="panel"><div class="panel-head"><h3>Condimentos</h3>${canWrite() ? '<button data-action="new-condiment">Novo condimento</button>' : ""}</div>${table(["Codigo", "Nome", "Peso unitario (kg)", "Ultima contagem", "Peso total (kg)", ""], condimentsData.map((item) => { const count = latest.get(item.code); return `<tr><td>${escape(item.code)}</td><td>${escape(item.name)}</td><td>${fmt(item.unit_weight)}</td><td>${fmt(count?.count)}</td><td>${fmt(count?.total_weight)}</td><td>${actionButtons("condiment", item.code, true)}${canWrite() ? `<button data-action="count-condiment" data-id="${item.code}" class="secondary">Contar</button>` : ""}</td></tr>`; }).join(""))}</section>`;
  }
  async function reports() {
    const now = new Date(); const month = String(now.getMonth() + 1).padStart(2, "0"); const year = now.getFullYear();
    const stock = await allStock();
    const start = `${year}-${month}-01T00:00:00`; const end = new Date(year, Number(month), 1).toISOString();
    const { data: exits, error } = await state.client.from("movements").select("product_code,quantity").eq("type", "exit").gte("created_at", start).lt("created_at", end);
    if (error) throw error;
    const exitsByProduct = new Map(); exits.forEach((item) => exitsByProduct.set(item.product_code, number(exitsByProduct.get(item.product_code)) + number(item.quantity)));
    pageContent.innerHTML = `<section class="panel"><div class="panel-head"><h3>Resumo de ${month}/${year}</h3><button data-action="print-report" class="secondary">Imprimir / salvar PDF</button></div>${table(["Codigo", "Produto", "Saidas no mes", "Estoque atual", ""], stock.map((item) => `<tr><td>${escape(item.code)}</td><td>${escape(item.name)}</td><td>${fmt(exitsByProduct.get(item.code))}</td><td>${fmt(item.stock)}</td><td>${canWrite() ? `<button data-action="save-count" data-id="${item.code}" class="secondary">Salvar contagem</button>` : ""}</td></tr>`).join(""))}</section>`;
  }
  async function users() {
    const { data, error } = await state.client.from("profiles").select("id,full_name,email,role,created_at").order("created_at"); if (error) throw error;
    state.users = data;
    pageContent.innerHTML = `<section class="panel"><div class="panel-head"><h3>Perfis de acesso</h3></div><p class="hint">Contas novas entram como visualizadoras. Promova-as aqui depois que confirmarem o e-mail.</p>${table(["Nome", "E-mail", "Perfil", "Criado em", ""], data.map((item) => `<tr><td>${escape(item.full_name)}</td><td>${escape(item.email)}</td><td>${escape(roleLabel[item.role])}</td><td>${dateTime(item.created_at)}</td><td>${item.id === state.user.id ? "" : `<button data-action="edit-user" data-id="${item.id}" class="secondary">Alterar perfil</button>`}</td></tr>`).join(""))}</section>`;
  }
  async function render() {
    if (!state.profile) return; $("#page-title").textContent = titles[state.page]; $("#page-kicker").textContent = state.page === "dashboard" ? "PAINEL" : "ESTOQUE";
    if (state.profile.role === "pending") { pageContent.innerHTML = '<section class="panel empty"><h3>Acesso aguardando liberacao</h3><p>Um administrador precisa definir o seu perfil antes que voce possa consultar o estoque.</p></section>'; return; }
    pageContent.innerHTML = '<section class="panel empty">Carregando...</section>';
    try { await ({ dashboard, products, movements, condiments, reports, users }[state.page])(); } catch (error) { fail(error); pageContent.innerHTML = '<section class="panel empty">Nao foi possivel carregar os dados.</section>'; }
  }

  async function editProduct(id) { const current = id ? (await state.client.from("products").select("*").eq("code", id).single()).data : {}; openModal(id ? "Editar produto" : "Novo produto", [{ name: "code", label: "Codigo", value: current.code, readonly: !!id }, { name: "name", label: "Nome", value: current.name }, { name: "initial_stock", label: "Estoque inicial", type: "number", step: "0.01", value: current.initial_stock ?? 0 }, { name: "minimum_stock", label: "Estoque minimo", type: "number", step: "0.01", value: current.minimum_stock ?? 0 }], async (values) => { values.initial_stock = number(values.initial_stock); values.minimum_stock = number(values.minimum_stock); const query = id ? state.client.from("products").update(values).eq("code", id) : state.client.from("products").insert(values); const { error } = await query; if (error) throw error; toast("Produto salvo."); }); }
  async function editMovement(id) { const current = id ? (await state.client.from("movements").select("*").eq("id", id).single()).data : {}; if (!state.products) { const { data } = await state.client.from("products").select("code,name").order("name"); state.products = data; } openModal(id ? "Editar movimentacao" : "Registrar movimentacao", [{ name: "product_code", label: "Produto", type: "select", value: current.product_code, options: state.products.map((item) => ({ value: item.code, label: `${item.name} (${item.code})` })) }, { name: "type", label: "Tipo", type: "select", value: current.type || "entry", options: [{ value: "entry", label: "Entrada" }, { value: "exit", label: "Saida" }] }, { name: "quantity", label: "Quantidade", type: "number", step: "0.01", value: current.quantity ?? 0 }], async (values) => { values.quantity = number(values.quantity); const query = id ? state.client.from("movements").update(values).eq("id", id) : state.client.from("movements").insert(values); const { error } = await query; if (error) throw error; toast("Movimentacao salva."); }); }
  async function editCondiment(id) { const current = id ? (await state.client.from("condiments").select("*").eq("code", id).single()).data : {}; openModal(id ? "Editar condimento" : "Novo condimento", [{ name: "code", label: "Codigo", value: current.code, readonly: !!id }, { name: "name", label: "Nome", value: current.name }, { name: "unit_weight", label: "Peso unitario (kg)", type: "number", step: "0.001", value: current.unit_weight ?? 0 }], async (values) => { values.unit_weight = number(values.unit_weight); const query = id ? state.client.from("condiments").update(values).eq("code", id) : state.client.from("condiments").insert(values); const { error } = await query; if (error) throw error; toast("Condimento salvo."); }); }
  async function countCondiment(id) { const item = state.condiments?.find((condiment) => condiment.code === id) || (await state.client.from("condiments").select("*").eq("code", id).single()).data; openModal(`Contagem: ${item.name}`, [{ name: "count", label: "Quantidade contada", type: "number", step: "0.01", value: 0 }], async (values) => { const count = number(values.count); const { error } = await state.client.from("condiment_counts").insert({ condiment_code: id, count, total_weight: count * number(item.unit_weight) }); if (error) throw error; toast("Contagem registrada."); }); }
  async function saveCount(id) { const product = (await allStock()).find((item) => item.code === id); openModal(`Contagem: ${product.name}`, [{ name: "count", label: "Estoque contado", type: "number", step: "0.01", value: product.stock }], async (values) => { const now = new Date(); const { error } = await state.client.from("monthly_reports").upsert({ product_code: id, month: now.getMonth() + 1, year: now.getFullYear(), count: number(values.count) }, { onConflict: "product_code,month,year" }); if (error) throw error; toast("Contagem mensal salva."); }); }
  async function changeUserRole(id) { const user = state.users.find((item) => item.id === id); openModal(`Perfil de ${user.full_name}`, [{ name: "role", label: "Nivel de acesso", type: "select", value: user.role, options: Object.entries(roleLabel).map(([value, label]) => ({ value, label })) }], async (values) => { const { error } = await state.client.from("profiles").update({ role: values.role }).eq("id", id); if (error) throw error; toast("Perfil atualizado."); }); }
  async function deleteItem(tableName, id, label) { if (!confirm(`Excluir ${label}? Esta acao nao pode ser desfeita.`)) return; const key = tableName === "movements" ? "id" : "code"; const { error } = await state.client.from(tableName).delete().eq(key, id); if (error) return fail(error); toast("Registro excluido."); render(); }

  document.addEventListener("click", async (event) => { const target = event.target.closest("[data-action]"); if (!target || !state.client) return; const { action, id } = target.dataset; try { if (action === "new-product") await editProduct(); if (action === "edit-product") await editProduct(id); if (action === "delete-product") await deleteItem("products", id, "este produto"); if (action === "new-movement") await editMovement(); if (action === "edit-movement") await editMovement(id); if (action === "delete-movement") await deleteItem("movements", id, "esta movimentacao"); if (action === "new-condiment") await editCondiment(); if (action === "edit-condiment") await editCondiment(id); if (action === "delete-condiment") await deleteItem("condiments", id, "este condimento"); if (action === "count-condiment") await countCondiment(id); if (action === "save-count") await saveCount(id); if (action === "edit-user") await changeUserRole(id); if (action === "print-report") window.print(); } catch (error) { fail(error); } });
  $("#login-form").addEventListener("submit", async (event) => { event.preventDefault(); try { const { error } = await state.client.auth.signInWithPassword({ email: $("#login-email").value, password: $("#login-password").value }); if (error) throw error; } catch (error) { setAuthMessage(error.message); } });
  $("#signup-form").addEventListener("submit", async (event) => { event.preventDefault(); try { const { error } = await state.client.auth.signUp({ email: $("#signup-email").value, password: $("#signup-password").value, options: { data: { full_name: $("#signup-name").value } } }); if (error) throw error; setAuthMessage("Conta criada. Confirme o e-mail e aguarde a liberacao do administrador.", false); } catch (error) { setAuthMessage(error.message); } });
  $("#logout").addEventListener("click", () => state.client.auth.signOut()); $("#refresh").addEventListener("click", render); $("#modal-close").addEventListener("click", () => modal.close()); $("#modal-cancel").addEventListener("click", () => modal.close());
  $("#navigation").addEventListener("click", (event) => { const button = event.target.closest("button[data-page]"); if (!button) return; state.page = button.dataset.page; document.querySelectorAll("#navigation button").forEach((item) => item.classList.toggle("active", item === button)); render(); });
  initialize();
})();
