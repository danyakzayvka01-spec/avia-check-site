import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const config = window.AIRCHECK_FIREBASE_CONFIG;
if (!config?.projectId) throw new Error("Firebase configuration is missing.");

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);
const ADMIN_EMAIL = "trust@aircheck.local";
const MAX_DATA_URL_LENGTH = 650000;
const elements = {
  form: document.querySelector("#ticketForm"), input: document.querySelector("#ticketNumber"), result: document.querySelector("#result"),
  image: document.querySelector("#ticketImage"), ticketModal: document.querySelector("#ticketModal"), title: document.querySelector("#ticket-title"),
  loginForm: document.querySelector("#loginForm"), loginName: document.querySelector("#loginName"), loginPassword: document.querySelector("#loginPassword"), loginMessage: document.querySelector("#loginMessage"), loginModal: document.querySelector("#loginModal"),
  registerForm: document.querySelector("#registerForm"), registerName: document.querySelector("#registerName"), registerPassword: document.querySelector("#registerPassword"), registerMessage: document.querySelector("#registerMessage"), registerModal: document.querySelector("#registerModal"),
  addForm: document.querySelector("#addTicketForm"), addNumber: document.querySelector("#newTicketNumber"), addImage: document.querySelector("#newTicketImage"), addMessage: document.querySelector("#addTicketMessage"), addModal: document.querySelector("#addTicketModal"),
  ticketListButton: document.querySelector("#ticketListButton"), ticketListModal: document.querySelector("#ticketListModal"), ticketList: document.querySelector("#ticketList"), ticketListMessage: document.querySelector("#ticketListMessage"),
  login: document.querySelector("#loginButton"), register: document.querySelector("#registerButton"), add: document.querySelector("#addTicketButton"), logout: document.querySelector("#logoutButton"), status: document.querySelector("#adminStatus")
};

