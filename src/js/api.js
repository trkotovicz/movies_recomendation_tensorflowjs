/**
 * CLIENTE REST HTTP - Conecta a UI com o Servidor HTTP no Navegador
 * Envia chamadas nativas `fetch('/api/...')` que são processadas pelo Servidor no Navegador.
 */

class ApiClient {
  constructor() {
    this.baseUrl = '/api';
    this.initFallbackInterceptor();
  }

  // Interceptador de Fallback: Garante funcionamento contínuo mesmo se o Service Worker ainda não ativou ou em origens sem suporte
  initFallbackInterceptor() {
    const originalFetch = window.fetch.bind(window);
    
    window.fetch = async (input, init) => {
      const urlStr = typeof input === 'string' ? input : (input.url || '');
      
      // Se for chamada para /api/ e o Service Worker não estiver ativamente controlando a página
      if (urlStr.includes('/api/') && (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller || window.location.protocol === 'file:')) {
        return this.simulateServerResponse(urlStr, init);
      }
      
      try {
        const response = await originalFetch(input, init);
        // Se a requisição /api/ caiu na rede real e retornou 404 (ex: servidor estático simples)
        if (urlStr.includes('/api/') && response.status === 404) {
          return this.simulateServerResponse(urlStr, init);
        }
        return response;
      } catch (err) {
        if (urlStr.includes('/api/')) {
          return this.simulateServerResponse(urlStr, init);
        }
        throw err;
      }
    };
  }

  // Simulação local caso SW não esteja ativo no momento
  async simulateServerResponse(urlStr, init) {
    const url = new URL(urlStr, window.location.origin);
    const method = (init && init.method) || 'GET';
    
    // Repassa para a lógica do servidor HTTP (sw.js)
    if (typeof handleApiRequest === 'function') {
      const dummyReq = {
        method,
        json: async () => (init && init.body ? JSON.parse(init.body) : {})
      };
      return await handleApiRequest(dummyReq, url);
    }
    return new Response(JSON.stringify({ status: 500, error: 'Servidor indisponível' }), { status: 500 });
  }

  // Retorna catálogo de filmes com filtros
  async getMovies(options = {}) {
    const { search = '', genre = '', sort = 'rating_desc', page = 1, limit = 24 } = options;
    const params = new URLSearchParams({
      search,
      genre,
      sort,
      page: page.toString(),
      limit: limit.toString()
    });
    
    const response = await fetch(`${this.baseUrl}/movies?${params}`);
    return await response.json();
  }

  // Retorna detalhes de 1 filme
  async getMovieById(id) {
    const response = await fetch(`${this.baseUrl}/movies/${id}`);
    return await response.json();
  }

  // Retorna gêneros disponíveis
  async getGenres() {
    const response = await fetch(`${this.baseUrl}/genres`);
    return await response.json();
  }

  // Retorna a lista de usuários predefinidos (data/users.json)
  async getUsers() {
    const response = await fetch(`${this.baseUrl}/users`);
    return await response.json();
  }

  // Retorna detalhes de 1 usuário específico
  async getUserById(id) {
    const response = await fetch(`${this.baseUrl}/users/${id}`);
    return await response.json();
  }

  // Cria um novo usuário
  async createUser(userData) {
    const response = await fetch(`${this.baseUrl}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    return await response.json();
  }

  // Atualiza um usuário existente
  async updateUser(id, userData) {
    const response = await fetch(`${this.baseUrl}/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    return await response.json();
  }

  // Retorna dataset formatado para TensorFlow.js
  async getDatasetForTFJS() {
    const response = await fetch(`${this.baseUrl}/dataset`);
    return await response.json();
  }

  // Salva avaliação do usuário (1 a 5 estrelas, assistido, curtido)
  async saveUserRating(userId, movieId, rating, title, watched = true, liked = false) {
    const response = await fetch(`${this.baseUrl}/user/ratings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, movieId, rating, title, watched, liked })
    });
    return await response.json();
  }

  // Reseta histórico do usuário
  async resetUserRatings() {
    const response = await fetch(`${this.baseUrl}/user/reset`, { method: 'POST' });
    return await response.json();
  }
}

// Exporta instância única
window.apiClient = new ApiClient();
