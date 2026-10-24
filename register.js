document.addEventListener('DOMContentLoaded', () => {
    // 1. Инициализация выбора страны
    initCountrySelector('reg-phone-wrapper');

    // Флаг-защита от спама уведомлениями
    let isErrorCooldown = false;

    // ГЛОБАЛЬНАЯ СИСТЕМА ОШИБОК
    function showError(msg) {
        if (isErrorCooldown) return;

        isErrorCooldown = true;
        setTimeout(() => {
            isErrorCooldown = false;
        }, 5000);

        const container = document.getElementById('toast-container');
        
        const toast = document.createElement('div');
        toast.className = 'custom-toast';
        
        toast.innerHTML = `
            <img src="error.svg" class="toast-icon" alt="Error">
            <span class="toast-text">${msg}</span>
            <span class="toast-close">&times;</span>
        `;
        
        container.appendChild(toast);
        
        const audio = new Audio('failScan.mp3');
        audio.play().catch(e => console.log("Audio play prevented:", e));
        
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
        
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            closeToast(toast);
        });
        
        setTimeout(() => {
            closeToast(toast);
        }, 5000);
    }

    function closeToast(toast) {
        toast.classList.remove('show');
        setTimeout(() => {
            if(toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 400); 
    }

    // 2. Логика иконки "Глаз" для пароля
    const togglePassword = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('reg-password');

    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', function () {
            const isPassword = passwordInput.getAttribute('type') === 'password';
            passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
            
            if (isPassword) {
                this.classList.remove('fa-eye');
                this.classList.add('fa-eye-slash');
            } else {
                this.classList.remove('fa-eye-slash');
                this.classList.add('fa-eye');
            }
        });
    }

    const howToGetTextarea = document.getElementById('reg-how-to-get');
    howToGetTextarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // 3. Переход от Шага 1 к Шагу 2
    document.getElementById('reg-next-btn').addEventListener('click', () => {
        const phoneInput = document.getElementById('reg-phone').value.trim();
        const pwdInput = document.getElementById('reg-password').value.trim();

        if (!phoneInput || !pwdInput) {
            showError('Введите номер телефона и пароль.');
            return;
        }
        if (pwdInput.length < 6) {
            showError('Пароль должен содержать минимум 6 символов.');
            return;
        }
        
        const selectedFlagImg = document.querySelector('.selected-country .flag-img');
        const isRussia = selectedFlagImg.src.includes('ru.svg');
        const pvzTypeWrapper = document.getElementById('pvz-type-wrapper');
        const pvzTypeInput = document.getElementById('reg-pvz-type');
        const pvzSelectedText = document.getElementById('pvz-selected-text');
        const workingHoursGroup = document.getElementById('working-hours-group');
        
        if (isRussia) {
            pvzTypeWrapper.style.display = 'block';
            pvzTypeInput.value = "";
            pvzSelectedText.textContent = "Выберите вид ПВЗ...";
            workingHoursGroup.style.display = 'none';
            howToGetTextarea.value = '';
            howToGetTextarea.style.height = 'auto';
        } else {
            pvzTypeWrapper.style.display = 'none';
            handlePvzTypeChange('Отдельное здание');
        }

        document.getElementById('step-1').style.display = 'none';
        document.getElementById('step-2').style.display = 'flex';
    });

    document.getElementById('reg-back-btn').addEventListener('click', () => {
        document.getElementById('step-2').style.display = 'none';
        document.getElementById('step-1').style.display = 'flex';
    });

    // 4. Логика модального окна для иконки Инфо
    const infoIcon = document.getElementById('address-info-icon');
    const mobileModal = document.getElementById('address-mobile-modal');
    const closeMobileModal = document.getElementById('close-address-modal');

    if (infoIcon) {
        infoIcon.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                mobileModal.style.display = 'flex';
            }
        });
    }

    if (closeMobileModal) {
        closeMobileModal.addEventListener('click', () => {
            mobileModal.style.display = 'none';
        });
    }

    const fittingRoomsInput = document.getElementById('reg-fitting-rooms');
    fittingRoomsInput.addEventListener('input', function() {
        if (this.value !== '') {
            let val = parseInt(this.value, 10);
            if (val < 1) this.value = 1;
            if (val > 100) this.value = 100;
        }
    });

    // --- ЛОГИКА КАСТОМНОГО СЕЛЕКТА "ВИД ПВЗ" ---
    const pvzFancyBox = document.getElementById('pvz-fancy-box');
    const pvzFancyOptions = document.getElementById('pvz-fancy-options');
    const pvzSelectedText = document.getElementById('pvz-selected-text');
    const pvzHiddenInput = document.getElementById('reg-pvz-type');
    
    const workingHoursGroup = document.getElementById('working-hours-group');
    const schBuilding = document.getElementById('schedule-building');
    const schPost = document.getElementById('schedule-post');

    if (pvzFancyBox) {
        pvzFancyBox.addEventListener('click', (e) => {
            e.stopPropagation();
            pvzFancyBox.classList.toggle('active');
            pvzFancyOptions.classList.toggle('show');
        });
    }

    document.addEventListener('click', () => {
        if (pvzFancyBox) {
            pvzFancyBox.classList.remove('active');
            pvzFancyOptions.classList.remove('show');
        }
    });

    if (pvzFancyOptions) {
        pvzFancyOptions.querySelectorAll('li').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = item.getAttribute('data-value');
                pvzSelectedText.innerHTML = item.innerHTML; 
                pvzFancyBox.classList.remove('active');
                pvzFancyOptions.classList.remove('show');
                
                handlePvzTypeChange(val);
            });
        });
    }

    function handlePvzTypeChange(val) {
        pvzHiddenInput.value = val;
        workingHoursGroup.style.display = 'block';
        howToGetTextarea.value = '';
        howToGetTextarea.style.height = 'auto';

        if (val === 'Отдельное здание') {
            schBuilding.style.display = 'block';
            schPost.style.display = 'none';
            howToGetTextarea.placeholder = 'Ориентиры и маршрут'; 
        } else if (val === 'Пункт в отделении Почты России') {
            schBuilding.style.display = 'none';
            schPost.style.display = 'block';
            howToGetTextarea.placeholder = 'Укажите номер отделения'; 
        } else {
            workingHoursGroup.style.display = 'none';
        }
    }


    // --- ГЕНЕРАЦИЯ И УПРАВЛЕНИЕ ГРАФИКОМ РАБОТЫ ПОЧТЫ ---
    const postDaysContainer = document.getElementById('post-days-container');
    const daysOfWeek = [
        { id: 'mon', label: 'ПН' }, { id: 'tue', label: 'ВТ' }, { id: 'wed', label: 'СР' },
        { id: 'thu', label: 'ЧТ' }, { id: 'fri', label: 'ПТ' }, { id: 'sat', label: 'СБ' }, { id: 'sun', label: 'ВС' }
    ];

    function generatePostScheduleUI() {
        postDaysContainer.innerHTML = '';
        daysOfWeek.forEach(day => {
            const row = document.createElement('div');
            row.className = 'schedule-row';
            row.innerHTML = `
                <div class="day-label">${day.label}</div>
                <select id="mode-${day.id}" class="custom-select schedule-select">
                    <option value="Указать режим работы">Рабочий день</option>
                    <option value="Выходной">Выходной</option>
                </select>
                <div class="time-inputs" id="time-inputs-${day.id}">
                    <div class="fancy-input-wrapper" style="width: auto;">
                        <input type="time" id="start-${day.id}" value="09:00" onclick="this.showPicker()">
                    </div>
                    <span>—</span> 
                    <div class="fancy-input-wrapper" style="width: auto;">
                        <input type="time" id="end-${day.id}" value="18:00" onclick="this.showPicker()">
                    </div>
                </div>
                <div class="break-section" id="break-section-${day.id}">
                    <label class="break-checkbox-label">
                        <input type="checkbox" id="has-break-${day.id}"> Перерыв
                    </label>
                    <div class="time-inputs disabled-element" id="break-inputs-${day.id}">
                        <div class="fancy-input-wrapper" style="width: auto;">
                            <input type="time" id="bstart-${day.id}" value="13:00" onclick="this.showPicker()">
                        </div>
                        <span>—</span> 
                        <div class="fancy-input-wrapper" style="width: auto;">
                            <input type="time" id="bend-${day.id}" value="14:00" onclick="this.showPicker()">
                        </div>
                    </div>
                </div>
            `;
            postDaysContainer.appendChild(row);

            const modeSelect = row.querySelector(`#mode-${day.id}`);
            const timeInputs = row.querySelector(`#time-inputs-${day.id}`);
            const breakSection = row.querySelector(`#break-section-${day.id}`);
            const hasBreakCheck = row.querySelector(`#has-break-${day.id}`);
            const breakInputs = row.querySelector(`#break-inputs-${day.id}`);

            modeSelect.addEventListener('change', (e) => {
                if (e.target.value === 'Выходной') {
                    timeInputs.classList.add('disabled-element');
                    breakSection.classList.add('disabled-element');
                } else {
                    timeInputs.classList.remove('disabled-element');
                    breakSection.classList.remove('disabled-element');
                }
            });

            hasBreakCheck.addEventListener('change', (e) => {
                if (e.target.checked) {
                    breakInputs.classList.remove('disabled-element');
                } else {
                    breakInputs.classList.add('disabled-element');
                }
            });
        });
    }

    generatePostScheduleUI();

    // --- ЛОГИКА ФОТОГРАФИЙ ---
    let photosList = []; 
    let photoIndexToDelete = null;

    const photoInput = document.getElementById('photo-input');
    const photosContainer = document.getElementById('photos-list');
    const uploadBtnWrapper = document.getElementById('photo-upload-btn-wrapper');
    const maxPhotos = 10;

    const photoModal = document.getElementById('photo-modal');
    const photoModalImg = document.getElementById('photo-modal-img');
    const closePhotoModal = document.getElementById('close-photo-modal');
    
    const deleteModal = document.getElementById('delete-photo-modal');
    const confirmDeleteBtn = document.getElementById('confirm-delete-photo');
    const cancelDeleteBtn = document.getElementById('cancel-delete-photo');

    closePhotoModal.addEventListener('click', () => { photoModal.style.display = 'none'; });
    cancelDeleteBtn.addEventListener('click', () => { deleteModal.style.display = 'none'; photoIndexToDelete = null; });

    confirmDeleteBtn.addEventListener('click', () => {
        if (photoIndexToDelete !== null) {
            photosList.splice(photoIndexToDelete, 1);
            photoIndexToDelete = null;
            renderPhotosUI();
        }
        deleteModal.style.display = 'none';
    });

    function renderPhotosUI() {
        document.querySelectorAll('.photo-card').forEach(el => el.remove());

        photosList.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'photo-card';

            const img = document.createElement('img');
            img.src = item.previewUrl;
            img.className = 'photo-thumbnail';
            img.addEventListener('click', () => {
                photoModalImg.src = item.previewUrl;
                photoModal.style.display = 'flex';
            });

            const delBtn = document.createElement('div');
            delBtn.className = 'photo-delete-btn';
            delBtn.innerHTML = '<i class="fas fa-times"></i>';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                photoIndexToDelete = index;
                deleteModal.style.display = 'flex';
            });

            card.appendChild(img);
            card.appendChild(delBtn);
            photosContainer.insertBefore(card, uploadBtnWrapper);
        });

        if (photosList.length >= maxPhotos) {
            uploadBtnWrapper.style.display = 'none';
        } else {
            uploadBtnWrapper.style.display = 'block';
        }
    }

    photoInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            Array.from(e.target.files).forEach(file => {
                if (photosList.length < maxPhotos) {
                    const previewUrl = URL.createObjectURL(file);
                    photosList.push({ file: file, previewUrl: previewUrl });
                }
            });
            renderPhotosUI();
        }
        e.target.value = '';
    });

    // --- ЗАГРУЗКА ФОТО В CLOUDINARY ---
    async function uploadPhotosToServer(filesArray) {
        const CLOUD_NAME = 'gj7aiofx'; 
        const UPLOAD_PRESET = 'wb_pvz_photos'; 
        
        const uploadPromises = filesArray.map(item => {
            const formData = new FormData();
            formData.append('file', item.file);
            formData.append('upload_preset', UPLOAD_PRESET);

            return fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                if (data.secure_url) {
                    return data.secure_url;
                }
                console.error('Cloudinary Error:', data.error);
                throw new Error('Ошибка сервиса изображений');
            })
            .catch(err => {
                console.error(err);
                return item.previewUrl; 
            });
        });

        return Promise.all(uploadPromises);
    }

    let globalWorkingHours = '';
    let globalFinalHowToGet = '';

    document.getElementById('reg-next-to-3-btn').addEventListener('click', () => {
        const address = document.getElementById('reg-address').value.trim();
        const fittingRooms = document.getElementById('reg-fitting-rooms').value.trim();
        const pvzType = document.getElementById('reg-pvz-type').value;
        const howToGetRaw = document.getElementById('reg-how-to-get').value.trim();

        if (!address || !fittingRooms || !pvzType || !howToGetRaw) {
            showError('Пожалуйста, заполните все обязательные поля.');
            return;
        }

        if (photosList.length === 0) {
            showError('Необходимо прикрепить минимум 1 фото.');
            return;
        }

        globalFinalHowToGet = howToGetRaw;
        if (pvzType === 'Пункт в отделении Почты России') {
            globalFinalHowToGet = `ПВЗ находится в отделении почты ${howToGetRaw}`;
        }

        globalWorkingHours = '';

        if (pvzType === 'Отдельное здание') {
            const checkedRadio = document.querySelector('input[name="building_schedule"]:checked');
            if (checkedRadio) {
                globalWorkingHours = checkedRadio.value;
            }
        } else if (pvzType === 'Пункт в отделении Почты России') {
            let scheduleArr = [];
            let isValidSchedule = true;

            daysOfWeek.forEach(day => {
                const mode = document.getElementById(`mode-${day.id}`).value;
                if (mode === 'Выходной') {
                    scheduleArr.push(`${day.label}: Выходной`);
                } else {
                    const start = document.getElementById(`start-${day.id}`).value;
                    const end = document.getElementById(`end-${day.id}`).value;
                    
                    if (!start || !end) {
                        isValidSchedule = false;
                    }

                    let dayStr = `${day.label}: ${start}-${end}`;
                    
                    const hasBreak = document.getElementById(`has-break-${day.id}`).checked;
                    if (hasBreak) {
                        const bStart = document.getElementById(`bstart-${day.id}`).value;
                        const bEnd = document.getElementById(`bend-${day.id}`).value;
                        if (!bStart || !bEnd) isValidSchedule = false;
                        
                        dayStr += ` (перерыв ${bStart}-${bEnd})`;
                    }
                    scheduleArr.push(dayStr);
                }
            });

            if (!isValidSchedule) {
                showError('Пожалуйста, корректно укажите время для всех рабочих дней.');
                return;
            }
            globalWorkingHours = scheduleArr.join(', ');
        }
        
        if (!globalWorkingHours) {
             showError('Пожалуйста, выберите график работы.');
             return;
        }

        document.getElementById('step-2').style.display = 'none';
        document.getElementById('step-3').style.display = 'flex';
    });

    document.getElementById('reg-back-to-2-btn').addEventListener('click', () => {
        document.getElementById('step-3').style.display = 'none';
        document.getElementById('step-2').style.display = 'flex';
    });

    // =========================================================================
    // 5. Финальная регистрация на 3-м шаге с новой иерархией базы данных
    // =========================================================================
    document.getElementById('reg-final-submit-btn').addEventListener('click', async () => {
        const surname = document.getElementById('reg-surname').value.trim();
        const name = document.getElementById('reg-name').value.trim();
        const patronymic = document.getElementById('reg-patronymic').value.trim();
        const dob = document.getElementById('reg-dob').value;
        const email = document.getElementById('reg-email').value.trim();

        if (!surname || !name || !patronymic || !dob || !email) {
            showError('Пожалуйста, заполните все данные о собственнике.');
            return;
        }

        document.getElementById('step-3').style.display = 'none';
        document.getElementById('loading-step').style.display = 'flex';

        try {
            const phoneWrapper = document.getElementById('reg-phone');
            const countryCode = phoneWrapper.dataset.countryCode || '7';
            const cleanPhoneInput = phoneWrapper.value.trim().replace(/\D/g, '');
            const loginId = countryCode + cleanPhoneInput; // Унифицированный номер телефона
            const password = document.getElementById('reg-password').value;

            const address = document.getElementById('reg-address').value.trim();
            const fittingRooms = document.getElementById('reg-fitting-rooms').value.trim();
            const pvzType = document.getElementById('reg-pvz-type').value;

            // Загрузка фото в Cloudinary
            const uploadedPhotoUrls = await uploadPhotosToServer(photosList);

            // Создаем аккаунт Firebase, используя введенную пользователем ПОЧТУ
            const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
            const uid = userCredential.user.uid;

            // Генерация уникального ID ПВЗ
            const pvzId = Math.floor(Math.random() * (99999999 - 100000 + 1)) + 100000;

            // 1. Структура: Все данные о собственнике (сохраняем пароль, как вы и просили)
            const ownerData = {
                role: 'owner', // Явная роль, чтобы в будущем отличать от менеджеров
                uid: uid,
                surname: surname,
                name: name,
                patronymic: patronymic,
                dob: dob,
                email: email,
                phone: loginId,
                password: password, 
                pvzId: pvzId,
                registeredAt: firebase.database.ServerValue.TIMESTAMP
            };

            // 2. Структура: Все данные о ПВЗ (отдельный узел для масштабирования)
            const pvzData = {
                id: pvzId,
                ownerId: uid, // Кто владеет ПВЗ
                address: address,
                fittingRooms: parseInt(fittingRooms, 10),
                workingHours: globalWorkingHours,
                pvzType: pvzType,
                howToGet: globalFinalHowToGet,
                photos: uploadedPhotoUrls,
                managers: {} // Контейнер для добавления менеджеров в будущем
            };

            // 3. Формируем единый пакет обновлений в Firebase
            const updates = {};
            
            // Вносим данные пользователя
            updates[`users/${uid}`] = ownerData;
            
            // Вносим данные ПВЗ
            updates[`pvz/${pvzId}`] = pvzData;
            
            // САМОЕ ГЛАВНОЕ: Индекс для входа. По номеру телефона мы сможем найти UID, роль и ID ПВЗ
            updates[`phoneIndex/${loginId}`] = {
                uid: uid,
                role: 'owner',
                pvzId: pvzId
            };

            // Отправляем все обновления разом
            await firebase.database().ref().update(updates);

            document.getElementById('loading-step').style.display = 'none';
            document.getElementById('success-step').style.display = 'flex';

        } catch (error) {
            showError('Ошибка регистрации: ' + error.message);
            console.error("Firebase Error:", error);
            
            document.getElementById('loading-step').style.display = 'none';
            document.getElementById('step-3').style.display = 'flex';
        } 
    });

    document.getElementById('go-to-login-btn').addEventListener('click', () => {
        window.location.href = 'login.html';
    });
});

// Выбор страны и маска
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