/* ==== CURRENCY.JS ==== */

const CURRENCY_META = {
    USD: { symbol: '$' },
    EUR: { symbol: '€' },
    GBP: { symbol: '£' },
    NGN: { symbol: '₦' }
};

let _liveRate = 1;
let _currencyReady = false;

window.initCurrency = async function () {
    if (!window.appSettings) {
        const { data } = await db.from('settings').select('currency_code, currency_position').single();
        window.appSettings = data || { currency_code: 'USD', currency_position: 'before' };
    }

    const code = window.appSettings.currency_code || 'USD';
    if (code === 'USD') { _liveRate = 1; _currencyReady = true; return; }

    try {
        const cacheKey = `inno-fx-${code}`;
        const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
        if (cached && (Date.now() - cached.time) < 3600000) {
            _liveRate = cached.rate;
        } else {
            const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json`);
            const data = await res.json();
            _liveRate = data.usd[code.toLowerCase()] || 1;
            sessionStorage.setItem(cacheKey, JSON.stringify({ rate: _liveRate, time: Date.now() }));
        }
    } catch (_) {
        _liveRate = 1;
    }
    _currencyReady = true;
};

/* ==== DISPLAY only ==== */
window.formatCurrency = function (usdVal) {
    const val = Number(usdVal) || 0;
    const code = window.appSettings?.currency_code || 'USD';
    const position = window.appSettings?.currency_position || 'before';
    const symbol = CURRENCY_META[code]?.symbol || '$';
    const converted = val * _liveRate;

    const display = converted.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    return position === 'before' ? symbol + display : display + symbol;
};