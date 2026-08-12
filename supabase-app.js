(() => {
  const config = window.AIRCHECK_SUPABASE_CONFIG;
  const isConfigured = config
    && config.url?.startsWith("https://")
    && !config.url.includes("PASTE_")
    && config.publishableKey
    && !config.publishableKey.includes("PASTE_");

  if (!isConfigured || !window.supabase) {
    console.warn("Supabase is not configured. Add the project URL and publishable key to supabase-config.js.");
    return;
  }

  const db = window.supabase.createClient(config.url, config.publishableKey);
  const elements = {
    form: document.querySelector("#ticketForm"),
    input: document.querySelector("#ticketNumber"),
    result: document.querySelector("#result"),
    image: document.querySelector("#ticketImage"),
    ticketModal: document.querySelector("#ticketModal"),
    title: document.querySelector("#ticket-title"),
    loginForm: document.querySelector("#loginForm"),
    loginName: document.querySelector("#loginName"),
    loginPassword: document.querySelector("#loginPassword"),
    loginMessage: document.querySelector("#loginMessage"),
    registerForm: document.querySelector("#registerForm"),
    registerName: document.querySelector("#registerName"),
    registerPassword: document.querySelector("#registerPassword"),
    registerMessage: document.querySelector("#registerMessage"),
    addForm: document.querySelector("#addTicketForm"),
    addNumber: document.querySelector("#newTicketNumber"),
    addImage: document.querySelector("#newTicketImage"),
    addMessage: document.querySelector("#addTicketMessage"),
    login: document.querySelector("#loginButton"),
    register: document.querySelector("#registerButton"),
    add: document.querySelector("#addTicketButton"),
    logout: document.querySelector("#logoutButton"),
    status: document.querySelector("#adminStatus"),
    loginModal: document.querySelector("#loginModal"),
    registerModal: document.querySelector("#registerModal"),
    addModal: document.querySelector("#addTicketModal")
  };
  let activeUser = null;
  let admin = false;

  function authEmail(value) {
    const login = value.trim().toLowerCase();
    return login.includes("@") ? login : `${login}@aircheck.local`;
  }

  function ticketNumber(value) {
    return value.trim().replace(/\s+/g, "");
  }

  function close(modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }

  function setMessage(element, message, success = false) {
    element.textContent = message;
    element.className = success ? "form-message success" : "form-message";
  }

  async function refreshUser() {
    const { data: { user } } = await db.auth.getUser();
    activeUser = user;
    admin = false;
    let username = "";
    if (user) {
      const { data } = await db.from("profiles").select("username, is_admin").eq("id", user.id).maybeSingle();
      admin = Boolean(data?.is_admin);
      username = data?.username || user.user_metadata?.username || "пользователь";
    }
    elements.login.hidden = Boolean(user);
    elements.register.hidden = Boolean(user);
    elements.add.hidden = !admin;
    elements.logout.hidden = !user;
    elements.status.hidden = !user;
    if (user) elements.status.textContent = admin ? "Вы вошли как администратор" : `Вы вошли как пользователь: ${username}`;
  }

  async function showTicket(number) {
    const { data: ticket, error } = await db.from("tickets").select("ticket_number, image_path").eq("ticket_number", number).maybeSingle();
    if (error || !ticket) {
      elements.result.className = "result missing is-visible";
      elements.result.innerHTML = "<strong>Билет не найден</strong><p>Такой номер отсутствует в системе.</p>";
      return;
    }
    const { data: signed, error: signedError } = await db.storage.from("ticket-images").createSignedUrl(ticket.image_path, 3600);
    if (signedError) {
      elements.result.className = "result missing is-visible";
      elements.result.innerHTML = "<strong>Билет найден</strong><p>Не удалось открыть фотографию билета.</p>";
      return;
    }
    elements.result.className = "result found is-visible";
    elements.result.innerHTML = `<strong>Билет найден</strong><p>Номер ${number} есть в системе.</p>`;
    elements.title.textContent = `Билет найден: ${number}`;
    elements.image.src = signed.signedUrl;
    elements.ticketModal.classList.add("is-open");
    elements.ticketModal.setAttribute("aria-hidden", "false");
  }

  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (![elements.form, elements.loginForm, elements.registerForm, elements.addForm].includes(form)) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    if (form === elements.form) {
      const number = ticketNumber(elements.input.value);
      if (!/^\d{6,20}$/.test(number)) {
        elements.result.className = "result missing is-visible";
        elements.result.innerHTML = "<strong>Билет не найден</strong><p>Введите номер из 6–20 цифр.</p>";
        return;
      }
      await showTicket(number);
      return;
    }

    if (form === elements.loginForm) {
      const { error } = await db.auth.signInWithPassword({ email: authEmail(elements.loginName.value), password: elements.loginPassword.value });
      if (error) {
        setMessage(elements.loginMessage, "Неверный логин или пароль.");
        return;
      }
      close(elements.loginModal);
      await refreshUser();
      return;
    }

    if (form === elements.registerForm) {
      const username = elements.registerName.value.trim();
      if (!/^[a-zA-Zа-яА-ЯёЁ0-9_-]{3,30}$/.test(username)) {
        setMessage(elements.registerMessage, "Логин: от 3 до 30 букв, цифр, дефиса или подчёркивания.");
        return;
      }
      const { data, error } = await db.auth.signUp({
        email: authEmail(username),
        password: elements.registerPassword.value,
        options: { data: { username } }
      });
      if (error) {
        setMessage(elements.registerMessage, error.message);
        return;
      }
      if (!data.session) {
        setMessage(elements.registerMessage, "Учётная запись создана. Подтвердите регистрацию, затем войдите.", true);
        return;
      }
      close(elements.registerModal);
      await refreshUser();
      return;
    }

    if (!admin || !activeUser) {
      setMessage(elements.addMessage, "Войдите как администратор.");
      return;
    }
    const number = ticketNumber(elements.addNumber.value);
    const file = elements.addImage.files[0];
    if (!/^\d{6,20}$/.test(number) || !file) {
      setMessage(elements.addMessage, "Укажите номер из 6–20 цифр и выберите фотографию.");
      return;
    }
    if (file.size > 3 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage(elements.addMessage, "Выберите JPG, PNG или WebP размером до 3 МБ.");
      return;
    }
    setMessage(elements.addMessage, "Загрузка билета…");
    const extension = file.name.split(".").pop().toLowerCase();
    const path = `${number}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await db.storage.from("ticket-images").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setMessage(elements.addMessage, "Не удалось загрузить фотографию.");
      return;
    }
    const { error: insertError } = await db.from("tickets").insert({ ticket_number: number, image_path: path, created_by: activeUser.id });
    if (insertError) {
      await db.storage.from("ticket-images").remove([path]);
      setMessage(elements.addMessage, insertError.code === "23505" ? "Билет с таким номером уже существует." : "Не удалось сохранить билет.");
      return;
    }
    elements.addForm.reset();
    setMessage(elements.addMessage, "Билет добавлен и доступен на всех устройствах.", true);
  }, true);

  document.addEventListener("click", async (event) => {
    if (event.target.closest("#logoutButton")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      await db.auth.signOut();
      [elements.addModal, elements.loginModal, elements.registerModal].forEach(close);
      await refreshUser();
    }
  }, true);

  db.auth.onAuthStateChange(() => refreshUser());
  refreshUser();
})();
