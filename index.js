const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');

const AIO_URL = "https://aiometadata.stremio.ru/stremio/13771301-c143-4a9a-9c9c-d588609a944c";
const TMDB_API_KEY = process.env.TMDB_API_KEY || "c5ac73f999688f3863fbe5c6c905a189";
const TVDB_API_KEY = process.env.TVDB_API_KEY || "ef90006d-336e-4b11-a97b-ffdd650cf9a6";

// TVDB requires JWT token
let TVDB_TOKEN = null;
async function getTVDBToken() {
    if (TVDB_TOKEN && Date.now() < TVDB_TOKEN.expires) {
        return TVDB_TOKEN.token;
    }
    
    try {
        const response = await axios.post('https://api4.thetvdb.com/v4/login', {
            apikey: TVDB_API_KEY
        });
        
        TVDB_TOKEN = {
            token: response.data.data.token,
            expires: Date.now() + 23 * 60 * 60 * 1000 // 23 hours
        };
        
        return TVDB_TOKEN.token;
    } catch (error) {
        console.error('TVDB Login Error:', error.message);
        return null;
    }
}

// Enhanced cache
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

async function getTVDBInfo(imdbId, title) {
    const token = await getTVDBToken();
    if (!token) return null;
    
    try {
        // Search by IMDb ID
        let tvdbId = null;
        
        if (imdbId && imdbId.startsWith('tt')) {
            const searchRes = await axios.get(
                `https://api4.thetvdb.com/v4/search?imdbId=${imdbId}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            if (searchRes.data.data && searchRes.data.data.length > 0) {
                tvdbId = searchRes.data.data[0].tvdb_id;
            }
        }
        
        // If not found, search by title
        if (!tvdbId && title) {
            const searchRes = await axios.get(
                `https://api4.thetvdb.com/v4/search?query=${encodeURIComponent(title)}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            if (searchRes.data.data && searchRes.data.data.length > 0) {
                tvdbId = searchRes.data.data[0].tvdb_id;
            }
        }
        
        // Get series details
        if (tvdbId) {
            const seriesRes = await axios.get(
                `https://api4.thetvdb.com/v4/series/${tvdbId}/extended`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            return seriesRes.data.data;
        }
        
        return null;
        
    } catch (error) {
        console.error('TVDB API Error:', error.message);
        return null;
    }
}

async function getEnrichedMetadata(imdbId, title, type) {
    const cacheKey = `enriched_${imdbId || title}`;
    const cached = cache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }
    
    // Try TVDB first for series
    let metadata = null;
    if (type === 'series') {
        metadata = await getTVDBInfo(imdbId, title);
    }
    
    // Fallback to TMDB
    if (!metadata) {
        metadata = await getTMDBInfo(imdbId, title, type);
    }
    
    if (metadata) {
        cache.set(cacheKey, {
            data: metadata,
            timestamp: Date.now()
        });
    }
    
    return metadata;
}

// Update getTMDBInfo function to use from previous code
async function getTMDBInfo(imdbId, title, type) {
    // ... keep the TMDB function from previous code ...
}

