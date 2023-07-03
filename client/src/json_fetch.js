export function jsonFetch (resource, options) {
  options.headers = options.headers || {};
  options.headers.Accept = 'application/json';
  return window.fetch(resource, options).then((response) => {
    if (response.ok) return response.json();

    return response.json().catch((e) => {
      console.error('Failed to parse error response', e);
      return { error: response.status };
    }).then((errData) => {
      throw new Error(`Failed to fetch ${resource}: ${errData.error}`);
    });
  });
}
