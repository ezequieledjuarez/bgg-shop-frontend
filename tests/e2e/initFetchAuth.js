(() => {
  try {
    const origFetch = window.fetch;
    window.fetch = async function(input, init) {
      try {
        const raw = window.sessionStorage.getItem('bgg-shop.session') || '{}';
        const s = JSON.parse(raw);
        const token = s && s.access_token;
        const opKey = s && (s.op_key || s.opKey || s.opKey);
        const finalInit = init ? Object.assign({}, init) : {};
        finalInit.headers = new Headers(finalInit.headers || {});
        if (token && !finalInit.headers.has('Authorization')) {
          finalInit.headers.set('Authorization', 'Bearer ' + token);
        }
        if (opKey && !finalInit.headers.has('X-Op-Key')) {
          finalInit.headers.set('X-Op-Key', opKey);
        }
        return origFetch.call(this, input, finalInit);
      } catch (e) {
        return origFetch.call(this, input, init);
      }
    };
  } catch (e) { /* ignore */ }
})();