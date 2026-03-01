const firebaseConfig = {
    apiKey: "AIzaSyD_K-A6a0x6iRVPTdArVVBauLvMfhKCilM",
    authDomain: "wbpvz-d22a9.firebaseapp.com",
    databaseURL: "https://wbpvz-d22a9-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "wbpvz-d22a9",
    storageBucket: "wbpvz-d22a9.appspot.com",
    messagingSenderId: "226300786281",
    appId: "1:226300786281:web:5895daad84bfcb6b38d4f8"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const database = firebase.database();

let localUserCache = null;

auth.onAuthStateChanged(user => {
    const isAuthPage = window.location.pathname.includes('login.html') || window.location.pathname.includes('register.html');
    if (user) {
        // ОЧЕНЬ ВАЖНО: Всегда запрашиваем Менеджера!
        const hasPvz = sessionStorage.getItem('currentPvzId');
        const hasManager = sessionStorage.getItem('currentManager');
        if (!hasPvz || !hasManager) {
            if (!isAuthPage) window.location.href = 'login.html';
        } else {
            if (isAuthPage) window.location.href = 'index.html';
            else initializeApp(user.uid);
        }
    } else {
        if (!isAuthPage) {
            window.location.href = 'login.html';
        }
    }
});

async function initializeApp(uid) {
    try {
        const cachedData = sessionStorage.getItem('userCache_' + uid);
        if (cachedData) {
            localUserCache = JSON.parse(cachedData);
            console.log("Данные успешно загружены из кеша сессии.");
            cleanupOldHistory(uid); 
        } else {
            await syncDataFromFirebase(uid);
        }
        runAppLogic();
    } catch (error) {
        console.error("Критическая ошибка при инициализации:", error);
    } 
}

async function syncDataFromFirebase(uid) {
    if (!uid) throw new Error("UID пользователя не найден для синхронизации.");
    const userRef = database.ref('users/' + uid);
    const snapshot = await userRef.once('value');
    if (snapshot.exists()) {
        localUserCache = snapshot.val();
        sessionStorage.setItem('userCache_' + uid, JSON.stringify(localUserCache));
        console.log('Данные успешно синхронизированы из Firebase и сохранены в кеш сессии.');
        cleanupOldHistory(uid);
    } else {
        console.error('Критическая ошибка: нет данных в Firebase для пользователя ' + uid);
        alert("Ошибка данных аккаунта. Пожалуйста, перезайдите.");
        auth.signOut();
    }
}

async function syncDataToFirebase(uid, userObject) {
    if (!uid || !userObject) return;
    try {
        await database.ref('users/' + uid).set(userObject);
        sessionStorage.setItem('userCache_' + uid, JSON.stringify(userObject));
        console.log('Данные сохранены в Firebase и кеш сессии обновлен.');
        updateAllBadges();
    } catch (error) {
        console.error("Ошибка при сохранении данных в Firebase:", error);
        showAlert("Не удалось сохранить данные на сервере. Проверьте соединение.", true);
    }
}

function cleanupOldHistory(uid) {
    if (!localUserCache || !localUserCache.data || !localUserCache.data.issuedHistory) return;
    const history = localUserCache.data.issuedHistory;
    const now = Date.now();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const cleanHistory = history.filter(entry => {
        const entryDate = new Date(entry.date).getTime();
        return (now - entryDate) < fourteenDaysMs;
    });

    if (cleanHistory.length !== history.length) {
        console.log(`Автоматически удалено ${history.length - cleanHistory.length} старых записей истории.`);
        localUserCache.data.issuedHistory = cleanHistory;
        syncDataToFirebase(uid, localUserCache);
    }
}

function getUserData() {
    if (!localUserCache) return {};
    if (typeof localUserCache.data === 'undefined') localUserCache.data = {};
    return localUserCache.data;
}

function saveUserData(dataObject) {
    const uid = auth.currentUser ? auth.currentUser.uid : null;
    if (!uid || !localUserCache) return;
    localUserCache.data = dataObject;
    syncDataToFirebase(uid, localUserCache);
}

function runAppLogic() {
    populateSharedElements();
    attachSharedEventListeners();
    updateAllBadges();

    if (typeof initWebSocket === 'function') initWebSocket();
    const path = window.location.pathname;
    
    if ((path.endsWith('/') || path.includes('index.html')) && typeof initIndexPage === 'function') initIndexPage();
    else if (path.includes('p.html') && typeof initPriemkaTovaryPage === 'function') initPriemkaTovaryPage();
    else if (path.includes('returns.html') && typeof initVozvratTovaryPage === 'function') initVozvratTovaryPage();
    else if (path.includes('r2.html') && typeof initVozvratKorobkiPage === 'function') initVozvratKorobkiPage();
    else if (path.includes('r3.html') && typeof initVozvratKartonPage === 'function') initVozvratKartonPage();
    else if (path.includes('r4.html') && typeof initVozvratUtilPage === 'function') initVozvratUtilPage();
    else if (path.includes('fines.html') && typeof initFinesPage === 'function') initFinesPage();
    else if (path.includes('rating.html') && typeof initRatingPage === 'function') initRatingPage();
    else if (path.includes('box_stats.html') && typeof initBoxStatsPage === 'function') initBoxStatsPage();
    else if (path.includes('p2.html') && typeof initPriemkaSmenaYacheykiPage === 'function') initPriemkaSmenaYacheykiPage();
    else if (path.includes('p3.html') && typeof initPriemkaPovtornayaPage === 'function') initPriemkaPovtornayaPage();
}

function populateSharedElements() {
    const currentUserInfo = localUserCache ? localUserCache.pvzInfo : {};
    const currentPvzId = sessionStorage.getItem('currentPvzId');
    const currentRole = sessionStorage.getItem('currentManagerRole') || 'employee';
    
    let activePvz = {};
    if (currentUserInfo) {
        if (Array.isArray(currentUserInfo)) {
            activePvz = currentUserInfo.find(p => p.pvzId === currentPvzId) || currentUserInfo[0] || {};
        } else if (currentUserInfo.pvzId) {
            activePvz = currentUserInfo;
        } else {
            const pvzArray = Object.values(currentUserInfo);
            activePvz = pvzArray.find(p => p.pvzId === currentPvzId) || pvzArray[0] || {};
        }
    }

    const userPvzId = activePvz.pvzId || '?????????';
    const userAddress = activePvz.address || 'Адрес не указан';
    const userEmployeeId = sessionStorage.getItem('currentManagerId') || activePvz.employeeId || '??????';
    const currentManager = sessionStorage.getItem('currentManager') || 'Сотрудник';
    const userEmail = activePvz.email || (localUserCache && localUserCache.email ? localUserCache.email : 'N/A');
    const userPhone = activePvz.phone || (localUserCache && localUserCache.phone ? localUserCache.phone : 'N/A');

    document.querySelectorAll('.sidebar-version').forEach(div => {
        if(div) div.innerHTML = `ID ${userPvzId}<br>v1.0.90`;
    });

    const helpMenu = document.getElementById('help-menu');
    if (helpMenu) {
        helpMenu.innerHTML = `
        <div class="help-menu-content">
            <div class="help-header">
                <h2>Меню</h2>
                <button class="icon-btn" id="close-help-btn">&times;</button>
            </div>
            <div class="pvz-info">
                <p><strong>ID ПВЗ:</strong> ${userPvzId}</p>
                <p><strong>Адрес:</strong> ${userAddress}</p>
                <p><strong>Менеджер:</strong> ${currentManager} (ID: ${userEmployeeId})</p>
            </div>
            <hr class="menu-divider">
            <button class="menu-button" id="search-by-code-btn-menu">
                <img src="search_loupe.svg" class="menu-icon-svg" alt="Поиск">Поиск по ШК
            </button>
            ${currentRole === 'owner' ? `
            <button class="menu-button" id="manage-employees-btn">
                <i class="fas fa-users" style="margin-right:8px; width:20px; text-align:center;"></i>Управление сотрудниками
            </button>` : ''}
            <button class="menu-button" id="education-portal-btn">
                <img src="education.svg" class="menu-icon-svg" alt="">Портал обучения
            </button>
            <button class="menu-button" id="leave-feedback-btn">
                <img src="star-empty.svg" class="menu-icon-svg" alt="">Оставить отзыв
            </button>
            <hr class="menu-divider">
            <div class="accordion">
                <div class="accordion-item">
                    <button class="accordion-header">
                        <img src="onboarding.svg" class="menu-icon-svg" alt="">
                        <span>Как работать с программой</span>
                        <i class="fas fa-chevron-down accordion-arrow"></i>
                    </button>
                    <div class="accordion-content">
                        <button class="menu-button" data-help-topic="issue"><i class="fas fa-truck"></i>Выдача</button>
                        <button class="menu-button" data-help-topic="reception"><i class="fas fa-dolly"></i>Приёмка</button>
                        <button class="menu-button" data-help-topic="returns"><i class="fas fa-undo"></i>Возвраты</button>
                    </div>
                </div>
                <div class="accordion-item">
                    <button class="accordion-header">
                        <img src="set.svg" class="menu-icon-svg" alt="">
                        <span>Настройки</span>
                        <i class="fas fa-chevron-down accordion-arrow"></i>
                    </button>
                    <div class="accordion-content">
                        <button class="menu-button" id="connect-scanner-btn"><i class="fas fa-barcode"></i>Сканер</button>
                        <button class="menu-button" id="account-details-btn"><i class="fas fa-user-circle"></i>Аккаунт</button>
                        <div class="voice-settings">
                            <div class="voice-setting-row">
                                <label for="voice-speed-slider">Скорость:</label>
                                <input type="range" id="voice-speed-slider" min="0.5" max="2" step="0.1" value="1.3">
                                <span id="voice-speed-value">1.3</span>
                            </div>
                            <button id="save-voice-settings-btn" class="secondary-btn">Сохранить</button>
                        </div>
                    </div>
                </div>
                <div class="accordion-item">
                    <button class="accordion-header">
                        <img src="like.svg" class="menu-icon-svg" alt="">
                        <span>Полезные ссылки</span>
                        <i class="fas fa-chevron-down accordion-arrow"></i>
                    </button>
                    <div class="accordion-content">
                        <button class="menu-button" id="main-page-link-btn">Главная страница</button>
                    </div>
                </div>
                <div class="accordion-item">
                    <button class="accordion-header">
                        <img src="dots-menu.svg" class="menu-icon-svg" alt="">
                        <span>Доп. функционал</span>
                        <i class="fas fa-chevron-down accordion-arrow"></i>
                    </button>
                    <div class="accordion-content">
                        <button class="menu-button" onclick="location.href='rating.html'"><i class="fas fa-star"></i>Отзывы о ПВЗ</button>
                        <button class="menu-button" onclick="location.href='box_stats.html'"><i class="fas fa-boxes"></i>Статистика по коробкам</button>
                        <button class="menu-button" onclick="location.href='fines.html'"><i class="fas fa-file-invoice-dollar"></i>Штрафы</button>
                    </div>
                </div>
            </div>
            <button class="menu-button" id="exit-btn">
                <img src="log-out.svg" class="menu-icon-svg" alt=""> Выйти
            </button>
        </div>`;
    }

    if (currentRole === 'owner' && !document.getElementById('employee-management-modal')) {
        const empModal = document.createElement('div');
        empModal.id = 'employee-management-modal';
        empModal.className = 'fullscreen-modal';
        empModal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <button class="close-modal-btn">&times;</button>
            <h2>Управление сотрудниками</h2>
            <button class="primary-btn full-width-btn" id="add-employee-trigger" style="margin-bottom: 15px;"><i class="fas fa-user-plus"></i> Добавить сотрудника</button>
            <div id="employee-list-container" class="employee-list"></div>
        </div>`;
        document.body.appendChild(empModal);

        // КРАСИВЫЙ РЕДАКТОР СОТРУДНИКА
        const empFormModal = document.createElement('div');
        empFormModal.id = 'employee-form-modal';
        empFormModal.className = 'fullscreen-modal';
        empFormModal.innerHTML = `
        <div class="modal-content" style="max-width: 500px; text-align: left;">
            <button class="close-modal-btn">&times;</button>
            <h2 id="emp-form-title" style="margin-bottom: 20px;">Добавить сотрудника</h2>
            <input type="hidden" id="emp-edit-id">
            
            <div class="input-group">
                <div class="phone-input-wrapper"><input type="text" id="emp-last-name" placeholder="Фамилия" required></div>
            </div>
            <div class="input-group">
                <div class="phone-input-wrapper"><input type="text" id="emp-first-name" placeholder="Имя" required></div>
            </div>
            <div class="input-group">
                <div class="phone-input-wrapper"><input type="text" id="emp-patronymic" placeholder="Отчество"></div>
            </div>
            <div class="input-group">
                <label>Дата рождения</label>
                <div class="phone-input-wrapper"><input type="date" id="emp-dob" required></div>
            </div>
            
            <hr style="margin: 20px 0; border: none; border-top: 1px solid var(--border-color);">
            
            <h3 style="margin-bottom: 15px;">Контактные данные</h3>
            <div class="input-group">
                <div class="phone-input-wrapper"><input type="tel" id="emp-phone" placeholder="Телефон" required></div>
            </div>
            <div class="input-group">
                <div class="phone-input-wrapper"><input type="email" id="emp-email" placeholder="E-mail"></div>
            </div>
            
            <div class="input-group">
                <label>Кем является:</label>
                <div class="custom-form-select" id="emp-role-wrapper">
                    <span class="selected-val" id="emp-role-selected-text">Менеджер</span>
                    <i class="fas fa-chevron-down"></i>
                    <ul class="custom-select-dropdown" id="emp-role-dropdown">
                        <li data-value="employee">Менеджер</li>
                        <li data-value="owner">Собственник ПВЗ</li>
                    </ul>
                </div>
                <input type="hidden" id="emp-role" value="employee">
            </div>
            
            <button class="primary-btn full-width-btn" id="save-employee-btn" style="margin-top: 10px;">Сохранить</button>
        </div>`;
        document.body.appendChild(empFormModal);
        
        setupCustomRoleSelector();
    }

    if (!document.getElementById('logout-choice-modal')) {
        const logoutModal = document.createElement('div');
        logoutModal.id = 'logout-choice-modal';
        logoutModal.className = 'fullscreen-modal';
        logoutModal.innerHTML = `
        <div class="modal-content">
            <button class="close-modal-btn">&times;</button>
            <h2>Выход</h2>
            <p>Вы хотите сменить сотрудника или выйти из аккаунта полностью?</p>
            <div class="modal-buttons-container">
                <button class="primary-btn" id="change-employee-btn">Сменить сотрудника</button>
                <button class="secondary-btn" id="full-logout-btn" style="color: var(--error); border-color: var(--error);">Выйти полностью</button>
            </div>
        </div>`;
        document.body.appendChild(logoutModal);
    }

    // КАСТОМНАЯ МОДАЛКА УДАЛЕНИЯ СОТРУДНИКА
    if (!document.getElementById('confirm-delete-modal')) {
        const delModal = document.createElement('div');
        delModal.id = 'confirm-delete-modal';
        delModal.className = 'fullscreen-modal';
        delModal.innerHTML = `
        <div class="modal-content">
            <h2>Удаление сотрудника</h2>
            <p>Вы уверены, что хотите удалить этого сотрудника? Действие нельзя отменить.</p>
            <div class="modal-buttons-container">
                <button class="secondary-btn" id="cancel-delete-btn">Отмена</button>
                <button class="primary-btn" id="confirm-delete-action-btn" style="background: var(--error);">Да, удалить</button>
            </div>
        </div>`;
        document.body.appendChild(delModal);
    }

    const searchModal = document.getElementById('search-modal');
    if(searchModal) {
        searchModal.innerHTML = `<div class="modal-content search-modal-content" style="max-width: 700px;"><button class="close-modal-btn">&times;</button><h3>Поиск товара по коду</h3><div class="input-group" style="display: flex; gap: 10px;"><input type="text" id="search-item-code" placeholder="Введите 9 цифр кода товара" maxlength="9" inputmode="numeric" style="flex: 1;"><button id="execute-search-btn" class="primary-btn"><i class="fas fa-search"></i></button></div><div id="search-result-container"></div></div>`;
    }

    const qrModal = document.getElementById('qr-code-modal');
    if(qrModal) {
        qrModal.innerHTML = `<div class="modal-content"><button class="close-modal-btn">&times;</button><h2>QR-код пункта выдачи</h2><img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=PVZ_ID_${userPvzId}" alt="QR Code"><p>ID ПВЗ: ${userPvzId}</p></div>`;
    }

    const accountModal = document.getElementById('account-modal');
     if (accountModal) {
        accountModal.innerHTML = `<div class="modal-content" style="text-align: left;"><button class="close-modal-btn">&times;</button><h2><i class="fas fa-user-circle"></i> Данные аккаунта</h2><div class="pvz-info" style="padding: 0; background: none; border: none;"><p><strong>ID ПВЗ:</strong> ${userPvzId}</p><p><strong>Адрес:</strong> ${userAddress}</p><p><strong>ID Сотрудника:</strong> ${userEmployeeId}</p><p><strong>Текущий Менеджер:</strong> ${currentManager}</p><p><strong>Логин (Телефон):</strong> ${userPhone}</p><p><strong>Email:</strong> ${userEmail}</p></div></div>`;
    }
    
    let feedbackModal = document.getElementById('feedback-modal');
    if (!feedbackModal) {
        feedbackModal = document.createElement('div');
        feedbackModal.id = 'feedback-modal';
        feedbackModal.className = 'fullscreen-modal';
        document.body.appendChild(feedbackModal);
    }
    feedbackModal.innerHTML = `<div class="modal-content"><button class="close-modal-btn">&times;</button><h2>Оцените программу</h2><p>Пожалуйста, оставьте вашу оценку. Это поможет нам стать лучше.</p><div class="feedback-stars" id="feedback-stars-container"><span class="star" data-value="1"><i class="far fa-star"></i></span><span class="star" data-value="2"><i class="far fa-star"></i></span><span class="star" data-value="3"><i class="far fa-star"></i></span><span class="star" data-value="4"><i class="far fa-star"></i></span><span class="star" data-value="5"><i class="far fa-star"></i></span></div><textarea id="feedback-text" placeholder="Напишите ваш комментарий (необязательно)" style="width: 100%; min-height: 80px; margin-top: 10px; resize: vertical; padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);"></textarea><button id="send-feedback-btn" class="primary-btn" style="margin-top: 20px;" disabled>Отправить</button></div>`;
}

// ЛОГИКА КАСТОМНОГО СЕЛЕКТОРА РОЛЕЙ
function setupCustomRoleSelector() {
    const wrapper = document.getElementById('emp-role-wrapper');
    const dropdown = document.getElementById('emp-role-dropdown');
    const selectedText = document.getElementById('emp-role-selected-text');
    const hiddenInput = document.getElementById('emp-role');
    
    if(!wrapper) return;

    wrapper.addEventListener('click', (e) => {
        dropdown.classList.toggle('show');
        e.stopPropagation();
    });

    document.addEventListener('click', () => {
        dropdown.classList.remove('show');
    });

    dropdown.querySelectorAll('li').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = item.getAttribute('data-value');
            const text = item.textContent;
            
            selectedText.textContent = text;
            hiddenInput.value = value;
            dropdown.classList.remove('show');
        });
    });
}

