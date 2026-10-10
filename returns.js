document.addEventListener('DOMContentLoaded', () => {
    // 1. Инициализация выбора страны
    initCountrySelector('reg-phone-wrapper');

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

    // Авто-изменение высоты для textarea
    const howToGetTextarea = document.getElementById('reg-how-to-get');
    howToGetTextarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // 3. Переход от Шага 1 к Шагу 2
    document.getElementById('reg-next-btn').addEventListener('click', () => {
        const phoneInput = document.getElementById('reg-phone').value.trim();
        const pwdInput = document.getElementById('reg-password').value.trim();
        const errorEl = document.getElementById('error-message-reg');

        if (!phoneInput || !pwdInput) {
            errorEl.textContent = 'Введите номер телефона и пароль.';
            errorEl.style.display = 'block';
            return;
        }
        if (pwdInput.length < 6) {
            errorEl.textContent = 'Пароль должен содержать минимум 6 символов.';
            errorEl.style.display = 'block';
            return;
        }

        errorEl.style.display = 'none';
        
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
            // Программно выбираем "Отдельное здание"
            handlePvzTypeChange('Отдельное здание');
        }

        document.getElementById('step-1').style.display = 'none';
        document.getElementById('step-2').style.display = 'block';
    });

    // Возврат на Шаг 1
    document.getElementById('reg-back-btn').addEventListener('click', () => {
        document.getElementById('step-2').style.display = 'none';
        document.getElementById('step-1').style.display = 'block';
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

    // Ограничение ввода примерочных (от 1 до 100)
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
            howToGetTextarea.placeholder = 'Укажите номер отделения (например: 101000)'; 
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
                    <option value="Указать режим работы">Указать режим работы</option>
                    <option value="Выходной">Выходной</option>
                </select>
                <div class="time-inputs" id="time-inputs-${day.id}">
                    <input type="time" id="start-${day.id}" value="09:00">
                    <span>—</span> 
                    <input type="time" id="end-${day.id}" value="18:00">
                </div>
                <div class="break-section" id="break-section-${day.id}">
                    <label class="break-checkbox-label">
                        <input type="checkbox" id="has-break-${day.id}"> Перерыв
                    </label>
                    <div class="time-inputs disabled-element" id="break-inputs-${day.id}">
                        <input type="time" id="bstart-${day.id}" value="13:00">
                        <span>—</span> 
                        <input type="time" id="bend-${day.id}" value="14:00">
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

    // --- ЛОГИКА ФОТОГРАФИЙ (МНОЖЕСТВЕННАЯ ЗАГРУЗКА, СЖАТИЕ И УДАЛЕНИЕ) ---
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

    // НОВАЯ ФУНКЦИЯ ДЛЯ СЖАТИЯ ФОТО ПЕРЕД ОТПРАВКОЙ (СОХРАНЯЕТ РАЗМЕР И ВИЗУАЛЬНОЕ КАЧЕСТВО)
    const optimizeImage = (file) => {
        return new Promise((resolve) => {
            if (!file.type.startsWith('image/')) {
                resolve(file); // Если не картинка, возвращаем как есть
                return;
            }

            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    
                    // Сохраняем оригинальные размеры
                    canvas.width = img.width;
                    canvas.height = img.height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    // Сжимаем в формат JPEG с качеством 85% (0.85). 
                    // Это визуально не портит фото, но сильно уменьшает его вес.
                    canvas.toBlob((blob) => {
                        if (blob) {
                            const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
                            const optimizedFile = new File([blob], newFileName, {
                                type: 'image/jpeg',
                                lastModified: Date.now()
                            });
                            resolve(optimizedFile);
                        } else {
                            resolve(file); // Фолбэк на оригинальный файл в случае ошибки canvas
                        }
                    }, 'image/jpeg', 0.85); 
                };
                img.onerror = () => resolve(file);
            };
            reader.onerror = () => resolve(file);
        });
    };

    photoInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files.length > 0) {
            
            // Визуально показываем загрузку во время процесса сжатия
            const uploadBtnSpan = document.querySelector('.photo-upload-btn span');
            const uploadBtnIcon = document.querySelector('.photo-upload-btn i');
            const oldText = uploadBtnSpan.textContent;
            const oldIcon = uploadBtnIcon.className;
            
            uploadBtnSpan.textContent = 'Сжатие...';
            uploadBtnIcon.className = 'fas fa-spinner fa-spin';

            const files = Array.from(e.target.files);
            
            for (let i = 0; i < files.length; i++) {
                if (photosList.length < maxPhotos) {
                    const file = files[i];
                    // Применяем сжатие перед добавлением
                    const optimizedFile = await optimizeImage(file);
                    
                    const previewUrl = URL.createObjectURL(optimizedFile);
                    photosList.push({ file: optimizedFile, previewUrl: previewUrl });
                }
            }

            // Возвращаем иконки обратно
            uploadBtnSpan.textContent = oldText;
            uploadBtnIcon.className = oldIcon;
            
            renderPhotosUI();
        }
        e.target.value = '';
    });

    // --- ЗАГРУЗКА ФОТО В CLOUDINARY ---
    async function uploadPhotosToServer(filesArray) {
        // !!! ЗАМЕНИ НА СВОИ ДАННЫЕ ИЗ CLOUDINARY !!!
        const CLOUD_NAME = 'gj7aiofx'; 
        const UPLOAD_PRESET = 'wb_pvz_photos'; // Обязательно Unsigned!
        
        const uploadPromises = filesArray.map(item => {
            const formData = new FormData();
            // Теперь item.file - это наш оптимизированный (сжатый) файл
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
                // Фолбэк на локальное превью, если что-то пошло не так (в проде лучше кидать ошибку)
                return item.previewUrl; 
            });
        });

        return Promise.all(uploadPromises);
    }

    // 5. Финальная регистрация
    document.getElementById('reg-submit-btn').addEventListener('click', async () => {
        const phoneWrapper = document.getElementById('reg-phone');
        const countryCode = phoneWrapper.dataset.countryCode || '7';
        const cleanPhoneInput = phoneWrapper.value.trim().replace(/\D/g, '');
        const loginId = countryCode + cleanPhoneInput;
        const password = document.getElementById('reg-password').value;

        const address = document.getElementById('reg-address').value.trim();
        const fittingRooms = document.getElementById('reg-fitting-rooms').value.trim();
        const pvzType = document.getElementById('reg-pvz-type').value;
        const howToGetRaw = document.getElementById('reg-how-to-get').value.trim();

        if (!address || !fittingRooms || !pvzType || !howToGetRaw) {
            alert('Пожалуйста, заполните все обязательные поля.');
            return;
        }

        if (photosList.length === 0) {
            alert('Необходимо прикрепить минимум 1 фото.');
            return;
        }

        let finalHowToGet = howToGetRaw;
        if (pvzType === 'Пункт в отделении Почты России') {
            finalHowToGet = `ПВЗ находится в отделении почты ${howToGetRaw}`;
        }

        let workingHoursFinalString = '';

        if (pvzType === 'Отдельное здание') {
            const checkedRadio = document.querySelector('input[name="building_schedule"]:checked');
            if (checkedRadio) {
                workingHoursFinalString = checkedRadio.value;
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
                alert('Пожалуйста, корректно укажите время для всех рабочих дней.');
                return;
            }
            workingHoursFinalString = scheduleArr.join(', ');
        }
        
        if (!workingHoursFinalString) {
             alert('Пожалуйста, выберите график работы.');
             return;
        }

        const submitBtn = document.getElementById('reg-submit-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка фото и создание ПВЗ...';

        try {
            // Загрузка фото в Cloudinary
            const uploadedPhotoUrls = await uploadPhotosToServer(photosList);

            const pseudoEmail = `${loginId}@wb-pvz.ru`;
            const userCredential = await firebase.auth().createUserWithEmailAndPassword(pseudoEmail, password);
            const uid = userCredential.user.uid;

            // Генерация ID ПВЗ
            const pvzId = Math.floor(Math.random() * (99999999 - 100000 + 1)) + 100000;

            const pvzData = {
                id: pvzId,
                address: address,
                fittingRooms: parseInt(fittingRooms, 10),
                workingHours: workingHoursFinalString,
                pvzType: pvzType,
                howToGet: finalHowToGet,
                photos: uploadedPhotoUrls // Добавляем массив ссылок на фото в БД
            };

            const updates = {};
            updates[`users/${uid}/pvzInfo`] = pvzData;
            updates[`phoneIndex/${loginId}`] = uid;

            await firebase.database().ref().update(updates);

            alert('ПВЗ успешно зарегистрирован!');
            window.location.href = 'login.html'; 

        } catch (error) {
            alert('Ошибка регистрации: ' + error.message);
            console.error("Firebase Error:", error);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Завершить регистрацию';
        }
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