// Enhanced filtering with both TMDB/TVDB data
function shouldFilter(item, metadata) {
    if (!item) return false;
    
    // Fallback if no metadata
    if (!metadata) {
        const text = (item.name + ' ' + (item.description || '')).toLowerCase();
        const blockPatterns = [
            'k-drama', 'kdrama', 'korean drama',
            'chinese drama', 'cdrama',
            'bollywood', 'tollywood', 'indian'
        ];
        return blockPatterns.some(pattern => text.includes(pattern));
    }
    
    // Extract country from metadata (TMDB or TVDB format)
    let countries = [];
    let genres = [];
    
    // TMDB format
    if (metadata.production_countries) {
        countries = metadata.production_countries.map(c => c.iso_3166_1);
        genres = (metadata.genres || []).map(g => g.name);
    }
    // TVDB format
    else if (metadata.originalCountry) {
        countries = [metadata.originalCountry];
        genres = (metadata.genres || []).map(g => g.name);
    }
    
    // TVDB might have country as string
    if (metadata.country && typeof metadata.country === 'string') {
        countries.push(metadata.country);
    }
    
    // Normalize country codes/names
    const normalizedCountries = countries.map(c => c.toLowerCase());
    
    // Check if Chinese content
    const isChinese = normalizedCountries.some(c => 
        c === 'cn' || c === 'china' || c.includes('china') || 
        c === 'tw' || c.includes('taiwan') ||
        c === 'hk' || c.includes('hong kong')
    );
    
    // Check if Indian content
    const isIndian = normalizedCountries.some(c => 
        c === 'in' || c === 'india' || c.includes('india')
    );
    
    // Check if Korean content
    const isKorean = normalizedCountries.some(c => 
        c === 'kr' || c === 'korea' || c.includes('korea')
    );
    
    // Block all Chinese/Indian
    if (isChinese || isIndian) {
        console.log(`Blocking ${item.name} - Countries: ${countries.join(', ')}`);
        return true;
    }
    
    // Smart Korean filtering
    if (isKorean) {
        const hasDrama = genres.includes('Drama') || genres.includes('드라마');
        const kdramaSubgenres = ['Romance', 'Romantic', 'Comedy', 'Family', 'Medical', 'Legal', 'Melodrama'];
        const kdramaCount = genres.filter(g => 
            kdramaSubgenres.some(sub => g.toLowerCase().includes(sub.toLowerCase()))
        ).length;
        
        // Also check TVDB genre IDs for Korean drama (10767 is Korean Drama genre in TVDB)
        const isKoreanDramaGenre = metadata.genre && (
            metadata.genre.includes('Korean') || 
            (metadata.genreId && metadata.genreId.includes(10767))
        );
        
        const shouldBlock = (hasDrama && kdramaCount >= 2) || isKoreanDramaGenre;
        
        console.log(`Korean check: ${item.name}, Genres: ${genres.join(', ')}, HasDrama: ${hasDrama}, KdramaCount: ${kdramaCount}, Block: ${shouldBlock}`);
        return shouldBlock;
    }
    
    return false;
}

// Builder and handlers remain similar but use getEnrichedMetadata
const builder = new addonBuilder({
    id: 'org.stremio.removit',
    version: '1.2.0',
    name: 'Removit Pro Filter',
    description: 'Smart filtering with TMDB & TVDB integration',
    resources: ['catalog', 'meta'],
    types: ['movie', 'series'],
    catalogs: []
});

builder.defineCatalogHandler(async ({type, id}) => {
    try {
        const response = await axios.get(`${AIO_URL}/catalog/${type}/${id}.json`);
        const items = response.data.metas || [];
        
        console.log(`Processing ${items.length} items`);
        
        const filteredItems = [];
        for (const item of items) {
            const metadata = await getEnrichedMetadata(item.imdb_id, item.name, type);
            if (!shouldFilter(item, metadata)) {
                filteredItems.push(item);
            }
        }
        
        console.log(`Filtered ${items.length} → ${filteredItems.length} items`);
        return { metas: filteredItems };
        
    } catch (error) {
        console.error('Catalog Error:', error.message);
        return { metas: [] };
    }
});

builder.defineMetaHandler(async ({type, id}) => {
    try {
        const response = await axios.get(`${AIO_URL}/meta/${type}/${id}.json`);
        const meta = response.data.meta;
        
        if (!meta) return { meta: null };
        
        const metadata = await getEnrichedMetadata(meta.imdb_id, meta.name, type);
        if (shouldFilter(meta, metadata)) {
            console.log(`Filtering meta: ${meta.name}`);
            return { meta: null };
        }
        
        return { meta };
        
    } catch (error) {
        console.error('Meta Error:', error.message);
        return { meta: null };
    }
});

serveHTTP(builder.getInterface(), { port: 7000 });
console.log('Removit Pro Filter running');
console.log('TMDB API:', TMDB_API_KEY ? 'Loaded' : 'Missing');
console.log('TVDB API:', TVDB_API_KEY ? 'Loaded' : 'Missing');
