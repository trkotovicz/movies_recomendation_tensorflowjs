/**
 * Servidor HTTP no Navegador (In-Browser HTTP Server)
 * Intercepta chamadas fetch('/api/...') e responde como uma API REST real.
 * Não requer nenhuma instalação local (Node.js/npm).
 */

let moviesCache = null;
let usersCache = null;
let userRatings = {};

// Função auxiliar para salvar a lista de usuários no LocalStorage (se disponível)
function saveUsersDataset(users) {
  usersCache = users;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('sw_users_dataset', JSON.stringify(users));
    }
  } catch (e) {
    console.warn('[SW Server] Não foi possível salvar users no localStorage (provável escopo SW)');
  }
}

// Carrega os dados de usuários a partir do users.json ou LocalStorage
async function loadUsersDataset() {
  if (usersCache && usersCache.length >= 30) return usersCache;
  
  try {
    if (typeof localStorage !== 'undefined') {
      const localData = localStorage.getItem('sw_users_dataset');
      if (localData) {
        const parsed = JSON.parse(localData);
        if (Array.isArray(parsed) && parsed.length >= 30) {
          usersCache = parsed;
          migrateLegacyRatings(usersCache);
          return usersCache;
        }
      }
    }
  } catch (e) {}

  try {
    const response = await fetch('/data/users.json');
    usersCache = await response.json();
    migrateLegacyRatings(usersCache);
    saveUsersDataset(usersCache);
  } catch (err) {
    console.warn('[SW Server] Falha ao carregar users.json:', err);
    usersCache = [];
  }
  return usersCache;
}

// Migração das avaliações antigas (sw_user_ratings) para a usuária Thais (ID 1)
function migrateLegacyRatings(users) {
  try {
    if (typeof localStorage === 'undefined') return;
    const legacyStr = localStorage.getItem('sw_user_ratings');
    if (!legacyStr) return;
    
    const legacy = JSON.parse(legacyStr);
    const thais = users.find(u => u.id === 1);
    
    if (thais) {
      let changed = false;
      for (const [movieIdStr, ratingData] of Object.entries(legacy)) {
        const movieId = parseInt(movieIdStr);
        if (ratingData.rating > 0) {
          const exists = thais.watched_movies.find(m => m.movie_id === movieId);
          if (!exists) {
            thais.watched_movies.push({
              movie_id: movieId,
              title: `Filme ${movieId}`, // fallback genérico
              user_rating: ratingData.rating,
              liked: ratingData.liked || false,
              watch_date: ratingData.timestamp ? ratingData.timestamp.split('T')[0] : new Date().toISOString().split('T')[0]
            });
            changed = true;
          }
        }
      }
      if (changed) {
        saveUsersDataset(users);
      }
    }
    // Limpa o antigo para não migrar de novo
    localStorage.removeItem('sw_user_ratings');
    console.log('[SW Server] Migração de sw_user_ratings concluída com sucesso!');
  } catch (e) {
    console.warn('[SW Server] Erro ao migrar ratings legados:', e);
  }
}

// Helper para converter CSV em Objetos de Filme
function parseCSV(csvText) {
  const lines = [];
  let currentLine = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentLine.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentLine.push(currentCell.trim());
      if (currentLine.length > 1 || currentLine[0] !== '') {
        lines.push(currentLine);
      }
      currentLine = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }
  if (currentCell || currentLine.length > 0) {
    currentLine.push(currentCell.trim());
    lines.push(currentLine);
  }

  if (lines.length === 0) return [];
  const headers = lines[0];
  const movies = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (row.length < headers.length) continue;
    
    // Headers: Poster_Link,Series_Title,Released_Year,Certificate,Runtime,Genre,IMDB_Rating,Overview,Meta_score,Director,Star1,Star2,Star3,Star4,No_of_Votes,Gross
    const genres = row[5] ? row[5].split(',').map(g => g.trim()) : [];
    const stars = [row[10], row[11], row[12], row[13]].filter(Boolean);

    movies.push({
      id: i,
      poster: row[0] || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&q=80',
      title: row[1],
      year: parseInt(row[2]) || 2000,
      certificate: row[3] || 'PG-13',
      runtime: row[4] || '120 min',
      genres: genres,
      genreString: row[5] || '',
      rating: parseFloat(row[6]) || 7.0,
      overview: row[7] || 'Sem sinopse disponível.',
      metaScore: parseInt(row[8]) || null,
      director: row[9] || 'Desconhecido',
      stars: stars,
      votes: parseInt(row[14]) || 0,
      gross: row[15] || 'N/A'
    });
  }
  return movies;
}

