// Глобальные переменные для состояний многошаговой авторизации
window.currentLoginId = null;
window.currentOwnerUid = null;
window.targetEmail = null;
window.targetPassword = null; // Добавлено для хранения пароля из БД

document.addEventListener('DOMContentLoaded', () => {
    const isLoginPage = !!document.getElementById('next-phone-btn');
    const isRegisterPage = !!document.getElementById('register-btn');

    if (isLoginPage) {
        initCountrySelector('login-phone-wrapper');

        // Обработчики шагов авторизации
        document.getElementById('next-phone-btn').addEventListener('click', handlePhoneNext);
        document.getElementById('login-id').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handlePhoneNext();
        });

        document.getElementById('login-submit-btn').addEventListener('click', handlePasswordSubmit);
        document.getElementById('login-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handlePasswordSubmit();
        });

        document.getElementById('back-to-phone-btn').addEventListener('click', () => {
            document.getElementById('step-password').style.display = 'none';
            document.getElementById('step-phone').style.display = 'block';
            document.getElementById('error-message-password').style.display = 'none';
            document.getElementById('login-password').value = '';
        });

        document.getElementById('forgot-password-link').addEventListener('click', async () => {
            if (window.targetEmail) {
                try {
                    await firebase.auth().sendPasswordResetEmail(window.targetEmail);
                    alert('Ссылка для сброса пароля отправлена на email аккаунта.');
                } catch(e) {
                    alert('Ошибка отправки: ' + e.message);
                }
            } else {
                alert('Не удалось найти email привязанный к аккаунту.');
            }
        });

        document.getElementById('pvz-not-found-btn')?.addEventListener('click', () => {
             alert("Извините за временное неудобство! Возможно мы не активировали ваш ПВЗ в системе Wildberries, если ПВЗ не появится в течении 15 минут, сообщите об этом нам на сайте pvz.wb.ru в разделе помощник!");
        });

        // Авто-авторизация (старая сессия)
        firebase.auth().onAuthStateChanged(async user => {
            if (user && window.location.pathname.includes('login.html')) {
                checkSavedSessionsAndRedirect(user.uid);
            }
        });
        
        const empPhoneSession = localStorage.getItem('employeePhone') || sessionStorage.getItem('employeePhone');
        if (!firebase.auth().currentUser && empPhoneSession) {
             checkSavedSessionsAndRedirect(null);
        }

    } else if (isRegisterPage) {
        initCountrySelector('reg-phone-wrapper');
        initCountrySelector('owner-phone-wrapper');
        setupRegisterLogic();
    }
});

async function checkSavedSessionsAndRedirect(ownerUid) {
    const hasPvz = localStorage.getItem('savedPvzId');
    const savedOwner = localStorage.getItem('savedOwnerUid') || ownerUid;
    const hasManager = sessionStorage.getItem('currentManager');

    if (hasPvz && hasManager) {
        window.location.href = 'index.html';
    } else if (hasPvz && savedOwner && !hasManager) {
        // Быстрый переход к списку менеджеров, если ПВЗ уже выбран
        document.getElementById('main-auth-form').style.display = 'none';
        loadEmployeesForFastLogin(savedOwner, hasPvz);
    } else if (ownerUid) {
        document.getElementById('main-auth-form').style.display = 'none';
        
        // Поиск ПВЗ пользователя по новой структуре
        const allPvzSnap = await firebase.database().ref('pvz').once('value');
        const allPvz = allPvzSnap.val() || {};
        let pvzData = Object.values(allPvz).filter(p => p.ownerId === ownerUid || p.uid === ownerUid);

        // Резервный поиск по старой структуре
        if (pvzData.length === 0) {
            const pvzSnap = await firebase.database().ref('users/' + ownerUid + '/pvzInfo').once('value');
            if (pvzSnap.exists()) {
                pvzData = pvzSnap.val();
            }
        }
        
        showPvzSelectionScreen(pvzData);
    }
}

function initCountrySelector(wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    
    const selector = wrapper.querySelector('.custom-country-selector');
    const selectedFlag = wrapper.querySelector('.flag-img');
    const list = wrapper.querySelector('.country-dropdown-list');
    const prefixSpan = wrapper.querySelector('.phone-prefix');
    const phoneInput = wrapper.querySelector('.phone-input');

    phoneInput.dataset.countryCode = '7'; 
    phoneInput.maxLength = 10;

    selector.addEventListener('click', (e) => {
        list.classList.toggle('show');
        e.stopPropagation();
    });

    document.addEventListener('click', () => {
        list.classList.remove('show');
    });

    list.querySelectorAll('li').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const code = item.getAttribute('data-code');
            const prefix = item.getAttribute('data-prefix');
            const length = item.getAttribute('data-length');
            const imgSrc = item.getAttribute('data-img');

            phoneInput.dataset.countryCode = code;
            selectedFlag.src = imgSrc;
            prefixSpan.textContent = prefix;
            if(length) phoneInput.maxLength = length;
            phoneInput.value = '';
            phoneInput.focus();

            list.classList.remove('show');
        });
    });
}