function updateCustomRoleSelectorDisplay(value) {
    const selectedText = document.getElementById('emp-role-selected-text');
    const hiddenInput = document.getElementById('emp-role');
    if(!selectedText) return;
    hiddenInput.value = value;
    selectedText.textContent = value === 'owner' ? 'Собственник ПВЗ' : 'Менеджер';
}

function attachSharedEventListeners() {
    document.getElementById('burger-menu')?.addEventListener('click', () => toggleModal('help-menu', true));
    document.getElementById('search-by-code-btn')?.addEventListener('click', () => toggleModal('search-modal', true));
    document.getElementById('search-by-code-btn-menu')?.addEventListener('click', () => { toggleModal('help-menu', false); toggleModal('search-modal', true); });
    document.getElementById('show-qr-btn')?.addEventListener('click', () => toggleModal('qr-code-modal', true));
    
    document.getElementById('exit-btn')?.addEventListener('click', () => {
        const rememberMe = localStorage.getItem('rememberMe') === 'true';
        if (rememberMe) {
            toggleModal('help-menu', false);
            toggleModal('logout-choice-modal', true);
        } else {
            performFullLogout();
        }
    });

    document.getElementById('change-employee-btn')?.addEventListener('click', () => {
        sessionStorage.removeItem('currentManager');
        sessionStorage.removeItem('currentManagerId');
        sessionStorage.removeItem('currentManagerRole');
        window.location.href = 'login.html';
    });

    document.getElementById('full-logout-btn')?.addEventListener('click', performFullLogout);

    document.getElementById('close-help-btn')?.addEventListener('click', () => toggleModal('help-menu', false));
    document.getElementById('connect-scanner-btn')?.addEventListener('click', () => { toggleModal('help-menu', false); toggleModal('scanner-setup-modal', true); });
    document.getElementById('account-details-btn')?.addEventListener('click', () => { toggleModal('help-menu', false); toggleModal('account-modal', true); });
    
    document.getElementById('manage-employees-btn')?.addEventListener('click', () => {
        toggleModal('help-menu', false);
        toggleModal('employee-management-modal', true);
        loadEmployeesToModal();
    });

    document.getElementById('add-employee-trigger')?.addEventListener('click', () => {
        document.getElementById('emp-form-title').textContent = "Добавить сотрудника";
        document.getElementById('emp-edit-id').value = '';
        ['emp-last-name', 'emp-first-name', 'emp-patronymic', 'emp-dob', 'emp-phone', 'emp-email'].forEach(id => document.getElementById(id).value = '');
        updateCustomRoleSelectorDisplay('employee');
        
        toggleModal('employee-management-modal', false);
        toggleModal('employee-form-modal', true);
    });

    document.getElementById('save-employee-btn')?.addEventListener('click', saveEmployeeData);

    document.querySelectorAll('.accordion-header').forEach(button => {
        button.addEventListener('click', (e) => {
            const currentItem = button.closest('.accordion-item');
            document.querySelectorAll('.accordion-item.open').forEach(openItem => {
                if (openItem !== currentItem) {
                    openItem.classList.remove('open');
                    openItem.querySelector('.accordion-content').style.maxHeight = '0';
                }
            });
            if (currentItem) {
                currentItem.classList.toggle('open');
                const content = currentItem.querySelector('.accordion-content');
                if (content) content.style.maxHeight = currentItem.classList.contains('open') ? content.scrollHeight + 'px' : '0';
            }
        });
    });

    document.querySelectorAll('[data-help-topic]').forEach(button => button.addEventListener('click', showHelpModal));
    document.querySelectorAll('.fullscreen-modal').forEach(modal => { modal.querySelector('.close-modal-btn')?.addEventListener('click', () => toggleModal(modal.id, false)); });
    document.getElementById('execute-search-btn')?.addEventListener('click', searchByItemCode);
    document.getElementById('search-item-code')?.addEventListener('keypress', e => { if (e.key === 'Enter') searchByItemCode(); });
    document.getElementById('education-portal-btn')?.addEventListener('click', () => { window.open('https://pvz-learning.wb.ru/', '_blank'); });
    document.getElementById('main-page-link-btn')?.addEventListener('click', () => { window.open('https://pvz.wb.ru/', '_blank'); });
    document.getElementById('leave-feedback-btn')?.addEventListener('click', () => { toggleModal('help-menu', false); toggleModal('feedback-modal', true); });

    const starsContainer = document.getElementById('feedback-stars-container');
    const sendFeedbackBtn = document.getElementById('send-feedback-btn');
    let currentRating = 0;

    function updateStars(rating) {
        if (!starsContainer) return;
        starsContainer.querySelectorAll('.star').forEach(s => {
            const i = s.querySelector('i');
            if (parseInt(s.dataset.value) <= rating) { s.classList.add('selected'); i.classList.remove('far'); i.classList.add('fas'); } 
            else { s.classList.remove('selected'); i.classList.remove('fas'); i.classList.add('far'); }
        });
    }

    if (starsContainer) {
        const stars = starsContainer.querySelectorAll('.star');
        stars.forEach(star => { star.addEventListener('click', () => { currentRating = parseInt(star.dataset.value); if (sendFeedbackBtn) sendFeedbackBtn.disabled = false; updateStars(currentRating); }); });
    }

    if (sendFeedbackBtn) {
        sendFeedbackBtn.addEventListener('click', () => {
            const feedbackText = document.getElementById('feedback-text').value;
            console.log(`Отзыв отправлен: ${currentRating} звезд, Текст: ${feedbackText}`);
            toggleModal('feedback-modal', false);
            showAlert('Спасибо за ваш отзыв!', false);
            currentRating = 0; updateStars(0);
            if(document.getElementById('feedback-text')) document.getElementById('feedback-text').value = '';
            sendFeedbackBtn.disabled = true;
        });
    }

    const speedSlider = document.getElementById('voice-speed-slider');
    const speedValueDisplay = document.getElementById('voice-speed-value');
    const saveVoiceBtn = document.getElementById('save-voice-settings-btn');

    if (speedSlider && speedValueDisplay) {
        const savedSpeed = localStorage.getItem('voiceSpeed') || '1.3';
        speedSlider.value = savedSpeed; speedValueDisplay.textContent = parseFloat(savedSpeed).toFixed(1);
        speedSlider.addEventListener('input', () => { speedValueDisplay.textContent = parseFloat(speedSlider.value).toFixed(1); });
    }

    if (saveVoiceBtn) {
        saveVoiceBtn.addEventListener('click', () => {
            const newSpeed = speedSlider.value; localStorage.setItem('voiceSpeed', newSpeed);
            if (typeof window.voiceSpeed !== 'undefined') window.voiceSpeed = parseFloat(newSpeed);
            showAlert('Скорость озвучки сохранена.', false);
        });
    }
}