// Carrega a base de dados a partir do CSV local
async function loadMovieDataset() {
  if (moviesCache) return moviesCache;
  try {
    const response = await fetch('/data/imdb_top_1000.csv');
    const text = await response.text();
    moviesCache = parseCSV(text);
  } catch (err) {
    console.warn('[SW Server] Falha ao carregar CSV. Usando dados fallback.', err);
    moviesCache = [];
  }
  return moviesCache;
}

// Salva avaliações do usuário no LocalStorage do navegador - OBSOLETO
function saveRatings(ratings) {
  // removido, agora usamos saveUsersDataset
}

// Service Worker LifeCycle
self.addEventListener('install', (event) => {
  console.log('[SW Server] Servidor HTTP instalado com sucesso.');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW Server] Servidor HTTP ativado e pronto para aceitar requisições.');
  event.waitUntil(self.clients.claim());
});

// Interceptador de Requisições HTTP (O Coração do Servidor no Navegador)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercepta apenas chamadas para a API REST /api/*
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(event.request, url));
  }
});

/**
 * Roteador HTTP do Servidor no Navegador
 */
async function handleApiRequest(request, url) {
  const method = request.method;
  const path = url.pathname;

  const movies = await loadMovieDataset();

  // CORS e Headers de resposta HTTP
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'X-Served-By': 'In-Browser-HTTP-Server-ServiceWorker'
  };

  try {
    // GET /api/movies (Catálogo com filtros e busca)
    if (method === 'GET' && path === '/api/movies') {
      const search = (url.searchParams.get('search') || '').toLowerCase();
      const genre = url.searchParams.get('genre') || '';
      const sort = url.searchParams.get('sort') || 'rating_desc';
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = parseInt(url.searchParams.get('limit') || '24');

      let filtered = [...movies];

      if (search) {
        filtered = filtered.filter(m => 
          m.title.toLowerCase().includes(search) || 
          m.director.toLowerCase().includes(search) ||
          m.stars.some(s => s.toLowerCase().includes(search))
        );
      }

      if (genre && genre !== 'Todos') {
        filtered = filtered.filter(m => m.genres.includes(genre));
      }

      // Ordenação
      if (sort === 'rating_desc') {
        filtered.sort((a, b) => b.rating - a.rating);
      } else if (sort === 'year_desc') {
        filtered.sort((a, b) => b.year - a.year);
      } else if (sort === 'title_asc') {
        filtered.sort((a, b) => a.title.localeCompare(b.title));
      }

      const total = filtered.length;
      const totalPages = Math.ceil(total / limit);
      const startIndex = (page - 1) * limit;
      const paginatedMovies = filtered.slice(startIndex, startIndex + limit);

      return new Response(JSON.stringify({
        status: 200,
        message: 'Filmes recuperados com sucesso',
        pagination: {
          page,
          limit,
          total,
          totalPages
        },
        data: paginatedMovies
      }), { status: 200, headers });
    }

    // GET /api/movies/:id (Detalhes de um filme específico)
    const movieMatch = path.match(/^\/api\/movies\/(\d+)$/);
    if (method === 'GET' && movieMatch) {
      const id = parseInt(movieMatch[1]);
      const movie = movies.find(m => m.id === id);
      if (!movie) {
        return new Response(JSON.stringify({ status: 404, error: 'Filme não encontrado' }), { status: 404, headers });
      }
      return new Response(JSON.stringify({
        status: 200,
        data: movie
      }), { status: 200, headers });
    }

    // GET /api/genres (Lista de gêneros únicos)
    if (method === 'GET' && path === '/api/genres') {
      const genreSet = new Set();
      movies.forEach(m => m.genres.forEach(g => genreSet.add(g)));
      const sortedGenres = Array.from(genreSet).sort();
      return new Response(JSON.stringify({
        status: 200,
        data: ['Todos', ...sortedGenres]
      }), { status: 200, headers });
    }

    // GET /api/users (Lista todos os usuários do dataset)
    if (method === 'GET' && path === '/api/users') {
      const users = await loadUsersDataset();
      return new Response(JSON.stringify({
        status: 200,
        data: users
      }), { status: 200, headers });
    }

    // GET /api/users/:id (Detalhes de um usuário específico)
    const userMatch = path.match(/^\/api\/users\/(\d+)$/);
    if (method === 'GET' && userMatch) {
      const id = parseInt(userMatch[1]);
      const users = await loadUsersDataset();
      const user = users.find(u => u.id === id);
      if (!user) {
        return new Response(JSON.stringify({ status: 404, error: 'Usuário não encontrado' }), { status: 404, headers });
      }
      return new Response(JSON.stringify({
        status: 200,
        data: user
      }), { status: 200, headers });
    }

    // POST /api/users (Criar novo usuário)
    if (method === 'POST' && path === '/api/users') {
      const body = await request.json();
      const { name, age, gender, preferred_genres } = body;
      
      if (!name || !age || !gender) {
        return new Response(JSON.stringify({ status: 400, error: 'name, age e gender são obrigatórios' }), { status: 400, headers });
      }

      const users = await loadUsersDataset();
      const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
      
      const newUser = {
        id: newId,
        name,
        age: parseInt(age),
        gender,
        preferred_genres: Array.isArray(preferred_genres) ? preferred_genres : [],
        watched_movies: []
      };

      users.push(newUser);
      saveUsersDataset(users);

      return new Response(JSON.stringify({
        status: 201,
        message: 'Usuário criado com sucesso!',
        data: newUser
      }), { status: 201, headers });
    }

    // PUT /api/users/:id (Editar usuário)
    if (method === 'PUT' && userMatch) {
      const id = parseInt(userMatch[1]);
      const body = await request.json();
      const { name, age, gender, preferred_genres } = body;

      const users = await loadUsersDataset();
      const userIndex = users.findIndex(u => u.id === id);
      
      if (userIndex === -1) {
        return new Response(JSON.stringify({ status: 404, error: 'Usuário não encontrado' }), { status: 404, headers });
      }

      if (name) users[userIndex].name = name;
      if (age) users[userIndex].age = parseInt(age);
      if (gender) users[userIndex].gender = gender;
      if (preferred_genres) users[userIndex].preferred_genres = preferred_genres;

      saveUsersDataset(users);

      return new Response(JSON.stringify({
        status: 200,
        message: 'Usuário atualizado com sucesso!',
        data: users[userIndex]
      }), { status: 200, headers });
    }

    // GET /api/dataset (Dataset otimizado para treinamento com TensorFlow.js)
    if (method === 'GET' && path === '/api/dataset') {
      const users = await loadUsersDataset();
      // Extrai matriz de gêneros únicos (vocabulário)
      const allGenres = Array.from(new Set(movies.flatMap(m => m.genres))).sort();
      
      const tfjsDataset = movies.map(m => {
        // Multi-hot vector dos gêneros
        const genreVector = allGenres.map(g => m.genres.includes(g) ? 1 : 0);
        return {
          movieId: m.id,
          title: m.title,
          genreVector: genreVector,
          imdbRating: m.rating,
          normalizedRating: m.rating / 10.0,
          year: m.year,
          normalizedYear: (m.year - 1920) / (2020 - 1920)
        };
      });

      return new Response(JSON.stringify({
        status: 200,
        vocabulary: {
          genres: allGenres,
          numGenres: allGenres.length
        },
        users: users,
        dataset: tfjsDataset
      }), { status: 200, headers });
    }

    // POST /api/user/ratings (Registrar avaliação/interação do usuário)
    if (method === 'POST' && path === '/api/user/ratings') {
      const body = await request.json();
      const { userId, movieId, rating, title, watched, liked } = body;

      if (!userId || !movieId) {
        return new Response(JSON.stringify({ status: 400, error: 'userId e movieId são obrigatórios' }), { status: 400, headers });
      }

      const users = await loadUsersDataset();
      const user = users.find(u => u.id === userId);
      
      if (!user) {
        return new Response(JSON.stringify({ status: 404, error: 'Usuário não encontrado' }), { status: 404, headers });
      }

      const existingIndex = user.watched_movies.findIndex(m => m.movie_id === movieId);
      const ratingObj = {
        movie_id: movieId,
        title: title || `Filme ${movieId}`,
        user_rating: rating,
        liked: liked !== undefined ? liked : (rating >= 4),
        watch_date: new Date().toISOString().split('T')[0]
      };

      if (existingIndex >= 0) {
        user.watched_movies[existingIndex] = { ...user.watched_movies[existingIndex], ...ratingObj };
      } else {
        user.watched_movies.push(ratingObj);
      }

      saveUsersDataset(users);

      return new Response(JSON.stringify({
        status: 200,
        message: 'Avaliação registrada para o usuário!',
        data: user.watched_movies
      }), { status: 200, headers });
    }

    // POST /api/user/reset (Limpar histórico de interações global)
    if (method === 'POST' && path === '/api/user/reset') {
      const users = await loadUsersDataset();
      users.forEach(u => u.watched_movies = []);
      saveUsersDataset(users);
      return new Response(JSON.stringify({
        status: 200,
        message: 'Histórico de todos os usuários resetado.'
      }), { status: 200, headers });
    }

    // Endpoint 404 Padrão
    return new Response(JSON.stringify({ status: 404, error: 'Endpoint HTTP não encontrado no Service Worker' }), { status: 404, headers });

  } catch (err) {
    console.error('[SW Server] Erro interno no servidor HTTP:', err);
    return new Response(JSON.stringify({ status: 500, error: err.message }), { status: 500, headers });
  }
}