// ШАГ 1: Поиск номера в БД
async function handlePhoneNext() {
    const phoneInputEl = document.getElementById('login-id');
    const countryCode = phoneInputEl.dataset.countryCode || '7';
    const cleanPhoneInput = phoneInputEl.value.trim().replace(/\D/g, ''); 
    const loginId = countryCode + cleanPhoneInput;

    const errorEl = document.getElementById('error-message-phone');
    const nextBtn = document.getElementById('next-phone-btn');

    if (!cleanPhoneInput) {
        errorEl.textContent = 'Пожалуйста, введите номер телефона.';
        errorEl.style.display = 'block';
        return;
    }

    nextBtn.disabled = true;
    nextBtn.innerHTML = `<div class="button-spinner"></div>`;
    errorEl.style.display = 'none';

    try {
        // Поиск по ветке, где лежат файлы регистрации (phoneIndex)
        const phoneIndexRef = firebase.database().ref('phoneIndex/' + loginId);
        const phoneSnapshot = await phoneIndexRef.once('value');
        
        if (!phoneSnapshot.exists()) {
            throw new Error("Номер не найден в базе данных.");
        }

        window.currentLoginId = loginId;
        const phoneData = phoneSnapshot.val();
        
        // UID может быть строкой или лежать внутри объекта
        const uid = typeof phoneData === 'string' ? phoneData : (phoneData.uid || Object.keys(phoneData)[0]);
        window.currentOwnerUid = uid;

        // Вытягиваем пароль и email напрямую из ветки users по структуре новой регистрации
        const userSnap = await firebase.database().ref('users/' + uid).once('value');
        const userData = userSnap.val();
        
        if (!userData || !userData.password) {
            throw new Error("Пароль не найден для данного пользователя. Обратитесь в поддержку.");
        }

        window.targetPassword = userData.password;
        
        let targetEmail = null;
        if (userData.email) targetEmail = userData.email;
        else if (userData.profile && userData.profile.email) targetEmail = userData.profile.email;
        else if (userData.pvzInfo && userData.pvzInfo.email) targetEmail = userData.pvzInfo.email;

        window.targetEmail = targetEmail;

        document.getElementById('step-phone').style.display = 'none';
        document.getElementById('step-password').style.display = 'block';
        document.getElementById('login-password').focus();

    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
    } finally {
        nextBtn.disabled = false;
        nextBtn.innerHTML = `<span>Далее</span>`;
    }
}

// ШАГ 2: Проверка пароля напрямую по базе данных
async function handlePasswordSubmit() {
    const passwordInput = document.getElementById('login-password').value;
    const errorEl = document.getElementById('error-message-password');
    const submitBtn = document.getElementById('login-submit-btn');
    const rememberMe = document.getElementById('remember-me').checked;

    if (!passwordInput) {
        errorEl.textContent = 'Пожалуйста, введите пароль.';
        errorEl.style.display = 'block';
        return;
    }

    errorEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<div class="button-spinner"></div>`;

    try {
        // Прямая сверка введенного пароля с паролем из ветки users
        if (passwordInput !== window.targetPassword) {
            throw { code: 'auth/wrong-password' };
        }
        
        // Фоновая авторизация Firebase для поддержания встроенных сессий (не блокирует вход если падает)
        if (window.targetEmail) {
            try {
                await firebase.auth().signInWithEmailAndPassword(window.targetEmail, passwordInput);
            } catch (authError) {
                console.warn("Фоновая авторизация Firebase не удалась, но БД пароль верен.", authError);
            }
        }

        if (rememberMe) {
            localStorage.setItem('employeePhone', window.currentLoginId);
        } else {
            sessionStorage.setItem('employeePhone', window.currentLoginId);
        }

        const uid = window.currentOwnerUid;
        
        // Подгружаем ПВЗ (учитываем новую и старую структуру)
        const allPvzSnap = await firebase.database().ref('pvz').once('value');
        const allPvz = allPvzSnap.val() || {};
        let pvzData = Object.values(allPvz).filter(p => p.ownerId === uid || p.uid === uid);
        
        if (pvzData.length === 0) {
            const oldPvzSnap = await firebase.database().ref('users/' + uid + '/pvzInfo').once('value');
            if (oldPvzSnap.exists()) {
                pvzData = oldPvzSnap.val();
            }
        }

        showPvzSelectionScreen(pvzData);

    } catch (error) {
        if (error.code === 'auth/wrong-password') {
            errorEl.textContent = 'Неверный пароль.';
        } else {
            errorEl.textContent = error.message || 'Ошибка авторизации.';
        }
        errorEl.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Войти</span>`;
    }
}

