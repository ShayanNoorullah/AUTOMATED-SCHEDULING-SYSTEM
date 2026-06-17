import tkinter as tk
from tkinter import ttk, messagebox
import json, os, threading, time

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "groups_config.json")
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


# ── Config helpers ──────────────────────────────────────────────────────────

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    return {"groups": []}

def save_config(config):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)


# ── Message formatter ────────────────────────────────────────────────────────

def format_message(schedule_entries):
    lines = ["*Note*", "Schedule for this week:", ""]
    for entry in schedule_entries:
        lines.append(f"* {entry['day']}: {entry['time']}")
    lines.append("*Kindly Acknowledge*")
    return "\n".join(lines)


# ── WhatsApp sender (Selenium) ────────────────────────────────────────────────

def send_to_group(group_name, message, status_cb, done_cb):
    try:
        import undetected_chromedriver as uc
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.keys import Keys
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        import pyperclip
    except ImportError as e:
        status_cb(f"Missing dependency: {e}. Run install.bat first.")
        done_cb(False)
        return

    session_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "whatsapp_session")
    os.makedirs(session_dir, exist_ok=True)

    options = uc.ChromeOptions()
    options.add_argument(f"--user-data-dir={session_dir}")
    options.add_argument("--profile-directory=Default")

    # Multiple fallback XPaths for each element (WhatsApp Web changes selectors often)
    SEARCH_XPATHS = [
        '//div[@contenteditable="true"][@data-tab="3"]',
        '//div[@role="textbox"][@title="Search input textbox"]',
        '//div[@aria-label="Search input textbox"]',
        '//div[contains(@class,"copyable-text")][@data-tab="3"]',
        '//p[@class="selectable-text copyable-text"][@data-tab="3"]',
    ]
    MSGBOX_XPATHS = [
        '//div[@contenteditable="true"][@data-tab="10"]',
        '//div[@aria-label="Type a message"]',
        '//div[@title="Type a message"]',
        '//div[@role="textbox"][@aria-label="Type a message"]',
        '//div[contains(@class,"copyable-text")][@data-tab="10"]',
    ]

    def find_first(driver, xpaths, timeout=60):
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.common.by import By
        from selenium.common.exceptions import TimeoutException
        for xpath in xpaths:
            try:
                el = WebDriverWait(driver, timeout).until(
                    EC.presence_of_element_located((By.XPATH, xpath)))
                return el
            except TimeoutException:
                continue
        return None

    driver = None
    try:
        driver = uc.Chrome(options=options, use_subprocess=True, version_main=148)

        status_cb(f"[{group_name}] Opening WhatsApp Web…")
        driver.get("https://web.whatsapp.com")

        status_cb(f"[{group_name}] Waiting for WhatsApp to load (scan QR if prompted)…")
        search_box = find_first(driver, SEARCH_XPATHS, timeout=90)

        if search_box is None:
            # Log page source snippet to help debug
            snippet = driver.page_source[:800].replace("\n", " ")
            status_cb(f"[{group_name}] Could not find search box. Page snippet: {snippet}")
            done_cb(False)
            return

        status_cb(f"[{group_name}] Searching for group…")
        search_box.click()
        time.sleep(0.5)
        search_box.send_keys(group_name)
        time.sleep(2)

        # Click first matching result
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.common.by import By
        wait = WebDriverWait(driver, 20)
        result = wait.until(EC.element_to_be_clickable(
            (By.XPATH, f'//span[@title="{group_name}"]')))
        result.click()
        time.sleep(1.5)

        # Find message box
        msg_box = find_first(driver, MSGBOX_XPATHS, timeout=20)
        if msg_box is None:
            status_cb(f"[{group_name}] Could not find message input box.")
            done_cb(False)
            return

        pyperclip.copy(message)
        msg_box.click()
        time.sleep(0.3)
        msg_box.send_keys(Keys.CONTROL, "v")
        time.sleep(0.5)
        msg_box.send_keys(Keys.ENTER)
        time.sleep(1.5)

        status_cb(f"✓ Sent to [{group_name}]")
        done_cb(True)

    except Exception as e:
        status_cb(f"✗ Failed [{group_name}]: {type(e).__name__}: {e}")
        done_cb(False)
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass


# ── Main Application ─────────────────────────────────────────────────────────

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("WhatsApp Schedule Sender")
        self.geometry("900x640")
        self.resizable(True, True)
        self.configure(bg="#f0f0f0")

        self.config_data = load_config()
        self.selected_group_idx = None

        # Day row widgets: {day: {"var": BooleanVar, "time": StringVar}}
        self.day_rows = {}

        self._build_ui()
        self._refresh_group_list()

    # ── UI builder ────────────────────────────────────────────────────────

    def _build_ui(self):
        # ── Top bar ──
        top = tk.Frame(self, bg="#075e54", pady=8)
        top.pack(fill="x")
        tk.Label(top, text="📅  WhatsApp Schedule Sender", font=("Segoe UI", 14, "bold"),
                 bg="#075e54", fg="white").pack()

        # ── Main content ──
        content = tk.Frame(self, bg="#f0f0f0")
        content.pack(fill="both", expand=True, padx=12, pady=8)

        # Left: group list
        left = tk.LabelFrame(content, text="Groups", bg="#f0f0f0",
                             font=("Segoe UI", 10, "bold"))
        left.pack(side="left", fill="y", padx=(0, 8))

        self.group_listbox = tk.Listbox(left, width=22, font=("Segoe UI", 10),
                                        selectbackground="#25d366", activestyle="none")
        self.group_listbox.pack(fill="both", expand=True, padx=6, pady=6)
        self.group_listbox.bind("<<ListboxSelect>>", self._on_select_group)

        btn_row = tk.Frame(left, bg="#f0f0f0")
        btn_row.pack(fill="x", padx=6, pady=(0, 6))
        tk.Button(btn_row, text="+ New", command=self._new_group,
                  bg="#25d366", fg="white", relief="flat",
                  font=("Segoe UI", 9, "bold")).pack(side="left", expand=True, fill="x", padx=(0, 2))
        tk.Button(btn_row, text="🗑 Delete", command=self._delete_group,
                  bg="#e74c3c", fg="white", relief="flat",
                  font=("Segoe UI", 9)).pack(side="left", expand=True, fill="x")

        # Right: editor
        right = tk.Frame(content, bg="#f0f0f0")
        right.pack(side="left", fill="both", expand=True)

        editor = tk.LabelFrame(right, text="Group Editor", bg="#f0f0f0",
                               font=("Segoe UI", 10, "bold"))
        editor.pack(fill="both", expand=True)

        # Group name
        name_row = tk.Frame(editor, bg="#f0f0f0")
        name_row.pack(fill="x", padx=10, pady=(10, 4))
        tk.Label(name_row, text="WhatsApp Group Name (exact):", bg="#f0f0f0",
                 font=("Segoe UI", 9)).pack(side="left")
        self.name_var = tk.StringVar()
        tk.Entry(name_row, textvariable=self.name_var, font=("Segoe UI", 10),
                 width=30).pack(side="left", padx=(8, 0))

        # Days schedule
        tk.Label(editor, text="Schedule (check days and enter time range, e.g.  12:00-1:30pm):",
                 bg="#f0f0f0", font=("Segoe UI", 9)).pack(anchor="w", padx=10, pady=(6, 2))

        days_frame = tk.Frame(editor, bg="#f0f0f0")
        days_frame.pack(fill="x", padx=14, pady=4)

        for day in DAYS:
            row = tk.Frame(days_frame, bg="#f0f0f0")
            row.pack(fill="x", pady=2)
            var = tk.BooleanVar()
            time_var = tk.StringVar()
            cb = tk.Checkbutton(row, text=day, variable=var, bg="#f0f0f0",
                                font=("Segoe UI", 9), width=10, anchor="w")
            cb.pack(side="left")
            entry = tk.Entry(row, textvariable=time_var, font=("Segoe UI", 9),
                             width=20, state="disabled")
            entry.pack(side="left", padx=(4, 0))

            # Enable/disable time entry based on checkbox
            def _toggle(e=entry, v=var):
                e.config(state="normal" if v.get() else "disabled")
            var.trace_add("write", lambda *a, e=entry, v=var: e.config(
                state="normal" if v.get() else "disabled"))

            self.day_rows[day] = {"var": var, "time": time_var}

        # Preview
        preview_frame = tk.LabelFrame(editor, text="Message Preview",
                                      bg="#f0f0f0", font=("Segoe UI", 9, "bold"))
        preview_frame.pack(fill="x", padx=10, pady=(8, 4))
        self.preview_text = tk.Text(preview_frame, height=7, font=("Courier New", 9),
                                    state="disabled", bg="#e8f5e9", relief="flat")
        self.preview_text.pack(fill="x", padx=6, pady=6)

        btn_row2 = tk.Frame(editor, bg="#f0f0f0")
        btn_row2.pack(fill="x", padx=10, pady=(0, 8))
        tk.Button(btn_row2, text="🔍 Preview Message", command=self._update_preview,
                  bg="#3498db", fg="white", relief="flat",
                  font=("Segoe UI", 9)).pack(side="left", padx=(0, 6))
        tk.Button(btn_row2, text="💾 Save Group", command=self._save_group,
                  bg="#075e54", fg="white", relief="flat",
                  font=("Segoe UI", 10, "bold"), padx=12).pack(side="left")

        # ── Bottom bar ──
        bottom = tk.Frame(self, bg="#f0f0f0")
        bottom.pack(fill="x", padx=12, pady=(0, 8))

        status_frame = tk.LabelFrame(bottom, text="Status Log", bg="#f0f0f0",
                                     font=("Segoe UI", 9, "bold"))
        status_frame.pack(fill="x", pady=(0, 6))
        self.status_box = tk.Text(status_frame, height=4, font=("Segoe UI", 9),
                                  state="disabled", bg="#1a1a2e", fg="#00ff88",
                                  relief="flat")
        self.status_box.pack(fill="x", padx=6, pady=4)

        self.release_btn = tk.Button(
            bottom, text="🚀  RELEASE SCHEDULES TO ALL GROUPS",
            command=self._release_all,
            bg="#25d366", fg="white", relief="flat",
            font=("Segoe UI", 12, "bold"), pady=10)
        self.release_btn.pack(fill="x")

    # ── Group list ────────────────────────────────────────────────────────

    def _refresh_group_list(self):
        self.group_listbox.delete(0, "end")
        for g in self.config_data["groups"]:
            self.group_listbox.insert("end", g["name"])

    def _on_select_group(self, event):
        sel = self.group_listbox.curselection()
        if not sel:
            return
        idx = sel[0]
        self.selected_group_idx = idx
        group = self.config_data["groups"][idx]
        self.name_var.set(group["name"])

        # Reset all days
        for day in DAYS:
            self.day_rows[day]["var"].set(False)
            self.day_rows[day]["time"].set("")

        for entry in group.get("schedule", []):
            day = entry["day"]
            if day in self.day_rows:
                self.day_rows[day]["var"].set(True)
                self.day_rows[day]["time"].set(entry["time"])

        self._update_preview()

    def _new_group(self):
        self.selected_group_idx = None
        self.name_var.set("")
        for day in DAYS:
            self.day_rows[day]["var"].set(False)
            self.day_rows[day]["time"].set("")
        self._clear_preview()

    def _delete_group(self):
        if self.selected_group_idx is None:
            messagebox.showwarning("No selection", "Select a group to delete.")
            return
        name = self.config_data["groups"][self.selected_group_idx]["name"]
        if messagebox.askyesno("Confirm", f"Delete group '{name}'?"):
            self.config_data["groups"].pop(self.selected_group_idx)
            save_config(self.config_data)
            self.selected_group_idx = None
            self._refresh_group_list()
            self._new_group()

    def _save_group(self):
        name = self.name_var.get().strip()
        if not name:
            messagebox.showwarning("Missing name", "Enter the WhatsApp group name.")
            return

        schedule = []
        for day in DAYS:
            if self.day_rows[day]["var"].get():
                t = self.day_rows[day]["time"].get().strip()
                if not t:
                    messagebox.showwarning("Missing time", f"Enter a time for {day}.")
                    return
                schedule.append({"day": day, "time": t})

        if not schedule:
            messagebox.showwarning("No days", "Check at least one day.")
            return

        group_data = {"name": name, "schedule": schedule}

        if self.selected_group_idx is not None:
            self.config_data["groups"][self.selected_group_idx] = group_data
        else:
            # Check for duplicate name
            names = [g["name"] for g in self.config_data["groups"]]
            if name in names:
                messagebox.showerror("Duplicate", f"A group named '{name}' already exists.")
                return
            self.config_data["groups"].append(group_data)
            self.selected_group_idx = len(self.config_data["groups"]) - 1

        save_config(self.config_data)
        self._refresh_group_list()
        self.group_listbox.selection_set(self.selected_group_idx)
        self._update_preview()
        self._log(f"💾 Group '{name}' saved.")

    # ── Preview ───────────────────────────────────────────────────────────

    def _get_current_schedule(self):
        schedule = []
        for day in DAYS:
            if self.day_rows[day]["var"].get():
                schedule.append({"day": day, "time": self.day_rows[day]["time"].get().strip()})
        return schedule

    def _update_preview(self):
        schedule = self._get_current_schedule()
        msg = format_message(schedule) if schedule else "(no days selected)"
        self.preview_text.config(state="normal")
        self.preview_text.delete("1.0", "end")
        self.preview_text.insert("end", msg)
        self.preview_text.config(state="disabled")

    def _clear_preview(self):
        self.preview_text.config(state="normal")
        self.preview_text.delete("1.0", "end")
        self.preview_text.config(state="disabled")

    # ── Status log ────────────────────────────────────────────────────────

    def _log(self, msg):
        def _do():
            self.status_box.config(state="normal")
            self.status_box.insert("end", msg + "\n")
            self.status_box.see("end")
            self.status_box.config(state="disabled")
        self.after(0, _do)

    # ── Release ───────────────────────────────────────────────────────────

    def _release_all(self):
        groups = self.config_data.get("groups", [])
        if not groups:
            messagebox.showwarning("No groups", "Add at least one group first.")
            return

        if not messagebox.askyesno("Confirm Release",
                f"Send schedules to {len(groups)} group(s)?\n\n" +
                "\n".join(f"• {g['name']}" for g in groups)):
            return

        self.release_btn.config(state="disabled", text="Sending…")
        self._log(f"── Starting release to {len(groups)} group(s) ──")

        def worker():
            total = len(groups)
            ok = 0
            for i, group in enumerate(groups):
                msg = format_message(group["schedule"])
                result = {"success": False}

                done_event = threading.Event()

                def done_cb(success, _r=result, _e=done_event):
                    _r["success"] = success
                    _e.set()

                t = threading.Thread(target=send_to_group,
                                     args=(group["name"], msg, self._log, done_cb),
                                     daemon=True)
                t.start()
                done_event.wait()
                if result["success"]:
                    ok += 1

            self._log(f"── Done: {ok}/{total} sent successfully ──")
            self.after(0, lambda: self.release_btn.config(
                state="normal", text="🚀  RELEASE SCHEDULES TO ALL GROUPS"))

        threading.Thread(target=worker, daemon=True).start()


if __name__ == "__main__":
    app = App()
    app.mainloop()
