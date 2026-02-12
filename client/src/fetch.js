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

export function jsonFetch (resource, options = {}) {
  options.headers = options.headers || {};
  options.headers.Accept = 'application/json';
  return window.fetch(resource, options).then((response) => {
    if (response.ok) return response.json();

    return response.json().catch((e) => {
      console.error('Failed to parse error response', e);
      return {
        error_class: response.status,
        error: response.statusText || 'Unknown error'
      };
    }).then((errData) => {
      throw new Error(`Failed to fetch ${resource} ${errData.error_class ? `[${errData.error_class}]` : ''}: ${errData.error}`);
    });
  });
}

export function htmlFetch (resource, options = {}) {
  options.headers = options.headers || {};
  options.headers.Accept = 'application/html';
  return window.fetch(resource, options).then((response) => {
    if (response.ok) return response.text();

    throw new Error(`Failed to fetch ${resource}: ${response.statusText}`);
  });
}

export function blobFetch (resource, options = {}) {
  return window.fetch(resource, options).then((response) => {
    if (response.ok) return response.blob();

    throw new Error(`Failed to fetch ${resource}: ${response.statusText}`);
  }).then((blob) => {
    // NB: toImageBitmap uses the name to quickly guess JPEG
    blob.name = resource;
    return blob;
  });
}