function performFullLogout() {
    const uid = auth.currentUser ? auth.currentUser.uid : null;
    if (uid) sessionStorage.removeItem('userCache_' + uid);
    sessionStorage.removeItem('currentPvzId');
    sessionStorage.removeItem('currentManager');
    sessionStorage.removeItem('currentManagerId');
    sessionStorage.removeItem('currentManagerRole');
    localStorage.removeItem('rememberMe');
    auth.signOut();
}

async function loadEmployeesToModal() {
    const uid = auth.currentUser.uid;
    const pvzId = sessionStorage.getItem('currentPvzId');
    if (!pvzId) return; 
    
    const container = document.getElementById('employee-list-container');
    container.innerHTML = '<div class="spinner" style="margin:20px auto;"></div>';

    try {
        const snap = await database.ref(`users/${uid}/employees/${pvzId}`).once('value');
        container.innerHTML = '';
        if (snap.exists()) {
            const emps = Object.values(snap.val());
            emps.forEach(emp => {
                const div = document.createElement('div');
                div.className = 'employee-item';
                div.innerHTML = `
                    <div class="emp-info">
                        <strong>${emp.lastName} ${emp.firstName} ${emp.patronymic || ''}</strong>
                        <span>${emp.role === 'owner' ? 'Собственник' : 'Менеджер'} | ${emp.phone}</span>
                    </div>
                    <div class="emp-actions">
                        <button class="icon-btn-small edit-emp" title="Редактировать"><i class="fas fa-edit"></i></button>
                        <button class="icon-btn-small del-emp" style="color:var(--error);" title="Удалить"><i class="fas fa-trash-alt"></i></button>
                    </div>
                `;
                div.querySelector('.edit-emp').onclick = () => editEmployee(emp);
                div.querySelector('.del-emp').onclick = () => showDeleteConfirmation(emp.id);
                container.appendChild(div);
            });
        } else {
            container.innerHTML = '<p>Сотрудники не найдены.</p>';
        }
    } catch (e) {
        container.innerHTML = '<p style="color:red;">Ошибка загрузки</p>';
    }
}

