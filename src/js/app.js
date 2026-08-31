/**
 * APLICAÇÃO PRINCIPAL - CATÁLOGO DE FILMES & MOTOR DE INTERAÇÕES
 * Controla a interface, paginação, filtros e requisições ao Servidor HTTP no Navegador.
 */

class App {
  constructor() {
    this.state = {
      genre: 'Todos',
      search: '',
      sort: 'rating_desc',
      page: 1,
      limit: 24,
      totalPages: 1,
      currentMovie: null,
      userRatings: {}
    };

    this.initServiceWorker();
    this.initEventListeners();
  }

  // Registra o Servidor HTTP no Navegador (Service Worker API)
  async initServiceWorker() {
    const statusText = document.getElementById('server-status-text');

    if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('[App] Service Worker HTTP Server registrado no escopo:', registration.scope);
        
        // Se ainda não estiver controlando o cliente na inicialização, aguarda ficar pronto
        if (!navigator.serviceWorker.controller) {
          await navigator.serviceWorker.ready;
        }

        if (statusText) {
          statusText.textContent = 'Servidor HTTP Ativo (Service Worker)';
        }
      } catch (error) {
        console.warn('[App] Falha ao registrar Service Worker, ativando interceptador fallback:', error);
        if (statusText) {
          statusText.textContent = 'Servidor HTTP Ativo (Fetch Interceptor)';
        }
      }
    } else {
      console.log('[App] Modo local ou file:// detectado. Servidor HTTP rodando via Fetch Interceptor.');
      if (statusText) {
        statusText.textContent = 'Servidor HTTP Ativo (Browser Native)';
      }
    }

    // Carrega dados iniciais
    await this.loadUsers();
    await this.loadGenres();
    this.updateHeroDashboard();
    await this.loadMovies();
    await window.tfjsBridge.loadDataset();
  }

  // Carrega a lista de usuários para o painel do Hero (1/3)
  async loadUsers() {
    const dropdown = document.getElementById('user-select-dropdown');
    if (!dropdown) return;

    try {
      const res = await window.apiClient.getUsers();
      if (res.status === 200 && Array.isArray(res.data)) {
        this.state.users = res.data;
        this.updateHeroDashboard();
        
        dropdown.innerHTML = res.data.map(user => `
          <option value="${user.id}">
            ${user.name} (${user.age} anos, ${user.gender}) - ${user.preferred_genres[0] || 'Geral'}
          </option>
        `).join('');

        // Seleciona o primeiro usuário por padrão
        if (res.data.length > 0) {
          this.selectUser(res.data[0].id);
        }

        dropdown.addEventListener('change', (e) => {
          this.selectUser(parseInt(e.target.value));
        });
      }
    } catch (e) {
      console.error('[App] Erro ao carregar usuários:', e);
      if (dropdown) dropdown.innerHTML = `<option value="">Erro ao carregar usuários</option>`;
    }
  }

  // Atualiza os dados estatísticos no Hero Dashboard
  updateHeroDashboard() {
    const usersCountEl = document.getElementById('hero-stat-users');
    if (usersCountEl && this.state.users) {
      usersCountEl.textContent = this.state.users.length;
    }

    const ratingsCountEl = document.getElementById('hero-stat-ratings');
    if (ratingsCountEl && this.state.users) {
      let totalRatings = 0;
      this.state.users.forEach(u => {
        totalRatings += (u.watched_movies || []).length;
      });
      ratingsCountEl.textContent = `${totalRatings} avaliações`;
    }
  }

  // Seleciona um usuário alvo e atualiza o cartão visual no Hero
  selectUser(userId) {
    const user = (this.state.users || []).find(u => u.id === userId);
    if (!user) return;

    this.state.selectedUser = user;
    window.tfjsBridge.selectedUser = user;

    // Atualiza o cartão do perfil
    const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2);
    document.getElementById('user-avatar-initials').textContent = initials;
    document.getElementById('user-card-name').textContent = user.name;
    document.getElementById('user-card-age').textContent = `${user.age} anos`;

    const genderEl = document.getElementById('user-card-gender');
    if (genderEl) {
      genderEl.textContent = user.gender === 'F' ? 'Feminino' : (user.gender === 'M' ? 'Masculino' : user.gender);
      genderEl.className = `gender-chip gender-${user.gender}`;
    }

    // Gêneros favoritos
    const genresEl = document.getElementById('user-card-genres');
    if (genresEl) {
      genresEl.innerHTML = (user.preferred_genres || []).map(g => `
        <span class="genre-pill" style="padding: 0.15rem 0.6rem; font-size: 0.72rem;">${g}</span>
      `).join('');
    }

    // Filmes assistidos
    const watched = user.watched_movies || [];
    document.getElementById('user-card-watched-count').textContent = `${watched.length} filmes`;

    const listEl = document.getElementById('user-card-watched-list');
    if (listEl) {
      listEl.innerHTML = watched.map(m => `
        <div class="user-watched-item">
          <span style="font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;" title="${m.title}">
            ${m.title}
          </span>
          <span style="color: var(--accent-gold); font-weight: 700;">★ ${(parseFloat(m.user_rating) || 0).toFixed(1)}</span>
        </div>
      `).join('');
    }

    this.buildUserRatingsMap();
    this.updateUserStatsDisplay();
    // Recarrega o grid para atualizar as estrelas das avaliações deste usuário
    this.loadMovies();

    console.log(`[App] Usuário alvo selecionado para recomendação:`, user);
  }

  // Constrói o mapa de ratings baseado no usuário selecionado
  buildUserRatingsMap() {
    this.state.userRatings = {};
    if (this.state.selectedUser && this.state.selectedUser.watched_movies) {
      this.state.selectedUser.watched_movies.forEach(m => {
        this.state.userRatings[m.movie_id] = {
          rating: m.user_rating,
          watched: true,
          liked: m.liked
        };
      });
    }
  }

  // Carrega a barra de gêneros
  async loadGenres() {
    const genreContainer = document.getElementById('genre-bar');
    if (!genreContainer) return;

    try {
      const res = await window.apiClient.getGenres();
      if (res.status === 200 && Array.isArray(res.data)) {
        this.state.allGenres = res.data; // Armazena globalmente
        genreContainer.innerHTML = res.data.map(g => `
          <button class="genre-pill ${g === this.state.genre ? 'active' : ''}" data-genre="${g}">
            ${g}
          </button>
        `).join('');
      }
    } catch (e) {
      console.error('[App] Erro ao carregar gêneros:', e);
    }
  }

  // --- Modal de Usuário ---

  openUserModal(isEdit = false) {
    const modal = document.getElementById('user-modal');
    if (!modal) return;

    const titleEl = document.getElementById('user-modal-title');
    const form = document.getElementById('user-form');
    const genresContainer = document.getElementById('user-genres-container');

    // Popula as checkboxes de gêneros
    const genres = (this.state.allGenres || []).filter(g => g !== 'Todos');
    genresContainer.innerHTML = genres.map(g => `
      <label style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; background: rgba(255,255,255,0.05); padding: 0.35rem 0.6rem; border-radius: var(--radius-sm); cursor: pointer;">
        <input type="checkbox" name="preferred_genres" value="${g}" style="accent-color: var(--accent-cyan);"> ${g}
      </label>
    `).join('');

    if (isEdit && this.state.selectedUser) {
      titleEl.textContent = 'Editar Usuário';
      document.getElementById('user-id').value = this.state.selectedUser.id;
      document.getElementById('user-name').value = this.state.selectedUser.name;
      document.getElementById('user-age').value = this.state.selectedUser.age;
      document.getElementById('user-gender').value = this.state.selectedUser.gender;
      
      const userGenres = this.state.selectedUser.preferred_genres || [];
      genresContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (userGenres.includes(cb.value)) cb.checked = true;
      });
    } else {
      titleEl.textContent = 'Novo Usuário';
      form.reset();
      document.getElementById('user-id').value = '';
    }

    modal.classList.add('active');
  }

  closeUserModal() {
    const modal = document.getElementById('user-modal');
    if (modal) modal.classList.remove('active');
  }

  async handleUserSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('user-id').value;
    const name = document.getElementById('user-name').value;
    const age = document.getElementById('user-age').value;
    const gender = document.getElementById('user-gender').value;
    
    const genreCheckboxes = document.querySelectorAll('#user-genres-container input:checked');
    const preferred_genres = Array.from(genreCheckboxes).map(cb => cb.value);

    const userData = { name, age, gender, preferred_genres };

    try {
      if (id) {
        // Edit
        await window.apiClient.updateUser(id, userData);
      } else {
        // Create
        await window.apiClient.createUser(userData);
      }
      this.closeUserModal();
      
      // Recarrega e seleciona
      const currentSelectedId = this.state.selectedUser ? this.state.selectedUser.id : null;
      await this.loadUsers(); // Já atualiza o dropdown e o state.users
      
      // Se editou, tenta manter selecionado o mesmo. Se criou, a API retornaria o ID, mas loadUsers já seleciona o índice 0 ou podemos manter o atual
      if (id) {
        this.selectUser(parseInt(id));
        document.getElementById('user-select-dropdown').value = id;
      } else {
        // Como o loadUsers pega o res.data e chamamos selectUser pro primeiro, vamos pegar o último (recém criado)
        const lastUser = this.state.users[this.state.users.length - 1];
        if (lastUser) {
          this.selectUser(lastUser.id);
          document.getElementById('user-select-dropdown').value = lastUser.id;
        }
      }
    } catch (err) {
      console.error('[App] Erro ao salvar usuário:', err);
      alert('Erro ao salvar usuário!');
    }
  }

  // --- Fim Modal de Usuário ---

  // Gera o HTML das 5 estrelas com suporte visual a 0.5 (meia estrela)
  renderStarRating(movieId, title, userRating = 0) {
    let starsHTML = '';
    for (let s = 1; s <= 5; s++) {
      let stateClass = 'empty';
      if (s <= userRating) {
        stateClass = 'full';
      } else if (s - 0.5 <= userRating) {
        stateClass = 'half';
      }
      starsHTML += `<button type="button" class="star-btn ${stateClass}" data-star="${s}" title="Clique no início para ${s - 0.5} ★ ou no meio/fim para ${s} ★">★</button>`;
    }

    const ratingDisplay = userRating > 0 ? userRating.toFixed(1) : '';
    return `
      <div class="star-rating" data-movie-id="${movieId}" data-title="${title.replace(/"/g, '&quot;')}" data-current-rating="${userRating}">
        <span class="star-rating-label">Sua nota:</span>
        <div class="stars-wrapper">
          ${starsHTML}
        </div>
        <span class="star-rating-value">${ratingDisplay}</span>
      </div>
    `;
  }

  // Vincula eventos de clique e hover com precisão de 0.5 nas estrelas
  bindStarRatingEvents(containerElement) {
    containerElement.querySelectorAll('.star-btn').forEach(btn => {
      // Clique com detecção de metade esquerda (0.5) vs direita (1.0)
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ratingContainer = btn.closest('.star-rating');
        const movieId = parseInt(ratingContainer.dataset.movieId);
        const title = ratingContainer.dataset.title;
        
        const rect = btn.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const baseStar = parseInt(btn.dataset.star);
        // Se clicou na primeira metade (<= 50%), meia estrela (ex: 3.5); caso contrário, estrela cheia (ex: 4.0)
        const rating = clickX <= (rect.width * 0.5) ? (baseStar - 0.5) : baseStar;
        
        this.rateMovie(movieId, rating, title);
      });

      // Preview dinâmico de hover
      btn.addEventListener('mousemove', (e) => {
        const ratingContainer = btn.closest('.star-rating');
        const rect = btn.getBoundingClientRect();
        const hoverX = e.clientX - rect.left;
        const baseStar = parseInt(btn.dataset.star);
        const previewRating = hoverX <= (rect.width * 0.5) ? (baseStar - 0.5) : baseStar;

        const stars = ratingContainer.querySelectorAll('.star-btn');
        stars.forEach(sBtn => {
          const sVal = parseInt(sBtn.dataset.star);
          sBtn.classList.remove('full', 'half', 'empty');
          if (sVal <= previewRating) {
            sBtn.classList.add('full');
          } else if (sVal - 0.5 <= previewRating) {
            sBtn.classList.add('half');
          } else {
            sBtn.classList.add('empty');
          }
        });

        const valSpan = ratingContainer.querySelector('.star-rating-value');
        if (valSpan) valSpan.textContent = previewRating.toFixed(1);
      });
    });

    // Ao sair com o mouse, restaura a nota gravada
    containerElement.querySelectorAll('.star-rating').forEach(ratingContainer => {
      ratingContainer.addEventListener('mouseleave', () => {
        const currentRating = parseFloat(ratingContainer.dataset.currentRating) || 0;
        const stars = ratingContainer.querySelectorAll('.star-btn');
        stars.forEach(sBtn => {
          const sVal = parseInt(sBtn.dataset.star);
          sBtn.classList.remove('full', 'half', 'empty');
          if (sVal <= currentRating) {
            sBtn.classList.add('full');
          } else if (sVal - 0.5 <= currentRating) {
            sBtn.classList.add('half');
          } else {
            sBtn.classList.add('empty');
          }
        });

        const valSpan = ratingContainer.querySelector('.star-rating-value');
        if (valSpan) valSpan.textContent = currentRating > 0 ? currentRating.toFixed(1) : '';
      });
    });
  }

  // Carrega a lista paginada de filmes
  async loadMovies() {
    const grid = document.getElementById('movie-grid');
    if (!grid) return;

    // Renderiza skeletons enquanto carrega
    grid.innerHTML = Array(12).fill(0).map(() => `
      <div class="movie-card skeleton" style="height: 340px;"></div>
    `).join('');

    try {
      const res = await window.apiClient.getMovies({
        search: this.state.search,
        genre: this.state.genre,
        sort: this.state.sort,
        page: this.state.page,
        limit: this.state.limit
      });

      if (res.status === 200) {
        this.state.totalPages = res.pagination.totalPages;
        this.renderMovieGrid(res.data);
        this.renderPagination(res.pagination);
      }
    } catch (e) {
      grid.innerHTML = `<div class="error-msg">Erro ao carregar filmes do Servidor HTTP no Navegador.</div>`;
      console.error(e);
    }
  }

  // Renderiza os cards de filmes no grid
  renderMovieGrid(movies) {
    const grid = document.getElementById('movie-grid');
    if (!grid) return;

    if (movies.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
          <h3>Nenhum filme encontrado</h3>
          <p>Tente ajustar seu termo de busca ou selecione outro gênero.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = movies.map(movie => {
      const userRating = this.state.userRatings[movie.id]?.rating || 0;
      return `
        <div class="movie-card fade-in" data-id="${movie.id}">
          <div class="movie-poster-wrapper" onclick="window.app.openMovieModal(${movie.id})">
            <img class="movie-poster" src="${movie.poster}" alt="${movie.title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&q=80'" />
            <div class="rating-badge">★ ${movie.rating}</div>
            <div class="movie-card-overlay">
              <span style="font-size: 0.8rem; color: #fff; font-weight: 600;">Ver Detalhes</span>
            </div>
          </div>
          <div class="movie-info">
            <h4 class="movie-title" title="${movie.title}">${movie.title}</h4>
            <div class="movie-genres">${movie.genres.join(', ')}</div>
            ${this.renderStarRating(movie.id, movie.title, userRating)}
          </div>
        </div>
      `;
    }).join('');

    // Conecta os ouvintes de clique e hover das estrelas
    this.bindStarRatingEvents(grid);
  }

  // Registra nota para o filme no Servidor HTTP
  async rateMovie(movieId, rating, title) {
    if (!this.state.selectedUser) {
      alert("Por favor, selecione um usuário alvo primeiro!");
      return;
    }

    try {
      const res = await window.apiClient.saveUserRating(
        this.state.selectedUser.id,
        movieId,
        rating,
        title,
        true,
        rating >= 4
      );

      if (res.status === 200) {
        // Atualiza a lista local do usuário para não precisar fazer fetch da lista inteira
        this.state.selectedUser.watched_movies = res.data;
        // Re-renderiza o cartão do usuário, as estrelas do catálogo e métricas do Hero
        this.selectUser(this.state.selectedUser.id);
        this.updateHeroDashboard();
      }
    } catch (e) {
      console.error('[App] Erro ao salvar nota:', e);
    }
  }

  // Atualiza estatísticas do usuário na UI
  updateUserStatsDisplay() {
    const ratings = Object.values(this.state.userRatings);
    const totalRated = ratings.filter(r => r.rating > 0).length;
    
    const countEl = document.getElementById('user-rated-count');
    if (countEl) countEl.textContent = totalRated;
  }

  // Abre modal com detalhes completos do filme
  async openMovieModal(id) {
    const modal = document.getElementById('movie-modal');
    if (!modal) return;

    try {
      const res = await window.apiClient.getMovieById(id);
      if (res.status === 200) {
        const movie = res.data;
        this.state.currentMovie = movie;

        document.getElementById('modal-poster').src = movie.poster;
        document.getElementById('modal-title').textContent = movie.title;
        document.getElementById('modal-year').textContent = `${movie.year} • ${movie.runtime} • ${movie.certificate}`;
        document.getElementById('modal-director').textContent = movie.director;
        document.getElementById('modal-stars').textContent = movie.stars.join(', ');
        document.getElementById('modal-rating').textContent = `★ ${movie.rating} (${movie.votes.toLocaleString()} votos)`;
        document.getElementById('modal-overview').textContent = movie.overview;
        document.getElementById('modal-genres').innerHTML = movie.genres.map(g => `<span class="genre-pill">${g}</span>`).join(' ');

        // Adiciona a caixa de avaliação com 0.5 dentro do modal
        const modalRatingBox = document.getElementById('modal-user-rating-box');
        if (modalRatingBox) {
          const userRating = this.state.userRatings[movie.id]?.rating || 0;
          modalRatingBox.innerHTML = `
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">
              Sua avaliação (${this.state.selectedUser?.name || 'Selecione um usuário'}):
            </div>
            ${this.renderStarRating(movie.id, movie.title, userRating)}
          `;
          this.bindStarRatingEvents(modalRatingBox);
        }

        modal.classList.add('active');
      }
    } catch (e) {
      console.error('[App] Erro ao abrir modal:', e);
    }
  }

  // Fecha modal
  closeMovieModal() {
    const modal = document.getElementById('movie-modal');
    if (modal) modal.classList.remove('active');
  }

  // Renderiza controles de paginação
  renderPagination(pagination) {
    const container = document.getElementById('pagination-container');
    if (!container) return;

    const { page, totalPages } = pagination;
    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 0.75rem; margin: 2rem 0;">
        <button class="btn-secondary" id="btn-prev" ${page <= 1 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''}>
          ← Anterior
        </button>
        <span style="color: var(--text-muted); font-size: 0.9rem; font-weight: 600;">
          Página ${page} de ${totalPages}
        </span>
        <button class="btn-secondary" id="btn-next" ${page >= totalPages ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''}>
          Próxima →
        </button>
      </div>
    `;

    document.getElementById('btn-prev')?.addEventListener('click', () => {
      if (this.state.page > 1) {
        this.state.page--;
        this.loadMovies();
      }
    });

    document.getElementById('btn-next')?.addEventListener('click', () => {
      if (this.state.page < this.state.totalPages) {
        this.state.page++;
        this.loadMovies();
      }
    });
  }

  // Configura event listeners
  initEventListeners() {
    // Busca com debounce
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      let timeout = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          this.state.search = e.target.value;
          this.state.page = 1;
          this.loadMovies();
        }, 300);
      });
    }

    // Clique na barra de gêneros
    const genreBar = document.getElementById('genre-bar');
    if (genreBar) {
      genreBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.genre-pill');
        if (btn) {
          genreBar.querySelectorAll('.genre-pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.state.genre = btn.dataset.genre;
          this.state.page = 1;
          this.loadMovies();
        }
      });
    }

    // Modal close
    document.getElementById('modal-close-btn')?.addEventListener('click', () => this.closeMovieModal());
    document.getElementById('movie-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'movie-modal') this.closeMovieModal();
    });

    // Modal de Usuário
    document.getElementById('btn-new-user')?.addEventListener('click', () => this.openUserModal(false));
    document.getElementById('btn-edit-user')?.addEventListener('click', () => this.openUserModal(true));
    document.getElementById('user-modal-close-btn')?.addEventListener('click', () => this.closeUserModal());
    document.getElementById('btn-cancel-user')?.addEventListener('click', () => this.closeUserModal());
    document.getElementById('user-form')?.addEventListener('submit', (e) => this.handleUserSubmit(e));
    
    document.getElementById('user-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'user-modal') this.closeUserModal();
    });
    
    // Botão de Exportar
    document.getElementById('btn-export-users')?.addEventListener('click', async () => {
      try {
        const res = await window.apiClient.getUsers();
        if (res.status === 200) {
          const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
          const downloadAnchorNode = document.createElement('a');
          downloadAnchorNode.setAttribute("href", dataStr);
          downloadAnchorNode.setAttribute("download", "users.json");
          document.body.appendChild(downloadAnchorNode);
          downloadAnchorNode.click();
          downloadAnchorNode.remove();
        }
      } catch (e) {
        console.error('[App] Erro ao exportar usuários:', e);
        alert('Erro ao exportar arquivo.');
      }
    });

    // Botões do Painel TensorFlow.js
    document.getElementById('btn-train-model')?.addEventListener('click', () => {
      window.tfjsBridge.trainModel();
    });

    document.getElementById('btn-predict-model')?.addEventListener('click', () => {
      window.tfjsBridge.generatePredictionsForSelectedUser();
    });

    // Reset button
    document.getElementById('btn-reset-ratings')?.addEventListener('click', async () => {
      if (confirm('Deseja resetar todas as avaliações no servidor (para todos os usuários)?')) {
        await window.apiClient.resetUserRatings();
        await this.loadUsers(); // Recarrega os dados limpos
      }
    });
  }
}

// Inicializa a aplicação
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