// ШАГ 3: Отображение пунктов выдачи
function showPvzSelectionScreen(pvzListRaw) {
    document.getElementById('main-auth-form').style.display = 'none';
    document.getElementById('manager-selection-screen').style.display = 'none';
    
    const listContainer = document.getElementById('pvz-list-container');
    listContainer.innerHTML = '';

    let pvzList = [];
    if (pvzListRaw && typeof pvzListRaw === 'object') {
        if (Array.isArray(pvzListRaw)) pvzList = pvzListRaw;
        else if (pvzListRaw.id || pvzListRaw.pvzId) pvzList = [pvzListRaw]; 
        else pvzList = Object.values(pvzListRaw);
    }

    if (pvzList.length > 0) {
        pvzList.forEach(pvz => {
            const pvzIdentifier = pvz.id || pvz.pvzId || 'Не указан';
            const btn = document.createElement('div');
            btn.className = 'pvz-select-item';
            btn.innerHTML = `<div><strong>ID: ${pvzIdentifier}</strong><span style="color: var(--text-secondary-color); font-size: 0.9rem; display:block; margin-top:2px;">${pvz.address || 'Адрес не указан'}</span></div><i class="fas fa-chevron-right" style="color: var(--gray-medium);"></i>`;
            btn.addEventListener('click', () => selectPvzAndProceed(pvz));
            listContainer.appendChild(btn);
        });
    } else {
        listContainer.innerHTML = '<p style="text-align:center; padding: 20px;">ПВЗ не найдены.</p>';
    }
    
    document.getElementById('pvz-selection-screen').style.display = 'block';
}

// ШАГ 4: Выбор ПВЗ и переход к списку сотрудников
async function selectPvzAndProceed(selectedPvz) {
    const pvzId = selectedPvz.id || selectedPvz.pvzId;
    if(pvzId) {
        localStorage.setItem('savedPvzId', pvzId);
    }
    
    document.getElementById('pvz-selection-screen').style.display = 'none';

    let ownerUid = selectedPvz.ownerId || selectedPvz.uid;
    if (!ownerUid) {
        ownerUid = window.currentOwnerUid;
    }

    if (!ownerUid) {
        alert("Системная ошибка: Не удалось определить владельца ПВЗ.");
        return;
    }
    
    localStorage.setItem('savedOwnerUid', ownerUid);
    loadEmployeesForFastLogin(ownerUid, pvzId);
}

// Загрузка списка сотрудников
async function loadEmployeesForFastLogin(ownerUid, pvzId) {
    const empRef = firebase.database().ref(`users/${ownerUid}/employees/${pvzId}`);
    const snap = await empRef.once('value');
    let employees = [];

    if (snap.exists()) {
        employees = Object.values(snap.val());
    } else {
        const defaultEmp = {
            id: Math.floor(100000000 + Math.random() * 900000000).toString(),
            lastName: 'Собственник',
            firstName: 'ПВЗ',
            patronymic: '',
            role: 'owner',
            phone: window.currentLoginId || ''
        };
        await empRef.child(defaultEmp.id).set(defaultEmp);
        employees.push(defaultEmp);
    }

    const list = document.querySelector('.manager-list');
    list.innerHTML = '';
    
    if (employees.length === 0) {
        list.innerHTML = '<p style="text-align:center; padding: 20px;">Сотрудники не найдены.</p>';
    }

    employees.forEach(emp => {
        const item = document.createElement('div');
        item.className = 'manager-item';
        item.innerHTML = `<strong>${emp.lastName} ${emp.firstName}</strong><span>${emp.role === 'owner' ? 'Собственник ПВЗ' : 'Менеджер'}</span>`;
        item.addEventListener('click', () => {
            handleEmployeeClick(emp);
        });
        list.appendChild(item);
    });

    document.getElementById('pvz-selection-screen').style.display = 'none';
    document.getElementById('manager-selection-screen').style.display = 'block';
}

// ШАГ 5: Вход в систему под выбранным сотрудником
function handleEmployeeClick(emp) {
    sessionStorage.setItem('currentManager', `${emp.firstName} ${emp.lastName}`);
    sessionStorage.setItem('currentManagerId', emp.id);
    sessionStorage.setItem('currentManagerRole', emp.role);
    sessionStorage.setItem('showServerLoading', 'true');
    
    window.location.href = 'index.html';
}