function editEmployee(emp) {
    document.getElementById('emp-form-title').textContent = "Редактировать сотрудника";
    document.getElementById('emp-edit-id').value = emp.id;
    document.getElementById('emp-last-name').value = emp.lastName || '';
    document.getElementById('emp-first-name').value = emp.firstName || '';
    document.getElementById('emp-patronymic').value = emp.patronymic || '';
    document.getElementById('emp-dob').value = emp.dob || '';
    document.getElementById('emp-phone').value = emp.phone || '';
    document.getElementById('emp-email').value = emp.email || '';
    
    updateCustomRoleSelectorDisplay(emp.role || 'employee');
    
    toggleModal('employee-management-modal', false);
    toggleModal('employee-form-modal', true);
}

async function saveEmployeeData() {
    const uid = auth.currentUser.uid;
    const pvzId = sessionStorage.getItem('currentPvzId');
    if (!pvzId) {
        showAlert('Критическая ошибка: ID ПВЗ не определен. Перезайдите в систему.', true);
        return;
    }
    
    const idField = document.getElementById('emp-edit-id').value;
    
    // Генерируем 9 цифр
    const generatedId = Math.floor(100000000 + Math.random() * 900000000).toString();
    
    const empData = {
        id: idField || generatedId,
        lastName: document.getElementById('emp-last-name').value.trim(),
        firstName: document.getElementById('emp-first-name').value.trim(),
        patronymic: document.getElementById('emp-patronymic').value.trim(),
        dob: document.getElementById('emp-dob').value,
        phone: document.getElementById('emp-phone').value.trim(),
        email: document.getElementById('emp-email').value.trim(),
        role: document.getElementById('emp-role').value
    };

    if (!empData.lastName || !empData.firstName || !empData.phone) {
        showAlert('Заполните обязательные поля (Фамилия, Имя, Телефон)', true);
        return;
    }

    try {
        await database.ref(`users/${uid}/employees/${pvzId}/${empData.id}`).set(empData);
        showAlert('Сотрудник сохранен', false);
        toggleModal('employee-form-modal', false);
        toggleModal('employee-management-modal', true);
        loadEmployeesToModal();
    } catch (e) {
        showAlert('Ошибка сохранения: ' + e.message, true);
    }
}

