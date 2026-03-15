document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('reviews-container')) {
        initRatingPage();
    }
});

function initRatingPage () {
    let allReviews = [];
    let activeFilters = { period: 'all', dateFrom: null, dateTo: null };
    let pendingFilters = { ...activeFilters };
    
    function loadReviews() {
        const userData = getUserData();
        allReviews = userData.reviews || []; 
        // Generate a few reviews if none exist, for demonstration
        if (allReviews.length === 0) {
            allReviews = generateMockReviews();
            userData.reviews = allReviews;
            saveUserData(userData);
        }
        applyAndRender();
    }

    function generateMockReviews() {
        const names = ["Александр", "Елена", "Дмитрий", "Ольга", "Андрей"];
        const comments = [
            "Все отлично, быстро нашли и выдали заказ. Спасибо!",
            "Пункт чистый, персонал вежливый. Буду заказывать сюда еще.",
            "Немного пришлось подождать, но в целом все хорошо.",
            "Не было пакета нужного размера, а так все отлично.",
            "Очень приятная девушка на выдаче, помогла проверить товар."
        ];
        return Array.from({ length: 5 }, (_, i) => ({
            id: Date.now() + i,
            name: names[i % names.length],
            rating: Math.floor(Math.random() * 2) + 4, // 4 or 5
            date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
            comment: comments[i % comments.length],
            managerComment: null
        }));
    }

    function applyAndRender() {
        activeFilters = { ...pendingFilters };
        let filtered = [...allReviews];
        const { period, dateFrom, dateTo } = activeFilters;

        if (dateFrom && dateTo) {
            let from = new Date(dateFrom); from.setHours(0,0,0,0);
            let to = new Date(dateTo); to.setHours(23,59,59,999);
            filtered = allReviews.filter(r => new Date(r.date) >= from && new Date(r.date) <= to);
        } else if (period && period !== 'all') {
            const now = new Date();
            let startDate = new Date();
            if (period === 'week') startDate.setDate(now.getDate() - 7);
            else if (period === 'month') startDate.setMonth(now.getMonth() - 1);
            else if (period === '3month') startDate.setMonth(now.getMonth() - 3);
            filtered = allReviews.filter(r => new Date(r.date) >= startDate);
        }
        
        renderReviews(filtered);
        renderActiveFilterPills();
    }

    function renderReviews(reviews) {
        const container = document.getElementById('reviews-container');
        const summaryEl = document.getElementById('rating-summary');
        container.innerHTML = '';

        if (reviews.length === 0) {
            container.innerHTML = `<div class="empty-message"><i class="fas fa-comment-slash"></i><div>Отзывов за выбранный период нет</div></div>`;
            summaryEl.textContent = '0.00';
            return;
        }

        let totalRating = 0;
        reviews.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(review => {
            totalRating += review.rating;
            container.appendChild(createReviewCard(review));
        });
        const averageRating = (totalRating / reviews.length).toFixed(2);
        summaryEl.textContent = averageRating;

        // Attach event listeners for manager comments
        document.querySelectorAll('.manager-comment-form').forEach(form => {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const reviewId = e.target.dataset.reviewId;
                const commentInput = e.target.querySelector('.manager-comment-input');
                const commentText = commentInput.value.trim();
                if (commentText) {
                    saveManagerComment(reviewId, commentText);
                    commentInput.value = '';
                }
            });
        });
    }

    function createReviewCard(review) {
        const card = document.createElement('div');
        card.className = 'review-card-new';

        const stars = '⭐'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
        const reviewDate = new Date(review.date);
        const formattedDate = `${reviewDate.toLocaleDateString('ru-RU')} ${reviewDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;

        let managerCommentHtml = `
            <form class="manager-comment-form" data-review-id="${review.id}">
                <textarea class="manager-comment-input" placeholder="Добавить комментарий..."></textarea>
                <button type="submit" class="primary-btn">Отправить</button>
            </form>
        `;
        if (review.managerComment) {
            managerCommentHtml = `
                <div class="manager-reply">
                    <strong>Ответ менеджера:</strong>
                    <p>${review.managerComment}</p>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="review-avatar-new"><i class="fas fa-user"></i></div>
            <div class="review-content-new">
                <div class="review-header-new">
                    <span class="review-author">${review.name}</span>
                    <span class="star-rating">${stars}</span>
                    <span class="review-date">${formattedDate}</span>
                </div>
                <p class="review-text">${review.comment}</p>
                ${managerCommentHtml}
            </div>
        `;
        return card;
    }
    
    function saveManagerComment(reviewId, commentText) {
        const userData = getUserData();
        const reviewIndex = (userData.reviews || []).findIndex(r => r.id == reviewId);
        
        if(reviewIndex > -1) {
            userData.reviews[reviewIndex].managerComment = commentText;
            saveUserData(userData);
            loadReviews(); // Reload and re-render all reviews
            showAlert('Комментарий добавлен', false);
        } else {
            showAlert('Не удалось найти отзыв', true);
        }
    }

    function renderActiveFilterPills() {
        const container = document.getElementById('active-filters-container');
        container.innerHTML = '';
        const { period, dateFrom, dateTo } = activeFilters;
        let pillText = '';

        if (dateFrom && dateTo) {
            pillText = `${new Date(dateFrom).toLocaleDateString('ru-RU')} — ${new Date(dateTo).toLocaleDateString('ru-RU')}`;
        } else if (period) {
            pillText = {
                'all': 'Все', 'week': 'За неделю', 'month': 'За месяц', '3month': 'За 3 месяца'
            }[period];
        }
        if(pillText) container.innerHTML = `<div class="filter-pill">${pillText}</div>`;
    }

    function updateModalView() {
        document.querySelectorAll('#filter-modal .secondary-btn[data-period]').forEach(b => b.classList.remove('selected'));
        if (pendingFilters.period) {
            document.querySelector(`#filter-modal [data-period="${pendingFilters.period}"]`)?.classList.add('selected');
        }
        document.getElementById('date-from-filter').value = pendingFilters.dateFrom || '';
        document.getElementById('date-to-filter').value = pendingFilters.dateTo || '';
    }

    document.getElementById('open-filter-modal-btn').addEventListener('click', () => {
        pendingFilters = { ...activeFilters };
        updateModalView();
        toggleModal('filter-modal', true);
    });

    document.querySelectorAll('#filter-modal [data-period]').forEach(btn => {
        btn.addEventListener('click', () => {
            pendingFilters.period = btn.dataset.period;
            pendingFilters.dateFrom = null;
            pendingFilters.dateTo = null;
            updateModalView();
        });
    });
    
    const dateInputs = ['date-from-filter', 'date-to-filter'];
    dateInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            pendingFilters.period = null;
            pendingFilters.dateFrom = document.getElementById('date-from-filter').value;
            pendingFilters.dateTo = document.getElementById('date-to-filter').value;
            updateModalView();
        });
    });

    document.getElementById('apply-filters-btn').addEventListener('click', () => {
        if (pendingFilters.dateFrom && !pendingFilters.dateTo || !pendingFilters.dateFrom && pendingFilters.dateTo) {
            showAlert('Выберите обе даты для диапазона.', true);
            return;
        }
        applyAndRender();
        toggleModal('filter-modal', false);
    });
    
    document.getElementById('clear-filters-btn').addEventListener('click', () => {
        pendingFilters = { period: 'all', dateFrom: null, dateTo: null };
        updateModalView();
    });

    loadReviews();
}
