const SEP_INNER = '.';
const SEP_OUTER = '-';

/** Pull DT state from querystring */
export function getDTState (searchString, defaultState) {
  const searchParams = new URLSearchParams(searchString);

  function getOrder () {
    if (!searchParams.has('order')) {
      // No order set yet, return default
      return defaultState.order || [];
    }
    return searchParams.get('order').split(SEP_OUTER).map((o) => {
      const parts = o.split(SEP_INNER, 2);

      return [parseInt(parts[0], 10), parts[1]];
    });
  }

  return {
    order: getOrder()
  };
}

/** replaceState the order into the querystring */
export function setDTState (searchString, data) {
  const searchParams = new URLSearchParams(searchString);

  if (data.order) {
    searchParams.set('order', data.order.map((o) => `${o[0]}${SEP_INNER}${o[1]}`).join(SEP_OUTER));
  } else {
    searchParams.delete('order');
  }

  window.history.replaceState(null, '', '?' + searchParams.toString());
}

/** Remove DT state from search (so we can send on to server */
export function removeDTState (searchString) {
  const searchParams = new URLSearchParams(searchString);

  searchParams.delete('order');
  return '?' + searchParams.toString();
}