function showDeleteConfirmation(empId) {
    toggleModal('confirm-delete-modal', true);
    
    const btnConfirm = document.getElementById('confirm-delete-action-btn');
    const btnCancel = document.getElementById('cancel-delete-btn');
    
    // Очищаем старые слушатели
    const newConfirm = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newConfirm, btnConfirm);
    const newCancel = btnCancel.cloneNode(true);
    btnCancel.parentNode.replaceChild(newCancel, btnCancel);
    
    newCancel.addEventListener('click', () => { toggleModal('confirm-delete-modal', false); });
    newConfirm.addEventListener('click', () => { 
        toggleModal('confirm-delete-modal', false); 
        executeDeleteEmployee(empId); 
    });
}

async function executeDeleteEmployee(empId) {
    const uid = auth.currentUser.uid;
    const pvzId = sessionStorage.getItem('currentPvzId');
    try {
        await database.ref(`users/${uid}/employees/${pvzId}/${empId}`).remove();
        showAlert('Сотрудник удален', false);
        loadEmployeesToModal();
    } catch (e) {
        showAlert('Ошибка удаления', true);
    }
}

function toggleModal(modalId, show) {
    const modal = document.getElementById(modalId);
    const overlay = document.getElementById('overlay');
    if (!modal) return;
    if (show) {
        if (modalId === 'help-menu') { modal.classList.add('visible'); overlay?.classList.add('visible'); } 
        else { modal.style.display = 'flex'; setTimeout(() => modal.classList.add('visible'), 10); }
    } else {
        if (modalId === 'help-menu') { modal.classList.remove('visible'); overlay?.classList.remove('visible'); } 
        else { modal.classList.remove('visible'); setTimeout(() => { modal.style.display = 'none'; }, 300); }
    }
}

