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

// Настройка Splash Screen с гарантированным ожиданием 5 секунд
const SPLASH_DURATION = 5000;
const splashStartTime = Date.now();
let isSplashDone = sessionStorage.getItem('splashShown') === 'true';

function waitForSplash(callback) {
    if (isSplashDone) {
        const splashScreen = document.getElementById('splash-screen');
        if (splashScreen) {
            splashScreen.style.display = 'none';
            splashScreen.classList.add('hidden');
        }
        callback();
        return;
    }
    const elapsed = Date.now() - splashStartTime;
    const remaining = SPLASH_DURATION - elapsed;
    
    if (remaining > 0) {
        setTimeout(() => { finishSplash(callback); }, remaining);
    } else {
        finishSplash(callback);
    }
}

function finishSplash(callback) {
    sessionStorage.setItem('splashShown', 'true');
    isSplashDone = true;
    const splashScreen = document.getElementById('splash-screen');
    if (splashScreen) {
        splashScreen.classList.add('hidden');
        setTimeout(() => {
            splashScreen.style.display = 'none';
            callback();
        }, 500);
    } else {
        callback();
    }
}

auth.onAuthStateChanged(async user => {
    const isAuthPage = window.location.pathname.includes('login.html') || window.location.pathname.includes('register.html');
    
    if (user) {
        const hasPvz = localStorage.getItem('savedPvzId');
        const hasManager = sessionStorage.getItem('currentManager');
        
        if (!hasPvz || !hasManager) {
            waitForSplash(() => {
                if (!isAuthPage) window.location.href = 'login.html';
            });
        } else {
            if (isAuthPage) {
                window.location.href = 'index.html';
            } else {
                try {
                    const cachedData = sessionStorage.getItem('userCache_' + user.uid);
                    if (cachedData) {
                        localUserCache = JSON.parse(cachedData);
                        cleanupOldHistory(user.uid); 
                    } else {
                        const userRef = database.ref('users/' + user.uid);
                        const snapshot = await userRef.once('value');
                        if (snapshot.exists()) {
                            localUserCache = snapshot.val();
                            sessionStorage.setItem('userCache_' + user.uid, JSON.stringify(localUserCache));
                            cleanupOldHistory(user.uid);
                        } else {
                            auth.signOut();
                        }
                    }
                } catch(e) { console.error("Ошибка синхронизации:", e); }
                
                waitForSplash(() => {
                    runAppLogic();
                });
            }
        }
    } else {
        waitForSplash(() => {
            if (!isAuthPage) window.location.href = 'login.html';
        });
    }
});

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

let isAppLogicRun = false;

function runAppLogic() {
    if (isAppLogicRun) return;
    isAppLogicRun = true;

    renderDesktopHeader();
    populateSharedElements();
    attachSharedEventListeners();
    updateAllBadges();

    if (typeof initWebSocket === 'function') initWebSocket();
    const path = window.location.pathname;
    
    if ((path.endsWith('/') || path.includes('index.html')) && typeof initIndexPage === 'function') initIndexPage();
    else if (path.includes('p.html') && typeof initPriemkaTovaryPage === 'function') initPriemkaTovaryPage();
    else if (path.includes('returns.html') && typeof initVozvratTovaryPage === 'function') initVozvratTovaryPage();
    else if (path.includes('r2.html') && typeof initVozvratKorobkiPage === 'function') initVozvratKorobkiPage();
    else if (path.includes('r3.html') && typeof initVozvratKartonPage === 'function') initVozvratUtilPage();
    else if (path.includes('r4.html') && typeof initVozvratUtilPage === 'function') initVozvratUtilPage();
    else if (path.includes('fines.html') && typeof initFinesPage === 'function') initFinesPage();
    else if (path.includes('rating.html') && typeof initRatingPage === 'function') initRatingPage();
    else if (path.includes('box_stats.html') && typeof initBoxStatsPage === 'function') initBoxStatsPage();
    else if (path.includes('p2.html') && typeof initPriemkaSmenaYacheykiPage === 'function') initPriemkaSmenaYacheykiPage();
    else if (path.includes('p3.html') && typeof initPriemkaPovtornayaPage === 'function') initPriemkaPovtornayaPage();
}

