/* ── Supabase client init ── */
const SUPABASE_URL = 'https://skomnwdcuzfjnxfhsudy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrb21ud2RjdXpmam54ZmhzdWR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MzM2ODEsImV4cCI6MjA5NTQwOTY4MX0.SuGYAeFBfucl7A0K2kmJSHUeRYyBNJojx6zga1qG0Yc';
const REMEMBER_FLAG = 'inno-remember';

function _authStorage() {
    return localStorage.getItem(REMEMBER_FLAG) === 'true' ? localStorage : sessionStorage;
}

const dynamicStorage = {
    getItem: (key) => _authStorage().getItem(key),
    setItem: (key, value) => _authStorage().setItem(key, value),
    removeItem: (key) => _authStorage().removeItem(key)
};

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: dynamicStorage,
        persistSession: true,
        autoRefreshToken: true
    }
});


/* Date */
document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});