function searchByItemCode() {
    const code = document.getElementById('search-item-code').value.trim();
    const resultContainer = document.getElementById('search-result-container');
    resultContainer.innerHTML = '';
    if (!/^\d{9}$/.test(code)) { resultContainer.innerHTML = '<p style="color: var(--error);">Введите корректный 9-значный код.</p>'; return; }
    const userData = getUserData();
    const allItems = [...(userData.receptionItems || []), ...(userData.returnsItems || [])];
    const item = allItems.find(i => i.code === code);
    if (!item) { resultContainer.innerHTML = '<p>Товар с таким кодом не найден.</p>'; return; }
    
    const imageContent = item.isAdult ? `<img src="adult.svg" style="width:100%">` : (item.image ? `<img src="${item.image}" style="width:100%; object-fit:contain;">` : '📦');

    resultContainer.innerHTML = `<div style="display: flex; gap: 20px; text-align: left; margin-top: 20px;"><div style="width: 150px; flex-shrink: 0;"><div class="product-card">${item.isDefective ? '<div class="defective-overlay">БРАК</div>' : ''}<div class="product-image">${imageContent}</div></div></div><div><p><strong>Статус:</strong> ${ (userData.returnsItems || []).some(i => i.code === code) ? 'Ожидает возврата' : 'На складе'}</p><p><strong>Описание:</strong> ${item.name || 'Нет данных'}</p><p><strong>Ячейка:</strong> ${item.cell ? parseInt(item.cell, 10) : 'N/A'}</p><p><strong>Дата приемки:</strong> ${new Date(item.date).toLocaleString('ru-RU')}</p></div></div>`;
}

function getActualCell(originalCell) { return String(originalCell); }

function showAlert(message, isError = false) {
    const existingAlert = document.querySelector('.alert-message');
    if (existingAlert) existingAlert.remove();
    const alert = document.createElement('div'); alert.className = 'alert-message'; alert.textContent = message;
    alert.style.background = isError ? 'var(--error)' : 'var(--success)';
    if (isError && typeof playErrorSound === 'function') playErrorSound();
    document.body.appendChild(alert);
    setTimeout(() => { if (document.body.contains(alert)) document.body.removeChild(alert); }, 4000);
}

