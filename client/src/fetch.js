import { displayAlert } from './alert.js';

/** Remove any previously cached items  */
export function clearFetchCache () {
  window.sessionStorage.clear();
}

/** jsonFetch, but stash results in sessionStorage for use between pages */
export function jsonFetchCached (baseResource, params, options) {
  // https://stackoverflow.com/a/53307588
  const isReload =
    performance.getEntriesByType('navigation')[0]?.type === 'reload' ||
      performance.navigation?.type === 1;

  // https://developer.mozilla.org/en-US/docs/Web/API/Storage
  if (!isReload && params === window.sessionStorage.getItem(baseResource + '?query')) {
    return Promise.resolve(JSON.parse(window.sessionStorage.getItem(baseResource + '?data')));
  }

  return jsonFetch(baseResource + params, options).then((data) => {
    try {
      window.sessionStorage.setItem(baseResource + '?data', JSON.stringify(data));
      window.sessionStorage.setItem(baseResource + '?query', params);
    } catch (e) {
      // Result probably too big for cache, clear.
      console.warn('Failed to cache search result ' + params + '\n', e);
      try {
        window.sessionStorage.removeItem(baseResource + '?query');
        window.sessionStorage.removeItem(baseResource + '?data');
      } catch (e) {
        console.warn(e);
      }
    }
    return data;
  });
}

/** window.fetch, but network errors (blocked, offline, ...) say what failed */
export function fetchResource (resource, options) {
  return window.fetch(resource, options).catch((err) => {
    // NB: Callers check for aborts, pass them on as-is
    if (err.name === 'AbortError') throw err;
    console.error(`Failed to fetch ${resource}`, err);
    throw new Error(`Failed to fetch ${resource}: Network error, could not reach server (${err.message})`, { cause: err });
  });
}

/**
 * Current CSRF token, for X-CSRFToken headers
 *
 * NB: Read from the cookie rather than a form's csrfmiddlewaretoken, which
 * goes stale if the user logs in again in another tab (login rotates it)
 * https://docs.djangoproject.com/en/5.2/howto/csrf/#acquiring-the-token-if-csrf-use-sessions-and-csrf-cookie-httponly-are-false
 */
function getCookie (name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      // Does this cookie string begin with the name we want?
      if (cookie.substring(0, name.length + 1) === (name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

/** Describe a failed HTTP response (NB: statusText is always empty over HTTP/2) */
export function statusMessage (response) {
  return `${response.status} ${response.statusText}`.trim();
}

/** Start of a response body, whitespace collapsed, to show in error messages */
function bodySnippet (body) {
  const snippet = body.trim().replace(/\s+/g, ' ');
  return snippet.length > 20 ? snippet.slice(0, 20) + '...' : snippet;
}

export function jsonFetch (resource, options = {}) {
  options.headers = options.headers || {};
  options.headers.Accept = 'application/json';
  if (!/^(GET|HEAD|OPTIONS|TRACE)$/i.test(options.method || 'GET')) {
    // Django requires a CSRF token for any unsafe method
    options.headers['X-CSRFToken'] = getCookie('csrftoken');
  }
  return fetchResource(resource, options).then((response) => response.text().then((body) => {
    let rv;
    try {
      rv = JSON.parse(body);
    } catch (e) {
      // Not one of our JSON responses, e.g. CSRF failure / proxy error page
      console.error('Failed to parse JSON response', e);
      const snippet = bodySnippet(body);
      throw new Error(`Failed to fetch ${resource}: ${response.ok ? 'Unparsable' : statusMessage(response)}${snippet ? ` (${snippet})` : ''}`);
    }

    // NB: Streaming responses might have reported an error after starting
    if (rv.error) {
      throw new Error(`Failed to fetch ${resource} ${rv.error_class ? `[${rv.error_class}]` : ''}: ${rv.error}`);
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch ${resource}: ${statusMessage(response)}`);
    }
    return rv;
  })).then((rv) => {
    if (rv.alert) {
      displayAlert(rv.alert.level, rv.alert.messageHTML, rv.alert.timeout);
    }
    return rv;
  });
}

export function htmlFetch (resource, options = {}) {
  options.headers = options.headers || {};
  options.headers.Accept = 'application/html';
  return fetchResource(resource, options).then((response) => {
    if (response.ok) return response.text();

    throw new Error(`Failed to fetch ${resource}: ${statusMessage(response)}`);
  });
}

export function blobFetch (resource, options = {}) {
  return fetchResource(resource, options).then((response) => {
    if (response.ok) return response.blob();

    throw new Error(`Failed to fetch ${resource}: ${statusMessage(response)}`);
  }).then((blob) => {
    // NB: toImageBitmap uses the name to quickly guess JPEG
    blob.name = resource;
    return blob;
  });
}
