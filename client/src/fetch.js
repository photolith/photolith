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

/** Describe a failed HTTP response (NB: statusText is always empty over HTTP/2) */
export function statusMessage (response) {
  return `${response.status} ${response.statusText}`.trim();
}

export function jsonFetch (resource, options = {}) {
  options.headers = options.headers || {};
  options.headers.Accept = 'application/json';
  return fetchResource(resource, options).then((response) => {
    if (response.ok) {
      return response.text().then((body) => {
        try {
          return JSON.parse(body);
        } catch (e) {
          console.error('Failed to parse JSON response', e);
          const snippet = body.trim().replace(/\s+/g, ' ');
          throw new Error(`Failed to fetch ${resource}: Unparsable (${snippet.length > 20 ? snippet.slice(0, 20) + '...' : snippet})`);
        }
      }).then((rv) => {
        // NB: Streaming responses might have reported an error after starting
        if (rv.error) {
          throw new Error(`Failed to fetch ${resource} ${rv.error_class ? `[${rv.error_class}]` : ''}: ${rv.error}`);
        }
        return rv;
      });
    }

    return response.json().catch((e) => {
      console.error('Failed to parse error response', e);
      return {
        error_class: response.status,
        error: response.statusText || 'Unknown error'
      };
    }).then((errData) => {
      throw new Error(`Failed to fetch ${resource} ${errData.error_class ? `[${errData.error_class}]` : ''}: ${errData.error}`);
    });
  }).then((rv) => {
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