function showHelpModal(event) {
    const topic = event.currentTarget.dataset.helpTopic;
    const helpContent = {
        'issue': { title: 'Выдача', text: '1. Отсканируйте QR-код клиента или введите 4 цифры его телефона и 5 цифр кода из приложения.<br>2. Программа покажет ячейку и состав заказа.<br>3. Пройдите быструю проверку товаров (можно пропустить).<br>4. Выберите товары для выдачи. Вы можете снять выбор со-всех товаров, если клиент от всего отказывается.<br>5. Нажмите "Выдать".' },
        'reception': { title: 'Приёмка', text: '1. Перейдите в раздел Приёмка -> Товары.<br>2. Сканируйте ШК товаров. Система автоматически присвоит ячейку и озвучит её номер.<br>3. История последних принятых товаров отображается внизу экрана.'},
        'returns': { title: 'Возвраты', text: '1. Перейдите в Возврат -> Товары.<br>2. Здесь находятся все товары, от которых отказались клиенты.<br>3. Перейдите в раздел Коробки, выберите коробку и добавляйте туда товары для возврата.'},
    };
    const content = helpContent[topic];
    if (!content) return;
    let modal = document.getElementById('help-content-modal');
    if (!modal) {
        modal = document.createElement('div'); modal.id = 'help-content-modal'; modal.className = 'fullscreen-modal';
        document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="modal-content" style="text-align: left;"><button class="close-modal-btn">&times;</button><h2>${content.title}</h2><p class="help-text" style="font-size: 1rem; line-height: 1.6;">${content.text}</p></div>`;
    modal.querySelector('.close-modal-btn').onclick = () => toggleModal('help-content-modal', false);
    toggleModal('help-content-modal', true);
}

function updateAllBadges() {
    const userData = getUserData();
    const activeOrders = userData.activeOrders || [];
    updateBadge('order-count-badge', activeOrders.length);
    const unprocessedReturns = (userData.returnsItems || []).filter(item => !item.confirmed);
    const allItems = userData.receptionItems || [];
    const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
    const itemsToDispose = allItems.filter(item => new Date(item.date).getTime() < fourteenDaysAgo);
    const unprocessedReturnsCount = unprocessedReturns.length;
    const itemsToDisposeCount = itemsToDispose.length;
    const totalReturnCount = unprocessedReturnsCount + itemsToDisposeCount;
    if (totalReturnCount > 0) { const badgeText = `${unprocessedReturnsCount}/${itemsToDisposeCount}`; updateBadge('returns-nav-badge', badgeText); } 
    else { updateBadge('returns-nav-badge', 0); }
    updateBadge('returns-sidebar-badge', unprocessedReturnsCount);
    updateBadge('disposal-sidebar-badge', itemsToDisposeCount);
}

function updateBadge(badgeId, content) {
    const badge = document.getElementById(badgeId);
    if (badge) {
        const hasContent = (typeof content === 'number' && content > 0) || (typeof content === 'string' && content.length > 0 && content !== '0');
        if (hasContent) { badge.textContent = content; badge.style.display = 'flex'; } else { badge.style.display = 'none'; }
    }
}

const productData = [
    { "name": "City Umbrella/Зонт черный автомат антиветер", "image": "https://mns-basket-cdn-04.geobasket.net/vol2129/part212953/212953101/images/big/1.webp", "price": 19.01 },
    { "name": "ONE HOME/Кружка для чая и кофе керамическая 200мл", "image": "https://mns-basket-cdn-04.geobasket.net/vol4687/part468792/468792941/images/big/1.webp", "price": 24.52 },
    { "name": "DianaShop/рюкзак городской тканьевый школьный для повседневки", "image": "https://mns-basket-cdn-05.geobasket.net/vol3760/part376000/376000942/images/big/1.webp", "price":27.17 },
    { "name": "Цейс-видео/Флешка 128 гб usb 2.0 мини для компьютера красивая маленькая", "image": "https://mns-basket-cdn-04.geobasket.net/vol3114/part311481/311481511/images/big/1.webp", "price": 24.95 },
    { "name": "SmartX/Наушники беспроводные с микрофоном Pro 2", "image": "https://mns-basket-cdn-06.geobasket.net/vol4784/part478434/478434213/images/big/1.webp", "price": 47.61 },
    { "name": "Winnetou/Термос 1 литр с датчиком температуры, для чая и кофе", "image": "https://mns-basket-cdn-06.geobasket.net/vol3673/part367356/367356138/images/big/1.webp", "price": 60.13 },
    { "name": "ТВОЕ/Плотная базовая классическая футболка", "image": "https://mns-basket-cdn-06.geobasket.net/vol2403/part240385/240385498/images/hq/1.webp", "price": 19.25 },
    { "name": "BAASPLOA/Кроссовки летние дышащие сетка для бега и зала", "image": "https://mns-basket-cdn-04.geobasket.net/vol6586/part658634/658634206/images/big/1.webp", "price": 275.04 },
    { "name": "ILUUS/Солнцезащитные очки квадратные", "image": "https://mns-basket-cdn-05.geobasket.net/vol2239/part223976/223976992/images/big/1.webp", "price": 3.88 },
    { "name": "PROFIT/Смарт часы умные Smart Watch 10 оригинал", "image": "https://mns-basket-cdn-02.geobasket.net/vol3319/part331961/331961479/images/big/1.webp", "price": 59.66 },
    { "name": "GEMBIRD/Клавиатура игровая с подсветкой круглые клавиши", "image": "https://mns-basket-cdn-05.geobasket.net/vol126/part12620/12620087/images/big/1.webp", "price": 23.37 },
    { "name": "HerLer/Мышь беспроводная бесшумная с аккумулятором и подсветкой", "image": "https://mns-basket-cdn-06.geobasket.net/vol1556/part155604/155604983/images/big/1.webp", "price": 11.15 },
    { "name": "GameTime/Игровая приставка для телевизора смарт консоль game stick", "image": "https://mns-basket-cdn-02.geobasket.net/vol3293/part329363/329363084/images/big/1.webp", "price": 111.22 },
    { "name": "Красивый мир/Гидрогелевые патчи для глаз от отеков и мешков с золотом 24К", "image": "https://basket-24.wbbasket.ru/vol4222/part422273/422273330/images/big/1.webp", "price": 6.30 },
    { "name": "BILBON/Тканевые маски для лица, набор 10 шт", "image": "https://basket-10.wbbasket.ru/vol1539/part153930/153930212/images/big/1.webp", "price": 10.27 },
    { "name": "MARKELL/Сыворотка для роста бровей и ресниц 10 мл", "image": "https://basket-28.wbbasket.ru/vol5434/part543460/543460737/images/big/1.webp", "price": 16.72 },
    { "name": "Красотка/Бейби браш щеточки для ресниц и бровей", "image": "https://basket-18.wbbasket.ru/vol2969/part296932/296932598/images/big/1.webp", "price": 7.94 },
    { "name": "GreenEra/Твердый шампунь для роста и укрепления волос, от выпадения", "image": "https://mns-basket-cdn-02.geobasket.net/vol112/part11209/11209209/images/big/1.webp", "price": 16.41 },
    { "name": "Fito Cosmetic/Увлажняющий бальзам для восстановления губ Пантенол форте 4г", "image": "https://mns-basket-cdn-03.geobasket.net/vol1483/part148370/148370930/images/big/1.webp", "price": 5.36 },
    { "name": "A&O/Спонж мини для макияжа на кончик пальца", "image": "https://mns-basket-cdn-04.geobasket.net/vol1830/part183083/183083556/images/big/1.webp", "price": 7.94 },
    { "name": "Гардероб Тим/Набор двусторонних кистей для макияжа", "image": "https://mns-basket-cdn-05.geobasket.net/vol4665/part466502/466502837/images/big/1.webp", "price": 28.35 },
    { "name": "MIZON/Пилинг для лица скатка яблочная", "image": "https://mns-basket-cdn-02.geobasket.net/vol2608/part260845/260845089/images/big/1.webp", "price": 56.16 },
    { "name": "LEMISA/Скраб для тела Кокос", "image": "https://mns-basket-cdn-06.geobasket.net/vol1826/part182667/182667948/images/big/1.webp", "price": 16.81 },
    { "name": "Secrets Lan/Дезодорант кристалл без запаха 2 шт", "image": "https://mns-basket-cdn-02.geobasket.net/vol1545/part154528/154528069/images/big/1.webp", "price": 12.81 },
    { "name": "E-COSMETIC/Шампунь для волос OLLIN CARE ежедневный уход 1000 мл", "image": "https://mns-basket-cdn-06.geobasket.net/vol296/part29611/29611773/images/big/1.webp", "price": 40.84 },
    { "name": "Я Самая/Ватные диски 600 шт с веревочкой (5уп по 120шт)", "image": "https://mns-basket-cdn-02.geobasket.net/vol275/part27541/27541349/images/big/1.webp", "price": 18.78 },
    { "name": "ECOLIVE/Бомбочки для ванны подарочный набор 12 штук", "image": "https://mns-basket-cdn-02.geobasket.net/vol7014/part701405/701405344/images/big/1.webp", "price": 30.60 },
    { "name": "EPSOM.PRO/Магниевая соль для ванн для детей 500 гр", "image": "https://mns-basket-cdn-05.geobasket.net/vol1896/part189657/189657357/images/big/1.webp", "price": 15.72 },
    { "name": "MissLor/Массажер Гуаша микротоковый для лица и тела", "image": "https://mns-basket-cdn-03.geobasket.net/vol7636/part763656/763656740/images/big/1.webp", "price": 86.17 },
    { "name": "Chew/Отбеливающая зубная паста в таблетках", "image": "https://mns-basket-cdn-03.geobasket.net/vol1574/part157445/157445900/images/big/1.webp", "price": 12.84 },
    { "name": "Secret Showcase/Мицеллярная вода для снятия макияжа с глаз и лица", "image": "https://mns-basket-cdn-02.geobasket.net/vol7655/part765585/765585869/images/big/1.webp", "price": 11.72 },
    { "name": "OfficeClean/Жидкое мыло для рук, набор 3 по 500мл", "image": "https://mns-basket-cdn-06.geobasket.net/vol2713/part271319/271319193/images/big/1.webp", "price": 12.03 },
    { "name": "Цифровой Рай/Повербанк 10000 powerbank с проводами для телефона", "image": "https://mns-basket-cdn-04.geobasket.net/vol3585/part358566/358566751/images/big/1.webp", "price": 34.90 },
    { "name": "MarketHub/Внешний аккумулятор Acefast M16 Power Bank Черный", "image": "https://mns-basket-cdn-06.geobasket.net/vol5021/part502176/502176053/images/big/1.webp", "price": 112.67 },
    { "name": "Baseus/Кабель Display Type-C - Type-C 100 Вт, 2м", "image": "https://mns-basket-cdn-05.geobasket.net/vol5861/part586165/586165097/images/big/1.webp", "price": 44.48 }
];
      
const adultProductData = [
    { "name": "MERLO/Вино белое", "image": "https://placehold.co/1200x800/png?text=Wine+White", "price": 14.34, "isAdult": true },
    { "name": "ALTO/Вино красное", "image": "https://placehold.co/1200x800/png?text=Wine+Red", "price": 20.64, "isAdult": true },
    { "name": "TABACCO/Сигареты классические", "image": "https://placehold.co/1200x800/png?text=Cigarettes", "price": 3.82, "isAdult": true },
    { "name": "ENERGO/Энергетик классический", "image": "https://placehold.co/1200x800/png?text=Energy+Drink", "price": 2.64, "isAdult": true },
    { "name": "CASTELLO/Пиво светлое", "image": "https://placehold.co/1200x800/png?text=Beer", "price": 3.47, "isAdult": true }
];
