/** Remove any previously cached items  */
export function clearFetchCache () {
  window.sessionStorage.clear();
}

/** jsonFetch, but stash results in sessionStorage for use between pages */
export function jsonFetchCached (baseResource, params, options) {
  // https://developer.mozilla.org/en-US/docs/Web/API/Storage
  const cachedParams = window.sessionStorage.getItem(baseResource + '?query');
  if (cachedParams === params) {
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
    if (response.ok) {
      return response.json().then((rv) => {
        // NB: Streaming responses might have reported an error after starting
        if (rv.error) {
          throw new Error(`Failed to fetch ${resource} ${rv.error_class ? `[${rv.error_class}]` : ''}: ${rv.error}`);
        }
        return rv;
      }).catch((e) => {
        console.error('Failed to parse JSON response', e);
        throw new Error(`Failed to fetch ${resource}`);
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
