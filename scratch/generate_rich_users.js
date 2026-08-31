const fs = require('fs');
const path = require('path');

// 1. Carregar e parsear o CSV do IMDb Top 1000 exatamente como o sw.js faz
const csvPath = path.join(__dirname, '../data/imdb_top_1000.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');

function parseCSV(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let currentVal = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      row.push(currentVal.trim());
      if (row.length > 1) lines.push(row);
      row = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  if (row.length > 1) lines.push(row);
  return lines;
}

const parsedLines = parseCSV(csvContent);
const headers = parsedLines[0];
const movies = [];

for (let i = 1; i < parsedLines.length; i++) {
  const row = parsedLines[i];
  if (row.length < headers.length) continue;
  const genres = row[5] ? row[5].split(',').map(g => g.trim()) : [];
  movies.push({
    id: i,
    title: row[1],
    year: parseInt(row[2]) || 2000,
    genres: genres,
    rating: parseFloat(row[6]) || 7.0,
    director: row[9] || ''
  });
}

console.log(`Total de filmes carregados do CSV: ${movies.length}`);

// Perfis Arquetípicos Realistas
const archetypes = [
  {
    category: "Jovens Amantes de Animação & Fantasia",
    namesF: ["Laura", "Isabella", "Manuela", "Alice", "Sophia", "Beatriz", "Valentina", "Helena", "Camila", "Clara"],
    namesM: ["Lucas", "Gabriel", "Enzo", "Matheus", "Guilherme", "Felipe", "Pedro", "Henrique", "Arthur", "Leo"],
    ageRange: [18, 26],
    preferred: ["Animation", "Adventure", "Comedy", "Family", "Fantasy"],
    disliked: ["Horror", "Film-Noir", "Western", "War"]
  },
  {
    category: "Fãs de Sci-Fi, Ação & Tecnologia",
    namesF: ["Thais Kotovicz", "Mariana", "Fernanda", "Juliana", "Vanessa", "Bruna", "Renata", "Leticia", "Natalia", "Amanda"],
    namesM: ["Rodrigo", "Bruno", "Eduardo", "Diego", "Alexandre", "Rafael", "Thiago", "Gustavo", "Marcelo", "Vinicius"],
    ageRange: [24, 40],
    preferred: ["Action", "Sci-Fi", "Adventure", "Thriller"],
    disliked: ["Romance", "Musical", "Western"]
  },
  {
    category: "Cinefilia Clássica, Drama & História",
    namesF: ["Ana Carolina", "Patricia", "Cristina", "Luciana", "Claudia", "Silvia", "Heloisa", "Adriana", "Denise", "Monica"],
    namesM: ["Carlos", "Roberto", "Fernando", "Ricardo", "Paulo", "Sergio", "Marcos", "Antonio", "Luiz", "Jose"],
    ageRange: [38, 65],
    preferred: ["Drama", "Biography", "History", "War", "Crime"],
    disliked: ["Animation", "Sci-Fi", "Fantasy"]
  },
  {
    category: "Entusiastas de Suspense, Terror & Crime Noir",
    namesF: ["Carla", "Daniela", "Tatiana", "Priscila", "Flavia", "Bianca", "Jessica", "Renata", "Debora", "Kelly"],
    namesM: ["Vitor", "Fabio", "Leonardo", "Igor", "Caio", "Andre", "Renan", "Murilo", "Hugo", "Danilo"],
    ageRange: [22, 45],
    preferred: ["Crime", "Thriller", "Mystery", "Horror", "Film-Noir"],
    disliked: ["Animation", "Family", "Musical", "Romance"]
  },
  {
    category: "Comédias Românticas, Musicais & Família",
    namesF: ["Larissa", "Luana", "Giovanna", "Rafaela", "Carolina", "Aline", "Julia", "Marina", "Paula", "Lorena"],
    namesM: ["Bernardo", "Samuel", "Erick", "Danilo", "Joao", "Otavio", "Renato", "Caio", "Davi", "Tiago"],
    ageRange: [20, 36],
    preferred: ["Comedy", "Romance", "Music", "Musical", "Family", "Drama"],
    disliked: ["Horror", "War", "Action"]
  },
  {
    category: "Exploradores de Western, Guerra & Aventura Épica",
    namesF: ["Virginia", "Tania", "Sandra", "Regina", "Eliane", "Marta", "Fatima", "Sonia", "Vera", "Rose"],
    namesM: ["Walter", "Joaquim", "Valter", "Geraldo", "Ronaldo", "Benedito", "Rubens", "Nelson", "Claudio", "Cesar"],
    ageRange: [42, 68],
    preferred: ["Western", "War", "Adventure", "History", "Action"],
    disliked: ["Animation", "Comedy", "Musical"]
  }
];