function renderDesktopHeader() {
    const headerContainer = document.getElementById('desktop-header-container');
    if (!headerContainer) return;

    const currentPath = window.location.pathname;
    const isIndex = currentPath.endsWith('/') || currentPath.includes('index.html');
    const isP = currentPath.includes('p.html') || currentPath.includes('p2.html') || currentPath.includes('p3.html');
    const isReturns = currentPath.includes('returns.html') || currentPath.includes('r2.html') || currentPath.includes('r3.html') || currentPath.includes('r4.html');
    const isMore = currentPath.includes('more.html');

    headerContainer.innerHTML = `
        <div class="header-left-controls">
            <div class="toolbar-btn" id="burger-menu" title="Меню"><img src="points_menu.svg" alt="Меню" class="header-icon"></div>
            <div class="toolbar-btn" id="show-qr-btn" title="QR-код ПВЗ"><img src="delivery-qr-pvz_resized.svg" alt="QR ПВЗ" class="header-icon"></div>
            <div class="toolbar-btn" id="search-redirect-btn" title="Найти товар"><img src="search_loupe.svg" alt="Поиск" class="header-icon"></div>
        </div>
        <nav class="main-nav">
            <div class="nav-center">
                <button class="nav-btn ${isIndex ? 'active' : ''}" onclick="location.href='index.html'">
                    <div class="nav-icon-wrapper">
                        <img src="delivery.svg" alt="Выдача" class="nav-icon">
                        <div class="nav-badge" id="order-count-badge" style="display: none;">0</div>
                    </div>
                    <span class="nav-text">Выдача</span>
                </button>
                <button class="nav-btn ${isP ? 'active' : ''}" onclick="location.href='p.html'">
                    <div class="nav-icon-wrapper">
                        <img src="accept.svg" alt="Приёмка" class="nav-icon">
                    </div>
                    <span class="nav-text">Приёмка</span>
                </button>
                <button class="nav-btn ${isReturns ? 'active' : ''}" onclick="location.href='returns.html'">
                    <div class="nav-icon-wrapper">
                        <img src="returns.svg" alt="Возврат" class="nav-icon">
                        <div class="nav-badge" id="returns-nav-badge" style="display: none;">0</div>
                    </div>
                    <span class="nav-text">Возврат</span>
                </button>
                <button class="nav-btn ${isMore ? 'active' : ''}" onclick="location.href='more.html'">
                    <div class="nav-icon-wrapper">
                        <img src="grid-cards.svg" alt="Еще" class="nav-icon">
                    </div>
                    <span class="nav-text">Еще</span>
                </button>
            </div>
        </nav>
        <div class="header-right-controls">
            <div class="toolbar-btn" id="notifications-btn" title="Уведомления"><img src="notification_bell.svg" alt="Уведомления" class="header-icon"></div>
            <div class="toolbar-btn" id="chat-bot-btn" title="Чат-бот помощник"><img src="chat.svg" alt="Чат" class="header-icon"></div>
            <div id="connection-status" title="Статус сканера"><i class="fas fa-barcode"></i></div>
        </div>
    `;
}

