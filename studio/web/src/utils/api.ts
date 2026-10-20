export function installApiTransport() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return nativeFetch(input, init);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    const token = localStorage.getItem('redisx_token');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-RedisX-DB', localStorage.getItem('redisx_db') ?? '0');
    const response = await nativeFetch(input, { ...init, headers });
    if (response.status === 401 && !url.pathname.startsWith('/api/auth/')) window.dispatchEvent(new Event('redisx:unauthorized'));
    else if (!response.ok && response.status !== 404 && !url.pathname.startsWith('/api/auth/')) {
      try {
        const data = await response.clone().json();
        window.dispatchEvent(new CustomEvent('redisx:apierror', { detail: { message: data.message ?? data.error ?? 'The request could not be completed.', hint: data.hint } }));
      } catch { /* A page can handle a non-JSON failure. */ }
    }
    return response;
  };
}

export function websocketUrl(path: string) {
  const url = new URL(path, window.location.href);
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = localStorage.getItem('redisx_token');
  if (token) url.searchParams.set('token', token);
  return url.toString();
}
