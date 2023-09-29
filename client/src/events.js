export function changeEvent (detail) {
  return new window.UIEvent('change', {
    detail: detail || 0,
    view: window,
    bubbles: true,
    cancelable: true
  });
}

/** If state is true, display warning when navigating away from page */
export function toggleUnloadWarning (state) {
  // https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event#examples
  if (!window.phBeforeUnloadListener) {
    window.phBeforeUnloadListener = (event) => {
      event.preventDefault();
      return (event.returnValue = '');
    };
  }

  if (state) {
    window.addEventListener('beforeunload', window.phBeforeUnloadListener, { capture: true });
  } else {
    window.removeEventListener('beforeunload', window.phBeforeUnloadListener, { capture: true });
  }
}