let currentUserId = 1;
const allUsers = [];

// Manter usuário 1 como Thais Kotovicz com histórico rico
// Gerar no total 50 usuários com perfis variados
archetypes.forEach((arch, archIndex) => {
  // Gera 4 mulheres e 4 homens por arquétipo (total = 6 * 8 = 48 usuários + 2 extras = 50 usuários)
  const females = arch.namesF.slice(0, 4);
  const males = arch.namesM.slice(0, 4);

  const entries = [
    ...females.map(n => ({ name: n, gender: "F" })),
    ...males.map(n => ({ name: n, gender: "M" }))
  ];

  entries.forEach(person => {
    const age = Math.floor(Math.random() * (arch.ageRange[1] - arch.ageRange[0] + 1)) + arch.ageRange[0];
    
    // Seleciona 2 a 4 gêneros preferidos do arquétipo
    const numPreferred = Math.floor(Math.random() * 2) + 3; // 3 ou 4 gêneros
    const preferredGenres = [...arch.preferred].sort(() => 0.5 - Math.random()).slice(0, numPreferred);

    // Seleciona de 15 a 28 filmes para este usuário
    const numWatched = Math.floor(Math.random() * 14) + 15; // 15 a 28 filmes
    const watchedMovies = [];
    const watchedMovieIds = new Set();

    // 70% filmes de gêneros preferidos (notas 3.5, 4.0, 4.5, 5.0)
    const matchingMovies = movies.filter(m => m.genres.some(g => preferredGenres.includes(g)));
    // 30% filmes de outros gêneros (notas 1.0, 1.5, 2.0, 2.5, 3.0, 3.5)
    const otherMovies = movies.filter(m => !m.genres.some(g => preferredGenres.includes(g)));

    const numMatching = Math.round(numWatched * 0.75);
    const numOthers = numWatched - numMatching;

    // Amostrar filmes correspondentes
    const shuffledMatching = [...matchingMovies].sort(() => 0.5 - Math.random());
    for (let k = 0; k < shuffledMatching.length && watchedMovies.length < numMatching; k++) {
      const m = shuffledMatching[k];
      if (watchedMovieIds.has(m.id)) continue;
      watchedMovieIds.add(m.id);

      // Notas altas com variação 0.5 (3.5, 4.0, 4.5, 5.0)
      const ratings = [3.5, 4.0, 4.0, 4.5, 4.5, 5.0, 5.0];
      const rating = ratings[Math.floor(Math.random() * ratings.length)];
      const daysAgo = Math.floor(Math.random() * 300) + 1;
      const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      watchedMovies.push({
        movie_id: m.id,
        title: m.title,
        user_rating: rating,
        liked: rating >= 4.0,
        watch_date: date
      });
    }

    // Amostrar outros filmes (críticas menores / neutras)
    const shuffledOthers = [...otherMovies].sort(() => 0.5 - Math.random());
    for (let k = 0; k < shuffledOthers.length && watchedMovies.length < (numMatching + numOthers); k++) {
      const m = shuffledOthers[k];
      if (watchedMovieIds.has(m.id)) continue;
      watchedMovieIds.add(m.id);

      // Notas menores (1.0, 1.5, 2.0, 2.5, 3.0)
      const ratings = [1.0, 1.5, 2.0, 2.5, 2.5, 3.0, 3.5];
      const rating = ratings[Math.floor(Math.random() * ratings.length)];
      const daysAgo = Math.floor(Math.random() * 300) + 1;
      const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      watchedMovies.push({
        movie_id: m.id,
        title: m.title,
        user_rating: rating,
        liked: rating >= 4.0,
        watch_date: date
      });
    }

    // Ordenar filmes por data
    watchedMovies.sort((a, b) => b.watch_date.localeCompare(a.watch_date));

    allUsers.push({
      id: currentUserId++,
      name: person.name,
      age: age,
      gender: person.gender,
      preferred_genres: preferredGenres,
      watched_movies: watchedMovies
    });
  });
});

console.log(`Gerados ${allUsers.length} usuários com sucesso!`);
let totalRatings = allUsers.reduce((acc, u) => acc + u.watched_movies.length, 0);
console.log(`Total de avaliações no dataset: ${totalRatings}`);

const outputPath = path.join(__dirname, '../data/users.json');
fs.writeFileSync(outputPath, JSON.stringify(allUsers, null, 2), 'utf8');
console.log(`Arquivo salvo em: ${outputPath}`);