function populateSharedElements() {
    const currentUserInfo = localUserCache ? localUserCache.pvzInfo : {};
    const currentPvzId = localStorage.getItem('savedPvzId');
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
        if(div) div.innerHTML = `ID ${userPvzId}<br>v1.1.1`;
    });

    document.querySelectorAll('.sidebar-logo').forEach(logo => {
        if (!logo.querySelector('.sidebar-divider')) {
            const divider = document.createElement('hr');
            divider.className = 'sidebar-divider';
            logo.appendChild(divider);
        }
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

    if (!document.getElementById('notifications-modal')) {
        const notifModal = document.createElement('div');
        notifModal.id = 'notifications-modal';
        notifModal.className = 'fullscreen-modal';
        notifModal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; text-align: left;">
                <button class="close-modal-btn">&times;</button>
                <h2 style="margin-bottom: 20px;">Уведомления</h2>
                <div id="notifications-list" style="max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;">
                    <div class="empty-message" style="text-align: center; color: var(--text-secondary-color); padding: 20px 0;">Новых уведомлений нет</div>
                </div>
                <button id="clear-notifications-btn" class="secondary-btn full-width-btn" style="margin-top: 20px;">Стереть все</button>
            </div>
        `;
        document.body.appendChild(notifModal);
    }

    if (!document.getElementById('chat-bot-panel')) {
        const chatPanel = document.createElement('div');
        chatPanel.id = 'chat-bot-panel';
        chatPanel.className = 'chat-bot-panel';
        chatPanel.innerHTML = `
            <div class="chat-header">
                <h2>Чат-бот помощник</h2>
                <button class="close-chat-btn" id="close-chat-btn">&times;</button>
            </div>
            <div class="chat-messages" id="chat-messages-container">
                <div class="chat-message bot">Привет! Я твой виртуальный помощник. Выбери нужную тему ниже.</div>
            </div>
            <div class="chat-options">
                <button class="chat-option-btn" data-question="Как принимать товар">Как принимать товар</button>
                <button class="chat-option-btn" data-question="Как выдать заказ">Как выдать заказ</button>
                <button class="chat-option-btn" data-question="Как оформить возврат">Как оформить возврат</button>
            </div>
        `;
        document.body.appendChild(chatPanel);
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
    document.getElementById('show-qr-btn')?.addEventListener('click', () => toggleModal('qr-code-modal', true));
    
    document.getElementById('search-redirect-btn')?.addEventListener('click', () => { window.location.href = 'search.html'; });
    
    document.getElementById('notifications-btn')?.addEventListener('click', () => toggleModal('notifications-modal', true));
    
    document.getElementById('chat-bot-btn')?.addEventListener('click', () => {
        document.getElementById('chat-bot-panel').classList.add('visible');
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.classList.add('visible');
    });
    
    document.getElementById('close-chat-btn')?.addEventListener('click', () => {
        document.getElementById('chat-bot-panel').classList.remove('visible');
        const overlay = document.getElementById('overlay');
        if (overlay && !document.querySelector('.fullscreen-modal.visible') && !document.getElementById('help-menu').classList.contains('visible')) {
            overlay.classList.remove('visible');
        }
    });

    document.querySelectorAll('.chat-option-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const question = e.target.getAttribute('data-question');
            const chatContainer = document.getElementById('chat-messages-container');
            
            const userMsg = document.createElement('div');
            userMsg.className = 'chat-message user';
            userMsg.textContent = question;
            chatContainer.appendChild(userMsg);

            setTimeout(() => {
                const botMsg = document.createElement('div');
                botMsg.className = 'chat-message bot';
                if (question === 'Как принимать товар') {
                    botMsg.innerHTML = 'Перейдите в раздел <b>Приёмка</b>, сканируйте ШК товара. Программа сама назначит ячейку.';
                } else if (question === 'Как выдать заказ') {
                    botMsg.innerHTML = 'В разделе <b>Выдача</b> отсканируйте QR клиента или введите код. Затем отсканируйте товары к выдаче.';
                } else if (question === 'Как оформить возврат') {
                    botMsg.innerHTML = 'Перейдите в раздел <b>Возврат -> Товары</b>, найдите товар, затем в разделе Коробки поместите товар в возвратную тару.';
                } else {
                    botMsg.innerHTML = 'Уточните ваш вопрос у руководителя.';
                }
                chatContainer.appendChild(botMsg);
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }, 500);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        });
    });

    document.getElementById('clear-notifications-btn')?.addEventListener('click', () => {
        const notifList = document.getElementById('notifications-list');
        if (notifList) {
            notifList.innerHTML = '<div class="empty-message" style="text-align: center; color: var(--text-secondary-color); padding: 20px 0;">Новых уведомлений нет</div>';
        }
    });

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
    
    document.getElementById('education-portal-btn')?.addEventListener('click', () => { window.open('https://pvz-learning.wb.ru/', '_blank'); });
    document.getElementById('main-page-link-btn')?.addEventListener('click', () => { window.open('https://pvz.wb.ru/', '_blank'); });
    document.getElementById('leave-feedback-btn')?.addEventListener('click', () => { toggleModal('help-menu', false); toggleModal('feedback-modal', true); });

    document.getElementById('overlay')?.addEventListener('click', () => {
        const helpMenu = document.getElementById('help-menu');
        const chatPanel = document.getElementById('chat-bot-panel');
        if (helpMenu && helpMenu.classList.contains('visible')) toggleModal('help-menu', false);
        if (chatPanel && chatPanel.classList.contains('visible')) {
            chatPanel.classList.remove('visible');
            document.getElementById('overlay').classList.remove('visible');
        }
    });

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
    localStorage.removeItem('savedPvzId'); 
    sessionStorage.removeItem('currentManager');
    sessionStorage.removeItem('currentManagerId');
    sessionStorage.removeItem('currentManagerRole');
    localStorage.removeItem('rememberMe');
    auth.signOut();
}

async function loadEmployeesToModal() {
    const uid = auth.currentUser.uid;
    const pvzId = localStorage.getItem('savedPvzId');
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
    const pvzId = localStorage.getItem('savedPvzId');
    if (!pvzId) {
        showAlert('Критическая ошибка: ID ПВЗ не определен. Перезайдите в систему.', true);
        return;
    }
    
    const idField = document.getElementById('emp-edit-id').value;
    
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
    const pvzId = localStorage.getItem('savedPvzId');
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
    { "name": "City Umbrella/Зонт черный автомат антиветер", "image": "https://mns-basket-cdn-04.geobasket.net/vol2129/part212953/212953101/images/big/1.webp", "price": 19.01, "color": "Черный", "size": "Универсальный", "config": "Зонт 1 шт., чехол", "link": "https://www.wildberries.by/catalog/12301", "isReturnable": true },
    { "name": "ONE HOME/Кружка для чая и кофе керамическая 200мл", "image": "https://mns-basket-cdn-04.geobasket.net/vol4687/part468792/468792941/images/big/1.webp", "price": 24.52, "color": "Белый", "size": "200 мл", "config": "Кружка керамическая 1 шт.", "link": "https://www.wildberries.by/catalog/12302", "isReturnable": true },
    { "name": "DianaShop/рюкзак городской тканьевый школьный для повседневки", "image": "https://mns-basket-cdn-05.geobasket.net/vol3760/part376000/376000942/images/big/1.webp", "price": 27.17, "color": "Серый", "size": "40х30х15 см", "config": "Рюкзак 1 шт.", "link": "https://www.wildberries.by/catalog/12303", "isReturnable": true },
    { "name": "Цейс-видео/Флешка 128 гб usb 2.0 мини для компьютера красивая маленькая", "image": "https://mns-basket-cdn-04.geobasket.net/vol3114/part311481/311481511/images/big/1.webp", "price": 24.95, "color": "Серебристый", "size": "128 ГБ", "config": "Флеш-накопитель 1 шт., упаковка", "link": "https://www.wildberries.by/catalog/12304", "isReturnable": false },
    { "name": "SmartX/Наушники беспроводные с микрофоном Pro 2", "image": "https://mns-basket-cdn-06.geobasket.net/vol4784/part478434/478434213/images/big/1.webp", "price": 47.61, "color": "Белый", "size": "Универсальный", "config": "Наушники, кейс, кабель Type-C, амбушюры", "link": "https://www.wildberries.by/catalog/12305", "isReturnable": false },
    { "name": "Winnetou/Термос 1 литр с датчиком температуры, для чая и кофе", "image": "https://mns-basket-cdn-06.geobasket.net/vol3673/part367356/367356138/images/big/1.webp", "price": 60.13, "color": "Металлик", "size": "1 л", "config": "Термос с крышкой 1 шт.", "link": "https://www.wildberries.by/catalog/12306", "isReturnable": true },
    { "name": "ТВОЕ/Плотная базовая классическая футболка", "image": "https://mns-basket-cdn-06.geobasket.net/vol2403/part240385/240385498/images/hq/1.webp", "price": 19.25, "color": "Белый", "size": "M", "config": "Футболка 1 шт.", "link": "https://www.wildberries.by/catalog/12307", "isReturnable": true },
    { "name": "BAASPLOA/Кроссовки летние дышащие сетка для бега и зала", "image": "https://mns-basket-cdn-04.geobasket.net/vol6586/part658634/658634206/images/big/1.webp", "price": 275.04, "color": "Черный", "size": "42", "config": "Пара кроссовок, коробка", "link": "https://www.wildberries.by/catalog/12308", "isReturnable": true },
    { "name": "ILUUS/Солнцезащитные очки квадратные", "image": "https://mns-basket-cdn-05.geobasket.net/vol2239/part223976/223976992/images/big/1.webp", "price": 3.88, "color": "Коричневый", "size": "Универсальный", "config": "Очки 1 шт., чехол-мешочек", "link": "https://www.wildberries.by/catalog/12309", "isReturnable": true },
    { "name": "PROFIT/Смарт часы умные Smart Watch 10 оригинал", "image": "https://mns-basket-cdn-02.geobasket.net/vol3319/part331961/331961479/images/big/1.webp", "price": 59.66, "color": "Черный", "size": "Универсальный", "config": "Часы, магнитная зарядка, инструкция", "link": "https://www.wildberries.by/catalog/12310", "isReturnable": false },
    { "name": "GEMBIRD/Клавиатура игровая с подсветкой круглые клавиши", "image": "https://mns-basket-cdn-05.geobasket.net/vol126/part12620/12620087/images/big/1.webp", "price": 23.37, "color": "Черный", "size": "43х13 см", "config": "Клавиатура проводная 1 шт.", "link": "https://www.wildberries.by/catalog/12311", "isReturnable": false },
    { "name": "HerLer/Мышь беспроводная бесшумная с аккумулятором и подсветкой", "image": "https://mns-basket-cdn-06.geobasket.net/vol1556/part155604/155604983/images/big/1.webp", "price": 11.15, "color": "Черный матовый", "size": "Стандарт", "config": "Мышь, USB-адаптер, кабель зарядки", "link": "https://www.wildberries.by/catalog/12312", "isReturnable": false },
    { "name": "GameTime/Игровая приставка для телевизора смарт консоль game stick", "image": "https://mns-basket-cdn-02.geobasket.net/vol3293/part329363/329363084/images/big/1.webp", "price": 111.22, "color": "Черный", "size": "64 ГБ", "config": "Консоль(стик), 2 геймпада, кабель", "link": "https://www.wildberries.by/catalog/12313", "isReturnable": false },
    { "name": "Красивый мир/Гидрогелевые патчи для глаз от отеков и мешков с золотом 24К", "image": "https://basket-24.wbbasket.ru/vol4222/part422273/422273330/images/big/1.webp", "price": 6.30, "color": "Золотой", "size": "60 шт", "config": "Баночка с патчами, лопаточка", "link": "https://www.wildberries.by/catalog/12314", "isReturnable": false },
    { "name": "BILBON/Тканевые маски для лица, набор 10 шт", "image": "https://basket-10.wbbasket.ru/vol1539/part153930/153930212/images/big/1.webp", "price": 10.27, "color": "Разноцветный", "size": "10 шт", "config": "Маски тканевые 10 шт.", "link": "https://www.wildberries.by/catalog/12315", "isReturnable": false },
    { "name": "MARKELL/Сыворотка для роста бровей и ресниц 10 мл", "image": "https://basket-28.wbbasket.ru/vol5434/part543460/543460737/images/big/1.webp", "price": 16.72, "color": "Прозрачный", "size": "10 мл", "config": "Флакон с щеточкой 1 шт.", "link": "https://www.wildberries.by/catalog/12316", "isReturnable": false },
    { "name": "Красотка/Бейби браш щеточки для ресниц и бровей", "image": "https://basket-18.wbbasket.ru/vol2969/part296932/296932598/images/big/1.webp", "price": 7.94, "color": "Розовый", "size": "50 шт", "config": "Упаковка щеточек", "link": "https://www.wildberries.by/catalog/12317", "isReturnable": true },
    { "name": "GreenEra/Твердый шампунь для роста и укрепления волос, от выпадения", "image": "https://mns-basket-cdn-02.geobasket.net/vol112/part11209/11209209/images/big/1.webp", "price": 16.41, "color": "Зеленый", "size": "50 г", "config": "Шайба шампуня в коробочке", "link": "https://www.wildberries.by/catalog/12318", "isReturnable": false },
    { "name": "Fito Cosmetic/Увлажняющий бальзам для восстановления губ Пантенол форте 4г", "image": "https://mns-basket-cdn-03.geobasket.net/vol1483/part148370/148370930/images/big/1.webp", "price": 5.36, "color": "Прозрачный", "size": "4 г", "config": "Тюбик бальзама 1 шт.", "link": "https://www.wildberries.by/catalog/12319", "isReturnable": false },
    { "name": "A&O/Спонж мини для макияжа на кончик пальца", "image": "https://mns-basket-cdn-04.geobasket.net/vol1830/part183083/183083556/images/big/1.webp", "price": 7.94, "color": "Бежевый", "size": "Мини", "config": "Спонж 1 шт.", "link": "https://www.wildberries.by/catalog/12320", "isReturnable": true },
    { "name": "Гардероб Тим/Набор двусторонних кистей для макияжа", "image": "https://mns-basket-cdn-05.geobasket.net/vol4665/part466502/466502837/images/big/1.webp", "price": 28.35, "color": "Черный", "size": "Универсальный", "config": "Кисти 5 шт., чехол", "link": "https://www.wildberries.by/catalog/12321", "isReturnable": true },
    { "name": "MIZON/Пилинг для лица скатка яблочная", "image": "https://mns-basket-cdn-02.geobasket.net/vol2608/part260845/260845089/images/big/1.webp", "price": 56.16, "color": "Белый", "size": "120 мл", "config": "Тюбик пилинга 1 шт.", "link": "https://www.wildberries.by/catalog/12322", "isReturnable": false },
    { "name": "LEMISA/Скраб для тела Кокос", "image": "https://mns-basket-cdn-06.geobasket.net/vol1826/part182667/182667948/images/big/1.webp", "price": 16.81, "color": "Белый", "size": "250 г", "config": "Баночка скраба 1 шт.", "link": "https://www.wildberries.by/catalog/12323", "isReturnable": false },
    { "name": "Secrets Lan/Дезодорант кристалл без запаха 2 шт", "image": "https://mns-basket-cdn-02.geobasket.net/vol1545/part154528/154528069/images/big/1.webp", "price": 12.81, "color": "Прозрачный", "size": "60 г х 2", "config": "Дезодорант кристалл 2 шт.", "link": "https://www.wildberries.by/catalog/12324", "isReturnable": false },
    { "name": "E-COSMETIC/Шампунь для волос OLLIN CARE ежедневный уход 1000 мл", "image": "https://mns-basket-cdn-06.geobasket.net/vol296/part29611/29611773/images/big/1.webp", "price": 40.84, "color": "Белый", "size": "1000 мл", "config": "Бутылка шампуня 1 шт.", "link": "https://www.wildberries.by/catalog/12325", "isReturnable": false },
    { "name": "Я Самая/Ватные диски 600 шт с веревочкой (5уп по 120шт)", "image": "https://mns-basket-cdn-02.geobasket.net/vol275/part27541/27541349/images/big/1.webp", "price": 18.78, "color": "Белый", "size": "600 шт", "config": "Упаковки по 120 шт. (5 шт.)", "link": "https://www.wildberries.by/catalog/12326", "isReturnable": false },
    { "name": "ECOLIVE/Бомбочки для ванны подарочный набор 12 штук", "image": "https://mns-basket-cdn-02.geobasket.net/vol7014/part701405/701405344/images/big/1.webp", "price": 30.60, "color": "Разноцветный", "size": "12 шт", "config": "Подарочная коробка, бомбочки 12 шт.", "link": "https://www.wildberries.by/catalog/12327", "isReturnable": false },
    { "name": "EPSOM.PRO/Магниевая соль для ванн для детей 500 гр", "image": "https://mns-basket-cdn-05.geobasket.net/vol1896/part189657/189657357/images/big/1.webp", "price": 15.72, "color": "Белый", "size": "500 г", "config": "Пакет с солью 1 шт.", "link": "https://www.wildberries.by/catalog/12328", "isReturnable": false },
    { "name": "MissLor/Массажер Гуаша микротоковый для лица и тела", "image": "https://mns-basket-cdn-03.geobasket.net/vol7636/part763656/763656740/images/big/1.webp", "price": 86.17, "color": "Белый", "size": "Универсальный", "config": "Массажер, кабель USB, инструкция", "link": "https://www.wildberries.by/catalog/12329", "isReturnable": false },
    { "name": "Chew/Отбеливающая зубная паста в таблетках", "image": "https://mns-basket-cdn-03.geobasket.net/vol1574/part157445/157445900/images/big/1.webp", "price": 12.84, "color": "Белый", "size": "60 шт", "config": "Баночка с таблетками 1 шт.", "link": "https://www.wildberries.by/catalog/12330", "isReturnable": false },
    { "name": "Secret Showcase/Мицеллярная вода для снятия макияжа с глаз и лица", "image": "https://mns-basket-cdn-02.geobasket.net/vol7655/part765585/765585869/images/big/1.webp", "price": 11.72, "color": "Прозрачный", "size": "500 мл", "config": "Бутылка мицеллярной воды", "link": "https://www.wildberries.by/catalog/12331", "isReturnable": false },
    { "name": "OfficeClean/Жидкое мыло для рук, набор 3 по 500мл", "image": "https://mns-basket-cdn-06.geobasket.net/vol2713/part271319/271319193/images/big/1.webp", "price": 12.03, "color": "Зеленый/Желтый", "size": "3 х 500 мл", "config": "Бутылки с дозатором 3 шт.", "link": "https://www.wildberries.by/catalog/12332", "isReturnable": false },
    { "name": "Цифровой Рай/Повербанк 10000 powerbank с проводами для телефона", "image": "https://mns-basket-cdn-04.geobasket.net/vol3585/part358566/358566751/images/big/1.webp", "price": 34.90, "color": "Черный", "size": "10000 mAh", "config": "Повербанк со встроенными проводами", "link": "https://www.wildberries.by/catalog/12333", "isReturnable": false },
    { "name": "MarketHub/Внешний аккумулятор Acefast M16 Power Bank Черный", "image": "https://mns-basket-cdn-06.geobasket.net/vol5021/part502176/502176053/images/big/1.webp", "price": 112.67, "color": "Черный", "size": "20000 mAh", "config": "Аккумулятор, кабель Type-C", "link": "https://www.wildberries.by/catalog/12334", "isReturnable": false },
    { "name": "Baseus/Кабель Display Type-C - Type-C 100 Вт, 2м", "image": "https://mns-basket-cdn-05.geobasket.net/vol5861/part586165/586165097/images/big/1.webp", "price": 44.48, "color": "Серый", "size": "2 метра", "config": "Кабель с дисплеем 1 шт.", "link": "https://www.wildberries.by/catalog/12335", "isReturnable": false },
    { "name": "KRKA/Селафорт 6% капли от блох д/кошек 2,6-7,5кг 0,75мл(45мг) №1", "image": "https://mns-basket-cdn-05.geobasket.net/vol3708/part370844/370844257/images/big/1.webp", "price": 19.20, "color": "Прозрачный", "size": "0.75 мл", "config": "Пипетка в блистере 1 шт.", "link": "https://www.wildberries.by/catalog/12336", "isReturnable": false },
    { "name": "Dr. Zubareva/Магний В6 хелат глицинат бисглицинат", "image": "https://mns-basket-cdn-05.geobasket.net/vol8206/part820603/820603402/images/big/1.webp", "price": 42.61, "color": "Белый", "size": "120 капсул", "config": "Банка витаминов 1 шт.", "link": "https://www.wildberries.by/catalog/12337", "isReturnable": false },
    { "name": "Органик Микс/Универсальное удобрение для рассады овощей Морской коктейль", "image": "https://mns-basket-cdn-04.geobasket.net/vol3429/part342956/342956246/images/big/1.webp", "price": 13.08, "color": "Коричневый", "size": "200 г", "config": "Пакет с удобрением 1 шт.", "link": "https://www.wildberries.by/catalog/12338", "isReturnable": false },
    { "name": "UZcotton/Футболка базовая хлопок L", "image": "https://mns-basket-cdn-02.geobasket.net/vol269/part26990/26990809/images/big/1.webp", "price": 18.17, "color": "Черный", "size": "L", "config": "Футболка 1 шт.", "link": "https://www.wildberries.by/catalog/12339", "isReturnable": true },
    { "name": "Nutley/Конфеты без сахара Ассорти Полезный и вкусный подарок 1кг", "image": "https://mns-basket-cdn-04.geobasket.net/vol2153/part215380/215380836/images/big/1.webp", "price": 21.45, "color": "Ассорти", "size": "1 кг", "config": "Коробка конфет", "link": "https://www.wildberries.by/catalog/12340", "isReturnable": false },
    { "name": "UZcotton/Футболка коричневая хлопок S", "image": "https://mns-basket-cdn-03.geobasket.net/vol132/part13212/13212370/images/big/1.webp", "price": 18.72, "color": "Коричневый", "size": "S", "config": "Футболка 1 шт.", "link": "https://www.wildberries.by/catalog/12341", "isReturnable": true },
    { "name": "YeSiMi/Маски для лица тканевые набор 30 шт", "image": "https://mns-basket-cdn-04.geobasket.net/vol1613/part161341/161341156/images/big/1.webp", "price": 23.27, "color": "Белый", "size": "30 шт", "config": "Упаковка тканевых масок", "link": "https://www.wildberries.by/catalog/12342", "isReturnable": false },
    { "name": "Bona Forte/Удобрение для клубники и ягод гранулы 1 раз в сезон, 800 г", "image": "https://mns-basket-cdn-04.geobasket.net/vol1407/part140700/140700836/images/big/1.webp", "price": 17.12, "color": "Розовый", "size": "800 г", "config": "Пакет с гранулами 1 шт.", "link": "https://www.wildberries.by/catalog/12343", "isReturnable": false },
    { "name": "LingLong/шины летние 175/70 R13 82T", "image": "https://mns-basket-cdn-05.geobasket.net/vol2186/part218686/218686542/images/big/1.webp", "price": 106.67, "color": "Черный", "size": "R13", "config": "Автошина 1 шт.", "link": "https://www.wildberries.by/catalog/12344", "isReturnable": true },
    { "name": "STEPWEEK/Слипоны повседневные 41", "image": "https://mns-basket-cdn-04.geobasket.net/vol256/part25624/25624221/images/big/1.webp", "price": 23.66, "color": "Темно-синий", "size": "41", "config": "Пара слипонов, коробка", "link": "https://www.wildberries.by/catalog/12345", "isReturnable": true },
    { "name": "CROCS/Сабо для пляжа кроксы черные 44-45", "image": "https://mns-basket-cdn-04.geobasket.net/vol8729/part872996/872996606/images/big/1.webp", "price": 54.91, "color": "Черный", "size": "44-45", "config": "Пара сабо", "link": "https://www.wildberries.by/catalog/12346", "isReturnable": true },
    { "name": "BEST/Шлепки тапки резиновые домашние 41", "image": "https://mns-basket-cdn-02.geobasket.net/vol968/part96808/96808074/images/big/1.webp", "price": 26.88, "color": "Серый", "size": "41", "config": "Пара шлепанцев", "link": "https://www.wildberries.by/catalog/12347", "isReturnable": true },
    { "name": "Obba/Замшевые туфли лодочки на шпильке", "image": "https://mns-basket-cdn-03.geobasket.net/vol5673/part567381/567381350/images/big/1.webp", "price": 156.61, "color": "Бордовый", "size": "38", "config": "Туфли, коробка, пыльник", "link": "https://www.wildberries.by/catalog/12348", "isReturnable": true },
    { "name": "Xiaomi/Зарядное устройство xiaomi 33w оригинал", "image": "https://mns-basket-cdn-05.geobasket.net/vol7447/part744734/744734347/images/big/1.webp", "price": 51.13, "color": "Белый", "size": "33W", "config": "Блок питания, кабель", "link": "https://www.wildberries.by/catalog/12349", "isReturnable": false },
    { "name": "Яндекс/Умная колонка Станция Лайт 2 с Алисой, фиолетовая", "image": "https://mns-basket-cdn-04.geobasket.net/vol3038/part303802/303802236/images/big/1.webp", "price": 188.25, "color": "Фиолетовый", "size": "Лайт 2", "config": "Колонка, блок питания, инструкция", "link": "https://www.wildberries.by/catalog/12350", "isReturnable": false },
    { "name": "DOHEALTH/Зубная щетка электрическая звуковая", "image": "https://mns-basket-cdn-03.geobasket.net/vol5492/part549228/549228610/images/big/1.webp", "price": 51.04, "color": "Белый", "size": "Стандарт", "config": "Щетка, 4 насадки, кабель", "link": "https://www.wildberries.by/catalog/12351", "isReturnable": false },
    { "name": "Hatber/Скетчбук для рисования А5, блокнот", "image": "https://mns-basket-cdn-02.geobasket.net/vol1180/part118073/118073084/images/big/1.webp", "price": 6.88, "color": "Принт", "size": "А5", "config": "Скетчбук 1 шт.", "link": "https://www.wildberries.by/catalog/12352", "isReturnable": true },
    { "name": "АРТформат/Карандаши цветные Blackwood 24 цвета мягкие для рисования", "image": "https://mns-basket-cdn-03.geobasket.net/vol143/part14344/14344295/images/big/1.webp", "price": 18.07, "color": "24 цвета", "size": "Стандарт", "config": "Упаковка карандашей", "link": "https://www.wildberries.by/catalog/12353", "isReturnable": true },
    { "name": "Brauberg/Точилка для карандашей электрическая на батарейках для школы", "image": "https://mns-basket-cdn-05.geobasket.net/vol1740/part174048/174048487/images/big/1.webp", "price": 16.39, "color": "Синий", "size": "Компакт", "config": "Точилка 1 шт.", "link": "https://www.wildberries.by/catalog/12354", "isReturnable": false },
    { "name": "WALKER/Наушники беспроводные с микрофоном для телефона", "image": "https://mns-basket-cdn-03.geobasket.net/vol4344/part434460/434460365/images/big/1.webp", "price": 45.66, "color": "Черный", "size": "Вкладыши", "config": "Наушники, кейс, провод", "link": "https://www.wildberries.by/catalog/12355", "isReturnable": false },
    { "name": "Gerlax/Повербанк с быстрой зарядкой для телефона", "image": "https://mns-basket-cdn-03.geobasket.net/vol6090/part609015/609015050/images/big/1.webp", "price": 48.86, "color": "Белый", "size": "20000 mAh", "config": "Повербанк, упаковка", "link": "https://www.wildberries.by/catalog/12356", "isReturnable": false },
    { "name": "HOCO/Кабель type-c usb для зарядки android", "image": "https://mns-basket-cdn-03.geobasket.net/vol1606/part160613/160613840/images/big/1.webp", "price": 12.71, "color": "Черный", "size": "1 метр", "config": "Кабель 1 шт.", "link": "https://www.wildberries.by/catalog/12357", "isReturnable": false },
    { "name": "Dway/Видеорегистратор для автомобиля 2 в 1 с камерой заднего вида", "image": "https://mns-basket-cdn-06.geobasket.net/vol6119/part611984/611984758/images/big/1.webp", "price": 106.05, "color": "Черный", "size": "Зеркало", "config": "Регистратор, задняя камера, провода", "link": "https://www.wildberries.by/catalog/12358", "isReturnable": false },
    { "name": "STIMAXON/Пылесос для автомобиля беспроводной мощный", "image": "https://mns-basket-cdn-06.geobasket.net/vol1537/part153738/153738788/images/big/1.webp", "price": 52.43, "color": "Серый", "size": "Компакт", "config": "Пылесос, 3 насадки, кабель", "link": "https://www.wildberries.by/catalog/12359", "isReturnable": false },
    { "name": "AREON/Ароматизатор в машину картонный Дыня", "image": "https://mns-basket-cdn-04.geobasket.net/vol7202/part720237/720237951/images/big/1.webp", "price": 5.13, "color": "Желтый", "size": "1 шт", "config": "Ароматизатор в блистере", "link": "https://www.wildberries.by/catalog/12360", "isReturnable": true },
    { "name": "listoff/Ежедневник недатированный А5 136 л. кожаный для работы", "image": "https://mns-basket-cdn-06.geobasket.net/vol5319/part531926/531926608/images/big/1.webp", "price": 11.89, "color": "Коричневый", "size": "А5", "config": "Ежедневник 1 шт.", "link": "https://www.wildberries.by/catalog/12361", "isReturnable": true },
    { "name": "Pensan/Ручки шариковые синие набор для школы и офиса Global 12шт", "image": "https://mns-basket-cdn-04.geobasket.net/vol1051/part105108/105108321/images/big/1.webp", "price": 10.04, "color": "Синий", "size": "12 шт", "config": "Коробка с ручками", "link": "https://www.wildberries.by/catalog/12362", "isReturnable": true },
    { "name": "BG/Блочная тетрадь на кольцах со сменными блоками 120 листов", "image": "https://mns-basket-cdn-02.geobasket.net/vol4339/part433912/433912719/images/big/1.webp", "price": 11.36, "color": "Мятный", "size": "А5", "config": "Тетрадь с кольцами", "link": "https://www.wildberries.by/catalog/12363", "isReturnable": true },
    { "name": "H&S/Набор маркеров для скетчинга 60 штук", "image": "https://mns-basket-cdn-04.geobasket.net/vol405/part40528/40528891/images/big/1.webp", "price": 23.66, "color": "60 цветов", "size": "Сумочка", "config": "Сумка, маркеры 60шт.", "link": "https://www.wildberries.by/catalog/12364", "isReturnable": true },
    { "name": "Феникс/Книга теней : Книги саморазвитие", "image": "https://mns-basket-cdn-04.geobasket.net/vol4937/part493796/493796516/images/big/1.webp", "price": 5.86, "color": "Темный", "size": "Стандарт", "config": "Книга в переплете", "link": "https://www.wildberries.by/catalog/12365", "isReturnable": true },
    { "name": "Berlingo/Папка органайзер для документов семейная, А4", "image": "https://mns-basket-cdn-05.geobasket.net/vol484/part48478/48478802/images/big/1.webp", "price": 9.35, "color": "Синий", "size": "А4", "config": "Папка-органайзер 1 шт.", "link": "https://www.wildberries.by/catalog/12366", "isReturnable": true },
    { "name": "Berlingo/Клей-карандаш канцелярский pvp, набор 3 штуки по 8 гр", "image": "https://mns-basket-cdn-05.geobasket.net/vol4814/part481420/481420807/images/big/1.webp", "price": 5.81, "color": "Белый", "size": "3 х 8 г", "config": "Упаковка с клеем 3 шт.", "link": "https://www.wildberries.by/catalog/12367", "isReturnable": true }
];
      
const adultProductData = [
    { "name": "MERLO/Вино белое полусладкое, Италия", "image": "https://placehold.co/1200x800/png?text=Wine+White", "price": 14.34, "isAdult": true, "color": "Светлый", "size": "0.75 л", "config": "Бутылка стеклянная 1 шт.", "link": "https://www.wildberries.by", "isReturnable": false },
    { "name": "ALTO/Вино красное сухое, Испания", "image": "https://placehold.co/1200x800/png?text=Wine+Red", "price": 20.64, "isAdult": true, "color": "Красный", "size": "0.75 л", "config": "Бутылка стеклянная 1 шт.", "link": "https://www.wildberries.by", "isReturnable": false }
];