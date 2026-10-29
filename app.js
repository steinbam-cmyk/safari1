// Time Management: a simple personal task manager.
// Tasks are saved in the browser (localStorage), so no server is needed.

const STORAGE_KEY = "time-management.tasks";
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

const els = {
  form: document.getElementById("task-form"),
  id: document.getElementById("task-id"),
  title: document.getElementById("task-title"),
  due: document.getElementById("task-due"),
  priority: document.getElementById("task-priority"),
  notes: document.getElementById("task-notes"),
  submit: document.getElementById("submit-btn"),
  cancel: document.getElementById("cancel-edit"),
  filters: document.getElementById("filters"),
  search: document.getElementById("search"),
  sort: document.getElementById("sort"),
  list: document.getElementById("task-list"),
  empty: document.getElementById("empty"),
  summary: document.getElementById("summary"),
  exportBtn: document.getElementById("export-btn"),
  importFile: document.getElementById("import-file"),
  clearDone: document.getElementById("clear-done"),
};

let tasks = loadTasks();
let filter = "all";

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // Storage may be unavailable (e.g. private mode); the app still works for this visit.
  }
}

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isOverdue(task) {
  return !task.done && task.due && task.due < todayISO();
}

function matchesFilter(task) {
  const today = todayISO();
  switch (filter) {
    case "today": return !task.done && task.due === today;
    case "upcoming": return !task.done && task.due > today;
    case "overdue": return isOverdue(task);
    case "done": return task.done;
    default: return true;
  }
}

function compareTasks(a, b) {
  // Unfinished tasks always come before finished ones.
  if (a.done !== b.done) return a.done ? 1 : -1;
  switch (els.sort.value) {
    case "priority":
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        || (a.due || "9999").localeCompare(b.due || "9999");
    case "created":
      return b.createdAt - a.createdAt;
    default:
      return (a.due || "9999").localeCompare(b.due || "9999")
        || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  }
}

function formatDue(due) {
  if (!due) return "No due date";
  const today = todayISO();
  if (due === today) return "Due today";
  const date = new Date(due + "T00:00");
  const label = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return due < today ? `Overdue · ${label}` : `Due ${label}`;
}

function render() {
  const query = els.search.value.trim().toLowerCase();
  const visible = tasks
    .filter(matchesFilter)
    .filter((t) => !query || t.title.toLowerCase().includes(query) || (t.notes || "").toLowerCase().includes(query))
    .sort(compareTasks);

  els.list.replaceChildren(...visible.map(renderTask));
  els.empty.hidden = visible.length > 0;

  const open = tasks.filter((t) => !t.done).length;
  const overdue = tasks.filter(isOverdue).length;
  els.summary.textContent = `${open} open task${open === 1 ? "" : "s"}`
    + (overdue ? ` · ${overdue} overdue` : "");
}

function renderTask(task) {
  const li = document.createElement("li");
  li.className = `task priority-${task.priority}`;
  if (task.done) li.classList.add("done");
  if (isOverdue(task)) li.classList.add("overdue");

  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = task.done;
  check.setAttribute("aria-label", "Mark as done");
  check.addEventListener("change", () => updateTask(task.id, { done: check.checked }));

  const body = document.createElement("div");
  body.className = "task-body";
  const title = document.createElement("p");
  title.className = "task-title";
  title.textContent = task.title;
  const meta = document.createElement("p");
  meta.className = "task-meta";
  meta.textContent = `${formatDue(task.due)} · ${task.priority} priority`;
  body.append(title, meta);
  if (task.notes) {
    const notes = document.createElement("p");
    notes.className = "task-notes";
    notes.textContent = task.notes;
    body.append(notes);
  }

  const actions = document.createElement("div");
  actions.className = "task-actions";
  const edit = document.createElement("button");
  edit.type = "button";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => startEdit(task));
  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "Delete";
  del.addEventListener("click", () => {
    if (confirm(`Delete "${task.title}"?`)) {
      tasks = tasks.filter((t) => t.id !== task.id);
      saveTasks();
      render();
    }
  });
  actions.append(edit, del);

  li.append(check, body, actions);
  return li;
}

function updateTask(id, changes) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, ...changes } : t));
  saveTasks();
  render();
}

function startEdit(task) {
  els.id.value = task.id;
  els.title.value = task.title;
  els.due.value = task.due || "";
  els.priority.value = task.priority;
  els.notes.value = task.notes || "";
  els.submit.textContent = "Save changes";
  els.cancel.hidden = false;
  els.title.focus();
  els.form.scrollIntoView({ behavior: "smooth" });
}

function resetForm() {
  els.form.reset();
  els.id.value = "";
  els.priority.value = "medium";
  els.submit.textContent = "Add task";
  els.cancel.hidden = true;
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = els.title.value.trim();
  if (!title) return;
  const fields = {
    title,
    due: els.due.value || null,
    priority: els.priority.value,
    notes: els.notes.value.trim(),
  };
  if (els.id.value) {
    updateTask(els.id.value, fields);
  } else {
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
    tasks.push({ id, ...fields, done: false, createdAt: Date.now() });
    saveTasks();
    render();
  }
  resetForm();
});

els.cancel.addEventListener("click", resetForm);

els.filters.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  filter = button.dataset.filter;
  for (const b of els.filters.querySelectorAll("button")) b.classList.toggle("active", b === button);
  render();
});

els.search.addEventListener("input", render);
els.sort.addEventListener("change", render);

els.clearDone.addEventListener("click", () => {
  const count = tasks.filter((t) => t.done).length;
  if (!count || !confirm(`Remove ${count} completed task${count === 1 ? "" : "s"}?`)) return;
  tasks = tasks.filter((t) => !t.done);
  saveTasks();
  render();
});

els.exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `tasks-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported)) throw new Error("not a list");
    const known = new Set(tasks.map((t) => t.id));
    const fresh = imported.filter((t) => t && t.id && t.title && !known.has(t.id));
    tasks = tasks.concat(fresh);
    saveTasks();
    render();
    alert(`Imported ${fresh.length} task${fresh.length === 1 ? "" : "s"}.`);
  } catch {
    alert("That file doesn't look like a task export.");
  }
  els.importFile.value = "";
});

render();