let currentUser = null;
const isAdmin = () => currentUser?.email === ADMIN_EMAIL;
const emailFromLogin = value => {
  const login = value.trim().toLowerCase();
  return login.includes("@") ? login : `${login}@aircheck.local`;
};
const normalizeNumber = value => value.trim().replace(/\s+/g, "");
const closeModal = modal => { modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true"); };
const setMessage = (element, text, success = false) => { element.textContent = text; element.className = success ? "form-message success" : "form-message"; };
const isTicketNumber = value => /^\d{6,20}$/.test(value);

function updateControls() {
  const signedIn = Boolean(currentUser);
  elements.login.hidden = signedIn;
  elements.register.hidden = signedIn;
  elements.add.hidden = !isAdmin();
  elements.ticketListButton.hidden = !isAdmin();
  elements.logout.hidden = !signedIn;
  elements.status.hidden = !signedIn;
  if (signedIn) elements.status.textContent = isAdmin() ? "Вы вошли как администратор" : "Вы вошли как пользователь";
}

function renderMissing(message) {
  elements.result.className = "result missing is-visible";
  elements.result.innerHTML = `<strong>Билет не найден</strong><p>${message}</p>`;
}

async function findTicket(number) {
  const snapshot = await getDoc(doc(db, "tickets", number));
  if (!snapshot.exists()) { renderMissing("Такой номер отсутствует в системе."); return; }
  const ticket = snapshot.data();
  elements.result.className = "result found is-visible";
  elements.result.innerHTML = `<strong>Билет найден</strong><p>Номер ${number} есть в системе.</p>`;
  elements.title.textContent = `Билет найден: ${number}`;
  elements.image.src = ticket.imageDataUrl;
  elements.ticketModal.classList.add("is-open");
  elements.ticketModal.setAttribute("aria-hidden", "false");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function openTicketImage(number, imageDataUrl) {
  closeModal(elements.ticketListModal);
  elements.title.textContent = `Билет найден: ${number}`;
  elements.image.src = imageDataUrl;
  elements.ticketModal.classList.add("is-open");
  elements.ticketModal.setAttribute("aria-hidden", "false");
}

async function loadTicketList() {
  if (!isAdmin()) return;
  setMessage(elements.ticketListMessage, "Загружаю список билетов…");
  elements.ticketList.innerHTML = "";
  elements.ticketListModal.classList.add("is-open");
  elements.ticketListModal.setAttribute("aria-hidden", "false");
  try {
    const snapshot = await getDocs(collection(db, "tickets"));
    const tickets = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((first, second) => first.id.localeCompare(second.id, undefined, { numeric: true }));
    if (!tickets.length) {
      setMessage(elements.ticketListMessage, "В базе пока нет билетов.");
      return;
    }
    setMessage(elements.ticketListMessage, `Всего билетов: ${tickets.length}`, true);
    elements.ticketList.innerHTML = tickets.map(ticket => `
      <article class="ticket-list-item" data-ticket-number="${escapeHtml(ticket.id)}">
        <img src="${ticket.imageDataUrl}" alt="Фотография билета ${escapeHtml(ticket.id)}">
        <div><div class="ticket-list-number">Билет № ${escapeHtml(ticket.id)}</div></div>
        <div class="ticket-list-actions">
          <button type="button" data-action="view">Открыть фото</button>
          <button type="button" data-action="edit">Изменить номер</button>
          <button class="delete-ticket-button" type="button" data-action="delete">Удалить</button>
        </div>
      </article>`).join("");
  } catch (error) {
    setMessage(elements.ticketListMessage, error.code === "permission-denied" ? "Нет доступа. Опубликуйте обновлённые правила Firestore." : "Не удалось загрузить список билетов.");
  }
}

async function manageTicket(action, ticketNumber) {
  if (!isAdmin()) return;
  const ticketRef = doc(db, "tickets", ticketNumber);
  const ticketSnapshot = await getDoc(ticketRef);
  if (!ticketSnapshot.exists()) { await loadTicketList(); return; }
  const ticket = ticketSnapshot.data();
  if (action === "view") { openTicketImage(ticketNumber, ticket.imageDataUrl); return; }
  if (action === "delete") {
    if (!window.confirm(`Удалить билет № ${ticketNumber}?`)) return;
    await deleteDoc(ticketRef);
    await loadTicketList();
    return;
  }
  const nextNumber = normalizeNumber(window.prompt("Введите новый номер билета:", ticketNumber) || "");
  if (!nextNumber || nextNumber === ticketNumber) return;
  if (!isTicketNumber(nextNumber)) { window.alert("Номер билета должен содержать от 6 до 20 цифр."); return; }
  const nextRef = doc(db, "tickets", nextNumber);
  if ((await getDoc(nextRef)).exists()) { window.alert("Билет с таким номером уже существует."); return; }
  const batch = writeBatch(db);
  batch.set(nextRef, { ticketNumber: nextNumber, imageDataUrl: ticket.imageDataUrl, createdAt: ticket.createdAt || serverTimestamp() });
  batch.delete(ticketRef);
  await batch.commit();
  await loadTicketList();
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать изображение."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Файл не является корректным изображением."));
      image.onload = () => {
        const canvas = document.createElement("canvas");
        let scale = Math.min(1, 1200 / Math.max(image.width, image.height));
        const render = quality => {
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/jpeg", quality);
        };
        let result = render(0.8);
        for (let attempts = 0; result.length > MAX_DATA_URL_LENGTH && attempts < 5; attempts += 1) {
          scale *= 0.75;
          result = render(0.7);
        }
        if (result.length > MAX_DATA_URL_LENGTH) { reject(new Error("Фотография слишком большая. Выберите более компактное изображение.")); return; }
        resolve(result);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

document.addEventListener("submit", async event => {
  const form = event.target;
  if (![elements.form, elements.loginForm, elements.registerForm, elements.addForm].includes(form)) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  try {
    if (form === elements.form) {
      const number = normalizeNumber(elements.input.value);
      if (!isTicketNumber(number)) { renderMissing("Введите номер из 6–20 цифр."); return; }
      await findTicket(number);
      return;
    }
    if (form === elements.loginForm) {
      await signInWithEmailAndPassword(auth, emailFromLogin(elements.loginName.value), elements.loginPassword.value);
      closeModal(elements.loginModal);
      return;
    }
    if (form === elements.registerForm) {
      const username = elements.registerName.value.trim();
      if (!/^[a-zA-Zа-яА-ЯёЁ0-9_-]{3,30}$/.test(username)) { setMessage(elements.registerMessage, "Логин: от 3 до 30 букв, цифр, дефиса или подчёркивания."); return; }
      if (elements.registerPassword.value.length < 6) { setMessage(elements.registerMessage, "Пароль должен содержать не менее 6 символов."); return; }
      await createUserWithEmailAndPassword(auth, emailFromLogin(username), elements.registerPassword.value);
      closeModal(elements.registerModal);
      return;
    }
    if (!isAdmin()) { setMessage(elements.addMessage, "Войдите как администратор."); return; }
    const number = normalizeNumber(elements.addNumber.value);
    const file = elements.addImage.files[0];
    if (!isTicketNumber(number) || !file) { setMessage(elements.addMessage, "Укажите номер из 6–20 цифр и выберите фотографию."); return; }
    if (!file.type.startsWith("image/")) { setMessage(elements.addMessage, "Выберите файл изображения."); return; }
    setMessage(elements.addMessage, "Сжимаю и сохраняю билет…");
    const imageDataUrl = await compressImage(file);
    await setDoc(doc(db, "tickets", number), { ticketNumber: number, imageDataUrl, createdAt: serverTimestamp() });
    elements.addForm.reset();
    setMessage(elements.addMessage, "Билет добавлен и доступен на всех устройствах.", true);
  } catch (error) {
    const message = error.code === "auth/email-already-in-use" ? "Такой логин уже занят."
      : error.code === "auth/invalid-credential" ? "Неверный логин или пароль."
      : error.code === "permission-denied" ? "Нет прав на это действие. Проверьте правила Firestore."
      : error.message || "Не удалось выполнить действие.";
    const output = form === elements.loginForm ? elements.loginMessage : form === elements.registerForm ? elements.registerMessage : form === elements.addForm ? elements.addMessage : null;
    if (output) setMessage(output, message); else renderMissing(message);
  }
}, true);

document.addEventListener("click", async event => {
  if (event.target.closest("#ticketListButton")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await loadTicketList();
    return;
  }
  const ticketAction = event.target.closest("[data-action]");
  if (ticketAction) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const item = ticketAction.closest("[data-ticket-number]");
    try {
      await manageTicket(ticketAction.dataset.action, item.dataset.ticketNumber);
    } catch (error) {
      setMessage(elements.ticketListMessage, error.code === "permission-denied" ? "Нет прав на это действие. Обновите правила Firestore." : "Не удалось изменить билет.");
    }
    return;
  }
  if (!event.target.closest("#logoutButton")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await signOut(auth);
  [elements.addModal, elements.loginModal, elements.registerModal, elements.ticketListModal].forEach(closeModal);
}, true);

elements.ticketListModal.addEventListener("click", event => {
  if (event.target === elements.ticketListModal) closeModal(elements.ticketListModal);
});

onAuthStateChanged(auth, user => { currentUser = user; updateControls(); });
